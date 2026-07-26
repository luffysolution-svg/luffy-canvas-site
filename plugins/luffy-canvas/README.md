# Luffy Canvas Codex Plugin

让 Codex 通过自有 `luffy-canvas` MCP 打开并操作 Luffy Canvas。插件源码、Agent 和 Skills 均由当前仓库维护；上游归属见仓库根目录的 `NOTICE`。

## 从仓库安装

macOS / Linux：

```bash
git clone https://github.com/luffysolution-svg/luffy-canvas-site.git
cd luffy-canvas-site
cd canvas-agent
npm ci
npm run build
cd ..
codex plugin marketplace add "$(pwd)"
codex plugin add luffy-canvas@luffy-canvas-local
```

Windows PowerShell：

```powershell
git clone https://github.com/luffysolution-svg/luffy-canvas-site.git
cd luffy-canvas-site
cd canvas-agent
npm ci
npm run build
cd ..
codex plugin marketplace add "$PWD"
codex plugin add luffy-canvas@luffy-canvas-local
```

安装或更新后新建一个 Codex 任务，再输入“打开 Luffy Canvas 并安全配对”，让新 Skill 和 MCP 完整加载。

## Agent 与 MCP 是两个入口

下面的命令启动供网页连接的本地 HTTP/SSE Agent；插件内置 MCP wrapper 启动 stdio MCP Server。完整控制链路需要网页 Agent 已配对，并有一个 MCP 客户端连接 stdio Server。

`@luffysolution/canvas-agent` 尚未发布到 npm 时，不要回退到上游包。使用刚构建的仓库路径：

```bash
cd canvas-agent
npm ci
npm run build
node dist/index.js
```

npm registry 已确认目标版本归本项目维护者所有后，也可使用固定版本 `@luffysolution/canvas-agent@0.2.0`。

## 从旧插件迁移

```bash
codex plugin remove infinite-canvas
codex mcp remove infinite-canvas
codex plugin marketplace remove luffy-canvas-site-local
```

旧项不存在时可忽略对应提示。重新注册当前仓库 marketplace 后安装 `luffy-canvas@luffy-canvas-local`。

## 卸载

```bash
codex plugin remove luffy-canvas
codex mcp remove luffy-canvas
```
