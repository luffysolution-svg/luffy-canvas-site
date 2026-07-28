# Baoyu Skills 来源说明

生图工作台的部分设计规则、选项体系和工作流思路基于 [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills) 转译。

## 固定参考版本

- 仓库：`https://github.com/JimLiu/baoyu-skills`
- 参考提交：`6b7a2e417500561a5ecdd0b168332f4142584617`
- 上游许可证：[MIT License](https://github.com/JimLiu/baoyu-skills/blob/6b7a2e417500561a5ecdd0b168332f4142584617/LICENSE)
- 上游版权：`Copyright (c) 2026 Jim Liu`

完整 MIT 许可文本及版权声明已保留在项目根目录 [NOTICE](../../NOTICE)。

## 转译范围

本项目参考并转译了以下图片创作能力：

- Cover Image：封面类型、配色、渲染、文字层级、情绪、字体、画幅和完整风格预设。
- XHS Images：视觉风格、版式、配色覆盖、完整预设、长文本拆卡和首图锚点工作流。
- Infographic：完整布局、完整视觉风格、推荐规则、内容结构化与数据忠实原则。
- Article Illustrator：文章分析、插图位置规划、插图类型、统一视觉圣经和逐项提示词。
- Comic：画风、基调、页面与分格规则、角色/场景连续性及分镜工作流。
- Diagram：关系类型与技术图解语义规则。

转译后的实现位于 `web/src/features/image-design/`，主要形态是 TypeScript 注册表、纯函数编译器、浏览器端规划器和 React 界面。

## 未复制的机制

Luffy Canvas 没有嵌入或运行上游的 Agent、Skill Runtime、本地脚本和文件输出机制，也不会在运行时从 GitHub 下载 `SKILL.md`。对应能力被替换为：

- 静态 TypeScript 规则注册表；
- Zustand 与 localforage 本地偏好；
- 浏览器确认面板和表单；
- IndexedDB 生成记录与资产；
- 项目原有的 `requestImageBatch` 图片请求链。

技术图解最终仍由图片模型生成位图，不使用 SVG、Mermaid、HTML 或 Canvas 图形冒充生成结果。

## 许可关系

Baoyu Skills 的适配部分依据 MIT License 使用。Luffy Canvas 项目整体仍依据根目录 `LICENSE` 中的 GNU AGPL v3.0 发布；本说明不表示 Baoyu Skills 的原作者将版权转让给本项目，也不声称这些规则完全由 Luffy Canvas 原创。
