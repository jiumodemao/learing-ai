// 多AI · 知识库管理后端（仅管理员可写）
// 安全设计：① 验证登录 JWT ② 比对用户 ID 与 OWNER_UUID 环境变量
// 任何写操作都必须先通过这两关，普通用户即使调用本接口也会被拒绝

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "只支持 POST" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ownerId = Deno.env.get("OWNER_UUID")!;

    // 1. 验证登录
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "未登录或登录已过期" }, 401);

    // 2. 验证身份：只有管理员本人
    if (user.id !== ownerId) {
      return json({ error: "无权限：只有管理员可以修改知识库" }, 403);
    }

    // 3. 处理写操作
    const body = await req.json();
    const action = body.action;

    if (action === "update_lesson") {
      const { lessonId, title, content, task, terms } = body;
      if (!lessonId) return json({ error: "缺少 lessonId" }, 400);
      const { error } = await supabase.from("lessons")
        .update({ title, content, task, terms }).eq("id", lessonId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "update_unit") {
      const { unitId, description } = body;
      if (!unitId) return json({ error: "缺少 unitId" }, 400);
      const { error } = await supabase.from("units")
        .update({ description }).eq("id", unitId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: `未知操作：${action}` }, 400);
  } catch (e) {
    return json({ error: `服务异常：${String(e)}` }, 500);
  }
});
