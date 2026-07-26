# 常见工作流

## 理解当前画布

1. 调用 `canvas_get_state` 获取摘要。
2. 用户指向当前选区时调用 `canvas_get_selection`。
3. 仅在布局细节必要时调用 `canvas_export_snapshot`。
4. 用节点名称和 ID 总结结果，不返回大型媒体数据。

## 创建内容与布局

1. 先读取画布和视口。
2. 单节点使用对应语义工具。
3. 多节点布局、连接或批量更新合并为一次 `canvas_apply_ops`。
4. 保留节点间距与媒体原始比例。
5. 返回新节点 ID，必要时再次读取状态确认。

## 运行生成

1. 确认当前 Profile 含生成工具。
2. 需要工作台参数时先调用对应 `*_get_config`。
3. 提交一次生成请求并记录任务 ID。
4. 使用 `generation_get_status` 查询到终态。
5. 状态未知、网络中断或响应待确认时不要自动重试；先让用户确认提供商侧是否已消费。

## 使用附件和素材

1. 附件落画布使用 `canvas_create_attachment_nodes`，不要创建空媒体占位。
2. 使用返回的真实节点 ID 连接生成流程。
3. `assets_add` 和附件写入遵循网页审批。
4. 不把 base64、API Key 或 session token 写入节点。

## 切换页面或画布

1. 用 `canvas_list_projects` 获取画布 ID。
2. 用 `site_navigate` 打开 `/canvas/:id`。
3. 等待页面成为活动连接，再重新读取状态。
4. Provider 或客户端切换时不要复用其他 Provider 的会话 ID。
