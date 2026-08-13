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

  // ---------- 学习路径（多邻国式页面流 + 进度系统） ----------
  let doneSet = new Set();
  let todayDoneCount = 0;
  let curUnitPage = null; // { unit, lessons }

  async function loadDoneSet() {
    doneSet = new Set();
    const s = getSupabase(), u = getCurrentUser();
    if (s && u) {
      const { data } = await s.from('user_progress').select('lesson_id, done_at').eq('user_id', u.id);
      (data || []).forEach((r) => doneSet.add(r.lesson_id));
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      todayDoneCount = (data || []).filter((r) => r.done_at && new Date(r.done_at) >= t0).length;
    } else {
      doneSet = new Set(storage.get('lesson-done', []));
      todayDoneCount = storage.get('today-lessons-' + dateKey(), 0);
    }
  }

  // 轻提示
  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
  }

  async function markLessonDone(lessonId, done) {
    const s = getSupabase(), u = getCurrentUser();
    if (s && u) {
      if (done) {
        await s.from('user_progress').upsert(
          { user_id: u.id, lesson_id: lessonId, status: 'done', done_at: new Date().toISOString() },
          { onConflict: 'user_id,lesson_id' }
        );
      } else {
        await s.from('user_progress').delete().eq('user_id', u.id).eq('lesson_id', lessonId);
      }
    } else {
      const arr = storage.get('lesson-done', []);
      storage.set('lesson-done', done ? [...arr, lessonId] : arr.filter((x) => x !== lessonId));
      storage.set('today-lessons-' + dateKey(), Math.max(0, storage.get('today-lessons-' + dateKey(), 0) + (done ? 1 : -1)));
    }
    await loadDoneSet();
  }

  async function fetchPathData() {
    const s = getSupabase(), u = getCurrentUser();
    if (s && u) {
      const [st, un, le] = await Promise.all([
        s.from('stages').select('*').order('ord'),
        s.from('units').select('*').order('ord'),
        s.from('lessons').select('id,unit_id,ord,title').order('ord'),
      ]);
      return { stages: st.data || [], units: un.data || [], lessons: le.data || [], cloud: true };
    }
    return {
      stages: PATH_DEMO.map((x) => ({ title: x.title, goal: x.goal, demoUnits: x.units })),
      units: [], lessons: [], cloud: false,
    };
  }

  // 页面 1：阶段列表（进度条 + 单元状态圈）
  async function renderPath() {
    const root = $('#path-root');
    root.innerHTML = '';
    const { stages, units, lessons, cloud } = await fetchPathData();
    await loadDoneSet();
    // 顶部总览卡：今日已学 + 总进度
    if (cloud && lessons.length) {
      const totalLessons = lessons.length;
      const overallPct = Math.round((doneSet.size / totalLessons) * 100);
      const top = document.createElement('div');
      top.className = 'card hero-card';
      top.innerHTML = `
        <div class="stage-head"><h2 class="stage-title">我的学习进度</h2><span class="stage-pct">${overallPct}%</span></div>
        <p class="muted">今日已学 ${todayDoneCount} 课 · 累计完成 ${doneSet.size}/${totalLessons} 课</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${overallPct}%"></div></div>`;
      root.appendChild(top);
    }
    stages.forEach((st, i) => {
      const stUnits = cloud ? units.filter((u) => u.stage_id === st.id) : [];
      const stLessons = cloud ? lessons.filter((l) => stUnits.some((u) => u.id === l.unit_id)) : [];
      const doneCount = stLessons.filter((l) => doneSet.has(l.id)).length;
      const pct = stLessons.length ? Math.round((doneCount / stLessons.length) * 100) : 0;
      const card = document.createElement('div');
      card.className = 'card stage-card stage-c' + ((i % 5) + 1);
      card.innerHTML = `
        <div class="stage-head"><h2 class="stage-title">${st.title}</h2><span class="stage-pct">${pct}%</span></div>
        <p class="muted">${st.goal || ''}</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <ul class="unit-list"></ul>`;
      const ul = card.querySelector('.unit-list');
      if (cloud) {
        stUnits.forEach((un, j) => {
          const ls = lessons.filter((l) => l.unit_id === un.id);
          const uDone = ls.filter((l) => doneSet.has(l.id)).length;
          const allDone = ls.length > 0 && uDone === ls.length;
          const li = document.createElement('li');
          li.className = 'unit';
          li.innerHTML = `
            <span class="status-circle ${allDone ? 'done' : ''}">${allDone ? '✓' : (j + 1)}</span>
            <span class="unit-main">
              <span class="unit-title">${un.title}</span>
              <span class="unit-desc">${ls.length ? `${uDone}/${ls.length} 课` : ''}${un.description ? ' · ' + un.description : ''}</span>
              <span class="progress-bar mini"><span class="progress-fill" style="width:${ls.length ? (uDone / ls.length) * 100 : 0}%"></span></span>
            </span>`;
          li.addEventListener('click', () => openUnitPage(un));
          ul.appendChild(li);
        });
      } else {
        (st.demoUnits || []).forEach((t, j) => {
          const li = document.createElement('li');
          li.className = 'unit';
          li.innerHTML = `<span class="status-circle">${j + 1}</span><span class="unit-main"><span class="unit-title">${t}</span><span class="unit-desc">登录后解锁课程内容</span></span>`;
          ul.appendChild(li);
        });
      }
      root.appendChild(card);
    });
  }

  // 页面 2：单元页（课程列表 + 状态）
  async function openUnitPage(unit) {
    curUnitPage = { unit, lessons: [] };
    const root = $('#path-root');
    const s = getSupabase(), u = getCurrentUser();
    const { data } = (s && u) ? await s.from('lessons').select('*').eq('unit_id', unit.id).order('ord') : { data: [] };
    curUnitPage.lessons = data || [];
    const ls = curUnitPage.lessons;
    const uDone = ls.filter((l) => doneSet.has(l.id)).length;
    const pct = ls.length ? Math.round((uDone / ls.length) * 100) : 0;
    const firstUndone = ls.find((l) => !doneSet.has(l.id));
    root.innerHTML = `
      <button class="back-btn" id="path-back-unit">← 返回学习路径</button>
      ${firstUndone
        ? `<button class="btn primary continue-btn" id="continue-btn">▶ 继续学习：第 ${firstUndone.ord} 课 · ${firstUndone.title}</button>`
        : `<div class="unit-done-banner">🎉 本单元已全部完成！</div>`}
      <div class="card stage-card">
        <div class="stage-head"><h2 class="stage-title">${unit.title}</h2><span class="stage-pct">${pct}%</span></div>
        <p class="muted">${unit.description || ''}</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <ul class="unit-list"></ul>
      </div>`;
    const ul = root.querySelector('.unit-list');
    if (!ls.length) {
      ul.innerHTML = '<li class="unit"><span class="unit-main"><span class="unit-desc">本单元课程内容正在准备中，敬请期待</span></span></li>';
    }
    ls.forEach((l, i) => {
      const isDone = doneSet.has(l.id);
      const isCurrent = !isDone && firstUndone && firstUndone.id === l.id;
      const li = document.createElement('li');
      li.className = 'unit' + (isCurrent ? ' current' : '');
      li.innerHTML = `
        <span class="status-circle ${isDone ? 'done' : ''}">${isDone ? '✓' : (i + 1)}</span>
        <span class="unit-main">
          <span class="unit-title">第 ${l.ord} 课 · ${l.title}${isCurrent ? '<span class="current-tag">当前</span>' : ''}</span>
          ${l.task ? `<span class="unit-desc">任务：${String(l.task).slice(0, 36)}…</span>` : ''}
        </span>`;
      li.addEventListener('click', () => openLessonPage(l, i, unit));
      ul.appendChild(li);
    });
    root.querySelector('#path-back-unit').addEventListener('click', renderPath);
    const cont = root.querySelector('#continue-btn');
    if (cont && firstUndone) {
      const idx = ls.findIndex((l) => l.id === firstUndone.id);
      cont.addEventListener('click', () => openLessonPage(firstUndone, idx, unit));
    }
    window.scrollTo(0, 0);
  }

  // 页面 3：上课页（讲义 + 术语词典 + 任务 + 上下课导航）
  async function openLessonPage(lesson, idx, unit) {
    const root = $('#path-root');
    const ls = curUnitPage.lessons;
    const prev = idx > 0 ? ls[idx - 1] : null;
    const next = idx < ls.length - 1 ? ls[idx + 1] : null;
    const isDone = doneSet.has(lesson.id);
    const unitPct = ls.length ? Math.round((idx / ls.length) * 100) : 0;
    root.innerHTML = `
      <button class="back-btn" id="path-back-lesson">← 返回单元</button>
      <div class="card lesson-page">
        <div class="lesson-kicker">第 ${idx + 1} / ${ls.length} 课 · ${unit.title}</div>
        <div class="progress-bar lesson-bar"><div class="progress-fill" style="width:${unitPct}%"></div></div>
        <h2 class="lesson-page-title">${lesson.title}</h2>
        ${lesson.terms ? `<div class="terms-box"><div class="terms-title">术语小词典</div><div class="md-body">${renderMD(lesson.terms)}</div></div>` : ''}
        <div class="lesson-content md-body">${lesson.content ? renderMD(lesson.content) : '<p class="muted">内容撰写中…</p>'}</div>
        ${lesson.task ? `<div class="lesson-task"><b>动手任务：</b>${lesson.task}</div>` : ''}
        <div class="lesson-nav">
          <button class="btn ghost" id="prev-btn" ${prev ? '' : 'disabled'}>← 上一课</button>
          <button class="btn primary" id="done-btn">${isDone ? '已完成 ✓' : '标记完成'}</button>
          <button class="btn ghost" id="next-btn" ${next ? '' : 'disabled'}>下一课 →</button>
        </div>
      </div>`;
    root.querySelector('#path-back-lesson').addEventListener('click', () => openUnitPage(unit));
    root.querySelector('#done-btn').addEventListener('click', async () => {
      const markingDone = !isDone;
      await markLessonDone(lesson.id, markingDone);
      if (markingDone) {
        if (next) {
          // 自动进入下一课，无需点返回
          showToast('🎉 本课完成，自动进入下一课！');
          setTimeout(() => openLessonPage(next, idx + 1, unit), 900);
        } else {
          showToast('🏆 恭喜！本单元全部完成！');
          setTimeout(() => openUnitPage(unit), 1100);
        }
      } else {
        openLessonPage(lesson, idx, unit);
      }
    });
    if (prev) root.querySelector('#prev-btn').addEventListener('click', () => openLessonPage(prev, idx - 1, unit));
    if (next) root.querySelector('#next-btn').addEventListener('click', () => openLessonPage(next, idx + 1, unit));
    window.scrollTo(0, 0);
  }

  // Markdown 渲染（安全过滤）
  const renderMD = (t) => {
    try {
      if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parse(t));
    } catch { /* 渲染失败就返回纯文本 */ }
    return String(t).replace(/</g, '&lt;');
  };

  // Esc 关闭登录弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const m = $('#auth-modal'); if (m) m.hidden = true; }
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
    // 知识库管理入口：仅管理员可见
    $('#admin-nav').hidden = !(user && isOwner());
    if (user && isOwner()) loadAdmin();
    loadTasks();
    updateStreak();
    renderPath();
  };

  // ---------- 知识库管理（仅管理员） ----------
  const isOwner = () => getCurrentUser()?.id === APP_CONFIG.ADMIN_USER_ID;
  const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const escText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  async function loadAdmin() {
    const root = $('#admin-root');
    const s = getSupabase();
    if (!s || !isOwner()) { root.innerHTML = ''; return; }
    const { data: stages } = await s.from('stages').select('*').order('ord');
    const { data: units } = await s.from('units').select('*').order('ord');
    const { data: lessons } = await s.from('lessons').select('*').order('unit_id, ord');
    root.innerHTML = '';
    (stages || []).forEach((st) => {
      const card = document.createElement('div');
      card.className = 'card stage-card stage-c' + (((st.ord - 1) % 5) + 1);
      card.innerHTML = `<h2 class="stage-title">${st.title}</h2><ul class="admin-unit-list"></ul>`;
      const ul = card.querySelector('ul');
      (units || []).filter((u) => u.stage_id === st.id).forEach((u) => {
        const li = document.createElement('li');
        li.className = 'admin-unit';
        li.innerHTML = `<div class="admin-unit-head"><span class="admin-unit-title">${u.title}</span><button class="mini-btn">编辑课程</button></div><div class="admin-lessons"></div>`;
        const btn = li.querySelector('.mini-btn');
        const box = li.querySelector('.admin-lessons');
        btn.addEventListener('click', () => {
          if (box.classList.contains('open')) { box.classList.remove('open'); box.innerHTML = ''; return; }
          const ls = (lessons || []).filter((l) => l.unit_id === u.id);
          box.innerHTML = '';
          ls.forEach((l) => {
            const d = document.createElement('div');
            d.className = 'admin-lesson';
            d.innerHTML =
              `<label>第 ${l.ord} 课标题<input class="l-title" value="${escAttr(l.title)}"></label>` +
              `<label>讲义内容（支持 Markdown）<textarea class="l-content" rows="8">${escText(l.content)}</textarea></label>` +
              `<label>术语小词典（每行一条，格式：术语：Token（词元）：解释…）<textarea class="l-terms" rows="3">${escText(l.terms)}</textarea></label>` +
              `<label>动手任务<input class="l-task" value="${escAttr(l.task)}"></label>` +
              `<button class="mini-btn save">保存本课</button><span class="save-msg"></span>`;
            box.appendChild(d);
            d.querySelector('.save').addEventListener('click', async () => {
              const msg = d.querySelector('.save-msg');
              msg.textContent = '保存中…';
              const { error } = await s.functions.invoke('kb-admin', {
                body: {
                  action: 'update_lesson', lessonId: l.id,
                  title: d.querySelector('.l-title').value,
                  content: d.querySelector('.l-content').value,
                  terms: d.querySelector('.l-terms').value,
                  task: d.querySelector('.l-task').value,
                },
              });
              msg.textContent = error ? ('失败：' + error.message) : '已保存 ✓';
            });
          });
          box.classList.add('open');
        });
        ul.appendChild(li);
      });
      root.appendChild(card);
    });
  }

  // 导出知识库为 md 文件（与本地 docs/knowledge-base 格式一致）
  $('#kb-export').addEventListener('click', async () => {
    const s = getSupabase();
    const { data: stages } = await s.from('stages').select('*').order('ord');
    const { data: units } = await s.from('units').select('*').order('ord');
    const { data: lessons } = await s.from('lessons').select('*').order('unit_id, ord');
    let md = '# 多AI 知识库（管理页导出）\n';
    (stages || []).forEach((st) => {
      md += `\n# ${st.title}\n`;
      (units || []).filter((u) => u.stage_id === st.id).forEach((u) => {
        md += `\n## [${u.id}] ${u.title}\n`;
        (lessons || []).filter((l) => l.unit_id === u.id).forEach((l) => {
          md += `\n### 第${l.ord}课 · ${l.title}\n${l.content || ''}\n\n任务：${l.task || ''}\n`;
          if (l.terms) md += `${l.terms.split('\n').map((t) => '术语：' + t.replace(/^术语[:：]\s*/, '')).join('\n')}\n`;
        });
      });
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'knowledge-base-export.md';
    a.click();
  });

  // ---------- 启动 ----------
  initAuth();
  loadTasks();
  updateStreak();
  renderPath();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
