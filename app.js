/* ============================================================
 * Cloudflare Pages LLM Chat — 前端逻辑 (js/app.js)
 * 功能：C1鉴权 / A7多会话 / A1多轮记忆 / B1多模型 / A2 Markdown
 *       A8复制清空 / A6移动端 / D1持久化 / D3导出 / D2统计
 * ============================================================ */

/* ---------- 1. 常量配置 ---------- */
const API = {
  auth:     '/api/auth',
  chat:     '/api/chat',
  sessions: '/api/sessions',
  export:   '/api/export',
  stats:    '/api/stats',
};

// 模型下拉选项：label 显示名，value 是后端真实模型 ID
const MODELS = [
  { label: 'Llama 3.1 8B',    value: '@cf/meta/llama-3.1-8b-instruct' },
  { label: 'DeepSeek R1 32B', value: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' },
  { label: 'Qwen 72B',        value: '@cf/qwen/qwen2-72b-instruct' },
  { label: 'Gemma 9B',        value: '@cf/google/gemma-2-9b-it' },
];

const TOKEN_KEY = 'cf_llm_token';   // localStorage 里存 token 的键
const THEME_KEY = 'cf_llm_theme';

/* ---------- 2. DOM 引用 ---------- */
const $ = (id) => document.getElementById(id);
const loginOverlay = $('loginOverlay'), loginPass = $('loginPass'),
      loginError = $('loginError'), btnLogin = $('btnLogin'),
      app = $('app'), sidebar = $('sidebar'), sessionList = $('sessionList'),
      btnNewSession = $('btnNewSession'), btnStats = $('btnStats'),
      btnExport = $('btnExport'), chat = $('chat'), modelSelect = $('modelSelect'),
      btnTheme = $('btnTheme'), btnClear = $('btnClear'), btnLogout = $('btnLogout'),
      form = $('form'), input = $('input'), btnSend = $('btnSend'),
      statsModal = $('statsModal'), statsBody = $('statsBody'), btnCloseStats = $('btnCloseStats');

/* ---------- 3. 状态 ---------- */
let token = localStorage.getItem(TOKEN_KEY) || '';
let currentSessionId = null;   // 当前会话
let messages = [];             // 当前会话的消息数组 {role, content}
let isStreaming = false;       // 是否正在流式生成（防止连点）
let abortController = null;    // 用于“停止生成”

/* ---------- 4. 通用请求封装（自动带 token） ---------- */
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) { logout(true); throw new Error('登录已过期，请重新登录'); }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('请求失败(' + res.status + ')：' + text.slice(0, 120));
  }
  return res;
}

/* ---------- 5. 鉴权：登录 / 退出 (C1) ---------- */
async function doLogin() {
  const pass = loginPass.value.trim();
  loginError.textContent = '';
  try {
    const res = await fetch(API.auth, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '密码错误');
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    enterApp();
  } catch (e) { loginError.textContent = e.message; }
}

function logout(force) {
  token = ''; localStorage.removeItem(TOKEN_KEY);
  currentSessionId = null; messages = [];
  app.classList.add('hidden');
  loginOverlay.classList.remove('hidden');
  if (!force) loginPass.value = '';
}

btnLogin.addEventListener('click', doLogin);
loginPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
btnLogout.addEventListener('click', () => logout());

function enterApp() {
  loginOverlay.classList.add('hidden');
  app.classList.remove('hidden');
  buildModelSelect();
  applyTheme();
  loadSessions();
}

/* ---------- 6. 模型下拉 (B1) ---------- */
function buildModelSelect() {
  modelSelect.innerHTML = '';
  MODELS.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.value; opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });
  // 记忆上次选择的模型
  const saved = localStorage.getItem('cf_llm_model');
  if (saved && MODELS.some((m) => m.value === saved)) modelSelect.value = saved;
  modelSelect.addEventListener('change', () =>
    localStorage.setItem('cf_llm_model', modelSelect.value));
}

/* ---------- 7. 主题切换 (A2) ---------- */
function applyTheme() {
  const dark = localStorage.getItem(THEME_KEY) === 'dark';
  document.body.classList.toggle('dark', dark);
  btnTheme.textContent = dark ? '☀️' : '🌙';
}
btnTheme.addEventListener('click', () => {
  const dark = !document.body.classList.contains('dark');
  localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  applyTheme();
});

/* ---------- 8. 会话管理 (A7 / D1) ---------- */
async function loadSessions() {
  try {
    const res = await apiFetch(API.sessions);
    const data = await res.json();
    renderSessionList(data.sessions || []);
    if (!currentSessionId && data.sessions.length) {
      await openSession(data.sessions[0].id);   // 默认打开第一个
    } else if (currentSessionId) {
      await openSession(currentSessionId);
    } else {
      newSession();
    }
  } catch (e) { console.error(e); }
}

function renderSessionList(sessions) {
  sessionList.innerHTML = '';
  sessions.forEach((s) => {
    const item = document.createElement('div');
    item.className = 'session-item' + (s.id === currentSessionId ? ' active' : '');
    item.innerHTML = `<span class="s-title">${escapeHtml(s.title)}</span>
                      <small class="s-meta">${s.message_count} 条 · ${fmtTime(s.updated_at)}</small>`;
    item.addEventListener('click', () => openSession(s.id));
    sessionList.appendChild(item);
  });
}

