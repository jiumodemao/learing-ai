# 多AI

全栈可交付的 AI 学习产品：从零基础到**能独立用 AI 赚钱**，手机 + 电脑都能运行。

## 架构

- **前端**：PWA 网页应用（手机浏览器"添加到主屏幕"即用，电脑浏览器直接打开）
- **后端**：Supabase Edge Functions（Serverless，代理调用 Gemini，API key 不出服务器）
- **数据库**：Supabase Postgres（账号、学习进度、任务、打卡、聊天记录，9 张表 + 行级权限）

## 本地打开

直接双击 `index.html`（未配置云端时以本地演示模式运行，数据存本机浏览器）。

## 接入步骤（一次性，约 20 分钟）

### A. 注册 Supabase（账号 + 数据库 + 后端）

1. 打开 supabase.com → 用 GitHub 账号登录（没有就免费注册）
2. **New project**：名字随意（如 duoai），区域选新加坡/东京，记下数据库密码
3. 等初始化完成（1-2 分钟）→ 左侧 **Integrations → Data API**（新版 Supabase 的 API 设置位置）：记下 **Project URL** 和 **anon public key**
4. 左侧 **SQL Editor → New query**：把 `supabase/migrations/0001_init.sql` 的内容全部粘贴 → **Run**（建表 + 课程数据 + 权限）
5. 左侧 **Authentication → Sign In / Providers → Email**：建议关闭 **Confirm email**（个人使用免去邮件确认一步）
6. 左侧 **Edge Functions → New function**：名称 `gemini-chat`，先随意部署占位
7. 在函数编辑器里把 `supabase/functions/gemini-chat/index.ts` 的内容粘贴进去 → **Deploy**
8. 函数详情 → **Secrets**：添加三个 secret（点 Add new secret）：
   - `GEMINI_API_KEY` = 步骤 B 拿到的 key
   - `SUPABASE_URL` = 第 3 步的 Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = Settings → API 里的 service_role key（保密，绝不给前端）

### B. 拿 Gemini 免费 API key

1. 打开 aistudio.google.com → 登录 Google 账号
2. **Get API key → Create API key** → 复制（免费额度足够个人学习使用）

### C. 填入配置

把第 3 步的 **Project URL** 和 **anon public key** 填进 `config.js`。

### D. 验证

刷新页面 → 右上角"登录" → 注册账号 → 三个标签页都试一遍：
- 今日任务：勾选/打卡（云端自动同步）
- AI 助教：提问（应该收到"小多"的回复，讲解后还会出题考你）

## 学习路径

五阶段 40 单元：会用 AI → 懂原理 → 会造 AI（全栈）→ 变现基础 → 变现实战冲刺营。
完整大纲见 [docs/学习路径大纲.md](docs/学习路径大纲.md)（v0.2 待审定）。

## 知识库管理（仅管理员）

- 登录管理员账号后，底部导航会出现第四个入口「知识库」：可在线编辑每课的标题/讲义/任务，保存即生效；也可一键导出 md 文件
- 讲义源文件在 `docs/knowledge-base/`（本地专属，**不上传 GitHub**）；修改 md 后运行 `node scripts/import-lessons.mjs` 重新导入数据库
- 安全：前端只对管理员显示入口，后端 kb-admin 函数校验管理员身份，普通用户写入一律 403

## 下一步（开发中）

任务生成器（按进度自动生成每日任务）→ 前端部署上线（手机安装到主屏幕）。
