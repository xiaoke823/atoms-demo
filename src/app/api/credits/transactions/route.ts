// GET /api/credits/transactions —— 积分流水分页
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 10, 50);
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);

  const rows = getDb()
    .prepare(
      `SELECT id, amount, reason, created_at FROM credit_transactions
       WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(user.id, limit, (page - 1) * limit);

  return Response.json({ items: rows });
}
