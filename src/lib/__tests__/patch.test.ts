// patch:迭代修改指令的应用(find/replace 原文精确匹配,仅唯一匹配生效)
import { describe, expect, it } from "vitest";
import { applyPatch } from "../patch";

const HTML = `<!DOCTYPE html>
<html><head><style>body{background:#f8fafc}</style></head>
<body><h1>番茄钟</h1><button id="start">开始</button></body></html>`;

describe("applyPatch", () => {
  it("应用唯一的 find/replace", () => {
    const r = applyPatch(HTML, [
      { find: "<h1>番茄钟</h1>", replace: '<h1>专注时钟</h1>' },
    ]);
    expect(r.html).toContain("<h1>专注时钟</h1>");
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toHaveLength(0);
  });

  it("find 不存在于原文 → 跳过,不影响其他项", () => {
    const r = applyPatch(HTML, [
      { find: "<h1>不存在</h1>", replace: "x" },
      { find: "background:#f8fafc", replace: "background:#eef2ff" },
    ]);
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    expect(r.html).toContain("#eef2ff");
    expect(r.html).toContain("番茄钟");
  });

  it("find 在原文出现多次(不唯一)→ 跳过,防止改错位置", () => {
    const two = "<p>A</p><p>A</p>";
    const r = applyPatch(two, [{ find: "<p>A</p>", replace: "<p>B</p>" }]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.html).toBe(two);
  });

  it("顺序应用:后一项作用于前一项的输出", () => {
    const r = applyPatch(HTML, [
      { find: "番茄钟", replace: "时钟" },
      { find: "<h1>时钟</h1>", replace: "<h1>定时器</h1>" },
    ]);
    expect(r.html).toContain("<h1>定时器</h1>");
  });

  it("非法条目(缺字段/非字符串/空 find/find===replace)被忽略", () => {
    const r = applyPatch(HTML, [
      null,
      "not-an-object",
      { find: "开始" },
      { find: "", replace: "x" },
      { find: "番茄钟", replace: "番茄钟" },
      { find: "番茄钟", replace: "专注钟" },
    ] as unknown[]);
    expect(r.applied).toHaveLength(1);
    expect(r.skipped).toHaveLength(0); // 非法项直接忽略,不算 skipped
    expect(r.html).toContain("专注钟");
  });

  it("非数组输入 → 全部跳过,原样返回", () => {
    const r = applyPatch(HTML, { fallback: true });
    expect(r.html).toBe(HTML);
    expect(r.applied).toHaveLength(0);
  });
});
