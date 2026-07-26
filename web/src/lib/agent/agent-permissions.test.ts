import { describe, expect, it } from "vitest";

import { classifyAgentTool, decideAgentTool, type AgentApprovalMode } from "./agent-permissions";

describe("agent permissions", () => {
    it.each(["site_navigate", "canvas_list_projects", "canvas_get_state", "canvas_get_selection", "canvas_export_snapshot", "generation_get_status", "workbench_image_get_config", "workbench_video_get_config", "prompts_search", "assets_list"])(
        "allows the read tool %s in every mode",
        (tool) => {
            expect(classifyAgentTool(tool)).toBe("read");
            (["readonly", "confirm-writes", "session-write", "always-agent"] satisfies AgentApprovalMode[]).forEach((mode) => {
                expect(decideAgentTool(mode, tool)).toBe("allow");
            });
        },
    );

    it.each([
        ["canvas_apply_ops", "write"],
        ["canvas_delete_nodes", "write"],
        ["canvas_update_node", "write"],
        ["canvas_create_attachment_nodes", "assets"],
        ["assets_add", "assets"],
        ["canvas_generate_image", "generate"],
        ["canvas_generate_video", "generate"],
        ["canvas_generate_audio", "generate"],
        ["canvas_run_generation", "generate"],
        ["workbench_image_generate", "generate"],
        ["workbench_video_generate", "generate"],
    ])("classifies %s as %s and requires confirmation by default", (tool, risk) => {
        expect(classifyAgentTool(tool)).toBe(risk);
        expect(decideAgentTool("readonly", tool)).toBe("deny");
        expect(decideAgentTool("confirm-writes", tool)).toBe("confirm");
        expect(decideAgentTool("session-write", tool)).toBe("allow");
        expect(decideAgentTool("always-agent", tool)).toBe("allow");
    });

    it("fails closed for unknown tools", () => {
        expect(classifyAgentTool("canvas_future_magic")).toBe("unknown");
        (["readonly", "confirm-writes", "session-write", "always-agent"] satisfies AgentApprovalMode[]).forEach((mode) => {
            expect(decideAgentTool(mode, "canvas_future_magic")).toBe("deny");
        });
    });
});
