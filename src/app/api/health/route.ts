// GET /api/health —— 部署健康检查：应用存活 + SQLite 可读写
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "db unreachable" },
      { status: 500 }
    );
  }
}
