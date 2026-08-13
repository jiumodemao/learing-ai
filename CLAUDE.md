# 多AI

全栈可交付的 AI 学习产品：把用户（AI 小白）从零培养到**能独立用 AI 赚钱**（就业或创业），手机 + 电脑都能运行。

## 架构（全栈三层）

```
前端 PWA（手机/电脑浏览器）     后端（Supabase Edge Functions）      数据库（Supabase Postgres）
index.html / app.js      →      gemini-chat（Deno TS，验证登录     →  9 张表：课程/用户/进度/任务/
config.js / auth.js              后代理调用 Gemini，key 只存服务端）     打卡/会话/消息，全部 RLS 隔离
```

- 前端：纯原生 HTML/CSS/JS + supabase-js（CDN），零构建，双击 index.html 即可打开
- 后端：Supabase Edge Functions（Serverless，免费额度），当前一个函数 `gemini-chat`
- 数据库：Supabase Postgres，schema 在 `supabase/migrations/0001_init.sql`（含五阶段课程种子数据与 RLS 策略）
- AI：Gemini 免费 API（用户自备 key，模型用环境变量 GEMINI_MODEL 配置，默认 gemini-2.5-flash）

## 已定决策（2026-08-13 与用户确认）

- 名称：多AI；PWA 双端；中文大白话 UI
- 核心功能：① 学习路径+每日计划（五阶段 40 单元）② AI 助教（Gemini，带课程进度上下文、小白人设、讲完出题）③ 账号同步（Supabase Auth + 云端数据）
- 大纲 v0.2：会用→懂原理→会造（全栈）→变现基础→变现实战冲刺营，主线是能力提升与赚钱（"培养能赚钱的人"）
- 与用户的"AI 热点日报"Agent 联动：日报是免费商业案例课

## 文件结构

- 前端（根目录）：`index.html`、`styles.css`、`app.js`（主逻辑，云端/本地双模式）、`auth.js`（登录注册）、`config.js`（Supabase URL/Key 占位）、`manifest.json`、`sw.js`、`icon.svg`
- 后端：`supabase/functions/gemini-chat/index.ts`
- 数据库：`supabase/migrations/0001_init.sql`（建表 + RLS + 课程种子）
- 文档：`docs/学习路径大纲.md`（v0.2，待用户审定）；`README.md`（含用户接入步骤）

## 约定

- API key 一律只存服务端（Edge Function Secrets），永不进前端
- 未配置 Supabase 时 App 必须能本地演示（localStorage 模式），配置+登录后自动切云端
- 课程内容（讲义/测验）由助教 + 我生成，写进 lessons 表；大纲变更时重跑迁移种子
- sw.js 缓存名带版本号，改前端资源时升级

## 下一步

1. 用户注册 Supabase + Gemini key（步骤见 README）→ 填 config.js
2. 部署：跑 0001_init.sql → 部署 gemini-chat 函数 + secrets → 联调登录/同步/助教
3. 大纲审定 → 课程讲义内容生成（分单元，助教人设联动）
4. 任务生成器（按用户进度自动生成每日任务；可用 pg_cron 或前端生成）
5. 前端部署（GitHub Pages/Vercel），手机"添加到主屏幕"
