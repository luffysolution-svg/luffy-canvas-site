---
name: operate-luffy-canvas
description: 通过 luffy-canvas MCP 读取、创建、修改、布局或生成 Luffy Canvas 内容。用户要求理解当前画布或选区、创建和连接节点、批量编辑布局、运行文本/图片/视频/音频生成、搜索提示词或管理素材时使用。
---

# Operate Luffy Canvas

## 操作顺序

1. 确认当前页面和画布状态。先调用 `canvas_get_state`；用户提到“当前”“选中”或“这个”时再调用 `canvas_get_selection`。
2. 页面未连接时停止写入，使用 `open-luffy-canvas` 完成启动和配对。
3. 优先使用语义工具；只有多节点批量改动才使用一次 `canvas_apply_ops`。
4. 生成请求提交后使用 `generation_get_status` 查询。任务状态不明时不要重复提交可能计费的请求。
5. 返回关键节点 ID、任务 ID 和结果摘要，不回传 base64、大型快照、session token 或 API Key。

## 工具选择

- 单个文本：`canvas_create_text_node`
- 多个文本：`canvas_create_text_nodes`
- 生成流程：`canvas_create_generation_flow`
- 图片提示词流程：`canvas_create_image_prompt_flow`
- 批量布局或连接：一次 `canvas_apply_ops`
- 工作台生成：先读对应 `*_get_config`，再调用 `*_generate`
- 提示词：`prompts_search`
- 素材：`assets_list`、`assets_add`

完整工具与 Profile 范围见 [references/tools.md](references/tools.md)。常见操作步骤见 [references/workflows.md](references/workflows.md)，连接、权限和生成异常见 [references/troubleshooting.md](references/troubleshooting.md)。

## 权限与审批

- 只调用当前 MCP Profile 暴露的工具，不尝试通过低级操作绕过 Profile。
- 读取状态、选区和快照无需网页确认。
- 修改或删除现有节点、批量操作、生成任务、附件落画布和素材写入遵循网页审批。
- MCP 客户端自身审批与网页画布审批是两层独立机制；一层允许不代表另一层自动允许。
- Codex、Claude Code、WorkBuddy 和其他标准 MCP 客户端遵循相同工具语义与 Profile，不假设它们共享侧边栏会话。

## 画布规范

- 页面文案和节点内容默认使用中文。
- 节点留出清晰间距，避免堆叠。
- 图片、视频和音频节点默认保持原始比例。
- 不模拟鼠标点击，不要求用户手工粘贴工具 JSON。
