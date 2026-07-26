import assert from "node:assert/strict";
import test from "node:test";

import { enforceProfileInput, resolveMcpProfile, toolsForProfile } from "./mcp-profiles.js";
import { toolNames } from "./schemas.js";

test("defaults to the editor profile and supports CLI or environment selection", () => {
    assert.equal(resolveMcpProfile([], {}), "editor");
    assert.equal(resolveMcpProfile(["--profile", "readonly"], { LUFFY_CANVAS_MCP_PROFILE: "full" }), "readonly");
    assert.equal(resolveMcpProfile([], { LUFFY_CANVAS_MCP_PROFILE: "assets" }), "assets");
    assert.throws(() => resolveMcpProfile(["--profile", "admin"], {}), /Unknown/);
});

test("profiles expose only their documented tools", () => {
    assert(!toolsForProfile("readonly").includes("canvas_apply_ops"));
    assert(toolsForProfile("editor").includes("canvas_apply_ops"));
    assert(!toolsForProfile("editor").includes("canvas_generate_image"));
    assert(toolsForProfile("generator").includes("canvas_generate_image"));
    assert.deepEqual(toolsForProfile("assets"), ["assets_list", "assets_add", "canvas_create_attachment_nodes"]);
    assert.deepEqual(toolsForProfile("full"), [...toolNames]);
});

test("editor input cannot trigger generation through write tools", () => {
    assert.throws(() => enforceProfileInput("editor", "canvas_apply_ops", { ops: [{ type: "run_generation", nodeId: "n1" }] }), /cannot run generation/);
    assert.throws(() => enforceProfileInput("editor", "canvas_create_generation_flow", { prompt: "x", autoRun: true }), /cannot enable autoRun/);
    assert.doesNotThrow(() => enforceProfileInput("editor", "canvas_apply_ops", { ops: [{ type: "move_nodes", ids: ["n1"], x: 1, y: 2 }] }));
});
