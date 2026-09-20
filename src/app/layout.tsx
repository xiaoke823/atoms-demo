import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Atomix · AI 员工团队造应用",
  description:
    "描述你的想法，AI 员工团队为你完成需求分析、技术方案、编码与质检，一键生成可运行的网页应用。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // suppressHydrationWarning: 浏览器插件(如 Trancy、沉浸式翻译)会在水合前往 <html>/<body> 注入属性
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900" suppressHydrationWarning>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
