import assert from "node:assert/strict";
import test from "node:test";

import { AgentAdapterRegistry, claudeCodeArgs, ClaudeCodeAdapter, CodexAdapter } from "./agent-adapters.js";
import type { AgentAdapter } from "./agent-adapter.js";

test("registry reports provider availability and capabilities", async () => {
    let shutdownForce: boolean | undefined;
    const fake: AgentAdapter = {
        id: "fake",
        displayName: "Fake",
        capabilities: { sessions: true, history: false, deleteSession: false, attachments: false, interrupt: true, tokenUsage: false },
        async isAvailable() {
            return true;
        },
        async listSessions() {
            return [];
        },
        async startSession() {
            return { id: "one", title: "One", status: "idle" };
        },
        async resumeSession(sessionId) {
            return { id: sessionId, title: "One", status: "idle" };
        },
        async deleteSession() {},
        async sendTurn() {},
        async interrupt() {
            return true;
        },
        async shutdown(force) {
            shutdownForce = force;
        },
        normalizeEvent() {
            return null;
        },
    };
    const registry = new AgentAdapterRegistry(() => undefined, [fake]);

    assert.deepEqual(await registry.providers(), [
        {
            id: "fake",
            displayName: "Fake",
            available: true,
            capabilities: { ...fake.capabilities, listSessions: false, resumeSession: false },
        },
    ]);
    assert.equal(registry.get("fake"), fake);
    assert.throws(() => registry.get("missing"), /Unknown agent provider/);
    await registry.shutdown(true);
    assert.equal(shutdownForce, true);
});

test("Claude Code advertises only native capabilities and normalizes stream events", async () => {
    const adapter = new ClaudeCodeAdapter();
    const session = await adapter.startSession({ cwd: process.cwd() });

    assert.match(session.id, /^[0-9a-f-]{36}$/);
    assert.equal(adapter.capabilities.history, false);
    assert.equal(adapter.capabilities.attachments, false);
    assert.deepEqual(await adapter.listSessions({ cwd: process.cwd() }), []);
    assert.equal(
        adapter.normalizeEvent({
            type: "stream_event",
            session_id: session.id,
            event: { type: "message_start", message: { id: "message-one" } },
        }),
        null,
    );
    assert.deepEqual(
        adapter.normalizeEvent({
            type: "stream_event",
            session_id: session.id,
            event: { type: "content_block_delta", delta: { type: "text_delta", text: "Claude " } },
        }),
        {
            type: "item.updated",
            session_id: session.id,
            item: { id: "message-one", type: "agent_message", text: "Claude " },
        },
    );
    assert.deepEqual(
        adapter.normalizeEvent({
            type: "stream_event",
            session_id: session.id,
            event: { type: "content_block_delta", delta: { type: "text_delta", text: "Code" } },
        }),
        {
            type: "item.updated",
            session_id: session.id,
            item: { id: "message-one", type: "agent_message", text: "Claude Code" },
        },
    );
    assert.deepEqual(
        adapter.normalizeEvent({
            type: "assistant",
            session_id: session.id,
            message: { id: "message-one", content: [{ type: "text", text: "Claude Code" }], usage: { input_tokens: 10, output_tokens: 2 } },
        }),
        {
            type: "item.completed",
            session_id: session.id,
            item: { id: "message-one", type: "agent_message", text: "Claude Code" },
            usage: { input_tokens: 10, output_tokens: 2 },
        },
    );
    assert.deepEqual(adapter.normalizeEvent({ type: "result", session_id: session.id, result: "done" }), {
        type: "turn.completed",
        session_id: session.id,
        result: "done",
    });
});

test("Claude Code accepts only UUID sessions known to the adapter", async () => {
    const adapter = new ClaudeCodeAdapter();

    await assert.rejects(adapter.resumeSession("--settings=attacker.json", { cwd: process.cwd() }), /must be a UUID/);
    const id = "123e4567-e89b-42d3-a456-426614174000";
    assert.equal((await adapter.resumeSession(id, { cwd: process.cwd() })).id, id);
    const args = claudeCodeArgs(id, false, "{}");
    assert.equal(args[0], "--bare");
    assert.ok(args.includes("--strict-mcp-config"));
    assert.deepEqual(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2), ["--tools", ""]);
    assert.ok(args.includes("mcp__luffy-canvas__*"));
    assert.equal(args.at(-1), `--resume=${id}`);
});

test("Claude Code normalizes MCP tool lifecycle and failed results", async () => {
    const adapter = new ClaudeCodeAdapter();
    const sessionId = "123e4567-e89b-42d3-a456-426614174000";
    const toolId = "tool-one";

    assert.deepEqual(
        adapter.normalizeEvent({
            type: "stream_event",
            session_id: sessionId,
            event: {
                type: "content_block_start",
                index: 0,
                content_block: { type: "tool_use", id: toolId, name: "mcp__luffy-canvas__canvas_get_state", input: {} },
            },
        }),
        {
            type: "item.started",
            session_id: sessionId,
            item: { id: toolId, type: "mcp_tool_call", server: "luffy-canvas", tool: "canvas_get_state", arguments: {}, status: "in_progress" },
        },
    );
    assert.deepEqual(
        adapter.normalizeEvent({
            type: "stream_event",
            session_id: sessionId,
            event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"scope":"all"}' } },
        }),
        {
            type: "item.updated",
            session_id: sessionId,
            item: { id: toolId, type: "mcp_tool_call", server: "luffy-canvas", tool: "canvas_get_state", arguments: { scope: "all" }, status: "in_progress" },
        },
    );
    assert.deepEqual(
        adapter.normalizeEvent({
            type: "user",
            session_id: sessionId,
            message: { content: [{ type: "tool_result", tool_use_id: toolId, content: [{ type: "text", text: '{"nodes":[]}' }] }] },
        }),
        {
            type: "item.completed",
            session_id: sessionId,
            item: {
                id: toolId,
                type: "mcp_tool_call",
                server: "luffy-canvas",
                tool: "canvas_get_state",
                arguments: { scope: "all" },
                status: "completed",
                result: { content: [{ type: "text", text: '{"nodes":[]}' }] },
            },
        },
    );
    assert.deepEqual(adapter.normalizeEvent({ type: "result", subtype: "error_during_execution", is_error: true, result: "tool failed", session_id: sessionId }), {
        type: "turn.failed",
        subtype: "error_during_execution",
        is_error: true,
        result: "tool failed",
        message: "tool failed",
        session_id: sessionId,
    });
});

test("Codex adapter preserves native history, attachment, usage, and event capabilities", async () => {
    const adapter = new CodexAdapter(() => undefined);

    assert.equal(await adapter.isAvailable(), true);
    assert.deepEqual(adapter.capabilities, {
        sessions: true,
        history: true,
        deleteSession: true,
        attachments: true,
        interrupt: true,
        tokenUsage: true,
    });
    assert.deepEqual(adapter.normalizeEvent({ type: "turn.completed", usage: { input_tokens: 10 } }), {
        type: "turn.completed",
        usage: { input_tokens: 10 },
    });
    await assert.rejects(adapter.deleteSession("thread-without-workspace"), /requires its workspace/);
});
