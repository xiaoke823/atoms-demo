// 内存限流：单实例、重启即清零（demo 尺度可接受；多实例部署需换 Redis）
const last = new Map<string, number>();

/** 通过则记录本次时间并返回 true；间隔不足返回 false */
export function checkRate(key: string, seconds: number): boolean {
  const now = Date.now();
  const prev = last.get(key) ?? 0;
  if (now - prev < seconds * 1000) return false;
  last.set(key, now);
  return true;
}

/** 清理过期条目，防内存缓慢增长 */
export function sweepRate(maxAgeSeconds = 3600) {
  const now = Date.now();
  for (const [k, t] of last) if (now - t > maxAgeSeconds * 1000) last.delete(k);
}
