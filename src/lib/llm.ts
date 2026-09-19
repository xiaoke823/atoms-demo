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
  stream: boolean
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
    signal: AbortSignal.timeout(opts.stream ? 300_000 : 120_000),
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
  const res = await postChat(messages, opts, true);
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
}
