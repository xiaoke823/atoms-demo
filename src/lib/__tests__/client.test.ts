// client.postSSE：流中断（未收到 done/error 终止事件）应合成 error 事件，
// 而不是静默结束让页面永远卡在"AI 员工工作中"。
import { afterEach, describe, expect, it, vi } from "vitest";
import { postSSE } from "../client";
import type { SSEEvent } from "../types";

const enc = new TextEncoder();

function sseResponse(chunks: string[], status = 200) {
  const body = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("postSSE", () => {
  it("收到 done 后正常结束：不合成 error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['data: {"type":"done","projectId":7,"credits":90}\n\n'])
      )
    );
    const events: SSEEvent[] = [];
    await postSSE("/api/x", {}, (ev) => events.push(ev));
    expect(events).toEqual([
      { type: "done", projectId: 7, credits: 90 },
    ]);
  });

  it("流中途断开（无终止事件）：合成 error 事件", async () => {
    // 只收到一条 delta，随后连接被服务端关闭 —— 没有任何终止事件
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(['data: {"type":"delta","agent":"pm","text":"正在分析…"}\n\n'])
      )
    );
    const events: SSEEvent[] = [];
    await postSSE("/api/x", {}, (ev) => events.push(ev));
    expect(events).toHaveLength(2);
    const last = events[1];
    expect(last.type).toBe("error");
    if (last.type === "error") expect(last.message).toContain("中断");
  });

  it("流空关闭（无任何事件）：合成 error 事件", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([])));
    const events: SSEEvent[] = [];
    await postSSE("/api/x", {}, (ev) => events.push(ev));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
  });
});
