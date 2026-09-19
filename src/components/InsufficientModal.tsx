"use client";
// 积分不足引导弹窗：签到 / 去 Remix
import { useRouter } from "next/navigation";

export default function InsufficientModal({
  onClose,
  onCheckin,
}: {
  onClose: () => void;
  onCheckin?: () => void;
}) {
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900">⚡ 积分不足</h3>
        <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
          这次操作需要的积分不够了。可以签到领取，或去广场 Remix 别人的作品（免费）找找灵感。
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={() => {
              onCheckin?.();
              onClose();
            }}
            className="w-full py-2.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400"
          >
            每日签到 +20
          </button>
          <button
            onClick={() => {
              router.push("/explore");
              onClose();
            }}
            className="w-full py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
          >
            去广场找灵感（Remix 免费）
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">演示环境，暂不支持充值</p>
      </div>
    </div>
  );
}
