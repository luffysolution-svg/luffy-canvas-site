import { toolNames, type ToolName } from "./schemas.js";

export const mcpProfiles = ["readonly", "editor", "generator", "assets", "full"] as const;
export type McpProfile = (typeof mcpProfiles)[number];

const readonlyTools: ToolName[] = [
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
];

const profileTools: Record<McpProfile, ToolName[]> = {
    readonly: readonlyTools,
    editor: [
        ...readonlyTools,
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
    ],
    generator: [...readonlyTools, "canvas_generate_text", "canvas_generate_image", "canvas_generate_video", "canvas_generate_audio", "canvas_run_generation", "workbench_image_generate", "workbench_video_generate"],
    assets: ["assets_list", "assets_add", "canvas_create_attachment_nodes"],
    full: [...toolNames],
};

export function resolveMcpProfile(argv = process.argv.slice(2), env = process.env): McpProfile {
    const index = argv.indexOf("--profile");
    const value = index >= 0 ? argv[index + 1] : env.LUFFY_CANVAS_MCP_PROFILE;
    if (!value) return "editor";
    if (isMcpProfile(value)) return value;
    throw new Error(`Unknown Luffy Canvas MCP profile: ${value}`);
}

export function toolsForProfile(profile: McpProfile) {
    return [...profileTools[profile]];
}

export function enforceProfileInput(profile: McpProfile, name: ToolName, input: unknown) {
    if (!profileTools[profile].includes(name)) throw new Error(`Tool ${name} is not allowed by the ${profile} profile`);
    if (profile !== "editor" || !input || typeof input !== "object" || Array.isArray(input)) return;
    const value = input as Record<string, unknown>;
    if (name === "canvas_apply_ops" && Array.isArray(value.ops) && value.ops.some((op) => isGenerationOp(op))) {
        throw new Error("The editor profile cannot run generation operations");
    }
    if ((name === "canvas_create_config_node" || name === "canvas_create_image_prompt_flow" || name === "canvas_create_generation_flow") && value.autoRun === true) {
        throw new Error("The editor profile cannot enable autoRun");
    }
}

function isMcpProfile(value: string): value is McpProfile {
    return mcpProfiles.includes(value as McpProfile);
}

function isGenerationOp(value: unknown) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).type === "run_generation");
}
