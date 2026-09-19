"use client";
// 作品广场：公开浏览 + Remix
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { ExploreItemDTO } from "@/lib/types";
import ProjectCard from "@/components/ProjectCard";
import { useAuth, useToast } from "@/components/Providers";

export default function ExplorePage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [sort, setSort] = useState<"new" | "hot">("new");
  const [items, setItems] = useState<ExploreItemDTO[] | null>(null);
  const [remixing, setRemixing] = useState<number | null>(null);

  useEffect(() => {
    setItems(null);
    fetch(`/api/explore?sort=${sort}&limit=24`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  }, [sort]);

  const remix = useCallback(
    async (id: number) => {
      if (!user) {
        router.push("/login?next=/explore");
        return;
      }
      setRemixing(id);
      try {
        const d = await api<{ id: number }>(`/api/projects/${id}/remix`, {
          method: "POST",
        });
        toast("Remix 成功，开始你的改造吧", "success");
        router.push(`/workspace/${d.id}`);
      } catch (e: any) {
        toast(e.message || "Remix 失败", "error");
        setRemixing(null);
      }
    },
    [user, router, toast]
  );

  return (
    <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-slate-900">作品广场</h1>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {(["new", "hot"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-4 py-1.5 rounded-md ${
                sort === s ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s === "new" ? "最新" : "最热"}
            </button>
          ))}
        </div>
      </div>

      {items === null ? (
        <div className="text-slate-400 text-center py-20">加载中…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-slate-200">
          <div className="text-slate-400">广场还空着，去创造第一个作品吧</div>
          <button
            onClick={() => router.push("/")}
            className="mt-4 px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500"
          >
            开始创造
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <ProjectCard
              key={it.id}
              item={it}
              onRemix={remix}
              remixing={remixing === it.id}
            />
          ))}
        </div>
      )}
    </main>
  );
}
