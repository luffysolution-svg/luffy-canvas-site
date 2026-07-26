import { beforeEach, describe, expect, it, vi } from "vitest";

import { LEGACY_AGENT_TOKEN_STORAGE_KEY, LOCAL_AGENT_SESSION_STORAGE_KEY, consumeLegacyAgentQuery, fetchLocalAgentJson, openLocalAgentEventStream, pairLocalAgent, readStoredAgentSession, writeAgentTrust } from "./local-agent";

describe("local agent client", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        window.history.replaceState({}, "", "/canvas/test?mode=new");
    });

    it("moves the legacy long-lived token to versioned sessionStorage and deletes localStorage", () => {
        localStorage.setItem(LEGACY_AGENT_TOKEN_STORAGE_KEY, "legacy-secret");

        expect(readStoredAgentSession()).toEqual({ token: "legacy-secret", legacy: true });
        expect(localStorage.getItem(LEGACY_AGENT_TOKEN_STORAGE_KEY)).toBeNull();
        expect(JSON.parse(sessionStorage.getItem(LOCAL_AGENT_SESSION_STORAGE_KEY) || "{}")).toEqual({ token: "legacy-secret", legacy: true });
    });

    it("consumes legacy query credentials once and scrubs browser history", () => {
        window.history.replaceState({}, "", "/canvas/test?mode=new&agentUrl=http%3A%2F%2F127.0.0.1%3A17371&agentToken=query-secret");

        const result = consumeLegacyAgentQuery();

        expect(result).toMatchObject({ endpoint: "http://127.0.0.1:17371", session: { token: "query-secret", legacy: true }, deprecated: true });
        expect(window.location.search).toBe("?mode=new");
        expect(consumeLegacyAgentQuery().deprecated).toBe(false);
    });

    it("rejects legacy query credentials for a remote Agent endpoint", () => {
        window.history.replaceState({}, "", "/canvas/test?agentUrl=https%3A%2F%2Fevil.example&agentToken=query-secret");

        const result = consumeLegacyAgentQuery();

        expect(result).toMatchObject({ endpoint: "", session: null, deprecated: true, rejected: true });
        expect(sessionStorage.getItem(LOCAL_AGENT_SESSION_STORAGE_KEY)).toBeNull();
        expect(window.location.search).toBe("");
    });

    it("sends authenticated JSON requests with a header and never adds token to the URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await fetchLocalAgentJson("http://127.0.0.1:17371", "/agent/providers", "session-secret");

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://127.0.0.1:17371/agent/providers");
        expect(url).not.toContain("session-secret");
        expect(new Headers(init.headers).get("Authorization")).toBe("Bearer session-secret");
    });

    it("exchanges a one-time pairing code without putting it in the URL", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, token: "short-session", expiresAt: 2_000_000_000, agentId: "agent-1" }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        await pairLocalAgent("http://127.0.0.1:17371", "PAIR-1234");

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://127.0.0.1:17371/pair");
        expect(url).not.toContain("PAIR-1234");
        expect(JSON.parse(String(init.body))).toEqual({ code: "PAIR-1234" });
        expect(sessionStorage.getItem(LOCAL_AGENT_SESSION_STORAGE_KEY)).toContain("short-session");
    });

    it("persists only a non-sensitive agent identity for always-agent trust", () => {
        writeAgentTrust({ agentId: "agent-1", endpoint: "http://127.0.0.1:17371/" });

        expect(JSON.parse(localStorage.getItem("luffy-canvas-agent-trust:v1") || "{}")).toEqual({
            agentId: "agent-1",
            endpoint: "http://127.0.0.1:17371",
        });
        expect(localStorage.getItem("luffy-canvas-agent-trust:v1")).not.toContain("token");
    });

    it("opens SSE with Authorization while keeping the token out of its URL", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode('event: agent_state\ndata: {"provider":"codex","busy":false}\n\n'));
                controller.close();
            },
        });
        const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
        vi.stubGlobal("fetch", fetchMock);
        const events: Array<{ type: string; data: string }> = [];

        await openLocalAgentEventStream({
            endpoint: "http://127.0.0.1:17371",
            token: "session-secret",
            clientId: "client-1",
            signal: new AbortController().signal,
            onEvent: (event) => {
                events.push(event);
            },
        });

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://127.0.0.1:17371/events?clientId=client-1");
        expect(url).not.toContain("session-secret");
        expect(new Headers(init.headers).get("Authorization")).toBe("Bearer session-secret");
        expect(events).toEqual([{ type: "agent_state", data: '{"provider":"codex","busy":false}' }]);
    });
});
