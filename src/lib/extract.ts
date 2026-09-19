// 从 LLM 输出中提取结构化内容（容错解析）

export type JsonResult =
  | { ok: true; data: any }
  | { ok: false };

/** 提取 JSON：剥围栏 → 直接 parse → 首个{ 到末个} 子串 parse */
export function extractJson(text: string): JsonResult {
  const stripped = text
    .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
    .trim();
  try {
    return { ok: true, data: JSON.parse(stripped) };
  } catch {}
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return { ok: true, data: JSON.parse(stripped.slice(first, last + 1)) };
    } catch {}
  }
  return { ok: false };
}

/** 提取完整 HTML：```html 围栏优先；否则整段（需以 <!DOCTYPE 或 <html 开头） */
export function extractHtml(text: string): string | null {
  const fence = text.match(/```html\s*([\s\S]*?)```/);
  if (fence && fence[1].trim()) return fence[1].trim();
  const trimmed = text.trim();
  if (/^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed)) return trimmed;
  // 兜底：有些模型用无语言标注围栏
  const plainFence = text.match(/```\s*([\s\S]*?)```/);
  if (plainFence) {
    const inner = plainFence[1].trim();
    if (/^<!DOCTYPE/i.test(inner) || /^<html/i.test(inner)) return inner;
  }
  return null;
}
