-- 多AI 数据库初始化（在 Supabase SQL Editor 中整段执行）
-- 课程内容（stages/units 为公开只读，由大纲 seed）

create table if not exists stages (
  id serial primary key,
  ord int not null unique,
  title text not null,
  goal text,
  weeks text
);

create table if not exists units (
  id serial primary key,
  stage_id int not null references stages(id) on delete cascade,
  ord int not null,
  title text not null,
  description text,
  milestone text
);

create table if not exists lessons (
  id serial primary key,
  unit_id int not null references units(id) on delete cascade,
  ord int not null,
  title text not null,
  content text,          -- 讲义 Markdown（后续由助教/内容库生成）
  task text              -- 本课动手任务
);

-- 用户档案
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text default '同学',
  current_unit_id int references units(id),
  created_at timestamptz default now()
);

-- 学习进度
create table if not exists user_progress (
  user_id uuid references auth.users(id) on delete cascade,
  lesson_id int references lessons(id) on delete cascade,
  status text default 'not_started',  -- not_started | done
  done_at timestamptz,
  primary key (user_id, lesson_id)
);

-- 每日任务（登录用户当天自动生成）
create table if not exists daily_tasks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_date date not null default current_date,
  title text not null,
  unit_id int references units(id),
  done boolean not null default false,
  done_at timestamptz,
  unique (user_id, task_date, title)
);

-- 连续打卡
create table if not exists checkins (
  user_id uuid references auth.users(id) on delete cascade,
  check_date date not null default current_date,
  created_at timestamptz default now(),
  primary key (user_id, check_date)
);

-- 助教会话
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text default '新的对话',
  created_at timestamptz default now()
);

create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- ===== 权限（RLS：用户只能访问自己的数据）=====
alter table stages enable row level security;
alter table units enable row level security;
alter table lessons enable row level security;
alter table profiles enable row level security;
alter table user_progress enable row level security;
alter table daily_tasks enable row level security;
alter table checkins enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;

create policy "课程公开读" on stages for select using (true);
create policy "课程公开读" on units for select using (true);
create policy "课程公开读" on lessons for select using (true);

create policy "自己档案" on profiles for select using (auth.uid() = id);
create policy "自己档案更新" on profiles for update using (auth.uid() = id);
create policy "自己档案新建" on profiles for insert with check (auth.uid() = id);

create policy "自己进度" on user_progress for all using (auth.uid() = user_id);
create policy "自己任务" on daily_tasks for all using (auth.uid() = user_id);
create policy "自己打卡" on checkins for all using (auth.uid() = user_id);
create policy "自己会话" on chat_sessions for all using (auth.uid() = user_id);
create policy "自己消息" on chat_messages for all using (
  exists (select 1 from chat_sessions s where s.id = session_id and s.user_id = auth.uid())
);

-- ===== 种子数据：五阶段课程大纲 =====
insert into stages (ord, title, goal, weeks) values
(1, '阶段一 · 会用 AI —— 提效力', 'AI 变成你的外挂，日常提效 10 倍', '4-5 周'),
(2, '阶段二 · 懂原理 —— 认知力', '理解 AI 怎么工作、边界在哪、行业怎么运转', '4-5 周'),
(3, '阶段三 · 会造 AI —— 工程力', '全栈工程能力，独立做出并上线真实产品', '6-8 周'),
(4, '阶段四 · 变现基础 —— 商业力', '看懂 AI 时代怎么赚钱，选对赛道', '4-5 周'),
(5, '阶段五 · 变现实战 —— 冲刺营', '从 0 到第一笔真实收入', '8-12 周');

insert into units (stage_id, ord, title, description) values
(1,1,'认识 AI 与主流工具','生成式 AI 是什么；工具地图与选型；实测对比'),
(1,2,'提示词心法','万能提问框架；好提问 vs 坏提问；追问迭代'),
(1,3,'写作与内容提效','邮件/文案/总结/翻译/长文'),
(1,4,'办公提效实战','Excel/PPT/会议纪要/日程管理'),
(1,5,'信息力：AI 搜索与研究','调研正确姿势；识别幻觉；交叉验证'),
(1,6,'多模态实战','AI 画图；识图读 PDF；音视频工具'),
(1,7,'AI 工作流搭建','多工具打配合；高频场景 SOP 化'),
(1,8,'个人知识管理','用 AI 建第二大脑；笔记与知识库'),
(2,1,'大模型原理白话课','Token/参数/上下文；为什么模型像人'),
(2,2,'训练的秘密','预训练→微调→对齐；数据从哪来'),
(2,3,'主流模型与格局','各家特点；评测榜；怎么选模型（联动日报）'),
(2,4,'能力与边界','推理/记忆/幻觉；什么场景会翻车'),
(2,5,'提示词进阶','结构化提示；思维链；示例法；模板库'),
(2,6,'智能体 Agent 是什么','工具调用；规划；为什么 Agent 是主线'),
(2,7,'AI 行业商业版图','产业链；钱怎么流动；巨头牌局（日报案例）'),
(2,8,'安全、伦理与合规','隐私/版权/偏见/法规；从业常考'),
(3,1,'编程基础速通','HTML/CSS/JS 够用版：会改、会搭、会调'),
(3,2,'API 实战','API/Key/计费；Gemini 免费额度；第一次调用'),
(3,3,'第一个 AI 小工具','网页版 AI 问答/翻译器'),
(3,4,'后端与数据库入门','Supabase 建表/增删改查/鉴权/安全规则'),
(3,5,'前端进阶','移动优先/响应式；把界面做得像产品'),
(3,6,'搭 Agent','工具调用；多步骤任务编排'),
(3,7,'RAG 知识库','让 AI 读你的文档；私有数据问答'),
(3,8,'多模态应用','图像生成/识别；语音接入'),
(3,9,'部署上线','GitHub Pages/Vercel；域名；手机可访问'),
(3,10,'产品实战：完整 AI 应用','需求→设计→开发→上线→迭代'),
(4,1,'AI 赚钱全景图','就业岗位与创业模式全盘点；投入/周期/天花板'),
(4,2,'案例拆解','10 个真实变现案例逐案复盘（素材来自日报）'),
(4,3,'就业路线','简历包装；作品集；面试题；接单平台实操'),
(4,4,'内容变现路线','公众号/小红书/视频号 + AI 提效闭环'),
(4,5,'工具变现路线','痛点发现；小工具 MVP；定价与收费'),
(4,6,'服务变现路线','企业定制/咨询/培训：给不会 AI 的人提供服务'),
(4,7,'个人品牌','定位；持续输出；让钱主动找你'),
(4,8,'商业基本功','定价/成本/获客/合规；小生意财务常识'),
(5,1,'立项','选定方向，定义第一个付费 MVP'),
(5,2,'冲刺 1：做出 MVP','最小可用版本，先跑通再完善'),
(5,3,'冲刺 2：找到前 10 个用户','免费试用换反馈，或接第一单'),
(5,4,'冲刺 3：第一笔收款','打通收钱这件事，哪怕 1 块钱'),
(5,5,'迭代与放大','反馈→改进→提价/扩渠道'),
(5,6,'复盘与规划','数据复盘；下一步：副业/全职/求职');
