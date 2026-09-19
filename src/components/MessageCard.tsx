"use client";
// 剧场角色卡片：PM 紫 / 架构师蓝 / 工程师绿 / QA 橙；用户消息为右侧气泡
import type { Role } from "@/lib/types";
import type { TheaterCard } from "@/lib/theater";

const ROLE_META: Record<
  Exclude<Role, "user" | "system">,
  { name: string; label: string; emoji: string; color: string; bg: string; border: string }
> = {
  pm: { name: "Emma", label: "产品经理", emoji: "💜", color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  architect: { name: "Bob", label: "架构师", emoji: "🏗", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  engineer: { name: "Alex", label: "工程师", emoji: "💚", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  qa: { name: "Iris", label: "质检", emoji: "🧡", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
};

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-indigo-600 text-white whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function ArtifactView({ agent, artifact }: { agent: string; artifact: any }) {
  if (!artifact || typeof artifact !== "object") return null;

  if (agent === "pm") {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl">{artifact.icon || "✨"}</span>
          <span className="font-semibold text-slate-800">{artifact.name}</span>
          <span className="text-sm text-slate-500">{artifact.tagline}</span>
        </div>
        {Array.isArray(artifact.features) && artifact.features.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {artifact.features.map((f: string, i: number) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (agent === "architect") {
    const palette = artifact.palette || {};
    const swatches = Object.entries(palette).filter(([, v]) => typeof v === "string" && v.startsWith("#"));
    return (
      <div className="mt-2 space-y-2">
        {swatches.length > 0 && (
          <div className="flex items-center gap-1.5">
            {swatches.map(([k, v]) => (
              <span
                key={k}
                title={`${k} ${v}`}
                className="w-6 h-6 rounded-md border border-slate-200"
                style={{ background: v as string }}
              />
            ))}
            <span className="text-xs text-slate-400 ml-1">配色方案</span>
          </div>
        )}
        {Array.isArray(artifact.modules) && artifact.modules.length > 0 && (
          <div className="text-sm text-slate-600 space-y-0.5">
            {artifact.modules.slice(0, 6).map((m: any, i: number) => (
              <div key={i}>
                · <span className="font-medium text-slate-700">{m.name}</span>
                <span className="text-slate-400"> — {m.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (agent === "engineer") {
    const size = artifact.size ?? 0;
    return (
      <div className="mt-1 text-sm text-slate-500">
        代码生成完成 · {(size / 1024).toFixed(1)} KB
      </div>
    );
  }

  if (agent === "qa") {
    const passed = artifact.passed;
    return (
      <div className="mt-2 text-sm">
        {passed ? (
          <span className="text-emerald-600">✅ 质检通过{artifact.repaired ? "（经修复）" : ""}，应用可以发布</span>
        ) : (
          <div className="text-orange-600">
            ⚠️ 发现 {Array.isArray(artifact.issues) ? artifact.issues.length : 0} 个问题
            {Array.isArray(artifact.issues) && (
              <ul className="mt-1 list-disc list-inside text-slate-500">
                {artifact.issues.slice(0, 5).map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}

export default function MessageCard({ card }: { card: TheaterCard }) {
  const meta = ROLE_META[card.agent];
  const running = card.status === "running";
  return (
    <div className="flex gap-3">
      <div
        className={`shrink-0 w-9 h-9 rounded-full ${meta.bg} ${meta.border} border flex items-center justify-center text-lg ${running ? "animate-pulse" : ""}`}
      >
        {meta.emoji}
      </div>
      <div className={`flex-1 min-w-0 rounded-2xl rounded-tl-md border ${meta.border} ${meta.bg} bg-opacity-40 px-4 py-3`}>
        <div className="flex items-center gap-2">
          <span className={`font-medium text-sm ${meta.color}`}>
            {meta.name}
            <span className="text-slate-400 font-normal"> · {meta.label}</span>
          </span>
          {card.note === "repair" && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">修复中</span>
          )}
          {card.note === "iterate" && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600">迭代修改</span>
          )}
          {running ? (
            <span className="flex items-center gap-1 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          ) : (
            <span className="text-xs text-slate-300">✓</span>
          )}
        </div>

        {/* 打字文本（pm/architect 流式、engineer 状态行） */}
        {card.lines.length > 0 && (
          <div className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap break-all max-h-40 overflow-hidden">
            {card.lines.join("")}
          </div>
        )}

        {/* 工程师生成中的字数反馈 */}
        {card.agent === "engineer" && running && !card.note && (
          <div className="mt-1.5 text-sm text-slate-500">
            正在编写代码 · 已生成 {card.chars.toLocaleString()} 字符
            <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-1 animate-pulse align-middle" />
          </div>
        )}

        {/* 阶段产物（完成态） */}
        {!running && card.artifact && <ArtifactView agent={card.agent} artifact={card.artifact} />}
      </div>
    </div>
  );
}
