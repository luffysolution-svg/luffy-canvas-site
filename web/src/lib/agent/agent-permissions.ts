export type AgentApprovalMode = "readonly" | "confirm-writes" | "session-write" | "always-agent";
export type AgentToolRisk = "read" | "write" | "generate" | "assets" | "unknown";
export type AgentToolDecision = "allow" | "confirm" | "deny";

export const AGENT_APPROVAL_MODE_OPTIONS: Array<{ value: AgentApprovalMode; label: string }> = [
    { value: "readonly", label: "只读" },
    { value: "confirm-writes", label: "每次写操作确认" },
    { value: "session-write", label: "本次会话允许写入" },
    { value: "always-agent", label: "始终允许当前本地 Agent" },
];

const READ_TOOLS = new Set([
    "site_navigate",
    "canvas_list_projects",
    "canvas_get_state",
    "canvas_get_selection",
    "canvas_export_snapshot",
    "generation_get_status",
    "workbench_image_get_config",
    "workbench_video_get_config",
    "prompts_search",
    "assets_list",
]);

const GENERATION_TOOLS = new Set(["canvas_generate_text", "canvas_generate_image", "canvas_generate_video", "canvas_generate_audio", "canvas_run_generation", "workbench_image_generate", "workbench_video_generate"]);

const ASSET_TOOLS = new Set(["assets_add", "canvas_create_attachment_nodes"]);

const WRITE_TOOLS = new Set([
    "canvas_apply_ops",
    "canvas_create_node",
    "canvas_create_text_node",
    "canvas_create_text_nodes",
    "canvas_create_config_node",
    "canvas_create_image_prompt_flow",
    "canvas_create_generation_flow",
    "canvas_update_node",
    "canvas_update_node_text",
    "canvas_move_nodes",
    "canvas_resize_node",
    "canvas_delete_nodes",
    "canvas_connect_nodes",
    "canvas_select_nodes",
    "canvas_set_viewport",
]);

export function classifyAgentTool(name: string): AgentToolRisk {
    if (READ_TOOLS.has(name)) return "read";
    if (GENERATION_TOOLS.has(name)) return "generate";
    if (ASSET_TOOLS.has(name)) return "assets";
    if (WRITE_TOOLS.has(name)) return "write";
    return "unknown";
}

export function decideAgentTool(mode: AgentApprovalMode, name: string): AgentToolDecision {
    const risk = classifyAgentTool(name);
    if (risk === "unknown") return "deny";
    if (risk === "read") return "allow";
    if (mode === "readonly") return "deny";
    if (mode === "confirm-writes") return "confirm";
    return "allow";
}

export function agentToolRiskLabel(risk: AgentToolRisk) {
    if (risk === "generate") return "生成操作";
    if (risk === "assets") return "素材写入";
    if (risk === "write") return "画布写入";
    if (risk === "read") return "只读操作";
    return "未知工具";
}
