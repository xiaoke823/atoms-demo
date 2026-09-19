// LLM 适配层：OpenAI 兼容 chat/completions。
// 换供应商只改 env：LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（见 .env.example）。
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LlmOpts {
  temperature?: number;
  maxTokens?: number;
}

function cfg() {
  const baseUrl = (process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.LLM_API_KEY || "";
  const model = process.env.LLM_MODEL || "";
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM 未配置：需要 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL");
  }
  return { baseUrl, apiKey, model };
}

async function postChat(
  messages: ChatMessage[],
  opts: LlmOpts,
  stream: boolean,
  signal?: AbortSignal
): Promise<Response> {
  const { baseUrl, apiKey, model } = cfg();
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 16384,
    }),
    // 流式由调用方的空闲看门狗控制；非流式 120s 总超时
    signal: stream ? signal : AbortSignal.timeout(120_000),
  });
}

function extractContent(data: any): string {
  const c = data?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  // 部分兼容端点返回 content 为分段数组
  if (Array.isArray(c)) {
    return c.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("");
  }
  return "";
}

async function errorMessage(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = await res.text();
    detail = body.slice(0, 300);
  } catch {}
  return `LLM HTTP ${res.status} ${detail}`;
}

/** 非流式调用：返回完整文本。失败自动重试 1 次。 */
export async function chat(
  messages: ChatMessage[],
  opts: LlmOpts = {}
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await postChat(messages, opts, false);
      if (!res.ok) throw new Error(await errorMessage(res));
      const data = await res.json();
      const text = extractContent(data);
      if (!text) throw new Error("LLM 返回空内容");
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * 流式调用：逐段回调 onDelta，结束返回完整文本。
 * 解析 OpenAI 兼容 SSE：`data: {...}` 行取 choices[0].delta.content，`data: [DONE]` 结束。
 */
export async function chatStream(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  opts: LlmOpts = {}
): Promise<string> {
  // 空闲看门狗：120s 无数据才判超时；只要模型还在吐字就不中断
  const controller = new AbortController();
  let idle: ReturnType<typeof setTimeout> | null = null;
  const feed = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(
      () => controller.abort(new Error("LLM 流式响应超时（120 秒无数据）")),
      120_000
    );
  };
  feed();

  try {
    const res = await postChat(messages, opts, true, controller.signal);
    if (!res.ok) throw new Error(await errorMessage(res));
    if (!res.body) throw new Error("LLM 未返回流式响应体");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";

    const handlePayload = (payload: string): boolean => {
      if (payload === "[DONE]") return true;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          full += delta;
          onDelta(delta);
        }
      } catch {
        // 忽略无法解析的行（如部分端点的注释/心跳）
      }
      return false;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      feed();
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const s = line.trim();
        if (s.startsWith("data:") && handlePayload(s.slice(5).trim())) {
          return full;
        }
      }
    }
    // 流结束仍未收到 [DONE]：返回已累积内容
    return full;
  } finally {
    if (idle) clearTimeout(idle);
  }
}
