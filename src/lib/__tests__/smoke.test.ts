// smoke:生成物在 jsdom 中真实执行,抓运行时错误
import { describe, expect, it } from "vitest";
import { smokeTest } from "../smoke";

const wrap = (js: string) =>
  `<!DOCTYPE html><html><body><button id="b">go</button><script>${js}</script></body></html>`;

describe("smokeTest", () => {
  it("正常脚本通过", async () => {
    const r = await smokeTest(wrap(`document.getElementById("b").textContent = "ok";`));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("访问不存在的元素抛错被捕获", async () => {
    const r = await smokeTest(
      wrap(`document.getElementById("nope").addEventListener("click", function(){});`)
    );
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("语法错误被捕获", async () => {
    const r = await smokeTest(wrap(`function broken( {`));
    expect(r.ok).toBe(false);
  });

  it("死循环被超时终止,不挂死", async () => {
    const r = await smokeTest(wrap(`while (true) {}`), 800);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain("超时");
  }, 10_000);

  it("定时器中的异步报错也被捕获", async () => {
    const r = await smokeTest(
      wrap(`setTimeout(function(){ null.x }, 100);`)
    );
    expect(r.ok).toBe(false);
  });
});
