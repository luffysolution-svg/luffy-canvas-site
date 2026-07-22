<p align="center">
  <img src="web/public/logo.svg" width="96" alt="luffy-canvas-site logo">
</p>

<h1 align="center">luffy-canvas-site</h1>

<p align="center">
  面向 AI 图片、视频与画布工作流的开源创作平台。
</p>

<p align="center">
  <a href="https://github.com/luffysolution-svg/luffy-canvas-site"><img src="https://img.shields.io/github/stars/luffysolution-svg/luffy-canvas-site?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
</p>

## 项目介绍

`luffy-canvas-site` 是基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 的二次开发项目。它将无限画布、AI 图片与视频生成、参考素材、提示词库和本地 Agent 集成到同一个浏览器工作台中。

感谢原作者 [basketikun](https://github.com/basketikun) 及所有上游贡献者提供的开源基础。本项目保留上游来源说明，并继续使用 GNU Affero General Public License v3.0。

## 核心功能

- 多画布项目、节点编排、连线、缩放、导入与导出。
- 浏览器直连用户配置的 OpenAI 兼容、Gemini、Qwen 等接口。
- 图片、视频、音频和文本生成工作台。
- 提示词库、素材管理与浏览器本地持久化。
- Canvas Agent、MCP 与画布节点插件能力。
- 自定义模型调用脚本与多渠道模型配置。

详细文档见 [docs/index.md](docs/index.md)。

## 快速开始

```bash
git clone https://github.com/luffysolution-svg/luffy-canvas-site.git
cd luffy-canvas-site/web
bun install
bun run dev
```

开发服务默认运行在 `http://localhost:3000`。

## Netlify 部署

仓库根目录已包含 `netlify.toml`。Netlify 连接本仓库后会以 `web` 为基础目录执行 Vite 构建，并为 React Router 配置 SPA 回退。

也可以使用 Netlify CLI 发布：

```bash
cd web
bun run build
npx netlify deploy --prod --dir=dist
```

## 配置与安全

- AI API Key、Base URL、画布、素材和生成记录默认保存在用户浏览器本地。
- 仓库和静态部署产物不包含用户在浏览器中填写的 API Key。
- 请勿把真实密钥写入源码、提交记录或公开环境变量。
- 当前前端直接请求第三方 AI 接口，目标服务需要支持浏览器跨域请求。

## 开源协议与上游致谢

本项目使用 [GNU Affero General Public License v3.0](LICENSE)。通过网络向用户提供本项目功能时，应按照 AGPL-3.0 向用户提供对应源码。

上游项目：<https://github.com/basketikun/infinite-canvas>
