# Atomix MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现技术方案定义的"迷你 Atoms"——多智能体流水线生成单文件 HTML 应用的全栈平台（生成/迭代/发布/广场/Remix/积分）。

**Architecture:** Next.js 15 App Router 单体：前端剧场消费 SSE；服务端 pipeline 顺序调 LLM 四阶段（PM→架构→工程→QA+修复环）产出自包含 HTML；SQLite（better-sqlite3）4 张表；JWT（jose）+ scrypt 认证。

**Tech Stack:** Next.js 15 + TypeScript + Tailwind v4 + better-sqlite3 + jose + vitest（纯逻辑单测）+ scripts/e2e.mjs（全链路冒烟）

**Spec:** `C:\Users\15222\atoms-demo\技术方案.md`（含 SSE 事件协议 §3.4、流水线 prompt §3.5、积分数值 §2.3——数值与协议以 spec 为准，本计划不重复处引用之）

## Global Constraints

- 积分数值（spec §2.3）：注册+100 / 生成-10 / 迭代-2 / 发布+5 / 被 Remix+2 / 签到+20；扣减必须 `UPDATE users SET credits=credits-N WHERE id=? AND credits>=N`，影响行数=0 即不足
- SSE 事件类型仅：stage_start / delta / preview / done / error（字段见 spec §3.4）；`event: message\ndata: {JSON}\n\n` 格式；15s `: ping` 注释保活
- 预览与发布 iframe 一律 `sandbox="allow-scripts allow-forms allow-modals allow-popups"`（无 allow-same-origin）
- LLM 只经 `src/lib/llm.ts` 调用；env：LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / AUTH_SECRET；`.env*` 全部 gitignore，仓库只放 `.env.example`
- 生成限流 30s、迭代限流 15s（内存 Map，单实例，代码注释说明）
- 界面文案中文；角色名与配色：PM Emma #8b5cf6 / 架构师 Bob #3b82f6 / 工程师 Alex #10b981 / QA Iris #f59e0b
- 每个任务结束 git commit；测试命令统一 `npm test`（vitest run）

---

### Task 1: 项目脚手架

**Files:** Create: 仓库根 `C:\Users\15222\atomix`（create-next-app 生成）；`.env.local`（真实 Key，不入库）；`.env.example`；`data/.gitkeep`

- [ ] `npx create-next-app@latest atomix --ts --tailwind --eslint --app --src-dir --use-npm --yes`（在 C:\Users\15222 下执行；失败则降级 `--skip-install` 后 `npm i`）
- [ ] `npm i better-sqlite3 jose && npm i -D vitest`；package.json 加 `"test": "vitest run"`
- [ ] `.gitignore` 追加 `data/`；确认含 `.env*`
- [ ] `.env.local`：LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4、LLM_API_KEY=<真实Key>、LLM_MODEL=glm-4.5-flash、AUTH_SECRET=<32位随机串>；`.env.example` 同名占位
- [ ] layout.tsx metadata title "Atomix · AI 员工团队造应用"
- [ ] `npm run dev` 起服务，curl localhost:3000 返回 200；`git init` 已由脚手架完成，`git add -A && git commit -m "chore: scaffold atomix"`

### Task 2: 数据层 + 认证库（TDD）

**Files:** Create: `src/lib/db.ts`、`src/lib/auth.ts`、`src/lib/types.ts`；Test: `tests/db.test.ts`

**Interfaces (Produces):**
- `getDb(): Database`（单例，`data/atomix.db`，WAL；启动即 CREATE TABLE IF NOT EXISTS 四表，字段=spec §3.2）
- `hashPassword(pw): string` / `verifyPassword(pw, stored): boolean`（scrypt，存 `salt:hash` hex）
- `signToken({id,email}): Promise<string>` / `getUserFromRequest(req): {id,email,credits} | null`（jose HS256，7d，Authorization Bearer）
- `types.ts`：`SSEEvent = {type:'stage_start',agent,note?} | {type:'delta',agent,text} | {type:'preview',html} | {type:'stage_done',agent,artifact?} | {type:'done',projectId,credits} | {type:'error',message,code?}`；`Role='user'|'pm'|'architect'|'engineer'|'qa'`；`ProjectDTO`

- [ ] 测试先行：db 建表（用临时路径注入 `ATOMIX_DB_PATH`）、原子扣减（余额5 扣10 → 0 行）、流水写入；auth 往返（hash→verify true、错密码 false）
- [ ] 跑 `npm test` 确认先红后绿
- [ ] 实现 db.ts/auth.ts/types.ts 过测
- [ ] commit `feat: data layer + auth libs`

### Task 3: LLM 适配层 + 健康端点

**Files:** Create: `src/lib/llm.ts`、`src/app/api/health-llm/route.ts`；Modify: 无

