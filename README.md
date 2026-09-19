# Atomix ⚛ — 多智能体应用生成平台

> 本项目为 Atoms 笔试 Demo：还原 [Atoms](https://atoms.dev/) 的核心体验——描述想法，AI 员工团队（💜 产品经理 Emma、🏗 架构师 Bob、💚 工程师 Alex、🧡 质检 Iris）依次完成需求分析、技术方案、编码、质检，产出一个**可运行的单文件网页应用**：实时预览、聊天迭代、一键发布公开链接、作品广场 Remix、积分经济闭环。

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填入你的 LLM 配置（见下）
npm run dev                  # http://localhost:3000
```

数据库为本地 SQLite 文件（`data/atomix.db`），首次启动自动建表，无需迁移。

## 环境变量

| 变量 | 说明 |
|---|---|
| `LLM_BASE_URL` | OpenAI 兼容端点。默认智谱 `https://open.bigmodel.cn/api/paas/v4`；DeepSeek 用 `https://api.deepseek.com`；通义用 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `LLM_API_KEY` | 对应平台的按量付费 API Key（**不要提交到仓库**） |
| `LLM_MODEL` | 默认 `glm-4.5-flash`（免费档，1 并发）。生成一个应用约 3-5 分钟；追求速度可换付费旗舰模型，仅需改此变量 |
| `AUTH_SECRET` | JWT 签名密钥，随机 hex：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

**换供应商 = 改三个环境变量，零代码改动**（`src/lib/llm.ts` 适配层）。

## 核心架构

```
浏览器 ── SSE ──> Next.js API（流水线编排器）
                    ├─ 💜 PM        LLM·流式  → 需求 JSON（应用名/icon/功能清单）
                    ├─ 🏗 架构师     LLM·流式  → 方案 JSON（布局/模块/配色）
                    ├─ 💚 工程师     LLM·流式  → 完整单文件 HTML（Tailwind CDN）
                    ├─ 🧡 QA        规则引擎 + LLM 快审
                    └─ 🔧 修复      不合格自动打回，最多一轮
                 SQLite（users / projects / messages / credit_transactions）
```

- **确定性流水线而非自由 Agent 循环**：成本可控、无死循环、产出可解析
- **单文件 HTML 产出**："生成即部署"——iframe srcdoc 预览、存库即发布（`/p/:slug`）
- **积分原子扣减**：`UPDATE ... WHERE credits >= ?` 防并发透支；失败自动退分
- 生成限流 30s / 迭代限流 15s（内存实现，单实例）

## 功能清单

- 注册/登录（JWT），注册送 100 积分
- 多智能体生成剧场（角色卡片、流式打字、代码视图→实时预览翻转、QA 修复环）
- 聊天迭代（完整重生成 + 失败退分）
- 一键发布 `/p/:slug`（游客可访问 + Built with Atomix 角标，首次发布 +5）
- 作品广场（最新/最热）+ Remix（复制谱系、原作计数、原作者 +2）
- 积分系统：签到 +20（24h 冷却）、流水记录、余额不足引导弹窗

## 测试

```bash
npm test                # 单元测试（extract / QA 规则引擎 / 积分原子性）
node scripts/e2e.mjs    # 端到端冒烟（需先 npm run dev；含一次真实 LLM 生成）
```

## 部署（Zeabur 示例）

1. 导入 GitHub 仓库，Build Command: `npm run build`，Start: `npm start`
2. 挂载持久卷到 `/app/data`（保住 SQLite 文件）
3. 配置环境变量（同上表）

## 说明

- 本 Demo 由 Claude Code 按"技术方案 → 分任务实施计划 → TDD"流程实现，方案文档见仓库 `docs/` 与配套笔试文档
- 生成质量依赖所配模型；免费档适合演示，商用请换付费档
