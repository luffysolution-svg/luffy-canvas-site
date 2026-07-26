export const LOCAL_AGENT_SESSION_STORAGE_KEY = "luffy-canvas-agent-session:v1";
export const LOCAL_AGENT_TRUST_STORAGE_KEY = "luffy-canvas-agent-trust:v1";
export const LEGACY_AGENT_TOKEN_STORAGE_KEY = "canvas-agent-token";
export const LEGACY_AGENT_QUERY_MIGRATION_KEY = "luffy-canvas-agent-query-migration:v1";

export type LocalAgentSessionCredential = {
    token: string;
    expiresAt?: string | number;
    agentId?: string;
    legacy?: boolean;
};

export type LocalAgentTrust = {
    agentId: string;
    endpoint: string;
};

export type AgentProviderCapabilities = {
    listSessions: boolean;
    resumeSession: boolean;
    deleteSession: boolean;
    attachments: boolean;
};

export type AgentProvider = {
    id: string;
    displayName: string;
    available: boolean;
    capabilities: AgentProviderCapabilities;
};

export type AgentSessionSummary = {
    id: string;
    name?: string | null;
    title?: string;
    preview?: string;
    cwd?: string;
    status?: string;
    createdAt?: number | string;
    updatedAt?: number | string;
    source?: unknown;
};

export type AgentConfigResponse = {
    ok?: boolean;
    url?: string;
    agentId?: string;
    pairingRequired?: boolean;
    legacyAuthAvailable?: boolean;
};

export type AgentPairResponse = {
    ok?: boolean;
    token?: string;
    expiresAt?: string | number;
    agentId?: string;
    error?: string;
};

export type AgentProvidersResponse = {
    ok?: boolean;
    providers?: AgentProvider[];
};

export type AgentSessionsResponse = {
    ok?: boolean;
    provider?: string;
    sessions?: AgentSessionSummary[];
    data?: AgentSessionSummary[];
    activeSessionId?: string;
    session?: AgentSessionSummary;
    messages?: unknown[];
};

export type LocalAgentSseEvent = {
    type: string;
    data: string;
};

export function normalizeAgentEndpoint(value: string) {
    return value.trim().replace(/\/+$/, "");
}

