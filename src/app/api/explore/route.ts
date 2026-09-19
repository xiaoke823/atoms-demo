// GET /api/explore —— 作品广场（无需登录）?sort=new|hot&limit=&page=
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") === "hot" ? "hot" : "new";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 12, 48);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);

  const order =
    sort === "hot"
      ? "p.remix_count DESC, p.id DESC"
      : "p.published_at DESC, p.id DESC";

  const rows = getDb()
    .prepare(
      `SELECT p.id, p.title, p.icon, p.tagline, p.slug, p.remix_count, p.created_at, u.email
       FROM projects p JOIN users u ON p.user_id = u.id
       WHERE p.status = 'published'
       ORDER BY ${order}
       LIMIT ? OFFSET ?`
    )
    .all(limit, (page - 1) * limit) as any[];

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      icon: r.icon,
      tagline: r.tagline,
      slug: r.slug,
      remix_count: r.remix_count,
      author: maskEmail(r.email),
      createdAt: r.created_at,
    })),
  });
}
