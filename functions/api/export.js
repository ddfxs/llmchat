/* ============================================================
 * functions/api/export.js
 * GET /api/export?id=xx → 下载该会话的 Markdown 文件（.md）
 * 功能：D3 导出对话
 * ============================================================ */

export async function onRequestGet({ env, url }) {
  const id = url.searchParams.get('id');
  if (!id) return fail('缺少会话 id');

  /* ---- 1. 取会话信息 ---- */
  const sess = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(id).first();
  if (!sess) return fail('会话不存在', 404);

  /* ---- 2. 取全部消息（按时间升序） ---- */
  const { results: msgs } = await env.DB.prepare(
    `SELECT role, content, model, created_at
     FROM messages WHERE session_id = ?
     ORDER BY created_at ASC, id ASC`
  ).bind(id).all();

  /* ---- 3. 组装 Markdown 内容 ---- */
  const lines = [];
  lines.push(`# ${sess.title || '对话导出'}`);
  lines.push('');
  lines.push(`> 导出时间：${isoNow()}`);
  lines.push(`> 消息数：${msgs.length}`);
  if (sess.created_at) lines.push(`> 创建时间：${sess.created_at}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const m of msgs) {
    const roleLabel = m.role === 'user' ? '🧑 用户' : '🤖 AI';
    const meta = m.model ? `（${m.model}）` : '';
    lines.push(`### ${roleLabel}${meta}`);
    lines.push('');
    lines.push(m.content.trim());
    lines.push('');
  }

  const markdown = lines.join('\n');

  /* ---- 4. 生成 .md 文件响应（触发浏览器下载） ---- */
  const fileName = `conversation-${id.slice(0, 8)}.md`;
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/* ---------- 工具 ---------- */
function fail(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isoNow() {
  return new Date().toISOString();
}
