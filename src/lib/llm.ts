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

/** 带 HTTP 状态的 LLM 错误，用于判断是否值得退避重试 */
class LlmHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** 瞬时性失败（限流/服务端抖动）值得重试；4xx 语义错误重试无意义 */
const isTransient = (e: unknown) =>
  e instanceof LlmHttpError && (e.status === 429 || e.status >= 500);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BACKOFF_MS = [1000, 2000];

/** 非流式调用：返回完整文本。失败自动重试 1 次（瞬时性失败退避后再试）。 */
export async function chat(
  messages: ChatMessage[],
  opts: LlmOpts = {}
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && isTransient(lastErr)) await sleep(BACKOFF_MS[attempt - 1]);
    try {
      const res = await postChat(messages, opts, false);
      if (!res.ok) throw new LlmHttpError(await errorMessage(res), res.status);
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
 * 建立连接阶段（拿到响应头之前）的瞬时性失败（429/5xx/网络抖动）退避重试；
 * 开始输出后不再重试——onDelta 可能已推送，重发会导致内容重复。
 * 推理模型（如 glm-4.5）思考期间可能长时间不返回响应头，头等待用宽时限。
 */
export async function chatStream(
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  opts: LlmOpts = {}
): Promise<string> {
  // 头等待（模型思考）宽时限；数据流空闲（连接死）用短时限
  const HEADER_TIMEOUT_MS = 300_000;
  const IDLE_TIMEOUT_MS = 120_000;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();

    // ── 阶段一：请求 → 响应头（模型可能在此思考数分钟）──
    let res: Response;
    try {
      const headerTimer = setTimeout(
        () =>
          controller.abort(
            new Error("LLM 响应超时（300 秒未返回，模型思考过久或服务异常）")
          ),
        HEADER_TIMEOUT_MS
      );
      try {
        res = await postChat(messages, opts, true, controller.signal);
      } finally {
        clearTimeout(headerTimer);
      }
    } catch (e) {
      // 连接没建立或头未到达：无副作用，可安全重试
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      throw e;
    }

    // ── 阶段二：响应头 → 数据流。空闲看门狗：120s 无字节才判连接死；
    // 头到达即武装，覆盖"头 → 首字节"间隙。
    let idle: ReturnType<typeof setTimeout> | null = null;
    const feed = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(
        () =>
          controller.abort(new Error("LLM 流式响应超时（120 秒无数据）")),
        IDLE_TIMEOUT_MS
      );
    };
    feed();

    try {
      if (!res.ok) {
        const msg = await errorMessage(res);
        if (isTransient(new LlmHttpError(msg, res.status)) && attempt < BACKOFF_MS.length) {
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        throw new Error(msg);
      }
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
}
