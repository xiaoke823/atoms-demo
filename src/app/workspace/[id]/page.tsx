"use client";
// 工作台：历史回放 + 聊天迭代 + 发布入口
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, postSSE } from "@/lib/client";
import { useTheater } from "@/lib/theater";
import type { MessageDTO, ProjectDTO } from "@/lib/types";
import MessageCard, { UserBubble } from "@/components/MessageCard";
import PreviewPane from "@/components/PreviewPane";
import InsufficientModal from "@/components/InsufficientModal";
import { useAuth, useToast } from "@/components/Providers";

export default function Workspace() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, loading, refresh } = useAuth();
  const { state, feed, pushUser, loadHistory } = useTheater();
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing">("loading");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [insufficient, setInsufficient] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 登录守卫
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // 加载历史
  useEffect(() => {
    if (loading || !user || !params.id) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await api<{ project: ProjectDTO; messages: MessageDTO[] }>(
          `/api/projects/${params.id}`
        );
        if (cancelled) return;
        setProject(d.project);
        loadHistory(d.messages, d.project.html);
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, params.id, loadHistory]);

  // 自动滚到最新
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.cards.length, state.userLines.length]);

  const iterate = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !project) return;
    setBusy(true);
    setInput("");
    pushUser(text);
    try {
      await postSSE(`/api/projects/${params.id}/chat`, { message: text }, (ev) => {
        feed(ev);
        if (ev.type === "done") refresh();
        if (ev.type === "error") {
          if (ev.code === "INSUFFICIENT_CREDITS") setInsufficient(true);
          else toast(ev.message, "error");
        }
      });
    } catch (err: any) {
      toast(`连接中断：${err?.message || err}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async () => {
    if (publishing || !project) return;
    setPublishing(true);
    try {
      const d = await api<{ ok: boolean; slug: string | null }>(
        `/api/projects/${params.id}/publish`,
        { method: "POST", body: JSON.stringify({ action: "publish" }) }
      );
      if (d.slug) {
        setProject((p) => (p ? { ...p, status: "published", slug: d.slug } : p));
        setShowLink(true);
        toast("发布成功，奖励 5 积分 ⚡", "success");
        refresh();
      }
    } catch (e: any) {
      toast(e.message || "发布失败", "error");
    } finally {
      setPublishing(false);
    }
  };

  const doUnpublish = async () => {
    if (!project) return;
    try {
      await api(`/api/projects/${params.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ action: "unpublish" }),
      });
      setProject((p) => (p ? { ...p, status: "draft", slug: null } : p));
      setShowLink(false);
      toast("已取消发布");
    } catch (e: any) {
      toast(e.message || "操作失败", "error");
    }
  };

  const publicUrl =
    project?.slug && typeof window !== "undefined"
      ? `${window.location.origin}/p/${project.slug}`
      : "";

  if (loadState === "loading")
    return <main className="flex-1 flex items-center justify-center text-slate-400">加载中…</main>;
  if (loadState === "missing")
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
        项目不存在或无权访问
        <button onClick={() => router.push("/projects")} className="px-4 py-2 rounded-lg bg-indigo-600 text-white">
          返回我的项目
        </button>
      </main>
    );

  return (
    <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-[calc(100vh-3.5rem)]">
      {/* 左：团队对话 */}
      <section className="flex-1 min-w-0 flex flex-col gap-3">
        {project?.remix_of && (
          <div className="text-xs text-slate-500 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
            ⧉ 基于《{project.remixTitle || "原作"}》Remix ·{" "}
            {project.remix_count > 0 && <span>已被 Remix {project.remix_count} 次 · </span>}
            原始想法：{project.prompt.slice(0, 50)}
            {project.prompt.length > 50 ? "…" : ""}
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          {state.userLines.map((t, i) => (
            <UserBubble key={`u${i}`} text={t} />
          ))}
          {state.cards.map((c) => (
            <MessageCard key={c.key} card={c} />
          ))}
          {state.phase === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {state.errorMessage}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 迭代输入 */}
        <form onSubmit={iterate} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy || state.phase === "running" || !project?.html}
            placeholder={
              !project?.html
                ? "应用尚未生成完成"
                : busy || state.phase === "running"
                  ? "AI 员工工作中，请稍候…"
                  : "继续提需求，例如：加一个暂停按钮，主色换成青色（消耗 2 积分）"
            }
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 bg-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={busy || state.phase === "running" || !input.trim() || !project?.html}
            className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            发送
          </button>
        </form>
      </section>

      {/* 右：预览 */}
      <section className="w-full lg:w-[45%] lg:max-w-2xl min-h-[420px] lg:min-h-0">
        <PreviewPane
          codeText={state.codeText}
          html={state.previewHtml}
          running={state.phase === "running"}
          publishState={
            project?.html ? (project.status === "published" ? "published" : "enabled") : "hidden"
          }
          onPublish={doPublish}
          onUnpublish={doUnpublish}
        />
      </section>

      {insufficient && (
        <InsufficientModal onClose={() => setInsufficient(false)} onCheckin={refresh} />
      )}

      {/* 发布链接弹层 */}
      {showLink && project?.slug && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          onClick={() => setShowLink(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">🌐 发布成功</h3>
            <p className="mt-1 text-sm text-slate-500">
              任何人都可以通过下面的链接访问你的应用（无需登录）
            </p>
            <div className="mt-4 flex gap-2">
              <input
                readOnly
                value={publicUrl}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publicUrl);
                  toast("链接已复制", "success");
                }}
                className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
              >
                复制
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                访问
              </a>
              <button
                onClick={() => setShowLink(false)}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
