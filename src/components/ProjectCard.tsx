"use client";
// 广场/列表共享的作品卡片：emoji 渐变封面 + View / Remix 操作
import type { ExploreItemDTO } from "@/lib/types";

function gradientFor(icon: string | null): string {
  let h = 0;
  for (const ch of icon || "✨") h = (h * 31 + ch.codePointAt(0)!) % 360;
  const h2 = (h + 60) % 360;
  return `linear-gradient(135deg, hsl(${h} 80% 92%), hsl(${h2} 75% 85%))`;
}

interface Props {
  item: ExploreItemDTO;
  onRemix?: (id: number) => void;
  remixing?: boolean;
}

export default function ProjectCard({ item, onRemix, remixing }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      <div
        className="h-24 flex items-center justify-center text-5xl"
        style={{ background: gradientFor(item.icon) }}
      >
        {item.icon || "✨"}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="font-medium text-slate-800">{item.title}</div>
        <div className="text-sm text-slate-500 line-clamp-2 mt-1 flex-1">
          {item.tagline || "—"}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
          <span>{item.author}</span>
          <span>·</span>
          <span title="被 Remix 次数">⧉ {item.remix_count}</span>
        </div>
        <div className="flex gap-2 mt-3">
          <a
            href={`/p/${item.slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            View →
          </a>
          {onRemix && (
            <button
              onClick={() => onRemix(item.id)}
              disabled={remixing}
              className="flex-1 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
            >
              {remixing ? "Remix 中…" : "⧉ Remix"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
