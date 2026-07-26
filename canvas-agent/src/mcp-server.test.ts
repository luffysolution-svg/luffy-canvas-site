import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createMcpServer } from "./mcp-server.js";

test("MCP initializes as luffy-canvas, filters tools, and forwards calls", async () => {
    const calls: unknown[] = [];
    const server = createMcpServer("readonly", async (name, input) => {
        calls.push({ name, input });
        return { projectId: "project-1" };
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
        assert.equal(client.getServerVersion()?.name, "luffy-canvas");
        const tools = await client.listTools();
        assert(tools.tools.some((tool) => tool.name === "canvas_get_state"));
        assert(!tools.tools.some((tool) => tool.name === "canvas_apply_ops"));

        const result = await client.callTool({ name: "canvas_get_state", arguments: {} });
        assert.equal(result.isError, undefined);
        assert.deepEqual(calls, [{ name: "canvas_get_state", input: {} }]);
    } finally {
        await client.close();
        await server.close();
    }
});

test("MCP editor excludes generation while full exposes every tool", async () => {
    const editor = await listedToolNames("editor");
    const full = await listedToolNames("full");

    assert(editor.includes("canvas_apply_ops"));
    assert(!editor.includes("canvas_generate_image"));
    assert(full.includes("canvas_apply_ops"));
    assert(full.includes("canvas_generate_image"));
    assert(full.includes("assets_add"));
});

async function listedToolNames(profile: "editor" | "full") {
    const server = createMcpServer(profile, async () => ({}));
    const client = new Client({ name: `${profile}-client`, version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
        return (await client.listTools()).tools.map((tool) => tool.name);
    } finally {
        await client.close();
        await server.close();
    }
}
