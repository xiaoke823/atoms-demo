// GET /api/projects/:id —— 项目详情 + 消息历史（登录且为本人项目）
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const pid = Number(id);
  if (!Number.isFinite(pid))
    return Response.json({ message: "项目不存在" }, { status: 404 });

  const db = getDb();
  const project = db
    .prepare(
      `SELECT p.*, orig.title AS remixTitle, orig.slug AS remixSlug
       FROM projects p LEFT JOIN projects orig ON p.remix_of = orig.id
       WHERE p.id = ? AND p.user_id = ?`
    )
    .get(pid, user.id) as any;
  if (!project) return Response.json({ message: "项目不存在" }, { status: 404 });

  const messages = db
    .prepare(
      "SELECT id, project_id, role, content, created_at FROM messages WHERE project_id = ? ORDER BY id"
    )
    .all(pid);

  return Response.json({
    project: {
      id: project.id,
      title: project.title,
      prompt: project.prompt,
      html: project.html,
      icon: project.icon,
      tagline: project.tagline,
      status: project.status,
      slug: project.slug,
      remix_of: project.remix_of,
      remixTitle: project.remixTitle,
      remix_count: project.remix_count,
      updatedAt: project.updated_at,
    },
    messages: messages.map((m: any) => ({
      id: m.id,
      project_id: m.project_id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  });
}
