// /p/:slug —— 已发布应用公开访问页（无需登录）
// 全屏 iframe + "Built with Atomix" 角标（引流回落地页）
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface PublicProject {
  title: string;
  html: string | null;
}

function findBySlug(slug: string): PublicProject | null {
  const row = getDb()
    .prepare(
      "SELECT title, html FROM projects WHERE slug = ? AND status = 'published'"
    )
    .get(slug) as PublicProject | undefined;
  return row && row.html ? row : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = findBySlug(slug);
  return { title: p ? `${p.title} · Atomix` : "应用不存在 · Atomix" };
}

export default async function PublicAppPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = findBySlug(slug);
  if (!p) notFound();

  return (
    <main className="fixed inset-0 bg-white">
      <iframe
        title={p.title}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        srcDoc={p.html as string}
      />
      <a
        href="/"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-4 right-4 z-10 px-3.5 py-1.5 rounded-full bg-slate-900/70 text-white text-xs backdrop-blur hover:bg-slate-900/90 transition-colors"
      >
        ⚛ Built with Atomix
      </a>
    </main>
  );
}
