# Atomix 生产镜像：多阶段构建，最终镜像只含 standalone 产物
# better-sqlite3 为原生模块：deps 阶段带编译链（prebuild 下载失败时兜底源码编译），
# runner 与 builder 同为 linux glibc（bookworm），二进制兼容。

# ── 依赖阶段 ──
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# - registry 用 npmmirror（国内明显快于官方）
# - build_from_source：强制 better-sqlite3 源码编译，跳过 prebuild-install
#   的 GitHub 下载（无超时机制，CN 网络下可挂 20 分钟+）
RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm_config_build_from_source=true npm ci --registry=https://registry.npmmirror.com

# ── 构建阶段 ──
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 所有 API 路由均为 force-dynamic，构建期不需要真实密钥
RUN npm run build

# ── 运行阶段 ──
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    ATOMIX_DB_PATH=/app/data/atomix.db

RUN groupadd -r atomix && useradd -r -g atomix atomix

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# 兜底：file tracing 对原生模块的 .node 二进制偶发漏拷，显式带上
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

RUN mkdir -p /app/data && chown -R atomix:atomix /app
USER atomix
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
