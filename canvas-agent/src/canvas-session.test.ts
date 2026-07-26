import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasSession } from "./canvas-session.js";

test("MCP 读取当前激活网页的画布", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");

    session.activateClient("first");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");

    session.activateClient("second");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");
});

test("MCP snapshots omit client and storage metadata and bound large strings", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    session.updateState(
        {
            ...snapshot("canvas-first"),
            clientId: "browser-secret",
            nodes: [
                {
                    id: "node-1",
                    type: "text",
                    title: "Prompt",
                    position: { x: 0, y: 0 },
                    width: 320,
                    height: 200,
                    metadata: { content: "x".repeat(3000), remoteUrl: "https://storage.example/file?signature=secret", storageKey: "private-key" },
                },
                {
                    id: "node-2",
                    type: "image",
                    title: "Result",
                    position: { x: 400, y: 0 },
                    width: 320,
                    height: 200,
                    metadata: { content: "https://storage.example/file?signature=secret", remoteUrl: "https://storage.example/file?signature=secret", storageKey: "private-key" },
                },
                {
                    id: "node-3",
                    type: "panorama:viewer",
                    title: "Panorama",
                    position: { x: 800, y: 0 },
                    width: 320,
                    height: 200,
                    metadata: { content: "data:image/jpeg;base64,secret" },
                },
            ],
        },
        "first",
    );

    const state = (await session.callTool("canvas_get_state", {})) as Record<string, unknown>;
    const node = (state.nodes as Array<Record<string, unknown>>)[0];
    const metadata = node.metadata as Record<string, unknown>;
    const mediaMetadata = ((state.nodes as Array<Record<string, unknown>>)[1].metadata || {}) as Record<string, unknown>;
    const pluginMetadata = ((state.nodes as Array<Record<string, unknown>>)[2].metadata || {}) as Record<string, unknown>;
    assert.equal("clientId" in state, false);
    assert.equal("remoteUrl" in metadata, false);
    assert.equal("storageKey" in metadata, false);
    assert.equal(String(metadata.content).length, 2001);
    assert.equal("content" in mediaMetadata, false);
    assert.equal(mediaMetadata.contentAvailable, true);
    assert.equal("content" in pluginMetadata, false);
    assert.equal(pluginMetadata.contentAvailable, true);
});

test("write results are compacted before they return to MCP", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    session.updateState(snapshot("canvas-first"), "first");

    const result = session.callTool("canvas_create_text_node", { text: "safe" });
    const call = first.event("tool_call");
    session.resolveResult("first", {
        requestId: String(field(call, "requestId")),
        result: {
            ...snapshot("canvas-first"),
            clientId: "browser-secret",
            secret: "root-secret",
            viewport: { x: 1, y: 2, k: 3, token: "nested-secret" },
            nodes: [
                {
                    id: "node-1",
                    type: "image",
                    title: "Result",
                    position: { x: 0, y: 0, token: "nested-secret" },
                    width: 320,
                    height: 200,
                    metadata: {
                        content: "data:image/png;base64,secret",
                        remoteUrl: "https://storage.example/file?signature=secret",
                        storageKey: "private-key",
                        status: "success",
                    },
                },
            ],
        },
    });

    const state = (await result) as Record<string, unknown>;
    const node = (state.nodes as Array<Record<string, unknown>>)[0];
    const metadata = node.metadata as Record<string, unknown>;
    assert.equal("clientId" in state, false);
    assert.equal("secret" in state, false);
    assert.deepEqual(state.viewport, { x: 1, y: 2, k: 3 });
    assert.deepEqual(node.position, { x: 0, y: 0 });
    assert.equal("content" in metadata, false);
    assert.equal("remoteUrl" in metadata, false);
    assert.equal("storageKey" in metadata, false);
    assert.equal(metadata.contentAvailable, true);
});

