// 分析 SSE 流：各阶段耗时（按 ping 数×15s 估算）+ 抽取 HTML 存盘
import fs from "node:fs";

const file = process.argv[2] || "sse2.txt";
const lines = fs.readFileSync(file, "utf8").split("\n");
let ping = 0;
const at = {};
for (const l of lines) {
  if (l === ": ping") ping++;
  for (const a of ["pm", "architect", "engineer", "qa"]) {
    if (l.includes(`"stage_start","agent":"${a}"`) && at[a] === undefined)
      at[a] = ping;
  }
}
const order = ["pm", "architect", "engineer", "qa"];
for (let i = 0; i < order.length; i++) {
  const from = at[order[i]] ?? "?";
  const to = i + 1 < order.length ? at[order[i + 1]] : ping;
  console.log(
    `${order[i]}: ~${typeof from === "number" && typeof to === "number" ? (to - from) * 15 : "?"}s`
  );
}

const text = fs.readFileSync(file, "utf8");
const m = text.match(/"type":"preview","html":"((?:[^"\\]|\\.)*)"/);
if (m) {
  const html = JSON.parse('{"h":"' + m[1] + '"}').h;
  fs.writeFileSync("preview1.html", html);
  console.log(
    `HTML saved: ${html.length} chars, ${html.split("\n").length} lines`
  );
} else {
  console.log("no preview event found");
}
