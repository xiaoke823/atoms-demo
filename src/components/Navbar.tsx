"use client";
// 全局顶栏：/p/* 公开页隐藏
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./Providers";
import CreditsPanel from "./CreditsPanel";

export default function Navbar() {
  const pathname = usePathname() || "";
  const { user, logout } = useAuth();
  const [showCredits, setShowCredits] = useState(false);
  if (pathname.startsWith("/p/")) return null;

  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-1.5 font-bold text-lg text-indigo-600">
          <span>⚛</span> <span>Atomix</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-1 text-sm text-slate-600">
          <Link className="px-3 py-1.5 rounded-md hover:bg-slate-100" href="/projects">
            我的项目
          </Link>
          <Link className="px-3 py-1.5 rounded-md hover:bg-slate-100" href="/explore">
            广场
          </Link>
        </nav>
        <div className="flex-1" />
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <div className="relative">
              <button
                onClick={() => setShowCredits((s) => !s)}
                className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-medium hover:bg-amber-100"
                title="积分余额（点击签到/流水）"
              >
                ⚡ {user.credits}
              </button>
              {showCredits && <CreditsPanel onClose={() => setShowCredits(false)} />}
            </div>
            <span className="text-slate-500 hidden md:inline max-w-36 truncate">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600"
            >
              登出
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Link href="/login" className="px-3 py-1.5 rounded-md hover:bg-slate-100 text-slate-600">
              登录
            </Link>
            <Link
              href="/register"
              className="px-3.5 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500"
            >
              免费注册
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
