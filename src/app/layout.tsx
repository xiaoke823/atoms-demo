import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atomix · AI 员工团队造应用",
  description:
    "描述你的想法，AI 员工团队为你完成需求分析、技术方案、编码与质检，一键生成可运行的网页应用。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
