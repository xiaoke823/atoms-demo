"use client";
// 右侧预览面板：生成中=流式代码视图；收到 preview 后=iframe 实时预览
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  codeText: string;
  html: string | null;
  running: boolean;
  onPublish?: () => void;
  publishState?: "hidden" | "enabled" | "published";
  onUnpublish?: () => void;
}

export default function PreviewPane({
  codeText,
  html,
  running,
  onPublish,
  publishState = "hidden",
  onUnpublish,
}: Props) {
  const [iframeKey, setIframeKey] = useState(0);
  const codeRef = useRef<HTMLPreElement>(null);

  // 代码视图自动滚底
  useEffect(() => {
    if (codeRef.current) codeRef.current.scrollTop = codeRef.current.scrollHeight;
  }, [codeText]);

  const blobUrl = useMemo(() => {
    if (!html || typeof window === "undefined") return null;
    return URL.createObjectURL(new Blob([html], { type: "text/html" }));
  }, [html]);

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-slate-200 bg-slate-50/70">
        <span className="text-sm font-medium text-slate-600">实时预览</span>
        {running && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            构建中
          </span>
        )}
        <div className="flex-1" />
        {html && (
          <>
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              title="刷新预览"
              className="px-2 py-1 rounded-md text-sm text-slate-500 hover:bg-slate-100"
            >
              🔄
            </button>
            {blobUrl && (
              <a
                href={blobUrl}
                target="_blank"
                rel="noreferrer"
                title="新窗口打开"
                className="px-2 py-1 rounded-md text-sm text-slate-500 hover:bg-slate-100"
              >
                ↗
              </a>
            )}
            {publishState !== "hidden" && onPublish && (
              <button
                onClick={onPublish}
                disabled={running || publishState === "published"}
                className="ml-1 px-3 py-1 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {publishState === "published" ? "已发布 🌐" : "🚀 发布"}
              </button>
            )}
            {publishState === "published" && onUnpublish && (
              <button
                onClick={onUnpublish}
                title="取消发布"
                className="px-2 py-1 rounded-md text-xs text-slate-400 hover:bg-slate-100"
              >
                取消发布
              </button>
            )}
          </>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 relative">
        {html ? (
          <iframe
            key={iframeKey}
            title="preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            srcDoc={html}
          />
        ) : codeText ? (
          <pre
            ref={codeRef}
            className="absolute inset-0 overflow-auto p-4 text-xs leading-5 font-mono text-slate-600 bg-slate-900"
          >
            <code className="text-slate-300">{codeText}</code>
          </pre>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 gap-3">
            <span className="text-5xl">⚛</span>
            <span className="text-sm">AI 员工准备就绪，等待任务…</span>
          </div>
        )}
      </div>
    </div>
  );
}
