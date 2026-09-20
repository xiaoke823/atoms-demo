// 生成流水线编排器：PM → 架构师 → 工程师(流式) → QA(规则+LLM) → [修复一轮]
// 每阶段真实调用 LLM；通过 send 回调推送 SSE 事件（协议见 spec §3.4）。
import { getDb } from "./db";
import { chat, chatStream } from "./llm";
import type { ChatMessage } from "./llm";
import * as P from "./prompts";
import { extractJson, extractHtml } from "./extract";
import { runRuleChecks } from "./qa";
import type { SSEEvent, Agent } from "./types";

export type Send = (ev: SSEEvent) => void;

export interface PmArtifact {
  name: string;
  icon: string;
  tagline: string;
  features: string[];
  pages: string[];
  degraded?: boolean;
}

const RUNNING_TEXT: Record<Agent, string> = {
  pm: "正在分析需求…",
  architect: "正在设计技术方案…",
  engineer: "正在编写代码…",
  qa: "正在质检…",
};

/** 调 LLM 并解析 JSON（原始流转发供前端计数；带一次重试 + 降级为纯文本） */
export async function callJson(
  system: string,
  messages: ChatMessage[],
  send: Send,
  agent: Agent
): Promise<{ data: any | null; text: string }> {
  const first = await chatStream(
    [{ role: "system", content: system }, ...messages],
    (d) => send({ type: "delta", agent, text: d }),
    { temperature: 0.3, maxTokens: 4096 }
  );
  let j = extractJson(first);
  if (j.ok) return { data: j.data, text: first };
  send({ type: "delta", agent, text: "（输出格式异常，重试解析…）", status: true });
  const second = await chatStream(
    [
      { role: "system", content: system },
      ...messages,
      { role: "assistant", content: first },
      { role: "user", content: P.JSON_RETRY_ADDON },
    ],
    (d) => send({ type: "delta", agent, text: d }),
    { temperature: 0, maxTokens: 4096 }
  );
  j = extractJson(second);
  return j.ok ? { data: j.data, text: second } : { data: null, text: second };
}

function sanitizePm(data: any, fallbackText: string): PmArtifact {
  const d = data && typeof data === "object" ? data : {};
  const features = Array.isArray(d.features)
    ? d.features.filter((f: unknown) => typeof f === "string").slice(0, 6)
    : ["核心交互界面"];
  const pages = Array.isArray(d.pages)
    ? d.pages.filter((p: unknown) => typeof p === "string")
    : [];
  return {
    name: typeof d.name === "string" && d.name.trim() ? d.name.trim().slice(0, 12) : "未命名应用",
    icon: typeof d.icon === "string" && d.icon.trim() ? d.icon.trim().slice(0, 4) : "✨",
    tagline:
      typeof d.tagline === "string" && d.tagline.trim()
        ? d.tagline.trim().slice(0, 30)
        : fallbackText.slice(0, 20),
    features: features.length ? features : ["核心交互界面"],
    pages,
    degraded: !data,
  };
}

export interface GenerationResult {
  projectId: number;
  credits: number;
}

