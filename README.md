# llmchat

一个基于 Cloudflare Pages + Workers AI + D1 的轻量中文聊天应用，支持多会话、Markdown 渲染、模型切换和会话导出。

## 1. 功能概览

- 密码登录与 Bearer Token 鉴权
- 多会话聊天记录持久化
- 支持多个 Cloudflare AI 模型切换
- Markdown 代码/列表/引用等富文本展示
- 对话导出为 Markdown
- 用量统计与会话标题管理

## 2. 运行前准备

确保你已具备：

- Node.js 18+ / npm
- Cloudflare 账号
- 一个 Cloudflare D1 数据库
- 可用的 Workers AI 绑定

## 3. 快速开始

### 3.1 安装依赖

```bash
npm install
```

### 3.2 创建数据库表

在 Cloudflare D1 Console 中执行项目根目录下的 `schema.sql`，创建以下表：

- `sessions`
- `messages`
- `auth_tokens`

### 3.3 配置 Wrangler

编辑 `wrangler.toml`，至少修改以下内容：

```toml
name = "llm-chat"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[vars]
AUTH_PASS = "你的强密码"
TOKEN_TTL = "86400"

[[ai_bindings]]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "llm-chat-db"
database_id = "你的-D1-database-id"
```

说明：

- `AUTH_PASS`：登录时使用的访问密码
- `TOKEN_TTL`：访问令牌有效期，单位为秒，默认 `86400`
- `DB`：D1 数据库绑定名，代码中固定使用 `env.DB`
- `AI`：Workers AI binding 名，代码中固定使用 `env.AI`

### 3.4 本地开发

```bash
npm run dev
```

访问本地页面后，输入 `AUTH_PASS` 即可登录并开始聊天。

### 3.5 部署

```bash
npm run deploy
```

部署前确认：

- Cloudflare Pages 已绑定该项目
- 已配置 `AI` 和 `DB` binding
- 生产环境中的 `AUTH_PASS` 已正确设置

## 4. 项目结构

```text
.
├── css/
│   └── style.css
├── functions/
│   ├── _middleware.js
│   └── api/
│       ├── auth.js
│       ├── chat.js
│       ├── export.js
│       ├── sessions.js
│       └── stats.js
├── js/
│   └── app.js
├── index.html
├── package.json
├── schema.sql
├── wrangler.toml
└── README.md
```

## 5. 安全提醒

- 不要在公开仓库中直接写死真实密码
- 令牌不会明文保存到 D1，只保存 SHA-256 哈希
- 所有 `/api/*` 非登录接口都要求带有效 `Authorization: Bearer <token>`
- 部署时优先使用 Cloudflare 的 Secret / 环境变量管理敏感配置

## 6. 许可证

当前仓库未声明许可证。