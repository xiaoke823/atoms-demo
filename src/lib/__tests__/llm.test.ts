// llm：对上游 429/5xx 做退避重试（免费档瞬时限流不应击穿整条流水线）
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat, chatStream } from "../llm";

const enc = new TextEncoder();

/** 构造 OpenAI 兼容 SSE 流式成功响应 */
function sseResponse(chunks: string[], status = 200) {
  const body = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status });
}

function jsonResponse(obj: unknown, status: number) {
  return new Response(JSON.stringify(obj), { status });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("LLM_BASE_URL", "http://llm.test/v1");
  vi.stubEnv("LLM_API_KEY", "sk-test");
  vi.stubEnv("LLM_MODEL", "test-model");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("chatStream", () => {
  it("响应头等待 130s（推理模型思考）不误杀", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        // 模型思考 130s 才回响应头；abort 时正确 reject（真实 fetch 语义）
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 130_000);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(init.signal?.reason ?? new Error("aborted"));
          });
        });
        return sseResponse([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          "data: [DONE]\n\n",
        ]);
      })
    );

    const p = chatStream([{ role: "user", content: "hi" }], () => {});
    await vi.advanceTimersByTimeAsync(140_000);
    const text = await p;

    expect(text).toBe("Hi");
  });

  it("deadlineMs 到期中断挂起的流式请求", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason ?? new Error("aborted"))
          );
        });
      })
    );

    const out = chatStream(
      [{ role: "user", content: "hi" }],
      () => {},
      { deadlineMs: 100 }
    ).catch((e: unknown) => e);
    // 100ms deadline 触发 + 1s/2s 重试退避全部推进完
    await vi.advanceTimersByTimeAsync(3500);
    const err = await out;

    expect(err).toBeInstanceOf(Error);
  });

  it("响应头到达后 120s 无任何字节仍判超时", async () => {
    // 服务器回了头但流上永远没有数据（连接死）。
    // mock 需模拟真实 fetch 语义：abort 信号会让 body 流 error
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        const signal = init?.signal;
        if (!signal) throw new Error("test requires abort signal");
        const deadBody = new ReadableStream({
          start(c) {
            signal.addEventListener("abort", () => {
              c.error(signal.reason ?? new Error("aborted"));
            });
          },
        });
        return new Response(deadBody, { status: 200 });
      })
    );

    const out = chatStream([{ role: "user", content: "hi" }], () => {}).catch(
      (e: unknown) => e
    );
    await vi.advanceTimersByTimeAsync(130_000);
    const err = await out;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("120 秒无数据");
  });

  it("首次 429 后退避重试并成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "速率受限制" } }, 429))
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
          "data: [DONE]\n\n",
        ])
      );
    vi.stubGlobal("fetch", fetchMock);

    const p = chatStream([{ role: "user", content: "hi" }], () => {});
    await vi.advanceTimersByTimeAsync(1000); // 第一次退避
    const text = await p;

    expect(text).toBe("Hi");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("连续 3 次 429 后抛错", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "速率受限制" } }, 429));
    vi.stubGlobal("fetch", fetchMock);

    const p = chatStream([{ role: "user", content: "hi" }], () => {});
    const out = p.catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(3000); // 1s + 2s 两次退避
    const err = await out;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("429");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("400 语义错误不重试", async () => {
    const fetchMock = vi.mocked(
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "bad request" } }, 400))
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = chatStream([{ role: "user", content: "hi" }], () => {}).catch(
      (e: Error) => e
    );
    const err = await out;

    expect((err as Error).message).toContain("400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("chat", () => {
  it("deadlineMs 为总预算:挂起的请求在期限内被中断,不再重试", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason ?? new Error("aborted"))
          );
        });
      })
    );

    const out = chat([{ role: "user", content: "hi" }], { deadlineMs: 100 }).catch(
      (e: unknown) => e
    );
    await vi.advanceTimersByTimeAsync(150);
    const err = await out;

    expect(err).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1); // 总预算耗尽后不重试
  });

  it("首次 429 后退避重试并成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "速率受限制" } }, 429))
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "OK" } }] }, 200)
      );
    vi.stubGlobal("fetch", fetchMock);

    const p = chat([{ role: "user", content: "hi" }]);
    await vi.advanceTimersByTimeAsync(1000);
    const text = await p;

    expect(text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
