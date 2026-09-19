"use client";
// 我的项目列表
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useAuth } from "@/components/Providers";

interface MyProject {
  id: number;
  title: string;
  icon: string | null;
  tagline: string | null;
  status: "draft" | "published";
  slug: string | null;
  remix_of: number | null;
  remixTitle: string | null;
  updated_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [projects, setProjects] = useState<MyProject[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    api<{ projects: MyProject[] }>("/api/projects")
      .then((d) => setProjects(d.projects))
      .catch(() => setProjects([]));
  }, [loading, user, router]);

  return (
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">我的项目</h1>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500"
        >
          + 新创作
        </button>
      </div>

      {projects === null ? (
        <div className="text-slate-400 text-center py-20">加载中…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-slate-400 rounded-2xl border border-dashed border-slate-200">
          还没有项目，去创造第一个吧
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => router.push(`/workspace/${p.id}`)}
              className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <span className="text-3xl">{p.icon || "✨"}</span>
                {p.status === "published" ? (
                  <a
                    href={`/p/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="查看已发布链接"
                    className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                  >
                    🌐 /p/{p.slug}
                  </a>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                    草稿
                  </span>
                )}
              </div>
              <div className="mt-3 font-medium text-slate-800">{p.title}</div>
              {p.remix_of && (
                <div className="text-xs text-indigo-500 mt-0.5">
                  ⧉ Remix 自《{p.remixTitle || "原作"}》
                </div>
              )}
              <div className="text-sm text-slate-500 line-clamp-2 mt-1">
                {p.tagline || "—"}
              </div>
              <div className="text-xs text-slate-400 mt-3">
                更新于 {p.updated_at}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
