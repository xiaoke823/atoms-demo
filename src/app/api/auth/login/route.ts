// POST /api/auth/login —— 登录
import { getDb } from "@/lib/db";
import { verifyPassword, signToken } from "@/lib/auth";

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

  const row = getDb()
    .prepare("SELECT id, email, credits, password_hash FROM users WHERE email = ?")
    .get(email) as
    | { id: number; email: string; credits: number; password_hash: string }
    | undefined;

  if (!row || !verifyPassword(password, row.password_hash))
    return Response.json({ message: "邮箱或密码错误" }, { status: 401 });

  const token = await signToken({ id: row.id, email: row.email });
  return Response.json({
    token,
    user: { id: row.id, email: row.email, credits: row.credits },
  });
}
