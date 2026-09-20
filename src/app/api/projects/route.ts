// POST /api/projects —— 创建项目并触发生成（SSE 流式返回全过程）
// GET  /api/projects —— 我的项目列表
import { getUserFromRequest } from "@/lib/auth";
import { getDb, deductCredits, grantCredits } from "@/lib/db";
import { runGeneration } from "@/lib/pipeline";
import { sseFrame, SSE_PING } from "@/lib/sse";
import { checkRate, clearRate } from "@/lib/ratelimit";
import type { SSEEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "请求体错误" }, { status: 400 });
  }
  const prompt = (body.prompt || "").trim();
  if (!prompt) return Response.json({ message: "想法不能为空" }, { status: 400 });
  if (prompt.length > 500)
    return Response.json({ message: "想法描述请控制在 500 字以内" }, { status: 400 });

  if (!checkRate(`gen:${user.id}`, 30))
    return Response.json({ message: "生成太频繁，请 30 秒后再试" }, { status: 429 });

  const db = getDb();
  const balance = (
    db.prepare("SELECT credits FROM users WHERE id=?").get(user.id) as {
      credits: number;
    }
  ).credits;
  if (balance < 10)
    return Response.json(
      { message: "积分不足", code: "INSUFFICIENT_CREDITS" },
      { status: 402 }
    );

  const deduct = deductCredits(db, user.id, 10, "generate");
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

      runGeneration(user.id, prompt, send)
        .catch((e) => {
          // 生成失败：全额退分 + error 事件；同时释放限流窗口允许立即重试
          grantCredits(db, user.id, 10, "refund");
          clearRate(`gen:${user.id}`);
          send({
            type: "error",
            message:
              e instanceof Error ? `${e.message}（积分已退还）` : "生成失败，积分已退还",
          });
        })
        .finally(() => {
          if (ping) clearInterval(ping);
          closed = true;
          try {
            controller.close();
          } catch {}
        });
    },
    cancel() {
      closed = true;
      if (ping) clearInterval(ping);
      // 客户端主动断开：LLM 成本已发生，不退分，仅停止推送
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

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.title, p.icon, p.tagline, p.status, p.slug,
              p.remix_of, p.remix_count, p.updated_at, p.created_at,
              orig.title AS remixTitle
       FROM projects p
       LEFT JOIN projects orig ON p.remix_of = orig.id
       WHERE p.user_id = ?
       ORDER BY p.updated_at DESC`
    )
    .all(user.id);
  return Response.json({ projects: rows });
}
