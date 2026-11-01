-- ============================================================
-- Cloudflare LLM Chat — D1 建表脚本 (schema.sql)
-- 用法：在 D1 数据库 → Console → Run 里整段执行
-- ============================================================

-- ---------- 1. 会话表 ----------
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,                -- 会话 UUID
  title      TEXT NOT NULL DEFAULT '新会话',   -- 会话标题（首轮消息自动更新）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 2. 消息表（每条对话一行，含模型与 token 估算） ----------
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,                -- 消息 UUID
  session_id TEXT NOT NULL,                   -- 所属会话
  role       TEXT NOT NULL,                   -- user / system / assistant
  content    TEXT NOT NULL,                   -- 消息正文
  model      TEXT,                            -- 生成该条的模型 ID（用户消息为 NULL）
  token_used INTEGER NOT NULL DEFAULT 0,      -- 估算 token 消耗（D2 统计用）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- 3. 鉴权令牌表（只存 SHA-256 哈希，不存明文） ----------
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,                -- token 的 SHA-256 哈希
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL                    -- 过期时间（ISO）
);

-- ============================================================
-- 索引：按会话查询消息更快
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
