// 端到端冒烟测试：注册→生成→迭代→发布→游客访问→广场→Remix→签到→流水核对
// 用法：先 npm run dev，然后 node scripts/e2e.mjs [base_url]
// 注意：包含两次真实 LLM 调用（生成 + 迭代），总耗时约 5-8 分钟
const BASE = process.argv[2] || process.env.BASE || "http://localhost:3001";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data };
}

async function sse(path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {}
    return { error: data?.message || `HTTP ${res.status}`, code: data?.code };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const events = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data:")) {
          try {
            events.push(JSON.parse(line.slice(5).trim()));
          } catch {}
        }
      }
    }
  }
  return { events };
}

const stamp = Date.now().toString(36);

// ── 1. 注册 A ──
const emailA = `e2ea-${stamp}@atomix.dev`;
const regA = await api("/api/auth/register", {
  method: "POST",
  body: { email: emailA, password: "test123456" },
});
check("注册用户A", regA.status === 200 && regA.data.token, `credits=${regA.data?.user?.credits}`);
const tokenA = regA.data.token;
const uidA = regA.data.user.id;

// ── 2. 生成（SSE 全流程）──
console.log("\n⏳ 正在生成应用（真实 LLM，约 3-5 分钟）…\n");
const gen = await sse("/api/projects", tokenA, { prompt: "做一个极简倒计时器：输入秒数，点开始后倒计时，结束时提示" });
if (gen.error) {
  check("生成流水线", false, gen.error);
} else {
  const stages = gen.events.filter((e) => e.type === "stage_start").map((e) => e.agent);
  check("四阶段全部启动", ["pm", "architect", "engineer", "qa"].every((a) => stages.includes(a)), stages.join("→"));
  const preview = gen.events.find((e) => e.type === "preview");
  check("产出预览 HTML", !!preview && preview.html.length > 2000, `${preview?.html.length} chars`);
  const done = gen.events.find((e) => e.type === "done");
  check("done 事件 + 扣 10 积分", !!done && done.credits === 90, `credits=${done?.credits}`);
  const err = gen.events.find((e) => e.type === "error");
  check("无错误事件", !err, err?.message);
}
const projectId = gen.events?.find((e) => e.type === "done")?.projectId;

// ── 3. 迭代 ──
if (projectId) {
  console.log("\n⏳ 正在迭代修改（约 2-4 分钟）…\n");
  const it = await sse(`/api/projects/${projectId}/chat`, tokenA, {
    message: "把页面主标题改成'倒计时小助手'，并在结束后显示'时间到'",
  });
  const doneIt = it.events?.find((e) => e.type === "done");
  check("迭代成功 + 扣 2 积分", !!doneIt && doneIt.credits === 88, `credits=${doneIt?.credits}`);
  const preview2 = [...(it.events || [])].reverse().find((e) => e.type === "preview");
  check("迭代产出新 HTML", !!preview2 && preview2.html.length > 2000);
}

// ── 4. 发布 + 游客访问 ──
if (projectId) {
  const pub = await api(`/api/projects/${projectId}/publish`, {
    method: "POST",
    token: tokenA,
    body: { action: "publish" },
  });
  check("发布成功", pub.status === 200 && pub.data.slug, `slug=${pub.data?.slug}`);
  const pubAgain = await api(`/api/projects/${projectId}/publish`, {
    method: "POST",
    token: tokenA,
    body: { action: "publish" },
  });
  check("重复发布幂等", pubAgain.status === 200 && pubAgain.data.slug === pub.data.slug && pubAgain.data.already);
  const guest = await fetch(`${BASE}/p/${pub.data.slug}`);
  const guestHtml = await guest.text();
  check("游客访问公开页", guest.status === 200 && guestHtml.includes("Built with Atomix"));
}

// ── 5. 广场 + Remix ──
const explore = await api("/api/explore?sort=new");
const inExplore = (explore.data.items || []).some((i) => i.id === projectId);
check("广场包含已发布作品", inExplore);
const authorMasked = (explore.data.items || []).every((i) => !i.email || /\*\*\*/.test(i.author));
check("作者邮箱脱敏", authorMasked);

const emailB = `e2eb-${stamp}@atomix.dev`;
const regB = await api("/api/auth/register", { method: "POST", body: { email: emailB, password: "test123456" } });
const tokenB = regB.data.token;
const remix = await api(`/api/projects/${projectId}/remix`, { method: "POST", token: tokenB });
check("用户B Remix 成功", remix.status === 200 && remix.data.id, `新项目=${remix.data?.id}`);
const selfRemix = await api(`/api/projects/${projectId}/remix`, { method: "POST", token: tokenA });
check("不能 Remix 自己的作品", selfRemix.status === 400);

// ── 6. 签到 + 流水核对 ──
const checkin = await api("/api/credits/checkin", { method: "POST", token: tokenB });
check("用户B 签到 +20", checkin.status === 200 && checkin.data.credits === 120, `credits=${checkin.data?.credits}`);
const checkin2 = await api("/api/credits/checkin", { method: "POST", token: tokenB });
check("签到 24h 冷却", checkin2.status === 429);

const txA = await api("/api/credits/transactions?limit=20", { token: tokenA });
const amounts = (txA.data.items || []).reduce((m, t) => m + t.amount, 0);
check("A 积分流水收支一致", amounts === 95, `sum=${amounts}（100-10-2+5+2）`);
const meA = await api("/api/auth/me", { token: tokenA });
check("A 最终余额 95", meA.data.user.credits === 95, `credits=${meA.data.user?.credits}`);

// ── 汇总 ──
const failed = results.filter((r) => !r.ok);
console.log(`\n${"=".repeat(50)}\n${failed.length === 0 ? "🎉 全部通过" : `💥 ${failed.length} 项失败`}：${results.length} checks`);
process.exit(failed.length === 0 ? 0 : 1);
