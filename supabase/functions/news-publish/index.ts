// 多AI · 热点日报发布接口（供 Claude Code 每日任务同步用）
// 安全：请求头 X-Sync-Key 必须与 NEWS_SYNC_KEY secret 一致（同步密钥只存在用户本机与服务器）

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-sync-key, content-type, authorization",
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

  // 同步密钥校验
  const syncKey = req.headers.get("X-Sync-Key") || "";
  if (!syncKey || syncKey !== Deno.env.get("NEWS_SYNC_KEY")) {
    return json({ error: "同步密钥无效" }, 401);
  }

  try {
    const { date, overview, items, quick } = await req.json();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "缺少合法 date（YYYY-MM-DD）" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // 覆盖式写入当天日报
    await supabase.from("news_digests").upsert({ news_date: date, overview: overview || "" });
    await supabase.from("news_items").delete().eq("news_date", date);
    const rows = [
      ...(items || []).map((it: any) => ({
        news_date: date, kind: "top", rank: it.rank, title: it.title,
        summary: it.summary || "", why: it.why || "", urls: it.urls || [],
      })),
      ...(quick || []).map((q: any, i: number) => ({
        news_date: date, kind: "quick", rank: i + 1, title: q.text, urls: q.urls || [],
      })),
    ];
    if (rows.length) await supabase.from("news_items").insert(rows);
    return json({ ok: true, count: rows.length });
  } catch (e) {
    return json({ error: `服务异常：${String(e)}` }, 500);
  }
});
