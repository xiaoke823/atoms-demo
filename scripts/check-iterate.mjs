// 从迭代 SSE 流抽取最新 preview HTML，检查修改需求是否生效
import fs from "node:fs";

const file = process.argv[2] || "sse4.txt";
const text = fs.readFileSync(file, "utf8");
const matches = [...text.matchAll(/"type":"preview","html":"((?:[^"\\]|\\.)*)"/g)];
if (!matches.length) {
  console.log("no preview found");
  process.exit(1);
}
const html = JSON.parse('{"h":"' + matches[matches.length - 1][1] + '"}').h;
fs.writeFileSync("preview2.html", html);
console.log("html chars:", html.length);
console.log("含'暂停':", html.includes("暂停"));
const cyan = /(#0d9488|#06b6d4|#14b8a6|teal|cyan)/i.test(html);
console.log("含青色系颜色:", cyan);
console.log("规则检查: TODO出现 =", /TODO|FIXME/.test(html));
