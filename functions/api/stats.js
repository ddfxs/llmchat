/* ============================================================
 * functions/api/stats.js
 * GET /api/stats → 用量统计（D2）
 *   总消息数 / 总 token / 按模型分布 / 按日分布
 * ============================================================ */

export async function onRequestGet({ env }) {
  /* ---- 1. 总量统计 ---- */
  const total = await env.DB.prepare(
    `SELECT COUNT(*) AS messages,
            COALESCE(SUM(token_used), 0) AS tokens
     FROM messages`
  ).first();

  /* ---- 2. 按模型分布 ---- */
  const { results: byModel } = await env.DB.prepare(
    `SELECT model, COUNT(*) AS messages, COALESCE(SUM(token_used), 0) AS tokens
     FROM messages
     WHERE role = 'assistant' AND model IS NOT NULL
     GROUP BY model
     ORDER BY tokens DESC`
  ).all();

  /* ---- 3. 按日分布（最近 7 天） ---- */
  const { results: byDay } = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day,
            COUNT(*) AS messages,
            COALESCE(SUM(token_used), 0) AS tokens
     FROM messages
     GROUP BY day
     ORDER BY day DESC
     LIMIT 7`
  ).all();

  /* ---- 4. 组装并返回 ---- */
  return json({
    total_messages: total?.messages || 0,
    total_tokens:   total?.tokens   || 0,
    by_model: byModel.map((m) => ({
      model: m.model,
      messages: m.messages,
      tokens: m.tokens,
    })),
    by_day: byDay.map((d) => ({
      day: d.day,
      messages: d.messages,
      tokens: d.tokens,
    })),
  });
}

/* ---------- 工具 ---------- */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
