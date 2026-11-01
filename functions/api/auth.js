/* ============================================================
 * functions/api/auth.js
 * POST /api/auth  →  { password }  →  { token, expires_at }
 * 校验密码 → 生成随机 token → 存哈希到 D1 → 返回明文 token 给前端
 * ============================================================ */

export async function onRequestPost({ env, request }) {
  /* ---- 1. 读取请求体 ---- */
  let body;
  try {
    body = await request.json();
  } catch {
    return fail('请求体格式错误');
  }
  const password = (body.password || '').toString();

  /* ---- 2. 校验密码（与环境变量 AUTH_PASS 比对） ---- */
  const correct = env.AUTH_PASS || '';
  if (!correct) {
    return fail('服务端未配置 AUTH_PASS，请先设置');
  }
  // 用恒定时间比较，避免时序侧信道
  if (!safeEqual(password, correct)) {
    return fail('密码错误', 401);
  }

  /* ---- 3. 生成随机 token（32 字节 → 64 位十六进制） ---- */
  const token = randomToken();

  /* ---- 4. 计算 TTL 与过期时间 ---- */
  const ttl = parseInt(env.TOKEN_TTL || '86400', 10); // 默认 24 小时（秒）
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();

  /* ---- 5. 写入 D1（存 SHA-256 哈希，不落明文） ---- */
  await env.DB.prepare(
    `INSERT INTO auth_tokens (token_hash, created_at, expires_at)
     VALUES (?, ?, ?)`
  )
    .bind(await sha256(token), now.toISOString(), expiresAt)
    .run();

  /* ---- 6. 返回明文 token（仅此一次，前端存 localStorage） ---- */
  return new Response(JSON.stringify({ token, expires_at: expiresAt }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ---------- 工具：失败响应 ---------- */
function fail(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ---------- 工具：随机 token ---------- */
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- 工具：SHA-256（与 _middleware.js 完全一致） ---------- */
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ---------- 工具：恒定时间字符串比较，防时序攻击 ---------- */
function safeEqual(a, b) {
  const A = new TextEncoder().encode(a);
  const B = new TextEncoder().encode(b);
  if (A.length !== B.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A[i] ^ B[i];
  return diff === 0;
}
