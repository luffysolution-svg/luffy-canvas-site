import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useAgentStore", () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.resetModules();
    });

    it("defaults to confirming writes and migrates the legacy token out of localStorage", async () => {
        localStorage.setItem("canvas-agent-token", "legacy-token");

        const { useAgentStore } = await import("./use-agent-store");
        const state = useAgentStore.getState();

        expect(state.approvalMode).toBe("confirm-writes");
        expect(state.token).toBe("legacy-token");
        expect(state.legacyWarning).toBe(true);
        expect(localStorage.getItem("canvas-agent-token")).toBeNull();
        expect(sessionStorage.getItem("luffy-canvas-agent-session:v1")).toContain("legacy-token");
    });

    it("clears provider-scoped session state when the provider changes", async () => {
        const { useAgentStore } = await import("./use-agent-store");
        useAgentStore.setState({
            provider: "codex",
            activeThreadId: "codex-thread",
            threads: [{ id: "codex-thread", title: "Codex" }],
            messages: [{ id: "message", role: "assistant", text: "Codex reply" }],
        });

        useAgentStore.getState().setProvider("claude-code");

        expect(useAgentStore.getState()).toMatchObject({
            provider: "claude-code",
            activeThreadId: "",
            threads: [],
            messages: [],
        });
    });

    it("keeps write confirmation enabled when legacy URL credentials auto-connect", async () => {
        window.history.replaceState({}, "", "/canvas/test?agentUrl=http%3A%2F%2F127.0.0.1%3A17371&agentToken=query-token");
        const { consumeLegacyAgentQuery } = await import("@/services/api/local-agent");
        const legacy = consumeLegacyAgentQuery();
        const { useAgentStore } = await import("./use-agent-store");
        useAgentStore.getState().setSession(legacy.session);
        useAgentStore.setState({ url: legacy.endpoint });
        useAgentStore.getState().connectAgent({ silent: true });

        expect(useAgentStore.getState().enabled).toBe(true);
        expect(useAgentStore.getState().approvalMode).toBe("confirm-writes");
        expect(window.location.search).toBe("");
    });
});
