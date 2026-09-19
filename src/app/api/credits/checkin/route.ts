// POST /api/credits/checkin —— 每日签到 +20（24h 冷却）
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "请先登录" }, { status: 401 });

  const db = getDb();
  const row = db
    .prepare("SELECT last_checkin_at FROM users WHERE id = ?")
    .get(user.id) as { last_checkin_at: string | null };
  const last = row?.last_checkin_at ? new Date(`${row.last_checkin_at}Z`).getTime() : 0;
  const now = Date.now();
  if (now - last < 24 * 3600 * 1000) {
    return Response.json(
      {
        message: "今天已经签到过了",
        nextAvailableAt: new Date(last + 24 * 3600 * 1000).toISOString(),
      },
      { status: 429 }
    );
  }

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE users SET credits = credits + 20, last_checkin_at = datetime('now') WHERE id = ?"
    ).run(user.id);
    db.prepare(
      "INSERT INTO credit_transactions (user_id, amount, reason) VALUES (?, ?, ?)"
    ).run(user.id, 20, "checkin");
    const credits = (
      db.prepare("SELECT credits FROM users WHERE id = ?").get(user.id) as any
    ).credits;
    return credits;
  });
  const credits = tx();
  return Response.json({ ok: true, credits });
}
