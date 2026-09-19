"use client";
// 落地页：hero 输入框直达工作台 + 示例 chips + AI 员工介绍 + 最新作品
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const AGENTS = [
  { emoji: "💜", name: "产品经理 Emma", desc: "把一句话想法收敛成清晰的功能清单" },
  { emoji: "🏗", name: "架构师 Bob", desc: "设计页面结构、模块与配色方案" },
  { emoji: "💚", name: "工程师 Alex", desc: "流式编写完整可运行的单页应用" },
  { emoji: "🧡", name: "质检 Iris", desc: "规则 + 语义双重检查，问题自动打回修复" },
];

const IDEAS = ["番茄钟专注计时", "每日记账本", "宠物领养主页", "贪吃蛇小游戏"];

interface Work {
  id: number;
  title: string;
  icon: string | null;
  tagline: string | null;
  slug: string;
}

export default function Landing() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [works, setWorks] = useState<Work[]>([]);

  useEffect(() => {
    fetch("/api/explore?sort=new&limit=3")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setWorks(d.items || []))
      .catch(() => {});
  }, []);

  const start = (text: string) => {
    const t = text.trim();
    if (!t) return;
    sessionStorage.setItem("atomix_idea", t);
    router.push("/workspace/new");
  };

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900">
          一句话，让 AI 员工
          <br />
          为你造出<span className="text-indigo-600">可运行的应用</span>
        </h1>
        <p className="mt-5 text-slate-500 text-lg">
          描述你的想法 —— 需求分析、技术方案、编码、质检，一条流水线全搞定
        </p>
        <form
          className="mt-8 flex gap-2 max-w-xl mx-auto"
          onSubmit={(e) => {
            e.preventDefault();
            start(idea);
          }}
        >
          <input
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="例如：做一个番茄钟，支持专注和休息计时…"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-slate-800"
          />
          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 shrink-0"
          >
            开始创造
          </button>
        </form>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {IDEAS.map((s) => (
            <button
              key={s}
              onClick={() => start(s)}
              className="px-3.5 py-1.5 rounded-full border border-slate-200 text-sm text-slate-600 hover:border-indigo-400 hover:text-indigo-600 bg-white"
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">注册即送 100 积分 · 生成一个应用消耗 10 积分</p>
      </section>

      {/* AI 员工 */}
      <section className="max-w-5xl mx-auto px-4 pb-12">
        <h2 className="text-center text-xl font-semibold text-slate-800 mb-6">
          你的 AI 员工团队
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {AGENTS.map((a) => (
            <div key={a.name} className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
              <div className="text-3xl">{a.emoji}</div>
              <div className="mt-2 font-medium text-slate-800">{a.name}</div>
              <div className="mt-1 text-sm text-slate-500 leading-relaxed">{a.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 最新作品 */}
      {works.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-slate-800">最新作品</h2>
            <Link href="/explore" className="text-sm text-indigo-600 hover:underline">
              查看全部 →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {works.map((w) => (
              <a
                key={w.id}
                href={`/p/${w.slug}`}
                target="_blank"
                className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow"
              >
                <div className="text-3xl">{w.icon || "✨"}</div>
                <div className="mt-2 font-medium text-slate-800">{w.title}</div>
                <div className="text-sm text-slate-500 line-clamp-2">{w.tagline}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400 bg-white">
        Atomix · 用 AI 员工团队造应用 · 本项目为笔试 Demo
      </footer>
    </main>
  );
}
