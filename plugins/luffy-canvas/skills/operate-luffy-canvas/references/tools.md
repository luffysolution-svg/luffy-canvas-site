# MCP 工具与 Profile

通过 CLI 参数或环境变量选择 Profile：

```bash
luffy-canvas-agent mcp --profile editor
LUFFY_CANVAS_MCP_PROFILE=editor luffy-canvas-agent mcp
```

默认 Profile 是 `editor`。客户端只能看到当前 Profile 暴露的工具。

## readonly

- 页面与画布：`site_navigate`、`canvas_list_projects`、`canvas_get_state`、`canvas_get_selection`、`canvas_export_snapshot`
- 任务：`generation_get_status`
- 工作台配置：`workbench_image_get_config`、`workbench_video_get_config`
- 检索：`prompts_search`、`assets_list`

## editor

包含 `readonly`，并增加：

- `canvas_apply_ops`
- `canvas_create_node`
- `canvas_create_text_node`
- `canvas_create_text_nodes`
- `canvas_create_config_node`
- `canvas_create_image_prompt_flow`
- `canvas_create_generation_flow`
- `canvas_update_node`
- `canvas_update_node_text`
- `canvas_move_nodes`
- `canvas_resize_node`
- `canvas_delete_nodes`
- `canvas_connect_nodes`
- `canvas_select_nodes`
- `canvas_set_viewport`

`editor` 用于编辑画布，但不允许借助 `autoRun` 或 `run_generation` 绕过生成权限。

## generator

包含 `readonly`，并增加：

- `canvas_generate_text`
- `canvas_generate_image`
- `canvas_generate_video`
- `canvas_generate_audio`
- `canvas_run_generation`
- `workbench_image_generate`
- `workbench_video_generate`

## assets

- `assets_list`
- `assets_add`
- `canvas_create_attachment_nodes`

## full

注册全部工具。只在明确需要编辑、生成和素材写入的受信任客户端使用。

Profile 负责 MCP 工具暴露和输入级权限；网页仍独立确认删除、修改、生成、附件与素材写入等操作。
