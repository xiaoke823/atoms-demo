// POST /api/auth/register —— 注册（送 100 积分并写流水）
import { getDb } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: "请求体错误" }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return Response.json({ message: "邮箱格式不正确" }, { status: 400 });
  if (password.length < 6)
    return Response.json({ message: "密码至少 6 位" }, { status: 400 });

  const db = getDb();
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists)
    return Response.json({ message: "该邮箱已注册，请直接登录" }, { status: 409 });

  const r = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(email, hashPassword(password));
  const id = Number(r.lastInsertRowid);
  db.prepare(
    "INSERT INTO credit_transactions (user_id, amount, reason) VALUES (?, ?, ?)"
  ).run(id, 100, "register");

  const token = await signToken({ id, email });
  return Response.json({ token, user: { id, email, credits: 100 } });
}