export function isLoopbackAgentEndpoint(value: string) {
    try {
        const normalized = normalizeAgentEndpoint(value);
        const url = new URL(normalized);
        return ["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname) && !url.username && !url.password && normalized === url.origin;
    } catch {
        return false;
    }
}

export function readStoredAgentSession(now = Date.now()): LocalAgentSessionCredential | null {
    if (typeof window === "undefined") return null;
    const stored = parseStoredSession(window.sessionStorage.getItem(LOCAL_AGENT_SESSION_STORAGE_KEY));
    if (stored && !isExpiredSession(stored, now)) return stored;
    if (stored) window.sessionStorage.removeItem(LOCAL_AGENT_SESSION_STORAGE_KEY);

    const legacyToken = window.localStorage.getItem(LEGACY_AGENT_TOKEN_STORAGE_KEY)?.trim() || "";
    window.localStorage.removeItem(LEGACY_AGENT_TOKEN_STORAGE_KEY);
    if (!legacyToken) return null;
    const migrated = { token: legacyToken, legacy: true } satisfies LocalAgentSessionCredential;
    writeStoredAgentSession(migrated);
    return migrated;
}

export function writeStoredAgentSession(session: LocalAgentSessionCredential | null) {
    if (typeof window === "undefined") return;
    if (!session?.token) {
        window.sessionStorage.removeItem(LOCAL_AGENT_SESSION_STORAGE_KEY);
        return;
    }
    window.sessionStorage.setItem(LOCAL_AGENT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readAgentTrust(): LocalAgentTrust | null {
    if (typeof window === "undefined") return null;
    try {
        const value = JSON.parse(window.localStorage.getItem(LOCAL_AGENT_TRUST_STORAGE_KEY) || "null") as Partial<LocalAgentTrust> | null;
        return value?.agentId && value.endpoint ? { agentId: value.agentId, endpoint: normalizeAgentEndpoint(value.endpoint) } : null;
    } catch {
        return null;
    }
}

export function writeAgentTrust(trust: LocalAgentTrust | null) {
    if (typeof window === "undefined") return;
    if (!trust?.agentId || !trust.endpoint) {
        window.localStorage.removeItem(LOCAL_AGENT_TRUST_STORAGE_KEY);
        return;
    }
    window.localStorage.setItem(LOCAL_AGENT_TRUST_STORAGE_KEY, JSON.stringify({ agentId: trust.agentId, endpoint: normalizeAgentEndpoint(trust.endpoint) }));
}

export function consumeLegacyAgentQuery() {
    if (typeof window === "undefined") return { endpoint: "", session: null as LocalAgentSessionCredential | null, deprecated: false, rejected: false };
    const url = new URL(window.location.href);
    const staged = parseLegacyQueryMigration(window.sessionStorage.getItem(LEGACY_AGENT_QUERY_MIGRATION_KEY));
    window.sessionStorage.removeItem(LEGACY_AGENT_QUERY_MIGRATION_KEY);
    const endpoint = url.searchParams.get("agentUrl") || staged.endpoint;
    const token = url.searchParams.get("agentToken")?.trim() || staged.token;
    const deprecated = url.searchParams.has("agentUrl") || url.searchParams.has("agentToken") || staged.deprecated;
    if (deprecated) {
        url.searchParams.delete("agentUrl");
        url.searchParams.delete("agentToken");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    const safeEndpoint = isLoopbackAgentEndpoint(endpoint) ? normalizeAgentEndpoint(endpoint) : "";
    const session = token && safeEndpoint ? ({ token, legacy: true } satisfies LocalAgentSessionCredential) : null;
    if (session) writeStoredAgentSession(session);
    return { endpoint: safeEndpoint, session, deprecated, rejected: Boolean(deprecated && token && !safeEndpoint) };
}

export async function fetchAgentConfig(endpoint: string, signal?: AbortSignal) {
    return fetchLocalAgentJson<AgentConfigResponse>(endpoint, "/config", "", { signal });
}

export async function pairLocalAgent(endpoint: string, code: string, signal?: AbortSignal) {
    const data = await fetchLocalAgentJson<AgentPairResponse>(endpoint, "/pair", "", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
        signal,
    });
    if (!data.token) throw new Error(data.error || "配对失败，未收到会话凭据");
    const session = { token: data.token, expiresAt: data.expiresAt, agentId: data.agentId } satisfies LocalAgentSessionCredential;
    writeStoredAgentSession(session);
    return session;
}

export async function revokeLocalAgentSession(endpoint: string, token: string) {
    try {
        await fetchLocalAgentJson(endpoint, "/auth/revoke", token, { method: "POST" });
    } finally {
        writeStoredAgentSession(null);
    }
}

export function fetchLocalAgent(endpoint: string, path: string, token: string, init: RequestInit = {}) {
    if (!isLoopbackAgentEndpoint(endpoint)) throw new Error("本地 Agent 地址必须是 loopback origin");
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${normalizeAgentEndpoint(endpoint)}${path}`, { ...init, headers });
}

function parseLegacyQueryMigration(value: string | null) {
    try {
        const parsed = JSON.parse(value || "null") as { endpoint?: unknown; token?: unknown; deprecated?: unknown } | null;
        return {
            endpoint: typeof parsed?.endpoint === "string" ? parsed.endpoint : "",
            token: typeof parsed?.token === "string" ? parsed.token.trim() : "",
            deprecated: parsed?.deprecated === true,
        };
    } catch {
        return { endpoint: "", token: "", deprecated: false };
    }
}

export async function fetchLocalAgentJson<T = unknown>(endpoint: string, path: string, token: string, init: RequestInit = {}) {
    const response = await fetchLocalAgent(endpoint, path, token, init);
    const data = (await response.json().catch(() => ({}))) as T & { error?: string; msg?: string };
    if (!response.ok) {
        const error = new Error(data.error || data.msg || "本地 Agent 请求失败");
        Object.assign(error, { status: response.status });
        throw error;
    }
    return data;
}

export async function openLocalAgentEventStream({
    endpoint,
    token,
    clientId,
    signal,
    onOpen,
    onEvent,
}: {
    endpoint: string;
    token: string;
    clientId: string;
    signal: AbortSignal;
    onOpen?: () => void;
    onEvent: (event: LocalAgentSseEvent) => void | Promise<void>;
}) {
    const response = await fetchLocalAgent(endpoint, `/events?clientId=${encodeURIComponent(clientId)}`, token, {
        headers: { Accept: "text/event-stream" },
        cache: "no-store",
        signal,
    });
    if (!response.ok || !response.body) throw new Error(response.status === 401 ? "会话已过期，请重新配对" : "无法连接本地 Agent 事件流");
    onOpen?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseParser(onEvent);
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await parser.push(decoder.decode(value, { stream: true }));
        }
        await parser.push(decoder.decode());
    } finally {
        reader.releaseLock();
    }
}

function createSseParser(onEvent: (event: LocalAgentSseEvent) => void | Promise<void>) {
    let buffer = "";
    let eventType = "message";
    let data: string[] = [];
    const dispatch = async () => {
        if (!data.length) return;
        await onEvent({ type: eventType || "message", data: data.join("\n") });
        eventType = "message";
        data = [];
    };
    return {
        async push(chunk: string) {
            buffer += chunk;
            while (true) {
                const newline = buffer.indexOf("\n");
                if (newline < 0) return;
                const line = buffer.slice(0, newline).replace(/\r$/, "");
                buffer = buffer.slice(newline + 1);
                if (!line) {
                    await dispatch();
                    continue;
                }
                if (line.startsWith(":")) continue;
                const separator = line.indexOf(":");
                const field = separator < 0 ? line : line.slice(0, separator);
                const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /, "");
                if (field === "event") eventType = value;
                if (field === "data") data.push(value);
            }
        },
    };
}

function parseStoredSession(value: string | null): LocalAgentSessionCredential | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as Partial<LocalAgentSessionCredential>;
        return typeof parsed.token === "string" && parsed.token.trim() ? { token: parsed.token, expiresAt: parsed.expiresAt, agentId: parsed.agentId, legacy: parsed.legacy } : null;
    } catch {
        return null;
    }
}

function isExpiredSession(session: LocalAgentSessionCredential, now: number) {
    if (session.expiresAt == null) return false;
    const expiresAt = typeof session.expiresAt === "number" ? session.expiresAt : Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt < 10_000_000_000 ? expiresAt * 1000 <= now : expiresAt <= now;
}
