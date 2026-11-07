# llmchat

基于 Cloudflare Pages、Workers AI 和 D1 的轻量中文 LLM 聊天应用。前端提供多会话聊天、Markdown 渲染、模型切换和对话导出；Pages Functions 负责鉴权、AI 请求和数据持久化。

## 功能

- 密码登录与 Bearer Token 鉴权，令牌以 SHA-256 哈希形式存储在 D1
- 多会话及消息持久化
- Workers AI 流式生成，可选择 Llama、DeepSeek、Qwen 或 Gemma 模型
- Markdown 回复渲染、亮/暗主题
- 对话 Markdown 导出及用量统计

## 技术栈

- Cloudflare Pages / Pages Functions
- Cloudflare Workers AI
- Cloudflare D1
- 原生 JavaScript、HTML 和 CSS
- Wrangler 3

## 前置条件

- Node.js 和 npm
- Cloudflare 账号
- 已创建的 Cloudflare D1 数据库，并可使用 Workers AI

## 配置与运行

1. 安装依赖：

   ```bash
   npm install
   ```

2. 在 Cloudflare 控制台创建 D1 数据库，并在数据库 Console 中执行仓库根目录的 `schema.sql`。

3. 编辑 `wrangler.toml`，将 `database_id` 替换为实际 D1 数据库 ID，并设置 `database_name`。将 `AUTH_PASS` 改为强密码。不要将真实密码或其他密钥提交到公开仓库；部署时优先通过 Cloudflare 的加密 Secret/环境变量配置敏感值。

4. 本地启动 Pages：

   ```bash
   npm run dev
   ```

5. 部署到 Cloudflare Pages：

   ```bash
   npm run deploy
   ```

确保 Pages 项目配置了 `AI` Workers AI binding 和 `DB` D1 binding（名称需与 `wrangler.toml` 中的 binding 一致），并在部署环境中设置 `AUTH_PASS`。`TOKEN_TTL` 为可选配置，单位为秒，默认 86400 秒（24 小时）。

## 项目结构

```text
.
├── css/                 # 页面样式
├── functions/           # Pages Functions API 与鉴权中间件
│   └── api/             # auth、chat、sessions、export、stats 接口
├── js/app.js            # 前端交互逻辑
├── schema.sql           # D1 数据库表结构
├── index.html           # 单页应用入口
├── wrangler.toml        # Wrangler 与 Cloudflare 绑定配置
└── package.json         # 本地开发和部署脚本
```

## 安全提示

- 请在部署前将 `wrangler.toml` 中的示例密码替换为安全配置，并妥善保管凭据。
- `/api/auth` 以外的 API 均要求有效 Bearer Token。
- 不要在 issue、日志或客户端代码中公开密码、令牌或 Cloudflare 凭据。

## 许可证

当前仓库未声明许可证。