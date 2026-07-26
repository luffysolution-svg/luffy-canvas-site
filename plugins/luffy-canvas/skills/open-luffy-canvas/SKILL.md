---
name: open-luffy-canvas
description: 打开、启动、进入或连接 Luffy Canvas 在线或本地画布，并通过本地 Luffy Canvas Agent 完成安全配对。用户要求打开 Luffy Canvas、新建或恢复画布、连接本地 Agent、检查连接状态，或明确要求启动本地开发站点时使用。
---

# Open Luffy Canvas

默认打开在线站点。只有用户明确要求本地开发时才启动 Vite。

## 打开与配对

1. 检查 Luffy Canvas Agent 是否已在 `127.0.0.1` 运行。未运行时使用已公开发布的固定版本启动：

```bash
npx -y @luffysolution/canvas-agent@0.2.0
```

仅在用户明确要求调试当前仓库源码时，才从插件所在仓库构建并启动：

```bash
cd /absolute/path/to/luffy-canvas-site/canvas-agent
npm ci
npm run build
node dist/index.js
```

2. 从 Agent 启动输出取得短期、一次性的 pairing code。不要读取、打印或复用旧永久 token。
3. 默认打开 `https://luffy-canvas-site.vercel.app/canvas?mode=new`。不要把 pairing code、session token、API Key 或其他密钥放进 URL。
4. 在网页配对界面填写本地 Agent 地址和 pairing code，由网页 `POST /pair` 换取短期 session token。
5. 确认网页显示已连接，再继续使用 `operate-luffy-canvas`。配对不得改变网页写操作审批策略，默认仍需确认写入。

## 打开模式

- 默认新建画布：`mode=new`
- 用户明确要求最近画布：`mode=recent`
- 用户明确要求自己选择：`mode=choose`
- 用户指定画布 ID 时，打开对应 `/canvas/:id`

## 本地开发

仅在用户明确要求本地开发站点时执行：

```bash
cd web
npm ci --legacy-peer-deps
npm run dev
```

使用 Vite 输出的 Local 地址打开同样的画布路径，再完成配对。不要默认启动本地前端。

## 连接边界

插件配置的 `luffy-canvas` MCP 进程提供 stdio 工具，普通 Agent 进程提供网页连接；单独运行其中一个不能完成完整控制链路。若 MCP 尚未连接、网页未配对或 Agent 已断开，明确指出缺失环节，不要求用户复制 token 或内部 JSON。
