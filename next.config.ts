import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 为原生模块，服务端构建时外部化
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
