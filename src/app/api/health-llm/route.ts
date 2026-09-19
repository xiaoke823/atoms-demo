// 调试用：验证 LLM 适配层连通性（上线前删除）
import { chat } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reply = await chat(
      [{ role: "user", content: "回复两个字：正常" }],
      { temperature: 0, maxTokens: 512 }
    );
    return Response.json({
      ok: true,
      model: process.env.LLM_MODEL,
      reply,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
