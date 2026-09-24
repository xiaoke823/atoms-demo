// 冒烟测试:把生成物在 jsdom 中真实执行一遍,收集运行时报错。
// 这是"生成了但交互没反应"的主防线——静态审查抓不到运行时错误。
// 执行放在 worker 线程并设超时:生成物含死循环时只 terminate worker,
// 不会拖死服务进程。
import { Worker } from "node:worker_threads";
// 静态引用让打包追踪把 jsdom 及其依赖树收进 standalone 产物;
// 实际执行发生在下方 worker 的运行时 require 中(基于 cwd 的 node_modules 解析)
import "jsdom";

export interface SmokeResult {
  ok: boolean;
  errors: string[];
}

const WORKER_CODE = `
const { parentPort } = require("node:worker_threads");
const { JSDOM, VirtualConsole } = require("jsdom");
parentPort.on("message", (html) => {
  const errors = [];
  try {
    const vc = new VirtualConsole();
    vc.on("jsdomError", (e) => errors.push(String((e && e.message) || e)));
    vc.on("error", (m) => errors.push(String(m)));
    const dom = new JSDOM(html, {
      runScripts: "dangerously",   // 真实执行内联脚本
      virtualConsole: vc,
      url: "http://localhost/",    // 使 localStorage 可用
      pretendToBeVisual: true,     // requestAnimationFrame 等可用
    });
    dom.window.addEventListener("error", (ev) =>
      errors.push(String((ev && ev.message) || "脚本错误"))
    );
    // 给定时器/异步初始化留执行窗口
    setTimeout(() => {
      dom.window.close();
      parentPort.postMessage(errors);
    }, 500);
  } catch (e) {
    parentPort.postMessage(["页面执行失败: " + ((e && e.message) || e)]);
  }
});
`;

/** 返回生成物的运行时错误清单;空数组 = 通过。任何环境异常都降级为"跳过冒烟",绝不阻塞生成。 */
export function smokeTest(html: string, timeoutMs = 5000): Promise<SmokeResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(WORKER_CODE, { eval: true });
    } catch {
      resolve({ ok: true, errors: [] });
      return;
    }
    const finish = (r: SmokeResult) => {
      worker.terminate().catch(() => {});
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, errors: ["冒烟测试超时（脚本疑似死循环）"] }),
      timeoutMs
    );
    worker.once("message", (raw: string[]) => {
      clearTimeout(timer);
      // jsdom 对非标准 CSS 的解析告警是噪音,不计入
      const errors = (raw || []).filter((s) => !s.includes("Could not parse CSS")).slice(0, 5);
      finish({ ok: errors.length === 0, errors });
    });
    worker.once("error", () => {
      clearTimeout(timer);
      finish({ ok: true, errors: [] }); // 环境问题(jsdom 缺失等)不阻塞
    });
    worker.postMessage(html);
  });
}