test("画布写操作只发送给当前激活网页", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.activateClient("second");

    const result = session.callTool("canvas_create_text_node", { text: "只写入第二个画布" });
    const call = second.event("tool_call");
    assert.equal(first.event("tool_call"), undefined);
    assert.equal(field(call, "name"), "canvas_apply_ops");
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

test("当前 turn 的图片附件可在发起标签页画布创建图片节点", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    const dataUrl = "data:image/png;base64,aW1hZ2U=";
    session.setTurnAttachments("first", [{ id: "attachment-1", name: "商品.png", type: "image/png", size: 5, width: 1200, height: 600, dataUrl }]);
    session.bindClient("first");

    const result = session.callTool("canvas_create_attachment_nodes", { attachmentIds: ["attachment-1"], x: 100, y: 200 });
    const call = first.event("tool_call");
    const input = field(call, "input") as Record<string, unknown>;
    const nodes = input.nodes as Array<Record<string, unknown>>;
    assert.equal(field(call, "name"), "canvas_create_attachment_nodes");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].attachmentId, "attachment-1");
    assert.equal(nodes[0].title, "商品.png");
    assert.deepEqual(nodes[0].position, { x: 100, y: 200 });
    assert.equal(nodes[0].width, 640);
    assert.equal(nodes[0].height, 320);
    assert.equal("dataUrl" in nodes[0], false);
    assert.equal(session.getTurnAttachment("first", "attachment-1").dataUrl, dataUrl);

    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    const created = (await result) as { nodes: Array<{ id: string; attachmentId: string; title: string }> };
    assert.equal(created.nodes[0].id, nodes[0].id);
    assert.equal(created.nodes[0].attachmentId, "attachment-1");
    session.clearTurnAttachments("first");
    assert.throws(() => session.getTurnAttachment("first", "attachment-1"), /找不到/);
});

test("图片附件只允许发起 turn 的标签页读取和落入画布", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.setTurnAttachments("first", [{ id: "attachment-1", name: "商品.png", type: "image/png", dataUrl: "data:image/png;base64,aW1hZ2U=" }]);
    session.bindClient("second");

    await assert.rejects(session.callTool("canvas_create_attachment_nodes", { attachmentIds: ["attachment-1"] }), /发起标签页/);
    assert.throws(() => session.getTurnAttachment("second", "attachment-1"), /发起标签页/);
    assert.equal(first.event("tool_call"), undefined);
    assert.equal(second.event("tool_call"), undefined);
});

test("tool result is accepted only from the request client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.activateClient("first");

    const result = session.callTool("canvas_create_text_node", { text: "first only" });
    const call = first.event("tool_call");
    const requestId = String(field(call, "requestId"));

    assert.equal(session.resolveResult("second", { requestId, result: { ok: true, client: "second" } }), false);
    assert.equal(session.resolveResult("first", { requestId, result: { ok: true, client: "first" } }), true);
    assert.deepEqual(await result, { ok: true });
});

test("a pending write can be claimed exactly once before execution", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());

    const result = session.callTool("canvas_create_text_node", { text: "claim first" });
    const call = first.event("tool_call");
    const requestId = String(field(call, "requestId"));

    assert.equal(typeof field(call, "expiresAt"), "number");
    assert.equal(session.claimRequest("second", requestId), false);
    assert.equal(session.claimRequest("first", requestId), true);
    assert.equal(session.claimRequest("first", requestId), false);
    assert.equal(session.resolveResult("first", { requestId, result: { ok: true } }), true);
    assert.deepEqual(await result, { ok: true });
});

test("a claimed write survives SSE disconnect until its execution result arrives", async () => {
    const session = new CanvasSession({ approvalTimeoutMs: 20, executionTimeoutMs: 100 });
    const first = connect(session, "first");
    const result = session.callTool("canvas_create_text_node", { text: "execute once" });
    const call = first.event("tool_call");
    const requestId = String(field(call, "requestId"));

    assert.equal(session.claimRequest("first", requestId), true);
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(session.resolveResult("first", { requestId, result: { ok: true } }), true);
    assert.deepEqual(await result, { ok: true });
});

test("an executing write has a separate lease and reports an unknown outcome on expiry", async (t) => {
    const session = new CanvasSession({ approvalTimeoutMs: 20, executionTimeoutMs: 15 });
    const first = connect(session, "first");
    t.after(() => first.close());
    const result = session.callTool("canvas_create_text_node", { text: "slow" });
    const requestId = String(field(first.event("tool_call"), "requestId"));

    assert.equal(session.claimRequest("first", requestId), true);
    await assert.rejects(result, /执行结果未知.*不要自动重试/);
});

test("Agent shutdown rejects executing writes without retaining their lease timers", async (t) => {
    const session = new CanvasSession({ executionTimeoutMs: 60_000 });
    const first = connect(session, "first");
    t.after(() => first.close());
    const result = session.callTool("canvas_create_text_node", { text: "shutdown" });
    const requestId = String(field(first.event("tool_call"), "requestId"));

    assert.equal(session.claimRequest("first", requestId), true);
    session.shutdown();
    await assert.rejects(result, /Agent 已停止/);
    assert.equal(session.resolveResult("first", { requestId, result: { ok: true } }), false);
});

test("revoking an SSE credential closes its bound event stream", () => {
    const session = new CanvasSession();
    const response = new FakeSseResponse();
    session.openEvents(new URL("http://127.0.0.1/events?clientId=first"), response as unknown as ServerResponse, {
        credentialId: "session-hash",
        expiresAt: Date.now() + 60_000,
        isValid: () => true,
    });

    assert.equal(session.closeEventsForCredential("other"), 0);
    assert.equal(session.closeEventsForCredential("session-hash"), 1);
    assert.equal(response.ended, true);
});

