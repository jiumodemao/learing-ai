// 多AI · 笔记智能后端（第二大脑）
// 职责：验证身份 → 用 DeepSeek 整理笔记（打标签/写摘要/主题归类）或问答检索笔记
// 鉴权：用户 JWT（前端）；或 X-Sync-Key（每日定时任务，以管理员身份执行）
// Secrets：DEEPSEEK_API_KEY、DEEPSEEK_MODEL（默认 deepseek-v4-pro）、NEWS_SYNC_KEY、OWNER_UUID

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // 1. 鉴权：JWT 优先，否则用同步密钥（定时任务）
    let userId: string | null = null;
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "未登录或登录已过期" }, 401);
      userId = user.id;
    } else if (req.headers.get("X-Sync-Key") === Deno.env.get("NEWS_SYNC_KEY")) {
      userId = Deno.env.get("OWNER_UUID") || null;
    }
    if (!userId) return json({ error: "鉴权失败" }, 401);

    const body = await req.json();
    const action = body.action;
    const dk = Deno.env.get("DEEPSEEK_API_KEY");
    const model = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-v4-pro";
    const dsCall = async (messages: unknown[], jsonMode = false) => {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${dk}` },
        body: JSON.stringify({
          model, messages, max_tokens: 1500, temperature: 0.5,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek 调用失败 ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    };

    // ---------- 整理笔记 ----------
    if (action === "organize") {
      const { data: rawNotes } = await supabase.from("notes")
        .select("*").eq("user_id", userId).eq("status", "raw")
        .order("created_at", { ascending: true }).limit(100);
      if (!rawNotes || rawNotes.length === 0) {
        return json({ ok: true, organized: 0, review: "今天没有待整理的笔记。" });
      }

      const notesJson = rawNotes.map((n) => ({ id: n.id, content: n.content }));
      const prompt = `你是"第二大脑"整理助手。用户随手记了下面这些笔记（JSON 数组）。请：
1. 为每条笔记打 1-3 个简短中文标签（如"健身/健康"），并写一句不超过 15 字的摘要
2. 把全部笔记按主题归类，生成一段 200 字以内的"今日整理报告"：几个主题、每个主题一句话概括、最值得跟进的一条是什么
只输出 JSON：{"items":[{"id":1,"tags":["标签"],"summary":"摘要"}],"report":"整理报告"}

笔记：
${JSON.stringify(notesJson)}`;
      const raw = await dsCall([{ role: "user", content: prompt }], true);
      const parsed = JSON.parse(raw);
      const items = parsed.items || [];
      for (const it of items) {
        if (!it || !it.id) continue;
        await supabase.from("notes").update({
          tags: it.tags || [], summary: it.summary || "", status: "organized",
        }).eq("id", it.id).eq("user_id", userId);
      }
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("note_reviews").upsert(
        { user_id: userId, review_date: today, content: parsed.report || "" },
        { onConflict: "user_id,review_date" }
      );
      return json({ ok: true, organized: items.length, review: parsed.report || "" });
    }

    // ---------- 问答检索 ----------
    if (action === "ask") {
      const question = String(body.question || "").trim();
      const keyword = String(body.keyword || "").trim();
      if (!question) return json({ error: "问题不能为空" }, 400);
      let q = supabase.from("notes").select("id, content, tags, summary, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(300);
      if (keyword) q = q.ilike("content", `%${keyword}%`);
      const { data: notes } = await q;
      if (!notes || notes.length === 0) {
        return json({ answer: "你的笔记还是空的，先去随手记两条吧。" });
      }
      const notesText = notes.map((n) =>
        `[${n.created_at.slice(0, 10)}] ${n.content}${n.summary ? `（摘要：${n.summary}）` : ""}`
      ).join("\n");
      const answer = await dsCall([{
        role: "user",
        content: `以下是用户的全部/相关笔记。请根据笔记回答用户的问题。要求：大白话；引用笔记时带上日期；如果笔记里没有答案，直接说"笔记里没找到相关内容"。回答 200 字以内。\n\n笔记：\n${notesText}\n\n问题：${question}`,
      }]);
      return json({ answer });
    }

    return json({ error: `未知操作：${action}` }, 400);
  } catch (e) {
    return json({ error: `服务异常：${String(e)}` }, 500);
  }
});
