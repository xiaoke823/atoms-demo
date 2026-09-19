// 浏览器端请求封装：自动携带 JWT；postSSE 解析服务端 SSE 流
import type { SSEEvent } from "./types";

const TOKEN_KEY = "atomix_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  code?: string;
  status: number;
  data?: any;
  constructor(message: string, status: number, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    if (res.status === 401) setToken(null); // 页面自行决定是否跳登录
    throw new ApiError(data?.message || "请求失败", res.status, data?.code, data);
  }
  return data as T;
}

/**
 * 发起 SSE POST 请求，逐事件回调 onEvent。
 * 非 2xx 响应会转换成一次 error 事件（与流中 error 同构）。
 */
export async function postSSE(
  path: string,
  body: unknown,
  onEvent: (ev: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const token = getToken();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    if (res.status === 401) setToken(null);
    onEvent({
      type: "error",
      message: data?.message || `请求失败（${res.status}）`,
      code: data?.code,
    });
    return;
  }
  if (!res.body) {
    onEvent({ type: "error", message: "连接建立失败" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const handleFrame = (frame: string) => {
    // frame 形如 "event: message\ndata: {...}"；注释行（: ping）忽略
    for (const line of frame.split("\n")) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(s.slice(5).trim()));
      } catch {}
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      handleFrame(frame);
    }
  }
}
