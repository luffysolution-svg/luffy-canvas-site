<p align="center">
  <img src="web/public/logo.svg" width="96" alt="Luffy Canvas logo">
</p>

<h1 align="center">Luffy Canvas</h1>

<p align="center">
  面向 AI 图片、视频与画布工作流的开源创作平台。
</p>

<p align="center">
  <a href="https://luffy-canvas-site.vercel.app/">在线体验</a> ·
  <a href="docs/index.md">文档</a> ·
  <a href="https://github.com/luffysolution-svg/luffy-canvas-site">GitHub</a> ·
  <a href="LICENSE">AGPL-3.0</a>
</p>

## 项目介绍

Luffy Canvas 基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 二次开发，由 `luffysolution-svg` 维护。项目保留上游来源和版权归属，并继续使用 GNU Affero General Public License v3.0；详见 [NOTICE](NOTICE)。

## 核心功能

- 多画布项目、节点编排、连线、缩放、导入与导出。
- 图片、视频、音频和文本生成工作台。
- 提示词库、素材管理与浏览器本地持久化。
- 自有 Luffy Canvas Agent、标准 MCP、Codex 插件和 Skills。
- Codex 与 Claude Code 网页侧边栏，以及 WorkBuddy 等标准 MCP 客户端接入。
- 分级 MCP 权限、网页写操作确认和短期安全配对。

## 快速开始

```bash
git clone https://github.com/luffysolution-svg/luffy-canvas-site.git
cd luffy-canvas-site/web
bun install
bun run dev
```

开发服务默认运行在 `http://localhost:3000`。AI API Key、画布、素材和生成记录默认保存在浏览器本地，前端直接请求用户配置的兼容接口。

Agent 与客户端配置见：

- [MCP 接入](docs/content/docs/integrations/mcp.mdx)
- [Codex](docs/content/docs/integrations/codex.mdx)
- [Claude Code](docs/content/docs/integrations/claude-code.mdx)
- [WorkBuddy](docs/content/docs/integrations/workbuddy.mdx)

`@luffysolution/canvas-agent` 尚未发布到 npm 时，请按文档使用当前仓库构建产物的绝对路径，不要回退到上游包。

## 许可与来源

- 源代码：<https://github.com/luffysolution-svg/luffy-canvas-site>
- 许可证：[GNU AGPL v3.0](LICENSE)
- 上游项目：<https://github.com/basketikun/infinite-canvas>
- 修改与归属说明：[NOTICE](NOTICE)
