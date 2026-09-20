// POST /api/projects/:id/chat —— 聊天迭代（SSE 流式，完整重生成 HTML）
import { getUserFromRequest } from "@/lib/auth";
import { getDb, deductCredits, grantCredits } from "@/lib/db";
import { chatStream } from "@/lib/llm";
import * as P from "@/lib/prompts";
import { extractHtml } from "@/lib/extract";
import { runRuleChecks } from "@/lib/qa";
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
        try {
          // ── 工程师按修改需求完整重生成 ──
          send({ type: "stage_start", agent: "engineer", note: "iterate" });
          const raw = await chatStream(
            [
              { role: "system", content: P.ITERATE_SYSTEM },
              ...P.iterateUser(project.html as string, message),
            ],
            (d) => send({ type: "delta", agent: "engineer", text: d }),
            { temperature: 0.4 }
          );
          const html = extractHtml(raw);
          if (!html) throw new Error("未能生成有效的修改版本");

          send({ type: "preview", html });
          send({ type: "stage_done", agent: "engineer", artifact: { size: html.length } });

          // ── QA：规则复检，不过则修复一轮 ──
          send({ type: "stage_start", agent: "qa" });
          let finalHtml = html;
          let issues = runRuleChecks(html);
          let repaired = false;
          if (issues.length) {
            send({
              type: "delta",
              agent: "qa",
              text: `规则检查发现 ${issues.length} 个问题，打回修复…`,
              status: true,
            });
            try {
              const fixRaw = await chatStream(
                [
                  { role: "system", content: P.ENGINEER_SYSTEM },
                  ...P.repairUser(issues, html),
                ],
                () => {},
                { temperature: 0.3 }
              );
              const fixed = extractHtml(fixRaw);
              if (fixed) {
                finalHtml = fixed;
                repaired = true;
                send({ type: "preview", html: finalHtml });
              }
            } catch {}
            issues = runRuleChecks(finalHtml);
          }
          send({
            type: "stage_done",
            agent: "qa",
            artifact: { passed: issues.length === 0, issues, repaired },
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

          const credits = (
            db.prepare("SELECT credits FROM users WHERE id=?").get(user.id) as any
          ).credits;
          send({ type: "done", projectId: pid, credits });
        } catch (e) {
          // 失败：退回积分；释放限流窗口允许立即重试
          grantCredits(db, user.id, 2, "refund");
          clearRate(`iter:${user.id}`);
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