test("an SSE event stream closes when its credential expires", async () => {
    const session = new CanvasSession();
    const response = new FakeSseResponse();
    session.openEvents(new URL("http://127.0.0.1/events?clientId=first"), response as unknown as ServerResponse, {
        credentialId: "session-hash",
        expiresAt: Date.now() + 10,
        isValid: () => false,
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(response.ended, true);
});

test("生成状态查询由当前激活网页返回", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.activateClient("second");

    const result = session.callTool("generation_get_status", { scope: "all" });
    const call = second.event("tool_call");
    assert.equal(first.event("tool_call"), undefined);
    assert.equal(field(call, "name"), "generation_get_status");
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { total: 1, tasks: [{ id: "image-1", status: "running" }] } });
    assert.deepEqual(await result, { total: 1, tasks: [{ id: "image-1", status: "running" }] });
});

test("活动网页关闭后回退到仍连接的画布", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.activateClient("second");
    second.close();

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");
});

test("closing the active client falls back to the most recently focused client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    const third = connect(session, "third");
    t.after(() => {
        first.close();
        second.close();
        third.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.updateState(snapshot("canvas-third"), "third");
    session.activateClient("third");
    session.activateClient("second");
    second.close();

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-third");
});

test("closing a client rejects its pending tool requests", async () => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const result = session.callTool("canvas_create_text_node", { text: "pending" });
    const call = first.event("tool_call");
    const requestId = String(field(call, "requestId"));
    first.close();

    const outcome = await Promise.race([
        result.then(
            () => "resolved",
            (error) => (error instanceof Error ? error.message : String(error)),
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 20)),
    ]);
    if (outcome === "pending") session.resolveResult("first", { requestId, result: null });
    assert.match(outcome, /断开/);
});

test("shared thread events are broadcast with the active thread id", (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });

    session.emitThread("workspace_changed", "thread-2", { activeThreadId: "thread-2" });

    assert.deepEqual(first.event("workspace_changed"), { activeThreadId: "thread-2", threadId: "thread-2" });
    assert.deepEqual(second.event("workspace_changed"), { activeThreadId: "thread-2", threadId: "thread-2" });
});

test("new clients receive the current Codex state and later updates", (t) => {
    const session = new CanvasSession();
    session.setCodexState({ busy: true, threadId: "thread-2", turnId: "turn-1" });
    const client = connect(session, "first");
    t.after(() => client.close());

    assert.deepEqual(field(client.event("hello"), "codex"), { busy: true, threadId: "thread-2", turnId: "turn-1" });

    session.setCodexState({ busy: false });
    assert.deepEqual(client.event("codex_state"), { busy: false, threadId: "thread-2", turnId: "turn-1" });
});

test("a bound client remains the tool target while focus changes", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("first");
    session.activateClient("second");

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-first");
    const result = session.callTool("canvas_create_text_node", { text: "bound" });
    const call = first.event("tool_call");
    assert.equal(second.event("tool_call"), undefined);
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });

    session.releaseClient("first");
    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");
});

test("closing the bound client falls back to the active client", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => {
        first.close();
        second.close();
    });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("first");
    session.activateClient("second");
    first.close();

    assert.equal(field(await session.callTool("canvas_get_state", {}), "projectId"), "canvas-second");
    const result = session.callTool("canvas_create_text_node", { text: "fallback" });
    const call = second.event("tool_call");
    session.resolveResult("second", { requestId: String(field(call, "requestId")), result: { ok: true } });
    assert.deepEqual(await result, { ok: true });
});

function connect(session: CanvasSession, clientId: string) {
    const response = new FakeSseResponse();
    session.openEvents(new URL(`http://127.0.0.1/events?clientId=${clientId}`), response as unknown as ServerResponse);
    return response;
}

function snapshot(projectId: string) {
    return { projectId, title: projectId, nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
}

function field(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

class FakeSseResponse extends EventEmitter {
    private chunks: string[] = [];
    ended = false;

    writeHead() {
        return this;
    }

    write(chunk: string) {
        this.chunks.push(chunk);
        return true;
    }

    event(type: string) {
        const chunk = this.chunks.find((item) => item.startsWith(`event: ${type}\n`));
        const data = chunk
            ?.split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6);
        return data ? (JSON.parse(data) as unknown) : undefined;
    }

    close() {
        this.emit("close");
    }

    end() {
        this.ended = true;
        this.close();
    }
}
