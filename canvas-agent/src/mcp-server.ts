import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { AGENT_PROMPT, loadConfig, loadRuntimeConfig, VERSION } from "./config.js";
import { enforceProfileInput, resolveMcpProfile, toolsForProfile, type McpProfile } from "./mcp-profiles.js";
import { toolDescriptions, toolInputSchemas, type ToolName } from "./schemas.js";

type CanvasAgentToolResponse = { ok?: boolean; result?: unknown; error?: string };
export type McpToolCaller = (name: ToolName, input: unknown) => Promise<unknown>;

export function createMcpServer(profile: McpProfile, callTool: McpToolCaller = postCanvasAgentTool) {
    const server = new McpServer({ name: "luffy-canvas", version: VERSION }, { instructions: AGENT_PROMPT });
    toolsForProfile(profile).forEach((name) => registerCanvasTool(server, profile, name, callTool));
    return server;
}

export async function startMcpServer(argv = process.argv.slice(2)) {
    const profile = resolveMcpProfile(argv);
    await createMcpServer(profile).connect(new StdioServerTransport());
}

function registerCanvasTool(server: McpServer, profile: McpProfile, name: ToolName, callTool: McpToolCaller) {
    const schema = toolInputSchemas[name];
    server.registerTool(name, { description: toolDescriptions[name], inputSchema: schema.shape }, async (input: unknown) => {
        const parsed = schema.parse(input);
        enforceProfileInput(profile, name, parsed);
        const result = await callTool(name, parsed);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    });
}

async function postCanvasAgentTool(name: ToolName, input: unknown) {
    const config = loadConfig(false);
    const runtime = loadRuntimeConfig();
    if (!runtime || runtime.agentId !== config.agentId || runtime.expiresAt <= Date.now()) {
        throw new Error("Luffy Canvas Agent is not running or its MCP session expired. Start luffy-canvas-agent and retry.");
    }
    const res = await fetch(`${runtime.url}/api/tools`, {
        method: "POST",
        headers: { authorization: `Bearer ${runtime.sessionToken}`, "content-type": "application/json" },
        body: JSON.stringify({ name, input }),
    });
    const body = (await res.json().catch(() => ({}))) as CanvasAgentToolResponse;
    if (!res.ok || !body.ok) throw new Error(body.error || `Luffy Canvas Agent returned HTTP ${res.status}`);
    return body.result;
}
