/* ============================================================
 * functions/api/sessions.js
 * 会话管理（A7 多会话 / D1 持久化）
 *   GET    /api/sessions          → 会话列表（含消息数、标题、时间）
 *   POST   /api/sessions          → 新建会话
 *   GET    /api/sessions?id=xx    → 某会话的全部消息
 *   DELETE /api/sessions?id=xx    → 删除会话及其消息
 * ============================================================ */

export async function onRequestGet({ env, request, url }) {
  // ---------- 1. 查询单会话详情 ----------
  if (url.searchParams.get('id')) {
    const id = url.searchParams.get('id');
    const sess = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?')
      .bind(id).first();
    if (!sess) return fail('会话不存在', 404);

    const { results: msgs } = await env.DB.prepare(
      `SELECT role, content, model, created_at
       FROM messages WHERE session_id = ?
       ORDER BY created_at ASC, id ASC`
    ).bind(id).all();

    return json({ session: sess, messages: msgs });
  }

  // ---------- 2. 返回会话列表（含消息数，按更新时间倒序） ----------
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.title, s.created_at, s.updated_at,
            (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
     FROM sessions s
     ORDER BY s.updated_at DESC`
  ).all();

  return json({ sessions: results });
}

export async function onRequestPost({ env }) {
  // 新建会话：生成 uuid，标题默认“新会话”
  const id = uuid();
  const now = isoNow();
  await env.DB.prepare(
    'INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).bind(id, '新会话', now, now).run();

  return json({ id, title: '新会话', created_at: now, updated_at: now }, 201);
}

export async function onRequestDelete({ env, url }) {
  const id = url.searchParams.get('id');
  if (!id) return fail('缺少会话 id', 400);

  // 先删消息，再删会话（保证外键一致）
  await env.DB.prepare('DELETE FROM messages WHERE session_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();

  return json({ ok: true });
}

/* ---------- 工具 ---------- */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fail(msg, status = 400) {
  return json({ error: msg }, status);
}

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

function isoNow() {
  return new Date().toISOString();
}
