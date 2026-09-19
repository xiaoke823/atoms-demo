// GET /api/auth/me —— 当前用户信息（含实时积分）
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return Response.json({ message: "未登录或登录已过期" }, { status: 401 });
  return Response.json({ user });
}
