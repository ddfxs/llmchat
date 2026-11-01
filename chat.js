/* ============================================================
 * functions/api/chat.js
 * POST /api/chat → { session_id, model, messages }  → SSE 流式回复
 * 功能：B1 模型白名单 / A1 多轮记忆写入 D1 / D1 持久化 / D2 统计
 * ============================================================ */

/* ---- 允许的模型白名单（B1：防止前端传任意模型名） ---- */
const ALLOWED_MODELS = new Set([
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/qwen/qwen2-72b-instruct',
  '@cf/google/gemma-2-9b-it',
]);

export async function onRequestPost({ env, request }) {
  /* ---- 1. 读取并校验请求体 ---- */
  let body;
  try { body = await request.json(); }
  catch { return fail('请求体格式错误'); }

  const sessionId = (body.session_id || '').toString();
  const model     = (body.model || '').toString();
  const messages  = Array.isArray(body.messages) ? body.messages : [];

  if (!sessionId)                       return fail('缺少 session_id');
  if (!ALLOWED_MODELS.has(model))       return fail('不支持的模型');
  if (messages.length === 0)            return fail('消息不能为空');

  /* ---- 2. 校验会话存在（D1） ---- */
  const sess = await env.DB.prepare('SELECT id FROM sessions WHERE id = ?')
    .bind(sessionId).first();
  if (!sess) return fail('会话不存在', 404);

  /* ---- 3. 取出该会话已有消息数（用于判断是否首轮、定标题） ---- */
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS c FROM messages WHERE session_id = ?')
    .bind(sessionId).first();
  const isFirstTurn = (countRow?.c || 0) === 0;

  /* ---- 4. 把用户消息写入 D1（A1 记忆持久化） ---- */
  const userMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (userMsg) {
    await env.DB.prepare(
      `INSERT INTO messages (id, session_id, role, content, model, token_used, created_at)
       VALUES (?, ?, 'user', ?, NULL, 0, ?)`
    ).bind(uuid(), sessionId, userMsg.content, isoNow()).run();

    // 首轮：用第一条用户消息作为会话标题
    if (isFirstTurn) {
      const title = userMsg.content.trim().slice(0, 30) || '新会话';
      await env.DB.prepare('UPDATE sessions SET title = ? WHERE id = ?')
        .bind(title, sessionId).run();
    }
  }

  /* ---- 5. 调用 Workers AI，流式生成 ---- */
  const stream = await env.AI.run(model, { messages, stream: true });

  /* ---- 6. 用 TransformStream 边转发边聚合，结束时写库 ---- */
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let full = '';

  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      full += decoder.decode(chunk, { stream: true });
      controller.enqueue(chunk);            // 原样转发给前端
    },
    async flush() {
      decoder.decode();                      // 冲刷尾部
      // 估算 token（D2 统计用；流式接口不直接返回 usage）
      const tokenUsed = Math.ceil(full.length / 4);

      // 写入助手回复
      await env.DB.prepare(
        `INSERT INTO messages (id, session_id, role, content, model, token_used, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?)`
      ).bind(uuid(), sessionId, full, model, tokenUsed, isoNow()).run();

      // 更新会话时间
      await env.DB.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
        .bind(isoNow(), sessionId).run();
    },
  });

  stream.pipeTo(writable).catch(() => {});   // 异步落库，不阻塞响应

  /* ---- 7. 返回流式响应（SSE） ---- */
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

/* ---------- 工具：错误响应 ---------- */
function fail(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ---------- 工具：UUID（Workers 支持 crypto.randomUUID，含回退） ---------- */
function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b, i) =>
    [4, 6, 8, 10].includes(i) ? '-' + b.toString(16).padStart(2, '0')
                              : b.toString(16).padStart(2, '0')
  ).join('');
}

/* ---------- 工具：当前 ISO 时间 ---------- */
function isoNow() {
  return new Date().toISOString();
}
