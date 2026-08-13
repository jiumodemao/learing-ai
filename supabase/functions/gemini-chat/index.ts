// 多AI · AI 助教后端（Supabase Edge Function · 流式 SSE 版本）
// 职责：验证登录 → 存取会话 → 流式调用 Gemini（key 只在服务端）→ 逐字转发给前端
// 部署后需在 Secrets 配置：GEMINI_API_KEY（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 平台自动注入）

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-session-id",
};

// 助教人设：AI 小白陪练，目标是帮用户学完五阶段、最终变现
const SYSTEM_PROMPT = `你是「多AI」的 AI 助教"小多"，一位耐心、会打比方的 AI 学习陪练。
你的用户是 AI 小白，正在走五阶段学习路径：会用 AI → 懂原理 → 会造 AI → 变现基础 → 变现实战。

要求：
1. 全程大白话：术语第一次出现必须用生活化比喻解释。
2. 回答精炼：150-250 字，先给核心结论，再补要点，一次只讲透一个点。
3. 严禁 Markdown 格式：不用 **、#、- 等符号；纯文本分段，序号用 1. 2. 3.。
4. 讲解完概念后，出一道简短选择题（A/B/C）检验用户是否真懂。
5. 结合用户当前进度（会告诉你他在学哪个单元），把答案和课程内容挂钩。
6. 变现/就业问题给具体可执行建议（渠道、定价、步骤），不说空话。
7. 诚实：不确定就明说"我不确定"，并建议用户交叉验证。

用户当前进度：%CONTEXT%`;

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
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    // gemini-flash-latest 滚动别名，永远指向最新稳定 flash 模型
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";

    // 1. 验证登录
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return json({ error: "未登录或登录已过期" }, 401);

    // 2. 解析请求
    const body = await req.json();
    const { sessionId, message, context } = body;
    if (!message || !String(message).trim()) return json({ error: "消息不能为空" }, 400);

    // 3. 保存用户消息（新会话自动创建）
    let sid = sessionId;
    if (!sid) {
      const { data: s } = await supabase.from("chat_sessions")
        .insert({ user_id: user.id, title: String(message).slice(0, 20) }).select().single();
      sid = s.id;
    } else {
      const { data: own } = await supabase.from("chat_sessions")
        .select("id").eq("id", sid).eq("user_id", user.id).maybeSingle();
      if (!own) return json({ error: "会话不存在" }, 404);
    }
    await supabase.from("chat_messages").insert({ session_id: sid, role: "user", content: message });

    // 4. 取最近 20 条历史拼成对话
    const { data: history } = await supabase.from("chat_messages")
      .select("role, content").eq("session_id", sid).order("id", { ascending: true }).limit(20);
    const contents = (history || []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const ctx = context && context.trim() ? context : "未知（用户尚未同步学习进度）";

    // 5. 流式调用 Gemini
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT.replace("%CONTEXT%", ctx) }] },
          contents,
          // 提速：限制回复长度 + 控制随机性（回复越长越慢）
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
        }),
      }
    );
    if (!geminiRes.ok) {
      return json({ error: `Gemini 调用失败：${geminiRes.status} ${(await geminiRes.text()).slice(0, 200)}` }, 502);
    }

    // 6. 把 Gemini 的 SSE 增量转发给前端，同时攒全文存库
    let full = "";
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = geminiRes.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        const processChunk = (chunk: string) => {
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const obj = JSON.parse(line.slice(6));
              const text = (obj.candidates?.[0]?.content?.parts || [])
                .map((p: { text?: string }) => p.text || "").join("");
              if (text) {
                full += text;
                send({ delta: text });
              }
            } catch { /* 忽略解析失败的行 */ }
          }
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // 关键：统一换行符（Gemini 的 SSE 可能用 \r\n 分隔）
            buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            let idx;
            while ((idx = buf.indexOf("\n\n")) !== -1) {
              processChunk(buf.slice(0, idx));
              buf = buf.slice(idx + 2);
            }
          }
          // 处理结尾残留的数据块（最后一个事件可能没有结尾空行）
          if (buf.trim()) processChunk(buf);
          send({ done: true });
          controller.close();
          // 全文落库
          if (full.trim()) {
            await supabase.from("chat_messages")
              .insert({ session_id: sid, role: "assistant", content: full });
          }
        } catch (e) {
          send({ error: String(e) });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Session-Id": sid,
      },
    });
  } catch (e) {
    return json({ error: `服务异常：${String(e)}` }, 500);
  }
});
