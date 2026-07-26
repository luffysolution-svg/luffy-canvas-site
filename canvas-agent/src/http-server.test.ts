import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import test, { type TestContext } from "node:test";

import { AgentAdapterRegistry } from "./agent-adapters.js";
import type { AgentAdapter, SendTurnOptions } from "./agent-adapter.js";
import { AuthManager, hashToken } from "./auth.js";
import { createHttpApp } from "./http-server.js";
import type { CanvasAgentConfig, ConfigPaths } from "./config.js";

test("HTTP pairing binds a short session to its Origin and supports revocation", async (t) => {
    const fixture = await startFixture(t);
    const pairing = fixture.auth.createPairingCode();

    const publicConfig = await json(await fetch(`${fixture.url}/config`));
    assert.equal(publicConfig.agentId, "test-agent");
    assert.equal("token" in publicConfig, false);

    const missingOrigin = await fetch(`${fixture.url}/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: pairing.code }),
    });
    assert.equal(missingOrigin.status, 400);

    const pairedResponse = await fetch(`${fixture.url}/pair`, {
        method: "POST",
        headers: { Origin: fixture.origin, "content-type": "application/json" },
        body: JSON.stringify({ code: pairing.code }),
    });
    const paired = await json(pairedResponse);
    assert.equal(pairedResponse.status, 200);
    assert.match(String(paired.token), /^lcs_/);
    assert.equal(fixture.config.origins?.includes(fixture.origin), true);

    const reused = await fetch(`${fixture.url}/pair`, {
        method: "POST",
        headers: { Origin: fixture.origin, "content-type": "application/json" },
        body: JSON.stringify({ code: pairing.code }),
    });
    assert.equal(reused.status, 401);

    const providers = await fetch(`${fixture.url}/agent/providers`, { headers: sessionHeaders(fixture.origin, String(paired.token)) });
    assert.equal(providers.status, 200);
    assert.equal((await json(providers)).providers[0].id, "fake");

    const wrongOrigin = await fetch(`${fixture.url}/agent/providers`, { headers: sessionHeaders("http://localhost:5174", String(paired.token)) });
    assert.equal(wrongOrigin.status, 401);

    const revoked = await fetch(`${fixture.url}/auth/revoke`, { method: "POST", headers: sessionHeaders(fixture.origin, String(paired.token)) });
    assert.equal((await json(revoked)).revoked, true);
    assert.equal((await fetch(`${fixture.url}/agent/providers`, { headers: sessionHeaders(fixture.origin, String(paired.token)) })).status, 401);
});

test("generic provider routes isolate sessions and browser sessions cannot call MCP directly", async (t) => {
    const fixture = await startFixture(t);
    const credential = fixture.auth.issueSessionToken(fixture.origin);
    fixture.config.origins = [fixture.origin];
    const headers = sessionHeaders(fixture.origin, credential.token);

    const createdResponse = await fetch(`${fixture.url}/agent/sessions`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ provider: "fake" }),
    });
    const created = await json(createdResponse);
    assert.equal(createdResponse.status, 200);
    assert.equal(created.session.id, "fake-session");

    const listed = await json(await fetch(`${fixture.url}/agent/sessions?provider=fake`, { headers }));
    assert.equal(listed.activeSessionId, "fake-session");
    assert.equal(listed.sessions[0].id, "fake-session");

    const turnResponse = await fetch(`${fixture.url}/agent/sessions/fake-session/turn`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ provider: "fake", prompt: "draw a circle" }),
    });
    assert.equal(turnResponse.status, 200);
    assert.deepEqual(fixture.turns, [{ sessionId: "fake-session", promptIncludes: true }]);

    const directTool = await fetch(`${fixture.url}/api/tools`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ name: "canvas_get_state", input: {} }),
    });
    assert.equal(directTool.status, 403);
});

test("runtime and one-version legacy credentials remain distinct", async (t) => {
    const fixture = await startFixture(t, "legacy-secret");
    fixture.config.origins = [fixture.origin];
    const runtime = fixture.auth.issueRuntimeToken();

    const runtimeResponse = await fetch(`${fixture.url}/agent/providers`, { headers: { Authorization: `Bearer ${runtime.token}` } });
    assert.equal(runtimeResponse.status, 200);

    const legacyResponse = await fetch(`${fixture.url}/agent/providers`, {
        headers: { Origin: fixture.origin, "x-canvas-agent-token": "legacy-secret" },
    });
    assert.equal(legacyResponse.status, 200);
    assert.equal(legacyResponse.headers.get("deprecation"), "true");
    assert.match(legacyResponse.headers.get("warning") || "", /next version/);
});

test("legacy Codex routes delegate to the adapter and advertise deprecation", async (t) => {
    const fixture = await startFixture(t);
    const credential = fixture.auth.issueSessionToken(fixture.origin);
    fixture.config.origins = [fixture.origin];
    const headers = sessionHeaders(fixture.origin, credential.token);

    const createdResponse = await fetch(`${fixture.url}/agent/codex/threads/new`, { method: "POST", headers });
    const created = await json(createdResponse);
    assert.equal(createdResponse.status, 200);
    assert.equal(createdResponse.headers.get("deprecation"), "true");
    assert.equal(created.thread.id, "fake-session");
    assert.equal(created.workspace.activeThreadId, "fake-session");

    const listedResponse = await fetch(`${fixture.url}/agent/codex/threads`, { headers });
    assert.equal(listedResponse.status, 200);
    assert.equal((await json(listedResponse)).data[0].id, "fake-session");
});

async function startFixture(t: TestContext, legacyToken = "") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "luffy-http-test-"));
    const paths: ConfigPaths = {
        dir: path.join(root, ".luffy-canvas"),
        file: path.join(root, ".luffy-canvas", "agent.json"),
        runtimeFile: path.join(root, ".luffy-canvas", "runtime.json"),
        legacyFile: path.join(root, ".infinite-canvas", "canvas-agent.json"),
    };
    const config: CanvasAgentConfig = {
        url: "http://127.0.0.1:17371",
        agentId: "test-agent",
        origins: [],
        workspace: { workspacePath: path.join(root, "workspace"), activeSessionIds: {} },
        ...(legacyToken ? { legacyTokenHash: hashToken(legacyToken) } : {}),
    };
    const auth = new AuthManager({ legacyTokenHash: config.legacyTokenHash });
    const turns: Array<{ sessionId: string; promptIncludes: boolean }> = [];
    const adapter: AgentAdapter = {
        id: "fake",
        displayName: "Fake",
        capabilities: { sessions: true, history: true, deleteSession: true, attachments: false, interrupt: true, tokenUsage: false },
        async isAvailable() {
            return true;
        },
        async listSessions() {
            return [{ id: "fake-session", title: "Fake", status: "idle" }];
        },
        async startSession() {
            return { id: "fake-session", title: "Fake", status: "idle" };
        },
        async resumeSession(sessionId) {
            return { id: sessionId, title: "Fake", status: "idle" };
        },
        async readSession(sessionId) {
            return { id: sessionId, title: "Fake", status: "idle", messages: [] };
        },
        async deleteSession() {},
        async sendTurn(options: SendTurnOptions) {
            options.onStart?.();
            options.onSession?.(options.sessionId);
            turns.push({ sessionId: options.sessionId, promptIncludes: options.prompt.includes("draw a circle") });
            options.onFinish?.();
        },
        async interrupt() {
            return true;
        },
        normalizeEvent() {
            return null;
        },
    };
    const app = createHttpApp({
        config,
        configPaths: paths,
        auth,
        adapters: new AgentAdapterRegistry(() => undefined, [adapter, { ...adapter, id: "codex", displayName: "Codex" }]),
        log: () => undefined,
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
        server.close();
        await once(server, "close");
        fs.rmSync(root, { recursive: true, force: true });
    });
    const address = server.address() as AddressInfo;
    return { url: `http://127.0.0.1:${address.port}`, origin: "http://localhost:5173", config, auth, turns };
}

function sessionHeaders(origin: string, token: string) {
    return { Origin: origin, Authorization: `Bearer ${token}` };
}

async function json(response: Response) {
    return (await response.json()) as any;
}
