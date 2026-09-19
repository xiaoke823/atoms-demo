// QA 规则引擎：确定性检查（零成本，先于 LLM 语义审查执行）
export function runRuleChecks(html: string): string[] {
  const issues: string[] = [];
  if (!/<html[\s>]/i.test(html)) issues.push("缺少 <html> 标签");
  if (!/<!DOCTYPE\s+html/i.test(html)) issues.push("缺少 <!DOCTYPE html> 声明");
  if (!/<\/html>/i.test(html)) issues.push("HTML 未闭合（缺少 </html>）");

  const count = (re: RegExp) => (html.match(re) || []).length;
  if (count(/<script[\s>]/gi) !== count(/<\/script>/gi))
    issues.push("<script> 标签未配对闭合");
  if (count(/<style[\s>]/gi) !== count(/<\/style>/gi))
    issues.push("<style> 标签未配对闭合");

  if (html.length <= 2000) issues.push(`HTML 长度不足（${html.length} 字符，疑似半成品）`);

  if (/TODO|FIXME|your code here/i.test(html))
    issues.push("存在 TODO/FIXME/占位符残留");

  return issues;
}
