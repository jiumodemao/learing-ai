// 多AI 登录模块（Supabase Auth）
let _supabase = null;
let _user = null;

function initAuth() {
  if (window.supabase && isConfigured()) {
    _supabase = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    _supabase.auth.onAuthStateChange((_ev, session) => setUser(session?.user ?? null));
    _supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
  }
}

function setUser(u) {
  _user = u;
  if (window.onUserChanged) window.onUserChanged(u);
}

const getSupabase = () => _supabase;
const getCurrentUser = () => _user;

// 云端是否可用（客户端未初始化 = SDK 未加载或未配置）
function cloudReady() {
  return !!_supabase;
}

// 账号输入：支持用户名（自动转成内部邮箱）或完整邮箱
function toEmail(account) {
  return account.includes('@') ? account : account + '@duoai.app';
}

// 常见错误转成友好中文提示
function friendlyAuthError(msg) {
  if (/already registered/i.test(msg)) return '这个账号已经注册过了，请切换到"登录"直接登录（或点下方"已有账号？去登录"）。';
  if (/invalid login credentials|invalid email|invalid password/i.test(msg)) return '账号或密码不正确，请检查后重试。';
  if (/password should be at least/i.test(msg)) return '密码太短，至少需要 6 位。';
  if (/email not confirmed/i.test(msg)) return '邮箱尚未确认，请先到邮箱里点击确认链接。';
  if (/rate limit/i.test(msg)) return '操作太频繁，请稍等一分钟再试。';
  return msg;
}

// 注册（邮箱确认已关闭，注册后直接登录）
async function signUp(email, password) {
  if (!cloudReady()) {
    return { ok: false, message: '云端未连接：请确认 supabase-js 已加载且 config.js 已配置。' };
  }
  const { data, error } = await _supabase.auth.signUp({ email: toEmail(email), password });
  if (error) return { ok: false, message: friendlyAuthError(error.message) };
  if (data.session) return { ok: true };
  return { ok: true, needConfirm: true, message: '注册成功！请到邮箱查收确认邮件后回来登录。' };
}

async function signIn(email, password) {
  if (!cloudReady()) {
    return { ok: false, message: '云端未连接：请确认 supabase-js 已加载且 config.js 已配置。' };
  }
  const { data, error } = await _supabase.auth.signInWithPassword({ email: toEmail(email), password });
  if (error) return { ok: false, message: friendlyAuthError(error.message) };
  return { ok: true };
}

async function signOut() {
  if (!cloudReady()) { setUser(null); return; }
  await _supabase.auth.signOut();
  setUser(null);
}