**Interfaces (Produces):**
- `chat(messages:{role:'system'|'user'|'assistant',content:string}[], opts?:{temperature?:number,maxTokens?:number}):Promise<string>`（AbortController 120s 超时，失败重试1次）
- `chatStream(messages, onDelta:(t:string)=>void, opts?):Promise<string>`（stream:true 逐行解析 `data: {...}` 与 `data: [DONE]`，累积返回全文）

- [ ] 实现（用全局 fetch；URL = `${LLM_BASE_URL}/chat/completions`，body 带 model/messages/stream，头 Authorization Bearer）
- [ ] `GET /api/health-llm`：调 chat("回复两个字：正常")，返回 `{ok,model,reply}` 或 500 `{ok:false,error}`；route 声明 `export const runtime='nodejs'`
- [ ] dev 起服务 curl 该端点 → `ok:true`（真实模型回复）
- [ ] commit `feat: llm adapter`

### Task 4: 纯逻辑三件套 extract / qa / prompts（TDD）

**Files:** Create: `src/lib/extract.ts`、`src/lib/qa.ts`、`src/lib/prompts.ts`；Test: `tests/extract.test.ts`、`tests/qa.test.ts`

**Interfaces (Produces):**
- `extractJson(text): {ok:true,data:any}|{ok:false}`：剥 ```json 围栏 → JSON.parse；失败再取首个 `{` 到末个 `}` 子串 parse；再失败 ok:false
- `extractHtml(text): string|null`：/```html\s*([\s\S]*?)```/ 首匹配；无围栏但 trim 以 `<!DOCTYPE` 或 `<html` 开头则整段；否则 null
- `runRuleChecks(html): string[]`：spec §3.5 规则（doctype、`</html>`、script/style 配对、长度>2000、无 TODO/FIXME/your code here），返回 issues
- `prompts.ts`：`PM_SYSTEM / ARCHITECT_SYSTEM / ENGINEER_SYSTEM / QA_SYSTEM / REPAIR_ADDON / ITERATE_SYSTEM`（全文照抄 spec §3.5 与 prompts/04、06 的 prompt 正文）+ `buildArchitectUser(pmJson)`、`buildEngineerUser(pmJson,archJson,idea)`、`buildRepairUser(issues,html)`、`buildIterateUser(html,message)`

- [ ] 测试先行：围栏/无围栏/混杂文本的 json、html 提取；好坏 HTML 各构造样例跑规则；`npm test` 红→绿
- [ ] commit `feat: extract/qa/prompts`

### Task 5: 生成流水线 + SSE（核心后端）

**Files:** Create: `src/lib/pipeline.ts`、`src/lib/credits.ts`、`src/lib/ratelimit.ts`、`src/lib/sse.ts`、`src/app/api/projects/route.ts`

**Interfaces (Produces):**
- `sseFrame(ev:SSEEvent): string` → `event: message\ndata: ${JSON.stringify(ev)}\n\n`
- `checkRate(key,seconds): boolean`（内存 Map；通过则记录时间）
- `deductCredits(userId,n,reason): {ok,credits?}`（原子 UPDATE+流水，事务）；`grantCredits(userId,n,reason)`
- `POST /api/projects`（登录）：`{prompt}` → SSE 流：限流429 JSON → 余额<10 → error(code:INSUFFICIENT_CREDITS) → 预扣10 → 按 spec §3.5 顺序执行：PM(非流式+extractJson+重试1次+降级文本) → 架构师(同) → 工程师(流式 delta) → extractHtml 失败→error(退分) → preview → QA(规则+LLM JSON) → 不过则修复1轮(ENGINEER_SYSTEM+REPAIR_ADDON) → 新 preview → 规则复检 → 收尾：建 project(title/icon/tagline from PM JSON,html,prompt) + 写 5 条 messages(user/pm/architect/engineer/qa) → done{projectId,credits}
- `GET /api/projects`（登录）：我的项目倒序列表
- 路由内 ReadableStream + setInterval 15s 写 `: ping\n\n`，cancel 时 clearInterval + AbortController 中止 LLM；全程 try/catch → error 事件 + 退分（`+10 refund`，reason 'generate'）

- [ ] dev 下 curl -N -X POST -H auth 头 `{"prompt":"做一个极简番茄钟"}`：完整事件序列 pm→architect→engineer(delta大量)→preview→qa→done，credits=90
- [ ] 库中 project/messages/流水正确；30s 内重发 → 429；余额不足 → INSUFFICIENT_CREDITS
- [ ] commit `feat: generation pipeline with SSE`

### Task 6: 认证 API + 请求封装

**Files:** Create: `src/app/api/auth/register/route.ts`、`login/route.ts`、`me/route.ts`、`src/lib/client.ts`

**Interfaces (Produces):**
- register：校验邮箱/密码≥6 → 409 重复 → 建用户+`+100 register` 流水 → `{token,user:{id,email,credits}}`
- login：401 统一"邮箱或密码错误" → 同上结构
- me（Bearer）：`{user}` 或 401
- `client.ts`（客户端）：`api(path,init?)` 自动带 Bearer（localStorage 'atomix_token'）、401 时清 token 跳 /login；`postSSE(path,body,onEvent:(_:SSEEvent)=>void,onError):Promise<void>`（fetch + reader 按 `\n\n` 分帧解析 event/data）

- [ ] curl 三端点全流程（注册→重复注册409→登录→me）
- [ ] commit `feat: auth api + client`

### Task 7: 前端壳：导航/落地/登录注册

**Files:** Create: `src/components/Navbar.tsx`、`Toast.tsx`（context+useToast）、`src/app/register/page.tsx`、`login/page.tsx`；Modify: `src/app/page.tsx`、`layout.tsx`（挂 ToastProvider + Navbar，/p 路由不带——用 pathname startsWith('/p') 判断）

**要点：** 落地页 hero+输入框（提交→存 sessionStorage 'atomix_prompt' → /workspace/new）+4 chips+三员工介绍卡+最新作品3（fetch /api/explore?limit=3，空则隐藏）+footer；登录/注册成功存 token 跳 /；Navbar：Logo、工作台/我的项目/广场、积分徽章（点击开 CreditsPanel——Task 12 实装，先显示余额）、登录按钮或用户菜单（登出）。未登录访问受保护页：各页面自行判 token 跳 /login（无中间件，从简）。

- [ ] 手测：三页渲染、注册登录跳转、登出、刷新不掉登录态
- [ ] commit `feat: frontend shell`

### Task 8: 工作台剧场（核心前端）

**Files:** Create: `src/app/workspace/new/page.tsx`、`src/app/workspace/[id]/page.tsx`、`src/components/MessageCard.tsx`、`PreviewPane.tsx`、`src/lib/theater.ts`（客户端状态机：由 SSEEvent 流推导 cards[] 与 preview 状态，供两页复用）

**Interfaces (Produces):**
- `theater.ts`：`useTheater()` → `{cards, previewHtml, phase, credits, feed(ev), reset(), loading}`；card = `{role, name, status:'running'|'done', lines:string[], artifact?:any, repaired?:boolean, chars:number}`
- `MessageCard`：配色/头像/呼吸动画/打字点；pm artifact → name+icon+tagline+features chips；architect → palette 色块+modules；engineer → "生成完成 · X KB"折叠；qa → ✅ 或 "发现N问题已修复"
- `PreviewPane`：`mode:'code'|'live'`；code 态 pre 自动滚动（engineer delta 追加）；live 态 iframe srcdoc+sandbox 串；工具栏 🔄 / ↗(blob URL) / 🚀 发布（onPublish 回调，Task 10 接）
- `/workspace/new`：读 sessionStorage prompt → POST /api/projects（postSSE）→ feed 渲染 → done 后 router.replace(`/workspace/${id}`)（replace 前 cards 已完整，目标页从历史重载同内容）
- `/workspace/[id]`：GET 详情 → 历史卡片还原（完成态）+ preview；输入框（生成中禁用）→ Task 9 接迭代

- [ ] 手测：落地页输入"番茄钟"全程剧场（卡片依次出现/代码滚动/翻转预览/番茄钟可交互）；刷新 /workspace/[id] 无残留动画
- [ ] commit `feat: workspace theater`

### Task 9: 聊天迭代

**Files:** Create: `src/app/api/projects/[id]/chat/route.ts`；Modify: `src/app/workspace/[id]/page.tsx`、`src/lib/theater.ts`

**要点（= prompts/06 要点）：** 归属校验、html 非空 400、限流15s、预扣2、ITERATE_SYSTEM+buildIterateUser 流式 → extractHtml（失败→error+退2 refund）→ preview → 规则复检+修复一轮 → 更新 html/messages → done{credits}；前端：用户气泡入流+engineer"🔧 修改中"卡片+右栏回代码态→新预览；error code INSUFFICIENT_CREDITS → 弹窗引导（Task 12 完成弹窗，先 toast）。

- [ ] 手测："加暂停按钮且主色换青色" 生效；积分 90→88；15s 内连发 429
- [ ] commit `feat: chat iteration`

### Task 10: 发布 + 公开页 + 我的项目

**Files:** Create: `src/app/api/projects/[id]/publish/route.ts`（body `{action:'publish'|'unpublish'}`）、`src/app/p/[slug]/page.tsx`、`src/app/projects/page.tsx`；Modify: `PreviewPane`（发布按钮接通：成功 toast"+5 积分"+复制链接弹层）、`GET /api/projects/[id]`（Create: `src/app/api/projects/[id]/route.ts`，返回 project+messages+remix_of 标题）

**要点：** slug=6位小写字母数字随机（冲突重试）；publish → status/slug 落库+`+5 publish`；`/p/[slug]` server component 直查 db（未登录可访问）：全屏 iframe srcdoc+右下角半透明胶囊"⚛ Built with Atomix"（a target=_blank href=/）+ generateMetadata title；404 用 notFound()。projects 页：卡片列表（icon/title/status 标签/🌐+slug/Remix 标注/继续编辑）。

- [ ] 手测：发布→登出→游客访问 /p/xxx 可交互+角标回首页；unpublish 后 404；再发布新 slug
- [ ] commit `feat: publish + public page`

### Task 11: 广场 + Remix

**Files:** Create: `src/app/api/explore/route.ts`、`src/app/api/projects/[id]/remix/route.ts`、`src/components/ProjectCard.tsx`；Modify: `src/app/explore/page.tsx`

**要点（= prompts/08 要点）：** explore 无需登录 `?sort=new|hot&limit`，作者邮箱脱敏 `ja***@gmail.com`；remix：published 校验、不能 remix 自己(400)、复制新 draft(title+"（Remix）"、remix_of)、原作 count+1、原作者 `+2 remixed`、返回 `{id}`；前端卡片：emoji 大图标+按 unicode 哈希出的渐变底、View 新窗、Remix 登录态判断（未登录跳 /login?next=/explore）→ 成功跳 /workspace/:id+顶部"基于《xx》Remix"横幅；空状态引导。

- [ ] 手测：双账号 A 发布→B remix→B 可迭代→A +2 且 count+1；游客浏览正常
- [ ] commit `feat: explore + remix`

### Task 12: 积分完善

**Files:** Create: `src/app/api/credits/checkin/route.ts`、`transactions/route.ts`、`src/components/CreditsPanel.tsx`、`InsufficientModal.tsx`；Modify: `Navbar.tsx`（徽章点开 Panel）、workspace 两页（INSUFFICIENT_CREDITS → 弹窗：签到+20 / 去广场 Remix 免费，注明"演示环境暂不支持充值"）

**要点：** checkin 24h 冷却（last_checkin_at）429+nextAvailableAt；transactions 倒序分页；Panel：余额大字+签到按钮（冷却倒计时）+近10条流水（+绿/-红，reason 中文映射：注册赠送/生成应用/聊天迭代/发布奖励/被Remix/每日签到/退回）。

- [ ] 手测：签到+20、重复拦、扣到<10 后生成弹窗引导、签到后能继续
- [ ] commit `feat: credits system`

### Task 13: 打磨

**Files:** Modify: 全局（Toast 兜底"服务开小差了"、按钮防双击、SSE 断开恢复输入框+重新生成按钮、删除 health-llm、空/加载/错误态、footer）+ 根 `README.md`（项目介绍/环境变量表/本地启动/部署指引 Zeabur：创建服务+挂载 /data 持久卷+环境变量+Build 用 npx next build）+ `.env.example` 校对

- [ ] `npm run build` 通过；手测全站无 console 报错
- [ ] commit `polish: states, readme, deploy prep`

### Task 14: 端到端冒烟

**Files:** Create: `scripts/e2e.mjs`

**要点：** 对 dev server 纯 fetch 跑全链路：注册A→生成("极简番茄钟")→断言 preview+done credits=90→迭代("标题改成'专注钟'")→88→发布→游客 GET /p/:slug 含 html→注册B→explore 含该作→remix→A credits+2→B 签到+20→transactions 计数核对。SSE 用 reader 解析（复用 client.ts 逻辑的 node 版）。`npm run dev` 先起。

- [ ] `node scripts/e2e.mjs` 全绿（含一次真实 LLM 生成，约 1-2 分钟）
- [ ] 发现问题回改对应任务；全绿后 commit `test: e2e smoke`

### Task 15: 交付包

- [ ] 按模板填 `atoms-demo/提交说明模板.md`（技术栈/完成度按实况勾选）
- [ ] 用户操作：Zeabur 部署 + 域名可访问性验证（手机流量）+ GitHub 推送（确认无 .env）+ 预发布 4 个示例应用（番茄钟/记账本/宠物领养/贪吃蛇）
- [ ] 提醒：控制台重置 API Key（已泄漏于聊天记录）

## Self-Review 结论

- 覆盖 spec：§2 流程（T5,8,9,10,11,12）、§3.2 表（T2）、§3.3 API（T5,6,10,11,12）、§3.4 SSE（T5）、§3.5 流水线（T4,5）、§3.7 适配层（T3）、§4 UI（T7,8,12,13）、安全 §3.8（T2 sandbox/限流，T8 iframe）✅ 无缺口
- 类型一致：SSEEvent/Role/ProjectDTO 定义于 T2，T5/6/8/9 消费 ✅
- 无占位符；时间盒约 6-7h ✅
