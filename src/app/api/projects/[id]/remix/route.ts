// POST /api/projects/:id/remix —— 复制他人已发布作品为自己的草稿
// 原作 remix_count+1；原作者 +2 积分；Remix 本身免费
import { getUserFromRequest } from "@/lib/auth";
import { getDb, grantCredits } from "@/lib/db";

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

  const db = getDb();
  const target = db
    .prepare(
      "SELECT id, user_id, title, prompt, html, icon, tagline, status FROM projects WHERE id = ?"
    )
    .get(pid) as any;
  if (!target || target.status !== "published")
    return Response.json({ message: "作品不存在或未发布" }, { status: 404 });
  if (target.user_id === user.id)
    return Response.json(
      { message: "这是你自己的作品，直接在工作台继续迭代吧" },
      { status: 400 }
    );

  const newId = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO projects (user_id, title, prompt, html, icon, tagline, remix_of)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        user.id,
        `${target.title}（Remix）`,
        target.prompt,
        target.html,
        target.icon,
        target.tagline,
        target.id
      );
    const nid = Number(r.lastInsertRowid);
    // 复制完整对话历史，Remix 后的工作台可立即回放与迭代
    db.prepare(
      `INSERT INTO messages (project_id, role, content)
       SELECT ?, role, content FROM messages WHERE project_id = ? ORDER BY id`
    ).run(nid, target.id);
    db.prepare(
      "UPDATE projects SET remix_count = remix_count + 1 WHERE id = ?"
    ).run(target.id);
    grantCredits(db, target.user_id, 2, "remixed");
    return nid;
  })();

  return Response.json({ id: newId });
}
