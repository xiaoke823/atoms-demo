"use client";
// 全局上下文：Toast 通知 + 登录用户状态
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api, getToken, setToken } from "@/lib/client";
import type { UserDTO } from "@/lib/types";

type ToastFn = (message: string, type?: "info" | "success" | "error") => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

interface AuthCtx {
  user: UserDTO | null;
  loading: boolean;
  setUser: (u: UserDTO | null) => void;
  refresh: () => Promise<void>;
  logout: () => void;
}
const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  setUser: () => {},
  refresh: async () => {},
  logout: () => {},
});
export const useAuth = () => useContext(AuthContext);

interface ToastItem {
  id: number;
  message: string;
  type: "info" | "success" | "error";
}

let seq = 0;

export default function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const toast = useCallback<ToastFn>((message, type = "info") => {
    const id = ++seq;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const d = await api<{ user: UserDTO }>("/api/auth/me");
      setUser(d.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ToastCtx.Provider value={toast}>
      <AuthContext.Provider value={{ user, loading, setUser, refresh, logout }}>
        {children}
        {/* Toast 容器 */}
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-4 py-2.5 rounded-lg shadow-lg text-sm text-white animate-[fadeIn_.2s_ease-out] ${
                t.type === "error"
                  ? "bg-red-500"
                  : t.type === "success"
                    ? "bg-emerald-500"
                    : "bg-slate-700"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      </AuthContext.Provider>
    </ToastCtx.Provider>
  );
}
