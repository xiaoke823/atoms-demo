import { describe, it, expect } from "vitest";
import { extractJson, extractHtml } from "../src/lib/extract";
import { runRuleChecks } from "../src/lib/qa";

describe("extractJson", () => {
  it("裸 JSON 直接解析", () => {
    const r = extractJson('{"a":1}');
    expect(r).toEqual({ ok: true, data: { a: 1 } });
  });

  it("```json 围栏剥离", () => {
    const r = extractJson('好的，如下：\n```json\n{"name":"番茄钟"}\n```\n以上');
    expect(r).toEqual({ ok: true, data: { name: "番茄钟" } });
  });

  it("混杂文本中提取首个 { 到末个 } 的子串", () => {
    const r = extractJson('前置说明 {"a":{"b":2}} 后置说明');
    expect(r).toEqual({ ok: true, data: { a: { b: 2 } } });
  });

  it("无 JSON 时 ok:false", () => {
    expect(extractJson("完全不是 JSON").ok).toBe(false);
  });
});

describe("extractHtml", () => {
  const FULL = '<!DOCTYPE html><html><body><h1>Hi</h1></body></html>';

  it("```html 围栏提取", () => {
    const r = extractHtml(`说明文字\n\`\`\`html\n${FULL}\n\`\`\`\n结尾`);
    expect(r).toBe(FULL);
  });

  it("无围栏但以 <!DOCTYPE 开头则整段", () => {
    expect(extractHtml(`  ${FULL}  `)).toBe(FULL);
  });

  it("无 HTML 返回 null", () => {
    expect(extractHtml("抱歉我无法完成")).toBeNull();
  });
});

describe("QA 规则引擎", () => {
  const GOOD =
    '<!DOCTYPE html><html><head><style>body{color:#333}</style><script>console.log(1)</script></head><body><div>' +
    "x".repeat(2000) +
    "</div></body></html>";

  it("合规 HTML 通过", () => {
    expect(runRuleChecks(GOOD)).toEqual([]);
  });

  it("缺 DOCTYPE 报 issue", () => {
    const issues = runRuleChecks(GOOD.replace("<!DOCTYPE html>", ""));
    expect(issues.some((s) => s.includes("DOCTYPE"))).toBe(true);
  });

  it("script 未闭合报 issue", () => {
    const bad = GOOD.replace("</script>", "");
    expect(issues_about(bad, "script")).toBe(true);
  });

  it("长度不足报 issue", () => {
    const short = '<!DOCTYPE html><html><body><p>hi</p></body></html>';
    expect(runRuleChecks(short).some((s) => s.includes("长度"))).toBe(true);
  });

  it("残留 TODO 报 issue", () => {
    const bad = GOOD.replace("x".repeat(2000), "TODO: fill here" + "x".repeat(2000));
    expect(runRuleChecks(bad).some((s) => s.includes("TODO"))).toBe(true);
  });

  function issues_about(html: string, kw: string): boolean {
    return runRuleChecks(html).some((s) => s.includes(kw));
  }
});
