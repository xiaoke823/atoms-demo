// pipeline.callJson：原始流 delta 不带 status（前端只计数），
// 人工提示行（重试提示等）带 status:true（前端展示）。
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatStream: vi.fn(),
  chat: vi.fn(),
}));

vi.mock("../llm", () => ({
  chatStream: mocks.chatStream,
  chat: mocks.chat,
}));

import { callJson } from "../pipeline";
import type { SSEEvent } from "../types";

beforeEach(() => {
  mocks.chatStream.mockReset();
  mocks.chat.mockReset();
});

describe("callJson 的 delta 转发语义", () => {
  it("原始流 delta 无 status；格式异常重试提示带 status", async () => {
    mocks.chatStream
      .mockImplementationOnce(async (_m: unknown, onDelta: (d: string) => void) => {
        onDelta('{"name":'); // 非法 JSON（截断）
        return '{"name":';
      })
      .mockImplementationOnce(async (_m: unknown, onDelta: (d: string) => void) => {
        onDelta('{"name":"番茄钟"}');
        return '{"name":"番茄钟"}';
      });

    const events: SSEEvent[] = [];
    const { data } = await callJson("sys", [], (ev) => events.push(ev), "pm");

    expect(data).toEqual({ name: "番茄钟" });
    const deltas = events.filter((e) => e.type === "delta") as Extract<
      SSEEvent,
      { type: "delta" }
    >[];
    // 原始流照发（供前端计数），但不带 status
    expect(deltas.filter((d) => d.status === undefined).length).toBeGreaterThan(0);
    // 重试提示是人工文本，必须带 status
    const notice = deltas.find((d) => d.text.includes("重试"));
    expect(notice?.status).toBe(true);
    expect(mocks.chatStream).toHaveBeenCalledTimes(2);
  });
});
