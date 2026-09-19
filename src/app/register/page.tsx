"use client";
// 注册页
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/client";
import { useAuth, useToast } from "@/components/Providers";
import type { UserDTO } from "@/lib/types";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api<{ token: string; user: UserDTO }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(d.token);
      setUser(d.user);
      toast("注册成功，已赠送 100 积分 ⚡", "success");
      router.push("/");
    } catch (err: any) {
      toast(err.message || "注册失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-bold text-slate-900">创建账号</h1>
        <p className="mt-1 text-sm text-slate-500">注册即送 100 积分，可生成 10 个应用</p>
        <label className="block mt-6 text-sm font-medium text-slate-700">
          邮箱
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full px-3.5 py-2.5 rounded-lg border border-slate-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="you@example.com"
          />
        </label>
        <label className="block mt-4 text-sm font-medium text-slate-700">
          密码
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full px-3.5 py-2.5 rounded-lg border border-slate-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="至少 6 位"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full py-2.5 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "创建中…" : "注册"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-500">
          已有账号？{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            直接登录
          </Link>
        </p>
      </form>
    </main>
  );
}
