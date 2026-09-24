import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 为原生模块，jsdom 体积大且仅在 worker 中运行时 require——均外部化
  serverExternalPackages: ["better-sqlite3", "jsdom"],
  // 产物自含最小 server.js（Docker 部署用；见 DEPLOY.md）
  output: "standalone",
};

export default nextConfig;