/** 完整生成流程。抛错由调用方（route）负责退分与 error 事件。 */
export async function runGeneration(
  userId: number,
  idea: string,
  send: Send
): Promise<GenerationResult> {
  // ── 阶段 1 · PM ────────────────────────────────────────────
  send({ type: "stage_start", agent: "pm" });
  send({ type: "delta", agent: "pm", text: RUNNING_TEXT.pm, status: true });
  const pm = await callJson(P.PM_SYSTEM, P.pmUser(idea), send, "pm");
  const pmData = sanitizePm(pm.data, idea);
  send({ type: "delta", agent: "pm", text: `应用定位：${pmData.name} —— ${pmData.tagline}`, status: true });
  send({ type: "stage_done", agent: "pm", artifact: pmData });

  // ── 阶段 2 · 架构师 ────────────────────────────────────────
  send({ type: "stage_start", agent: "architect" });
  send({ type: "delta", agent: "architect", text: RUNNING_TEXT.architect, status: true });
  const arch = await callJson(
    P.ARCHITECT_SYSTEM,
    P.architectUser(pm.data ?? pmData),
    send,
    "architect"
  );
  const archData = arch.data ?? { layout: [], modules: [], palette: {}, interactions: [] };
  send({ type: "delta", agent: "architect", text: "技术方案已确定，交给工程师实现。", status: true });
  send({ type: "stage_done", agent: "architect", artifact: archData });

  // ── 阶段 3 · 工程师（流式） ─────────────────────────────────
  send({ type: "stage_start", agent: "engineer" });
  const raw = await chatStream(
    [{ role: "system", content: P.ENGINEER_SYSTEM }, ...P.engineerUser(idea, pm.data ?? pmData, archData)],
    (d) => send({ type: "delta", agent: "engineer", text: d }),
    { temperature: 0.5 }
  );
  const html = extractHtml(raw);
  if (!html) throw new Error("工程师输出中未找到有效 HTML，请重试");
  send({ type: "preview", html });

  // ── 阶段 4 · QA（规则 + LLM 快审） ─────────────────────────
  send({ type: "stage_start", agent: "qa" });
  const issues = runRuleChecks(html);
  let passed = issues.length === 0;
  if (passed) {
    send({ type: "delta", agent: "qa", text: "静态规则通过，进行语义审查…", status: true });
    const qaText = await chat(
      [{ role: "system", content: P.QA_SYSTEM }, ...P.qaUser(idea, pmData.features, html)],
      { temperature: 0, maxTokens: 2048 }
    );
    const qj = extractJson(qaText);
    if (qj.ok && qj.data?.passed === false && Array.isArray(qj.data.issues)) {
      const extra = qj.data.issues.filter((i: unknown) => typeof i === "string");
      if (extra.length) {
        passed = false;
        issues.push(...extra.slice(0, 5));
      }
    }
  }
  send({ type: "stage_done", agent: "qa", artifact: { passed, issues } });

  // ── 阶段 5 · 修复（最多一轮） ──────────────────────────────
  let finalHtml = html;
  let repaired = false;
  if (!passed) {
    send({ type: "stage_start", agent: "engineer", note: "repair" });
    send({ type: "delta", agent: "engineer", text: `QA 发现 ${issues.length} 个问题，正在修复…`, status: true });
    try {
      const fixRaw = await chatStream(
        [{ role: "system", content: P.ENGINEER_SYSTEM }, ...P.repairUser(issues, html)],
        () => {},
        { temperature: 0.3 }
      );
      const fixed = extractHtml(fixRaw);
      if (fixed) {
        finalHtml = fixed;
        repaired = true;
        send({ type: "preview", html: finalHtml });
      }
    } catch {
      // 修复失败不致命：保留原版本继续交付
    }
    const recheck = runRuleChecks(finalHtml);
    send({
      type: "stage_done",
      agent: "qa",
      artifact: { passed: recheck.length === 0, issues: recheck, repaired },
    });
  }

  // ── 收尾 · 落库 ────────────────────────────────────────────
  const db = getDb();
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO projects (user_id, title, prompt, html, icon, tagline)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(userId, pmData.name, idea, finalHtml, pmData.icon, pmData.tagline);
    const projectId = Number(r.lastInsertRowid);
    const ins = db.prepare(
      "INSERT INTO messages (project_id, role, content) VALUES (?, ?, ?)"
    );
    ins.run(projectId, "user", idea);
    ins.run(projectId, "pm", JSON.stringify(pm.data ?? pmData));
    ins.run(projectId, "architect", JSON.stringify(archData));
    ins.run(projectId, "engineer", finalHtml);
    ins.run(
      projectId,
      "qa",
      JSON.stringify({ passed, issues, repaired })
    );
    return projectId;
  });
  const projectId = tx();

  const credits = (
    db.prepare("SELECT credits FROM users WHERE id=?").get(userId) as any
  ).credits;
  send({ type: "done", projectId, credits });
  return { projectId, credits };
}
