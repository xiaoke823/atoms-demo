# 部署指南（VPS + Docker）

单容器部署：Next.js standalone + SQLite（数据卷持久化）。
生成一次应用需要 **3~11 分钟的 SSE 长连接**，因此只适合长驻进程（VPS/容器），不适合 Vercel 等 Serverless 平台。

## 0. 前置条件

- 一台 Linux 服务器（1 核 2G 起步即可），能访问外网（拉镜像、调 LLM API）
- 可选：一个域名（用于 HTTPS）

## 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

### 1.5 国内服务器必做：镜像加速

国内服务器直连 Docker Hub / Debian / npm 官方源极慢（构建可卡 30 分钟以上）。Dockerfile 内已内置 Debian 与 npm 的国内源替换；还需给 Docker 配置镜像拉取加速（用阿里云免费的[容器镜像服务加速地址](https://cr.console.aliyun.com/cn-hangzhou/instances/mirrors)，登录后在"镜像加速器"页拿到专属地址）：

```bash
sudo tee /etc/docker/daemon.json <<'EOF'
{ "registry-mirrors": ["https://<你的加速地址>.mirror.aliyuncs.com"] }
EOF
sudo systemctl daemon-reload && sudo systemctl restart docker
```

> 若已有其他可用的镜像加速地址（网易/中科大等），填进去即可，不局限于阿里云。

## 2. 获取代码

```bash
# 方式一：git
git clone <你的仓库地址> atomix && cd atomix
# 方式二：本机打包上传（排除依赖与本地数据）
# tar --exclude node_modules --exclude .next --exclude data -czf atomix.tar.gz . && scp atomix.tar.gz user@server:~
```

## 3. 配置环境变量

```bash
cp .env.production.example .env.production
openssl rand -hex 32        # 生成的值填入 AUTH_SECRET
vim .env.production         # 填 AUTH_SECRET 和 LLM_API_KEY
```

> **AUTH_SECRET 必须设置**：不设置会回退到代码里的开发密钥，任何人都能伪造登录 token。

## 4. 构建并启动

```bash
docker compose up -d --build
docker compose ps                      # 应显示 healthy（约 30 秒后）
curl http://localhost:3000/api/health  # {"ok":true}
```

## 5. Nginx 反向代理 + HTTPS

安装 nginx 与 certbot 后，站点配置 `/etc/nginx/sites-available/atomix`：

```nginx
server {
    listen 80;
    server_name your-domain.com;   # 换成你的域名或服务器 IP

    location / {
        proxy_pass http://127.0.0.1:3000;

        # ── SSE 关键配置（缺一生成过程会卡住/断流）──
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;            # 关闭缓冲，事件实时下发
        proxy_cache off;
        proxy_read_timeout 660s;        # 大于最长生成时间（11 分钟）
        proxy_send_timeout 660s;
        # ────────────────────────────────

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/atomix /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# 有域名的话上 HTTPS：
sudo certbot --nginx -d your-domain.com
```

## 6. 数据备份 / 恢复

SQLite 在命名卷 `atomix-data` 里（`/app/data/atomix.db`）。

```bash
# 备份（建议 crontab 定时）
docker exec atomix node -e "require('better-sqlite3')('/app/data/atomix.db').backup('/app/data/backup.db')"
docker cp atomix:/app/data/backup.db ./atomix-$(date +%F).db

# 恢复：停容器 → 覆盖卷内 atomix.db → 起容器
docker compose down
docker run --rm -v atomix-data:/data -v $PWD/atomix-2026-09-20.db:/src.db alpine cp /src.db /data/atomix.db
docker compose up -d
```

## 7. 更新版本

```bash
git pull            # 或重新上传代码
docker compose up -d --build
```

## 8. 排查

```bash
docker compose logs -f web          # 实时日志（含 LLM 报错、生成失败原因）
docker exec -it atomix sh           # 进容器
docker exec atomix node -e "console.log(process.env.AUTH_SECRET ? 'SET' : 'MISSING')"
```

常见问题：

| 症状 | 原因 |
|---|---|
| `docker compose build` 长时间卡在 apt/npm 步骤 | 国内访问境外源极慢：确认用的是本仓库 Dockerfile（已内置国内源）；并按 §1.5 配置镜像加速 |
| 生成卡在"构思方案"后失败 | 服务器出不了网，调不通 LLM API；`docker exec atomix node -e "fetch(process.env.LLM_BASE_URL+'/models').then(r=>console.log(r.status)).catch(e=>console.log('FAIL',e.message))"` |
| 页面能开但登录就 401 | `.env.production` 未配置或改后未 `docker compose up -d` 重建 |
| 走 Nginx 后生成几分钟必断 | Nginx 缺 SSE 配置（`proxy_buffering off` / `proxy_read_timeout`） |
| 容器反复重启 | `docker compose logs` 看启动报错；常见是卷权限（确认未改动 Dockerfile 的 user 配置） |

## 9. 运维边界

- **只跑单实例**：限流是进程内存 Map，`docker compose` 不要扩副本
- LLM 供应商额度/限流（尤其免费档 glm-4.5-flash）是生成失败的首要外部因素
- 服务器内存 2G 够用（Next standalone 常驻约 150~250MB）
