// POST /api/projects/:id/chat —— 聊天迭代（patch 模式：局部 find/replace，不全量重生成）
// 二轮验收修复：① 真增量(输出量小,不撞 max_tokens) ② QA 不过不落库(保留上一版)
// ③ 120s 总时限 + 客户端取消时不落库
import { getUserFromRequest } from "@/lib/auth";
import { getDb, deductCredits, grantCredits } from "@/lib/db";
import { chat, chatStream } from "@/lib/llm";
import * as P from "@/lib/prompts";
import { extractJson, extractHtml } from "@/lib/extract";
import { runRuleChecks } from "@/lib/qa";
import { applyPatch } from "@/lib/patch";
import { smokeTest } from "@/lib/smoke";
import { sseFrame, SSE_PING } from "@/lib/sse";
import { checkRate, clearRate } from "@/lib/ratelimit";
import type { SSEEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const pid = Number(id);
  if (!Number.isFinite(pid))
    return Response.json({ message: "项目不存在" }, { status: 404 });

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "请求体错误" }, { status: 400 });
  }
  const message = (body.message || "").trim();
  if (!message) return Response.json({ message: "修改需求不能为空" }, { status: 400 });
  if (message.length > 500)
    return Response.json({ message: "修改需求请控制在 500 字以内" }, { status: 400 });

  if (!checkRate(`iter:${user.id}`, 15))
    return Response.json({ message: "操作太频繁，请 15 秒后再试" }, { status: 429 });

  const db = getDb();
  const project = db
    .prepare("SELECT id, html FROM projects WHERE id = ? AND user_id = ?")
    .get(pid, user.id) as { id: number; html: string | null } | undefined;
  if (!project) return Response.json({ message: "项目不存在" }, { status: 404 });
  if (!project.html)
    return Response.json({ message: "应用尚未生成完成，无法迭代" }, { status: 400 });

  const deduct = deductCredits(db, user.id, 2, "iterate");
  if (!deduct.ok)
    return Response.json(
      { message: "积分不足", code: "INSUFFICIENT_CREDITS" },
      { status: 402 }
    );

  const encoder = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (ev: SSEEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(ev)));
        } catch {
          closed = true;
        }
      };
      ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(SSE_PING));
        } catch {}
      }, 15000);

      (async () => {
        let charged = true; // 本轮是否已扣分(决定失败路径要不要退)
        try {
          // ── 工程师:生成局部修改指令(patch),非流式、120s 总时限 ──
          send({ type: "stage_start", agent: "engineer", note: "iterate" });
          send({
            type: "delta",
            agent: "engineer",
            text: "正在分析修改需求，生成修改指令…",
            status: true,
          });
          const patchText = await chat(
            [
              { role: "system", content: P.ITERATE_PATCH_SYSTEM },
              ...P.iteratePatchUser(project.html as string, message),
            ],
            {
              temperature: 0.2,
              maxTokens: 4096,
              deadlineMs: 120_000,
              // 精确小修改不需要推理:关掉思考阶段,延迟大幅下降
              disableThinking: true,
            }
          );
          const j = extractJson(patchText);
          const result = applyPatch(project.html as string, j.ok ? j.data : null);

          // ── 冒烟:patch 后真实执行一遍 ──
          let finalHtml: string | null = null;
          let smokeErrors: string[] = [];
          if (result.applied.length) {
            send({ type: "stage_start", agent: "qa" });
            send({ type: "delta", agent: "qa", text: "运行冒烟测试…", status: true });
            const smoke = await smokeTest(result.html);
            smokeErrors = smoke.errors;
            send({
              type: "stage_done",
              agent: "qa",
              artifact: {
                passed: smoke.ok && runRuleChecks(result.html).length === 0,
                issues: smokeErrors,
              },
            });
            if (smoke.ok) finalHtml = result.html;
          }

          // ── patch 不适用/冒烟失败 → 带报错整体修复(关思考,安全时限内全量重写) ──
          if (!finalHtml) {
            send({ type: "stage_start", agent: "engineer", note: "iterate" });
            send({
              type: "delta",
              agent: "engineer",
              text: result.applied.length
                ? "局部修改后仍有运行错误，带上报错整体修复…"
                : "该需求不适合局部替换，正在整体修改…",
              status: true,
            });
            const fullRaw = await chatStream(
              [
                { role: "system", content: P.ITERATE_FULL_SYSTEM },
                ...P.iterateFullUser(project.html as string, message, smokeErrors),
              ],
              (d) => send({ type: "delta", agent: "engineer", text: d }),
              { temperature: 0.3, deadlineMs: 120_000, disableThinking: true }
            );
            const fixed = extractHtml(fullRaw);
            if (!fixed) throw new Error("整体修改未能产出有效 HTML");

            send({ type: "stage_start", agent: "qa" });
            send({ type: "delta", agent: "qa", text: "对整体修改运行冒烟测试…", status: true });
            const reSmoke = await smokeTest(fixed);
            send({
              type: "stage_done",
              agent: "qa",
              artifact: { passed: reSmoke.ok, issues: reSmoke.errors },
            });
            if (!reSmoke.ok) {
              send({ type: "preview", html: project.html as string });
              send({
                type: "delta",
                agent: "qa",
                text: "修复后仍有运行错误，已回滚到上一版本",
                status: true,
              });
              throw new Error(
                `整体修复后仍报错（${reSmoke.errors[0] || "未知"}），已保留上一版本`
              );
            }
            finalHtml = fixed;
          }

          if (runRuleChecks(finalHtml).length) {
            send({ type: "preview", html: project.html as string });
            throw new Error("修改未通过静态质检，已保留上一版本");
          }

          // 用户已取消：不再落库(此前推送的内容仅停留在其本地预览)
          if (closed) return;

          send({ type: "preview", html: finalHtml });
          send({
            type: "stage_done",
            agent: "engineer",
            artifact: { size: finalHtml.length },
          });

          // ── 落库 ──
          db.prepare(
            "UPDATE projects SET html = ?, updated_at = datetime('now') WHERE id = ?"
          ).run(finalHtml, pid);
          const ins = db.prepare(
            "INSERT INTO messages (project_id, role, content) VALUES (?, ?, ?)"
          );
          ins.run(pid, "user", message);
          ins.run(pid, "engineer", finalHtml);

          charged = false;
          const credits = (
            db.prepare("SELECT credits FROM users WHERE id=?").get(user.id) as {
              credits: number;
            }
          ).credits;
          send({ type: "done", projectId: pid, credits });
        } catch (e) {
          // 失败：退回积分；释放限流窗口允许立即重试
          if (charged) {
            grantCredits(db, user.id, 2, "refund");
            clearRate(`iter:${user.id}`);
          }
          send({
            type: "error",
            message:
              e instanceof Error ? `${e.message}（积分已退还）` : "迭代失败，积分已退还",
          });
        } finally {
          if (ping) clearInterval(ping);
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      })();
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
