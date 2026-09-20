// ratelimit：checkRate 窗口语义 + clearRate 释放窗口（生成失败后允许立即重试）
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRate, clearRate } from "../ratelimit";

afterEach(() => vi.useRealTimers());

describe("checkRate", () => {
  it("窗口内第二次调用被拒", () => {
    expect(checkRate("k", 30)).toBe(true);
    expect(checkRate("k", 30)).toBe(false);
  });

  it("不同 key 互不影响", () => {
    expect(checkRate("a", 30)).toBe(true);
    expect(checkRate("b", 30)).toBe(true);
  });
});

describe("clearRate", () => {
  it("清除后可立即再次通过（无需等窗口结束）", () => {
    expect(checkRate("gen:1", 30)).toBe(true);
    expect(checkRate("gen:1", 30)).toBe(false);
    clearRate("gen:1");
    expect(checkRate("gen:1", 30)).toBe(true);
  });

  it("只清除指定 key", () => {
    checkRate("gen:1", 30);
    checkRate("gen:2", 30);
    clearRate("gen:1");
    expect(checkRate("gen:2", 30)).toBe(false);
  });
});
