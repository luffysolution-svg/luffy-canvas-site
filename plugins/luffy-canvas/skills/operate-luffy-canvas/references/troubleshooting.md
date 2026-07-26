# 排障

## MCP 工具不存在

- 确认 MCP Server ID 是 `luffy-canvas`。
- 确认命令使用 `@luffysolution/canvas-agent`，或使用当前仓库构建产物的绝对路径。
- 检查当前 Profile；缺失工具可能是权限过滤的预期结果。
- 安装或更新 Codex 插件后新建任务，使 Skills 和 MCP 重新加载。

## 网页未连接

- HTTP/SSE Agent 与 stdio MCP 是两个进程；确认普通 Agent 也在运行。
- 使用新的短期 pairing code 重新配对。
- 不要把 pairing code 或 session token 放进 URL。
- 确认网页 Origin 被本次配对允许，且 Agent 仍只监听 `127.0.0.1`。

## 写操作等待确认

- MCP 客户端审批和网页审批相互独立。
- 在网页确认卡中检查目标画布、工具和参数。
- 请求过期后重新读取状态，不要批准旧请求或直接重复生成。

## 生成状态不明确

- 使用 `generation_get_status` 查询已有任务。
- 检查任务 ID、当前活动页面和 Agent 连接。
- 在确认提供商未消费前不要重新提交图片、视频或音频生成。

## 从旧名称迁移

```bash
codex plugin remove infinite-canvas
codex mcp remove infinite-canvas
```

然后安装 `luffy-canvas` 插件或 MCP。不要继续使用 `mcp__infinite-canvas__*`；新的 Claude Code 工具前缀是 `mcp__luffy-canvas__*`。
