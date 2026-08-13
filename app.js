// 多AI 主逻辑 v2
// 两种模式自动切换：
//  - 云端模式：Supabase 已配置且已登录（任务/打卡/聊天/课程全部上云）
//  - 本地模式：未配置或未登录（数据存 localStorage，界面可演示）
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ---------- 工具 ----------
  const today = new Date();
  const dateKey = () => today.toISOString().slice(0, 10);
  const storage = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  };

  // 今日任务模板（后续由任务生成器按学习进度自动生成）
  const TASK_TEMPLATE = [
    '完成当前单元的一节课程（去学习路径里选）',
    '动手：把今天学的用 AI 实操一次',
    '向助教提问，或做一道小测验',
  ];

  // ---------- 标签页 ----------
  const tabs = $$('.tab');
  const panels = $$('.tab-panel');
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    t.classList.add('active');
    $('#tab-' + t.dataset.tab).classList.add('active');
  }));

  // ---------- 今日任务 ----------
  const taskListEl = $('#task-list');

  function updateProgress() {
    const all = taskListEl.querySelectorAll('input').length;
    const done = taskListEl.querySelectorAll('input:checked').length;
    $('#task-progress-text').textContent = `${done}/${all} 任务`;
    $('#progress-fill').style.width = all ? (done / all) * 100 + '%' : '0%';
    const btn = $('#checkin-btn');
    btn.disabled = done < all;
    btn.textContent = done < all ? `完成今日任务并打卡（${done}/${all}）` : '完成今日任务并打卡';
  }

  function renderTasks(rows) {
    taskListEl.innerHTML = '';
    rows.forEach((t) => {
      const li = document.createElement('li');
      li.innerHTML = `<input type="checkbox"${t.done ? ' checked' : ''}><span>${t.title}</span>`;
      li.classList.toggle('done', !!t.done);
      li.querySelector('input').addEventListener('change', (e) => {
        const done = e.target.checked;
        li.classList.toggle('done', done);
        persistTask(t, done);
        updateProgress();
      });
      taskListEl.appendChild(li);
    });
    updateProgress();
  }

  async function persistTask(t, done) {
    const s = getSupabase(), u = getCurrentUser();
    if (s && u) {
      await s.from('daily_tasks')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', t.id);
    } else {
      const localId = t.localId ?? t.id;
      const doneIds = storage.get('tasks-' + dateKey(), []);
      storage.set('tasks-' + dateKey(), done ? [...doneIds, localId] : doneIds.filter((x) => x !== localId));
    }
  }

  async function loadTasks() {
    const s = getSupabase(), u = getCurrentUser();
    if (s && u) {
      let { data } = await s.from('daily_tasks')
        .select('*').eq('user_id', u.id).eq('task_date', dateKey());
      if (!data || data.length === 0) {
        await s.from('daily_tasks').insert(
          TASK_TEMPLATE.map((title) => ({ user_id: u.id, task_date: dateKey(), title }))
        );
        data = (await s.from('daily_tasks')
          .select('*').eq('user_id', u.id).eq('task_date', dateKey())).data;
      }
      renderTasks(data || []);
    } else {
      const doneIds = storage.get('tasks-' + dateKey(), []);
      renderTasks(TASK_TEMPLATE.map((title, i) => ({
        localId: 't' + i, title, done: doneIds.includes('t' + i),
      })));
    }
  }

  // ---------- 日期与打卡 ----------
  $('#today-date').textContent = today.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  function calcStreak(dates) {
    const set = new Set(dates);
    const d = new Date();
    if (!set.has(dateKey())) d.setDate(d.getDate() - 1);
    let n = 0;
    while (set.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  async function updateStreak() {
    const s = getSupabase(), u = getCurrentUser();
    let count = 0;
    if (s && u) {
      const { data } = await s.from('checkins').select('check_date').eq('user_id', u.id);
      count = calcStreak((data || []).map((r) => r.check_date));
    } else {
      count = storage.get('streak-count', 0);
    }
    $('#streak').textContent = `🔥 连续 ${count} 天`;
  }

  $('#checkin-btn').addEventListener('click', async () => {
    const s = getSupabase(), u = getCurrentUser();
    if (s && u) {
      await s.from('checkins').upsert(
        { user_id: u.id, check_date: dateKey() }, { onConflict: 'user_id,check_date' }
      );
    } else {
      const st = storage.get('streak', { lastDate: '', count: 0 });
      const y = new Date(today); y.setDate(today.getDate() - 1);
      const yKey = y.toISOString().slice(0, 10);
      if (st.lastDate === dateKey()) return;
      st.count = st.lastDate === yKey ? st.count + 1 : 1;
      st.lastDate = dateKey();
      storage.set('streak', st);
      storage.set('streak-count', st.count);
    }
    $('#checkin-btn').textContent = '已打卡，明天继续！';
    updateStreak();
  });

  // ---------- 学习路径 ----------
  // 未登录时的演示数据
  const PATH_DEMO = [
    { title: '阶段一 · 会用 AI —— 提效力', goal: 'AI 变成你的外挂，日常提效 10 倍',
      units: ['认识 AI 与主流工具', '提示词心法', '写作与内容提效', '办公提效实战', '信息力：AI 搜索与研究', '多模态实战', 'AI 工作流搭建', '个人知识管理'] },
    { title: '阶段二 · 懂原理 —— 认知力', goal: '理解 AI 怎么工作、边界在哪、行业怎么运转',
      units: ['大模型原理白话课', '训练的秘密', '主流模型与格局', '能力与边界', '提示词进阶', '智能体 Agent 是什么', 'AI 行业商业版图', '安全、伦理与合规'] },
    { title: '阶段三 · 会造 AI —— 工程力', goal: '全栈工程能力，独立做出并上线真实产品',
      units: ['编程基础速通', 'API 实战', '第一个 AI 小工具', '后端与数据库入门', '前端进阶', '搭 Agent', 'RAG 知识库', '多模态应用', '部署上线', '产品实战：完整 AI 应用'] },
    { title: '阶段四 · 变现基础 —— 商业力', goal: '看懂 AI 时代怎么赚钱，选对赛道',
      units: ['AI 赚钱全景图', '案例拆解', '就业路线', '内容变现路线', '工具变现路线', '服务变现路线', '个人品牌', '商业基本功'] },
    { title: '阶段五 · 变现实战 —— 冲刺营', goal: '从 0 到第一笔真实收入（项目制）',
      units: ['立项：定义付费 MVP', '冲刺 1：做出 MVP', '冲刺 2：找到前 10 个用户', '冲刺 3：第一笔收款', '迭代与放大', '复盘与规划'] },
  ];

  function renderPath(root, stages) {
    root.innerHTML = '';
    stages.forEach((st, i) => {
      const card = document.createElement('div');
      card.className = 'card stage-card stage-c' + ((i % 5) + 1);
      card.innerHTML = `<h2 class="stage-title">${st.title}</h2><p class="muted">${st.goal || ''}</p><ul class="unit-list"></ul>`;
      const ul = card.querySelector('.unit-list');
      (st.units || []).forEach((un, j) => {
        const li = document.createElement('li');
        li.className = 'unit';
        li.innerHTML = `<span class="unit-num">${j + 1}</span><span class="unit-main"><span class="unit-title">${un.title}</span>${un.description ? `<span class="unit-desc">${un.description}</span>` : ''}</span>`;
        if (un.id) li.addEventListener('click', () => openUnit(un.id));
        ul.appendChild(li);
      });
      root.appendChild(card);
    });
  }

  async function loadPath() {
    const root = $('#path-root');
    const s = getSupabase(), u = getCurrentUser();
    if (s && u) {
      try {
        const { data: stages } = await s.from('stages').select('*').order('ord');
        const { data: units } = await s.from('units').select('*').order('ord');
        renderPath(root, (stages || []).map((st) => ({
          ...st,
          units: (units || []).filter((x) => x.stage_id === st.id),
        })));
        return;
      } catch { /* 失败则用演示数据 */ }
    }
    renderPath(root, PATH_DEMO.map((st) => ({ title: st.title, goal: st.goal, units: st.units.map((t) => ({ title: t })) })));
  }

  // Markdown 渲染（安全过滤）
  const renderMD = (t) => {
    try {
      if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(t));
    } catch { /* 渲染失败就返回纯文本 */ }
    return String(t).replace(/</g, '&lt;');
  };

  async function openUnit(unitId) {
    const s = getSupabase();
    if (!s) return;
    $('#unit-modal').hidden = false;
    $('#unit-title').textContent = '加载中…';
    $('#unit-stage').textContent = '';
    $('#unit-desc').textContent = '';
    $('#unit-lessons').innerHTML = '<p class="muted">加载中…</p>';

    const { data: unit } = await s.from('units').select('*, stages(title)').eq('id', unitId).maybeSingle();
    $('#unit-title').textContent = unit?.title || '单元';
    $('#unit-stage').textContent = unit?.stages?.title || '';
    $('#unit-desc').textContent = unit?.description || '';

    const { data: lessons } = await s.from('lessons').select('*').eq('unit_id', unitId).order('ord');
    const box = $('#unit-lessons');
    box.innerHTML = '';
    if (!lessons || lessons.length === 0) {
      box.innerHTML = '<p class="muted">讲义撰写中，敬请期待…</p>';
      return;
    }
    lessons.forEach((l, i) => {
      const div = document.createElement('div');
      div.className = 'lesson';
      div.innerHTML = `<div class="lesson-title">第 ${i + 1} 课 · ${l.title}</div>` +
        (l.content ? `<div class="md-body">${renderMD(l.content)}</div>` : '<p class="muted">内容撰写中…</p>') +
        (l.task ? `<div class="lesson-task"><b>动手任务：</b>${l.task}</div>` : '');
      box.appendChild(div);
    });
  }
  $('#unit-close').addEventListener('click', () => { $('#unit-modal').hidden = true; });
  // 点遮罩关闭 / Esc 关闭（两个弹窗通用）
  $('#unit-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('#unit-modal').hidden = true; $('#auth-modal').hidden = true; }
  });

  // ---------- AI 助教（流式 + Markdown） ----------
  let chatSessionId = null;
  const msgs = $('#chat-messages');
  const chatInput = $('#chat-input');

  function addRow(who, html, isMD) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + who;
    row.innerHTML = `<div class="avatar">${who === 'me' ? '我' : '小'}</div><div class="bubble ${isMD ? 'md-body' : ''}"></div>`;
    const bubble = row.querySelector('.bubble');
    if (isMD) bubble.innerHTML = html; else bubble.textContent = html;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
    return { row, bubble };
  }

  function addTyping() {
    const row = addRow('tutor', '', false);
    row.bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    return row;
  }

  async function currentContext() {
    const s = getSupabase(), u = getCurrentUser();
    if (!s || !u) return '尚未开始课程';
    const { data } = await s.from('profiles')
      .select('units(title, stages(title))')
      .eq('id', u.id).maybeSingle();
    const unit = data?.units;
    return unit
      ? `正在学习：${unit.stages?.title ?? ''} / ${unit.title ?? ''}`
      : '刚开始学习，尚未选择单元';
  }

  async function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    addRow('me', text, false);
    chatInput.value = '';

    const s = getSupabase(), u = getCurrentUser();
    if (!isConfigured()) {
      addRow('tutor', '助教还没接入：需要先完成 Supabase + Gemini 配置（见 README）。', false);
      return;
    }
    if (!s || !u) {
      addRow('tutor', '请先登录，助教需要账号来记录你的学习进度。', false);
      return;
    }

    const typing = addTyping();
    let acc = '';
    try {
      const { data: sd } = await s.auth.getSession();
      const token = sd?.session?.access_token;
      if (!token) throw new Error('登录状态已失效，请重新登录');

      const res = await fetch(APP_CONFIG.SUPABASE_URL + '/functions/v1/gemini-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ sessionId: chatSessionId, message: text, context: await currentContext() }),
      });
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { msg = (await res.json()).error || msg; } catch { /* 非 JSON */ }
        throw new Error(msg);
      }
      chatSessionId = res.headers.get('X-Session-Id') || chatSessionId;

      // 逐字接收流式回复
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const o = JSON.parse(line.slice(6));
              if (o.delta) {
                acc += o.delta;
                typing.bubble.classList.add('md-body');
                typing.bubble.innerHTML = renderMD(acc);
                msgs.scrollTop = msgs.scrollHeight;
              }
              if (o.error) throw new Error(o.error);
            } catch (e) { /* 忽略解析失败行 */ }
          }
        }
      }
      if (!acc) typing.bubble.textContent = '（小多没有回复，请稍后重试）';
    } catch (e) {
      typing.row.remove();
      addRow('tutor', '出错了：' + (e.message || e), false);
    }
  }

  $('#chat-send').addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  // ---------- 登录 ----------
  const authBtn = $('#auth-btn');
  const authModal = $('#auth-modal');
  let authMode = 'signin';

  function openAuthModal(mode) {
    authMode = mode;
    $('#auth-title').textContent = mode === 'signin' ? '登录多AI' : '注册多AI';
    $('#auth-submit').textContent = mode === 'signin' ? '登录' : '注册';
    $('#auth-switch').textContent = mode === 'signin' ? '没有账号？注册一个' : '已有账号？去登录';
    $('#auth-error').textContent = '';
    authModal.hidden = false;
  }

  authBtn.addEventListener('click', () => {
    if (getCurrentUser()) {
      if (confirm('退出登录？本地数据不会丢失。')) signOut();
    } else {
      if (!isConfigured()) {
        $('#auth-error').textContent = '未配置 Supabase（见 README 接入步骤）。';
        authModal.hidden = false;
        return;
      }
      openAuthModal('signin');
    }
  });
  $('#auth-close').addEventListener('click', () => { authModal.hidden = true; });
  $('#auth-switch').addEventListener('click', () => openAuthModal(authMode === 'signin' ? 'signup' : 'signin'));
  $('#auth-submit').addEventListener('click', async () => {
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    $('#auth-error').textContent = '';
    if (!email || password.length < 6) {
      $('#auth-error').textContent = '请填写账号，密码至少 6 位。';
      return;
    }
    const res = authMode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    if (res.ok) {
      if (res.needConfirm) { $('#auth-error').textContent = res.message; }
      else authModal.hidden = true;
    } else {
      $('#auth-error').textContent = res.message;
    }
  });

  // 登录状态变化：刷新界面与数据
  window.onUserChanged = async (user) => {
    authBtn.textContent = user ? '已登录' : '登录';
    authBtn.classList.toggle('logged', !!user);
    if (user && getSupabase()) {
      // 首次登录自动建档（显示名 = 账号前缀）
      await getSupabase().from('profiles').upsert(
        { id: user.id, email: user.email, display_name: (user.email || '').split('@')[0] },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    }
    loadTasks();
    updateStreak();
    loadPath();
  };

  // ---------- 启动 ----------
  initAuth();
  loadTasks();
  updateStreak();
  loadPath();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
