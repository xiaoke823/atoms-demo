"use client";
// 生成入口：读取 sessionStorage 的想法 → 发起 SSE 生成 → 完成后跳转工作台
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postSSE } from "@/lib/client";
import { useTheater } from "@/lib/theater";
import MessageCard, { UserBubble } from "@/components/MessageCard";
import PreviewPane from "@/components/PreviewPane";
import InsufficientModal from "@/components/InsufficientModal";
import { useAuth, useToast } from "@/components/Providers";

export default function WorkspaceNew() {
  const router = useRouter();
  const toast = useToast();
  const { user, loading, refresh } = useAuth();
  const { state, feed, pushUser } = useTheater();
  const started = useRef(false);
  const [idea, setIdea] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState(false);

  // 登录守卫 + 读取想法
  // consumed：守卫必须幂等——消费 sessionStorage 后，auth 刷新带来的 user
  // 引用变化会重跑本 effect，若不拦下会因取不到想法而误跳回首页。
  const consumed = useRef(false);
  useEffect(() => {
    if (loading || consumed.current) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const stored = sessionStorage.getItem("atomix_idea");
    if (!stored) {
      router.replace("/");
      return;
    }
    consumed.current = true;
    setIdea(stored);
    sessionStorage.removeItem("atomix_idea");
  }, [loading, user, router]);

  // 发起生成（ref 防严格模式双跑）
  useEffect(() => {
    if (!idea || started.current) return;
    started.current = true;
    pushUser(idea);
    postSSE("/api/projects", { prompt: idea }, (ev) => {
      feed(ev);
      if (ev.type === "done") {
        refresh(); // 刷新顶栏积分
        setTimeout(() => router.replace(`/workspace/${ev.projectId}`), 1200);
      }
      if (ev.type === "error") {
        if (ev.code === "INSUFFICIENT_CREDITS") setInsufficient(true);
        else toast(ev.message, "error");
      }
    }).catch((e) => {
      toast(`连接中断：${e?.message || e}`, "error");
    });
  }, [idea, feed, pushUser, router, refresh, toast]);

  const regenerate = () => {
    if (!idea) return;
    sessionStorage.setItem("atomix_idea", idea);
    window.location.reload();
  };

  if (!idea) {
    return (
      <main className="flex-1 flex items-center justify-center text-slate-400">准备中…</main>
    );
  }

  return (
    <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-[calc(100vh-3.5rem)]">
      {/* 左：团队对话 */}
      <section className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {state.cards.map((c) =>
            c.agent === "user" ? (
              <UserBubble key={c.key} text={c.text || ""} />
            ) : (
              <MessageCard key={c.key} card={c} />
            )
          )}
          {state.phase === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {state.errorMessage}
              <button
                onClick={regenerate}
                className="ml-3 px-3 py-1 rounded-md bg-red-500 text-white hover:bg-red-400"
              >
                重新生成
              </button>
            </div>
          )}
        </div>
        <div className="text-center text-xs text-slate-400 pb-1">
          {state.phase === "running"
            ? "AI 员工工作中，请稍候…（首次生成约 3-5 分钟）"
            : state.phase === "done"
              ? "生成完成，正在进入工作台…"
              : ""}
        </div>
      </section>

      {/* 右：预览 */}
      <section className="w-full lg:w-[45%] lg:max-w-2xl min-h-[420px] lg:min-h-0">
        <PreviewPane
          codeText={state.codeText}
          html={state.previewHtml}
          running={state.phase === "running"}
        />
      </section>

      {insufficient && (
        <InsufficientModal onClose={() => setInsufficient(false)} onCheckin={refresh} />
      )}
    </main>
  );
}
