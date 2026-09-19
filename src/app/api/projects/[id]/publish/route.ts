// POST /api/projects/:id/publish —— 发布 / 取消发布（body: {action})
import { getUserFromRequest } from "@/lib/auth";
import { getDb, grantCredits } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function genSlug(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

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

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const action = body.action || "publish";

  const db = getDb();
  const project = db
    .prepare(
      "SELECT id, html, status, slug, published_at FROM projects WHERE id = ? AND user_id = ?"
    )
    .get(pid, user.id) as
    | { id: number; html: string | null; status: string; slug: string | null; published_at: string | null }
    | undefined;
  if (!project) return Response.json({ message: "项目不存在" }, { status: 404 });

  if (action === "unpublish") {
    db.prepare(
      "UPDATE projects SET status = 'draft', slug = NULL WHERE id = ?"
    ).run(pid);
    return Response.json({ ok: true, slug: null });
  }

  // publish
  if (!project.html)
    return Response.json({ message: "应用尚未生成完成，无法发布" }, { status: 400 });
  if (project.status === "published" && project.slug) {
    return Response.json({ ok: true, slug: project.slug, already: true });
  }

  // 生成唯一 slug（冲突重试）
  let slug = "";
  for (let i = 0; i < 8; i++) {
    const candidate = genSlug();
    const exists = db
      .prepare("SELECT id FROM projects WHERE slug = ?")
      .get(candidate);
    if (!exists) {
      slug = candidate;
      break;
    }
  }
  if (!slug) return Response.json({ message: "slug 生成失败，请重试" }, { status: 500 });

  db.prepare(
    "UPDATE projects SET status = 'published', slug = ?, published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
  ).run(slug, pid);

  // 首次发布奖励 +5 积分
  let credits: number | undefined;
  if (!project.published_at) {
    credits = grantCredits(db, user.id, 5, "publish");
  }
  return Response.json({ ok: true, slug, credits });
}