async function openSession(id) {
  currentSessionId = id;
  chat.innerHTML = '';
  messages = [];
  try {
    const res = await apiFetch(API.sessions + '?id=' + encodeURIComponent(id));
    const data = await res.json();
    messages = data.messages || [];
    messages.forEach((m) => renderMessage(m.role, m.content, false));
  } catch (e) {
    chat.innerHTML = `<div class="msg bot"><div class="bubble">加载会话失败：${escapeHtml(e.message)}</div></div>`;
  }
  loadSessions();          // 刷新高亮
}

async function newSession() {
  try {
    const res = await apiFetch(API.sessions, { method: 'POST', body: '{}' });
    const data = await res.json();
    currentSessionId = data.id;
    messages = [];
    chat.innerHTML = '';
    loadSessions();
  } catch (e) { alert('新建会话失败：' + e.message); }
}
btnNewSession.addEventListener('click', newSession);

/* ---------- 9. 渲染消息 (A2 Markdown / A8 复制) ---------- */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// 轻量 XSS 过滤：去掉 <script> 与 on* 事件属性（配合 marked）
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) =>
    [...el.attributes].forEach((a) => {
      if (/^on/i.test(a.name) || a.name === 'href' && /^javascript:/i.test(a.value))
        el.removeAttribute(a.name);
    }));
  return doc.body.innerHTML;
}

function renderMessage(role, content, addToMessages = true) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + role;

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (role === 'bot' ? ' md' : '');
  bubble.innerHTML = role === 'bot'
    ? sanitizeHtml(marked.parse(content))     // A2 Markdown
    : escapeHtml(content).replace(/\n/g, '<br>');
  wrap.appendChild(bubble);

  if (role === 'bot') {                        // A8 复制按钮
    const btn = document.createElement('button');
    btn.className = 'copy';
    btn.textContent = '复制';
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(content);
      btn.textContent = '✓ 已复制';
      setTimeout(() => (btn.textContent = '复制'), 1200);
    });
    wrap.appendChild(btn);
  }

  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  if (addToMessages) messages.push({ role, content });
  return { wrap, bubble };
}

/* ---------- 10. 发送 + 流式读取 (A1 记忆 / B1 模型) ---------- */
btnClear.addEventListener('click', () => {   // A8 一键清空
  if (!currentSessionId) return;
  messages = [];
  chat.innerHTML = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || isStreaming || !currentSessionId) return;

  input.value = '';
  autoResize();
  renderMessage('user', text);                // 先显示用户消息
  isStreaming = true; btnSend.disabled = true;

  // 构造发送给后端的历史（A1：带上 system + 此前所有消息）
  const payload = {
    session_id: currentSessionId,
    model: modelSelect.value,                  // B1
    messages: [
      { role: 'system', content: '你是一个乐于助人的助手，请用中文回答。' },
      ...messages,                             // 当前会话全部历史
    ],
  };

  const { bubble } = renderMessage('bot', '', false); // 占位气泡
  abortController = new AbortController();
  let full = '';

  try {
    const res = await fetch(API.chat, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });
    if (!res.ok) throw new Error('请求失败 HTTP ' + res.status);
    if (!res.body) throw new Error('无响应流');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value, { stream: true });
      bubble.innerHTML = sanitizeHtml(marked.parse(full)); // 流式重渲染
      chat.scrollTop = chat.scrollHeight;
    }
    messages.push({ role: 'assistant', content: full });   // 存入本地历史
    loadSessions();                                         // 更新会话条数/标题
  } catch (err) {
    if (err.name !== 'AbortError')
      bubble.innerHTML = `<span class="error">出错：${escapeHtml(err.message)}</span>`;
  } finally {
    isStreaming = false; btnSend.disabled = false;
    abortController = null;
  }
});

// 输入框自适应高度 (A6)
input.addEventListener('input', autoResize);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});
function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

/* ---------- 11. 导出对话 (D3) ---------- */
btnExport.addEventListener('click', async () => {
  if (!currentSessionId) return alert('请先选择会话');
  try {
    const res = await apiFetch(API.export + '?id=' + encodeURIComponent(currentSessionId));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'conversation-' + currentSessionId.slice(0, 8) + '.md';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { alert('导出失败：' + e.message); }
});

/* ---------- 12. 用量统计 (D2) ---------- */
btnStats.addEventListener('click', async () => {
  try {
    const res = await apiFetch(API.stats);
    const data = await res.json();
    statsBody.innerHTML = `
      <p>总消息数：<b>${data.total_messages}</b></p>
      <p>总 Token 消耗：<b>${data.total_tokens}</b></p>
      <p>按模型分布：</p>
      <ul>${data.by_model.map((m) =>
        `<li>${escapeHtml(m.model)} — ${m.messages} 条 / ${m.tokens} token</li>`).join('')}</ul>`;
    statsModal.classList.remove('hidden');
  } catch (e) { alert('统计加载失败：' + e.message); }
});
btnCloseStats.addEventListener('click', () => statsModal.classList.add('hidden'));
statsModal.addEventListener('click', (e) => {
  if (e.target === statsModal) statsModal.classList.add('hidden');
});

/* ---------- 13. 小工具 ---------- */
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ---------- 14. 启动 ---------- */
if (token) { enterApp(); } else { loginOverlay.classList.remove('hidden'); }
