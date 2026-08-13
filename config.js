// 多AI 全栈配置
// 注册 Supabase 项目后，把下面两个值填进来（Supabase 后台 → Settings → API）
// 未配置时 App 以"本地演示模式"运行：功能可用，数据只存本机
const APP_CONFIG = {
  SUPABASE_URL: "https://fqaxzfsbqjaevoqnfddr.supabase.co",        // 例：https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: "sb_publishable_rFDAHLAn1HhmCkACLrJWpg_zSieZ4Nb",   // anon public key（可公开，仅用于浏览器端受限访问）
  ADMIN_USER_ID: "1043dbcb-4eef-4067-ad92-85fa557bd8c7",          // 管理员（chillxox）用户 ID：仅此账号可见知识库管理页
};

const isConfigured = () => !!(APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY);
