// 迭代修改指令的应用:LLM 输出 find/replace 数组,对原文做精确局部替换。
// 设计约束(对应笔试二轮修复 ①):
// - 只做局部替换,不做全量重生成 → 输出量小,不撞 max_tokens,响应快
// - find 必须与原文完全一致且全文唯一才应用 → 防止改错位置
// - 顺序应用(后一项作用于前一项的输出);非法条目直接忽略

export interface PatchItem {
  find: string;
  replace: string;
  reason?: string;
}

export interface PatchResult {
  html: string;
  applied: PatchItem[];
  skipped: PatchItem[]; // 格式合法但无法安全应用(不匹配 / 不唯一)
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i >= 0) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

export function applyPatch(html: string, items: unknown): PatchResult {
  const applied: PatchItem[] = [];
  const skipped: PatchItem[] = [];
  if (!Array.isArray(items)) return { html, applied, skipped };

  let out = html;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const { find, replace } = raw as Record<string, unknown>;
    if (typeof find !== "string" || typeof replace !== "string") continue;
    if (!find || find === replace) continue;

    const item: PatchItem = { find, replace, reason: (raw as PatchItem).reason };
    // 唯一匹配才应用;找不到或不唯一都跳过,保住上一版好代码
    if (countOccurrences(out, find) !== 1) {
      skipped.push(item);
      continue;
    }
    out = out.replace(find, replace);
    applied.push(item);
  }
  return { html: out, applied, skipped };
}
