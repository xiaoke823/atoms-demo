"use client";
// 积分面板：余额 + 每日签到 + 近期流水（挂在顶栏徽章下）
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { TxDTO } from "@/lib/types";
import { useAuth, useToast } from "./Providers";

const REASON_MAP: Record<string, string> = {
  register: "注册赠送",
  generate: "生成应用",
  iterate: "聊天迭代",
  publish: "发布奖励",
  remixed: "被 Remix",
  checkin: "每日签到",
  refund: "退回",
};

export default function CreditsPanel({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { user, refresh } = useAuth();
  const [txs, setTxs] = useState<TxDTO[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextAt, setNextAt] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ items: TxDTO[] }>("/api/credits/transactions?limit=10")
      .then((d) => setTxs(d.items))
      .catch(() => setTxs([]));
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);

  const checkin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/credits/checkin", { method: "POST" });
      toast("签到成功 +20 ⚡", "success");
      refresh();
      const d = await api<{ items: TxDTO[] }>("/api/credits/transactions?limit=10");
      setTxs(d.items);
      setNextAt(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
    } catch (e: any) {
      if (e?.status === 429) {
        setNextAt(
          e.data?.nextAvailableAt || new Date(Date.now() + 3600_000).toISOString()
        );
        toast(e.message || "今天已签到", "error");
      } else {
        toast(e.message || "签到失败", "error");
      }
    } finally {
      setBusy(false);
    }
  };

  const countdown = nextAt
    ? new Date(new Date(nextAt).getTime() - Date.now()).toISOString().slice(11, 19)
    : null;

  return (
    <div
      ref={boxRef}
      className="absolute right-0 top-11 w-72 rounded-2xl border border-slate-200 bg-white shadow-xl p-4 z-50"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-500">当前余额</span>
        <span className="text-2xl font-bold text-amber-500">⚡ {user?.credits ?? "-"}</span>
      </div>

      <button
        onClick={checkin}
        disabled={busy || !!nextAt}
        className="mt-3 w-full py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400 disabled:opacity-60"
      >
        {nextAt ? `已签到 · ${countdown} 后可再签` : busy ? "签到中…" : "每日签到 +20"}
      </button>

      <div className="mt-4 text-xs text-slate-400 mb-1.5">最近流水</div>
      <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
        {txs === null ? (
          <div className="py-3 text-sm text-slate-400">加载中…</div>
        ) : txs.length === 0 ? (
          <div className="py-3 text-sm text-slate-400">暂无记录</div>
        ) : (
          txs.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-slate-600">{REASON_MAP[t.reason] || t.reason}</span>
              <span
                className={t.amount > 0 ? "text-emerald-600 font-medium" : "text-red-500"}
              >
                {t.amount > 0 ? `+${t.amount}` : t.amount}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
        生成 -10 · 迭代 -2 · 发布 +5 · 被 Remix +2 · 签到 +20
        <br />
        演示环境，暂不支持充值
      </div>
    </div>
  );
}
