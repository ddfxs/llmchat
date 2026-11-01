/* ============================================================
 * functions/_middleware.js
 * C1 全局鉴权中间件：除 /api/auth 外，所有 /api/* 请求
 * 必须携带有效 Bearer token（存在 D1 auth_tokens 表）。
 * ============================================================ */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  /* ---- 1. 登录接口放行（auth.js 内部自己校验密码） ---- */
  if (url.pathname === '/api/auth') {
    return context.next();
  }

  /* ---- 2. 其余接口：校验 Authorization 头 ---- */
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token) {
    return unauthorized('缺少访问令牌，请先登录');
  }

  /* ---- 3. 计算 token 的 SHA-256 哈希（不落明文） ---- */
  const hash = await sha256(token);

  /* ---- 4. 查 D1：该 token 是否存在 ---- */
  const { results } = await env.DB
    .prepare('SELECT expires_at FROM auth_tokens WHERE token_hash = ?')
    .bind(hash)
    .all();

  if (!results.length) {
    return unauthorized('令牌无效');
  }

  /* ---- 5. 检查是否过期，顺手清理过期记录 ---- */
  const expiresAt = Date.parse(results[0].expires_at);
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    await env.DB
      .prepare('DELETE FROM auth_tokens WHERE token_hash = ?')
      .bind(hash)
      .run();
    return unauthorized('令牌已过期，请重新登录');
  }

  /* ---- 6. 通过：继续执行目标接口 ---- */
  return context.next();
}

/* ---------- 统一 401 响应 ---------- */
function unauthorized(msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ---------- SHA-256 工具（Web Crypto，Workers 内置） ---------- */
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
