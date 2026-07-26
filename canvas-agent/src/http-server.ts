import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";

import { AgentAdapterRegistry } from "./agent-adapters.js";
import type { AgentAdapter } from "./agent-adapter.js";
import { withAgentPrompt } from "./agents.js";
import { AuthManager, hashToken, normalizeOrigin, parseBearerToken } from "./auth.js";
import { CanvasSession } from "./canvas-session.js";
import { clearRuntimeConfig, DEFAULT_CONFIG_PATHS, DEFAULT_PORT, ensureSiteWorkspace, loadConfig, PACKAGE_NAME, saveConfig, updateSiteWorkspace, writeRuntimeConfig, VERSION, type CanvasAgentConfig, type ConfigPaths } from "./config.js";
import type { AgentAttachment, AgentEmit } from "./types.js";

type AuthKind = "session" | "runtime" | "legacy";
export type HttpAppOptions = {
    config?: CanvasAgentConfig;
    configPaths?: ConfigPaths;
    auth?: AuthManager;
    session?: CanvasSession;
    adapters?: AgentAdapterRegistry;
    log?: (message: string) => void;
};

export function createHttpApp(options: HttpAppOptions = {}) {
    const paths = options.configPaths || DEFAULT_CONFIG_PATHS;
    const config = options.config || loadConfig(true, paths);
    const auth = options.auth || new AuthManager({ legacyTokenHash: config.legacyTokenHash });
    const session = options.session || new CanvasSession();
    const log = options.log || console.warn;
    let legacyWarningLogged = false;

    const emit: AgentEmit = (type, payload) => {
        const data = objectValue(payload);
        const provider = String(data.provider || data.agent || "codex");
        const sessionId = String(data.sessionId || data.session_id || data.threadId || data.thread_id || activeSessionId(config, provider));
        if (sessionId) session.emitThread(type, sessionId, { ...data, provider, sessionId });
        else session.emitAll(type, { ...data, provider });
    };
    const adapters = options.adapters || new AgentAdapterRegistry(emit);
    const workspace = ensureSiteWorkspace(config, paths);
    Object.entries(workspace.activeSessionIds || {}).forEach(([provider, sessionId]) => {
        if (!sessionId) return;
        session.setAgentState(provider, { sessionId });
        if (provider === "claude-code")
            void adapters
                .get(provider)
                .resumeSession(sessionId, { cwd: workspace.workspacePath })
                .catch(() => undefined);
    });
    const app = express();

    app.disable("x-powered-by");
    app.use(express.json({ limit: "30mb" }));
    app.use((req, res, next) => {
        const rawOrigin = headerValue(req.headers.origin);
        const origin = rawOrigin ? normalizeOrigin(rawOrigin) : "";
        if (rawOrigin && !origin) return void res.status(403).json({ ok: false, error: "origin not allowed" });
        if (origin) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
        }
        res.setHeader("Access-Control-Allow-Headers", "authorization,content-type,x-canvas-agent-token");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
        res.setHeader("Access-Control-Allow-Private-Network", "true");
        res.setHeader("Cache-Control", "no-store");
        if (req.method === "OPTIONS") return void res.status(204).end();
        next();
    });

    app.get("/health", (_req, res) => res.json(session.health()));
    app.get("/config", (_req, res) =>
        res.json({
            ok: true,
            url: config.url,
            agentId: config.agentId,
            pairingRequired: true,
            legacyAuthAvailable: Boolean(config.legacyTokenHash),
        }),
    );
    app.post("/pair", (req, res) => {
        const origin = normalizeOrigin(headerValue(req.headers.origin));
        if (!origin) return void res.status(400).json({ ok: false, error: "pairing requires an HTTP(S) Origin" });
        const credential = auth.exchangePairingCode(String(req.body?.code || ""), origin);
        if (!credential) return void res.status(401).json({ ok: false, error: "pairing code is invalid, expired, or already used" });
        config.origins ||= [];
        if (!config.origins.includes(origin)) {
            config.origins.push(origin);
            saveConfig(config, paths);
        }
        res.json({ ok: true, token: credential.token, expiresAt: credential.expiresAt, agentId: config.agentId });
    });

    app.use((req, res, next) => {
        const origin = normalizeOrigin(headerValue(req.headers.origin));
        const authorization = req.headers.authorization;
        const runtimePrincipal = auth.validateRuntimeBearer(authorization);
        if (runtimePrincipal) {
            res.locals.authKind = "runtime" satisfies AuthKind;
            res.locals.authPrincipal = runtimePrincipal;
            return next();
        }
        const sessionPrincipal = origin && config.origins?.includes(origin) ? auth.validateSessionBearer(authorization, origin) : null;
        if (sessionPrincipal) {
            res.locals.authKind = "session" satisfies AuthKind;
            res.locals.authPrincipal = sessionPrincipal;
            return next();
        }
        const legacyToken = legacyRequestToken(req);
        if (auth.isLegacyToken(legacyToken) && (!origin || config.origins?.includes(origin))) {
            res.locals.authKind = "legacy" satisfies AuthKind;
            res.setHeader("Deprecation", "true");
            res.setHeader("Warning", '299 Luffy Canvas "Legacy agent token authentication will be removed in the next version"');
            if (!legacyWarningLogged) {
                legacyWarningLogged = true;
                log("Legacy Luffy Canvas agent token authentication was used; pair again to obtain a short-lived session.");
            }
            return next();
        }
        res.status(401).json({ ok: false, error: "invalid or expired session" });
    });

    app.post("/auth/revoke", (req, res) => {
        const token = parseBearerToken(req.headers.authorization);
        const revoked = res.locals.authKind === "session" && auth.revokeSession(token);
        if (revoked) session.closeEventsForCredential(hashToken(token));
        res.json({ ok: true, revoked });
    });
    app.get("/events", (req, res) => {
        const token = parseBearerToken(req.headers.authorization);
        const principal = res.locals.authPrincipal as { kind: "session" | "runtime"; origin?: string; expiresAt: number } | undefined;
        const origin = normalizeOrigin(headerValue(req.headers.origin));
        session.openEvents(
            requestUrl(req, config),
            res,
            token && principal
                ? {
                      credentialId: hashToken(token),
                      expiresAt: principal.expiresAt,
                      isValid: () => (principal.kind === "session" ? Boolean(origin && auth.validateSessionToken(token, origin)) : Boolean(auth.validateRuntimeToken(token))),
                  }
                : undefined,
        );
    });
    app.post("/canvas/state", (req, res) => {
        session.updateState(req.body, clientId(req));
        res.json({ ok: true });
    });
    app.post(
        "/canvas/activate",
        route(async (req, res) => {
            session.activateClient(requiredClientId(req));
            res.json({ ok: true });
        }),
    );
    app.post("/canvas/claim", (req, res) => {
        const ok = session.claimRequest(requiredClientId(req), String(req.body?.requestId || ""));
        res.status(ok ? 200 : 409).json({ ok });
    });
    app.post("/canvas/result", (req, res) => {
        const ok = session.resolveResult(requiredClientId(req), req.body || {});
        res.status(ok ? 200 : 409).json({ ok });
    });
    app.get(
        "/agent/attachments/:attachmentId",
        route(async (req, res) => {
            const attachment = session.getTurnAttachment(requiredClientId(req), routeParam(req.params.attachmentId));
            const data = attachment.dataUrl.split(",", 2)[1];
            if (!data) throw httpError(400, "invalid image attachment");
            res.type(attachment.type).send(Buffer.from(data, "base64"));
        }),
    );
    app.post(
        "/api/tools",
        route(async (req, res) => {
            if (res.locals.authKind === "session") throw httpError(403, "browser sessions cannot invoke MCP tools directly");
            res.json({ ok: true, result: await session.callTool(req.body?.name, req.body?.input || {}) });
        }),
    );

    app.get(
        "/agent/providers",
        route(async (_req, res) => {
            res.json({ ok: true, providers: await adapters.providers() });
        }),
    );
    app.get(
        "/agent/sessions",
        route(async (req, res) => {
            const provider = requiredProvider(req);
            const adapter = adapters.get(provider);
            const workspace = ensureSiteWorkspace(config, paths);
            const sessions = await adapter.listSessions({ cwd: workspace.workspacePath, searchTerm: String(req.query.searchTerm || "") });
            res.json({ ok: true, provider, workspace, sessions, data: sessions, activeSessionId: activeSessionId(config, provider) });
        }),
    );
    app.post(
        "/agent/sessions",
        route(async (req, res) => {
            const provider = requiredProvider(req);
            const adapter = adapters.get(provider);
            await requireAvailable(adapter);
            if (session.getAgentState(provider).busy) throw httpError(409, `${adapter.displayName} is busy`);
            const workspace = ensureSiteWorkspace(config, paths);
            const agentSession = await adapter.startSession({ cwd: workspace.workspacePath });
            setActiveSession(config, paths, provider, agentSession.id);
            session.setAgentState(provider, { busy: false, sessionId: agentSession.id, turnId: "" });
            res.json({ ok: true, provider, session: agentSession });
        }),
    );
    app.get(
        "/agent/sessions/:sessionId",
        route(async (req, res) => {
            const provider = requiredProvider(req);
            const adapter = adapters.get(provider);
            if (!adapter.readSession) throw httpError(409, `${adapter.displayName} does not expose native session history`);
            const workspace = ensureSiteWorkspace(config, paths);
            const agentSession = await adapter.readSession(routeParam(req.params.sessionId), { cwd: workspace.workspacePath });
            res.json({ ok: true, provider, session: agentSession, messages: agentSession.messages || [] });
        }),
    );
    app.post(
        "/agent/sessions/:sessionId/turn",
        route(async (req, res) => {
            const provider = requiredProvider(req);
            const sessionId = routeParam(req.params.sessionId);
            await beginTurn({ provider, sessionId, body: req.body, config, paths, session, adapters, emit });
            res.json({ ok: true, provider, session: { id: sessionId, title: "", status: "running" } });
        }),
    );
    app.post(
        "/agent/sessions/:sessionId/interrupt",
        route(async (req, res) => {
            const provider = requiredProvider(req);
            const ok = await adapters.get(provider).interrupt(routeParam(req.params.sessionId));
            res.json({ ok, provider });
        }),
    );
    app.delete(
        "/agent/sessions/:sessionId",
        route(async (req, res) => {
            const provider = requiredProvider(req);
            const adapter = adapters.get(provider);
            if (!adapter.capabilities.deleteSession) throw httpError(409, `${adapter.displayName} does not expose native session deletion`);
            const sessionId = routeParam(req.params.sessionId);
            await adapter.deleteSession(sessionId, { cwd: ensureSiteWorkspace(config, paths).workspacePath });
            if (activeSessionId(config, provider) === sessionId) setActiveSession(config, paths, provider, "");
            res.json({ ok: true, provider });
        }),
    );

    app.use(["/agent/codex", "/agent/claude"], (_req, res, next) => {
        res.setHeader("Deprecation", "true");
        res.setHeader("Warning", '299 Luffy Canvas "Use the provider-neutral /agent/sessions API"');
        next();
    });
    registerLegacyRoutes(app, { config, paths, session, adapters, emit });

    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
        res.status(error.status || 500).json({ ok: false, error: error.message });
    });
    app.locals.canvasSession = session;
    app.locals.agentAdapters = adapters;
    return app;
}

export function startHttpServer() {
    const paths = DEFAULT_CONFIG_PATHS;
    const config = loadConfig(true, paths);
    const port = Number(process.env.PORT) || Number(new URL(config.url).port) || DEFAULT_PORT;
    config.url = `http://127.0.0.1:${port}`;
    saveConfig(config, paths);
    const auth = new AuthManager({ legacyTokenHash: config.legacyTokenHash });
    const runtime = auth.issueRuntimeToken();
    const pairing = auth.createPairingCode();
    const app = createHttpApp({ config, configPaths: paths, auth });
    const session = app.locals.canvasSession as CanvasSession;
    const adapters = app.locals.agentAdapters as AgentAdapterRegistry;
    let ownsRuntime = false;
    const server = app.listen(port, "127.0.0.1", () => {
        writeRuntimeConfig({ url: config.url, agentId: config.agentId, sessionToken: runtime.token, expiresAt: runtime.expiresAt }, paths);
        ownsRuntime = true;
        console.log("Luffy Canvas Agent");
        console.log(`Local URL: ${config.url}`);
        console.log(`Agent ID: ${config.agentId}`);
        console.log(`Pairing code: ${pairing.code} (expires in 5 minutes)`);
        console.log(`MCP after npm ownership is verified: codex mcp add luffy-canvas -- npx -y ${PACKAGE_NAME}@${VERSION} mcp --profile editor`);
    });
    const cleanup = () => {
        auth.revokeRuntimeToken(runtime.token);
        if (ownsRuntime) clearRuntimeConfig(paths, { agentId: config.agentId, sessionToken: runtime.token });
    };
    server.once("close", cleanup);
    server.once("error", (error) => {
        cleanup();
        console.error(`Luffy Canvas Agent failed to listen: ${error.message}`);
        process.exitCode = 1;
    });
    registerShutdown(server, cleanup, session, adapters);
    return server;
}

function registerLegacyRoutes(app: express.Express, context: TurnContext) {
    const { config, paths, session, adapters, emit } = context;
    app.get("/agent/codex/workspace", (_req, res) => {
        const workspace = ensureSiteWorkspace(config, paths);
        res.json({ ok: true, workspace: legacyWorkspace(workspace, "codex") });
    });
    app.get(
        "/agent/codex/threads",
        route(async (req, res) => {
            const workspace = ensureSiteWorkspace(config, paths);
            const data = await adapters.get("codex").listSessions({ cwd: workspace.workspacePath, searchTerm: String(req.query.searchTerm || "") });
            res.json({ ok: true, workspace: legacyWorkspace(workspace, "codex"), data });
        }),
    );
    app.post(
        "/agent/codex/threads/new",
        route(async (_req, res) => {
            const workspace = ensureSiteWorkspace(config, paths);
            const thread = await adapters.get("codex").startSession({ cwd: workspace.workspacePath });
            setActiveSession(config, paths, "codex", thread.id);
            res.json({ ok: true, workspace: legacyWorkspace(ensureSiteWorkspace(config, paths), "codex"), thread, messages: [] });
        }),
    );
    app.get(
        "/agent/codex/threads/:threadId",
        route(async (req, res) => {
            const workspace = ensureSiteWorkspace(config, paths);
            const adapter = adapters.get("codex");
            const thread = await adapter.readSession!(routeParam(req.params.threadId), { cwd: workspace.workspacePath });
            res.json({ ok: true, workspace: legacyWorkspace(workspace, "codex"), thread, messages: thread.messages || [] });
        }),
    );
    app.post(
        "/agent/codex/threads/:threadId/resume",
        route(async (req, res) => {
            const workspace = ensureSiteWorkspace(config, paths);
            const thread = await adapters.get("codex").resumeSession(routeParam(req.params.threadId), { cwd: workspace.workspacePath });
            setActiveSession(config, paths, "codex", thread.id);
            res.json({ ok: true, workspace: legacyWorkspace(ensureSiteWorkspace(config, paths), "codex"), thread, messages: thread.messages || [] });
        }),
    );
    app.post(
        "/agent/codex/threads/:threadId/delete",
        route(async (req, res) => {
            const id = routeParam(req.params.threadId);
            await adapters.get("codex").deleteSession(id, { cwd: ensureSiteWorkspace(config, paths).workspacePath });
            if (activeSessionId(config, "codex") === id) setActiveSession(config, paths, "codex", "");
            res.json({ ok: true });
        }),
    );
    app.post(
        "/agent/codex/turn",
        route(async (req, res) => {
            let id = String(req.body?.threadId || activeSessionId(config, "codex"));
            if (!id) {
                const workspace = ensureSiteWorkspace(config, paths);
                id = (await adapters.get("codex").startSession({ cwd: workspace.workspacePath })).id;
            }
            await beginTurn({ provider: "codex", sessionId: id, body: req.body, config, paths, session, adapters, emit });
            res.json({ ok: true, threadId: id });
        }),
    );
    app.post(
        "/agent/codex/interrupt",
        route(async (req, res) => {
            const ok = await adapters.get("codex").interrupt(String(req.body?.threadId || ""));
            res.json({ ok });
        }),
    );
    app.post(
        "/agent/claude/turn",
        route(async (req, res) => {
            let id = String(req.body?.sessionId || activeSessionId(config, "claude-code"));
            if (!id) id = (await adapters.get("claude-code").startSession({ cwd: ensureSiteWorkspace(config, paths).workspacePath })).id;
            await beginTurn({ provider: "claude-code", sessionId: id, body: req.body, config, paths, session, adapters, emit });
            res.json({ ok: true, sessionId: id });
        }),
    );
}

type TurnContext = {
    provider?: string;
    sessionId?: string;
    body?: Record<string, unknown>;
    config: CanvasAgentConfig;
    paths: ConfigPaths;
    session: CanvasSession;
    adapters: AgentAdapterRegistry;
    emit: AgentEmit;
};

async function beginTurn(context: Required<Pick<TurnContext, "provider" | "sessionId">> & TurnContext) {
    const { provider, config, paths, session, adapters, emit } = context;
    const adapter = adapters.get(provider);
    await requireAvailable(adapter);
    if (session.agentBusy) throw httpError(409, "Another agent turn is already running");
    const body = context.body || {};
    const prompt = String(body.prompt || "");
    if (!prompt.trim()) throw httpError(400, "prompt is required");
    const workspace = ensureSiteWorkspace(config, paths);
    let sessionId = context.sessionId;
    const client = String(body.clientId || "");
    const attachments = Array.isArray(body.attachments) ? (body.attachments as AgentAttachment[]) : [];
    const attachmentRefs = session.setTurnAttachments(client, attachments);
    const turnEmit: AgentEmit = (type, payload) => {
        const data = objectValue(payload);
        session.emitThread(type, sessionId, { ...data, provider, sessionId });
    };
    setActiveSession(config, paths, provider, sessionId);
    session.setAgentState(provider, { busy: true, sessionId, turnId: "" });
    session.emitThread("chat_message", sessionId, {
        provider,
        sessionId,
        sourceClientId: client,
        message: { id: String(body.messageId || Date.now()), role: "user", text: String(body.messageText || prompt) },
    });
    void adapter
        .sendTurn({
            sessionId,
            cwd: workspace.workspacePath,
            prompt: withAgentPrompt(withAttachmentContext(prompt, attachmentRefs)),
            attachments,
            emit: turnEmit,
            onStart: client ? () => session.bindClient(client) : undefined,
            onSession: (actualSessionId) => {
                sessionId = actualSessionId;
                setActiveSession(config, paths, provider, sessionId);
                session.setAgentState(provider, { busy: true, sessionId, turnId: "" });
            },
            onTurn: (turnId) => session.setAgentState(provider, { busy: true, sessionId, turnId }),
            onFinish: () => {
                session.clearTurnAttachments(client);
                if (client) session.releaseClient(client);
                session.setAgentState(provider, { busy: false, sessionId, turnId: "" });
            },
        })
        .catch((error) => {
            emit("agent_error", { provider, sessionId, message: error instanceof Error ? error.message : String(error) });
            session.clearTurnAttachments(client);
            if (client) session.releaseClient(client);
            session.setAgentState(provider, { busy: false, sessionId, turnId: "" });
        });
}

function setActiveSession(config: CanvasAgentConfig, paths: ConfigPaths, provider: string, id: string) {
    const current = ensureSiteWorkspace(config, paths);
    updateSiteWorkspace(config, { activeSessionIds: { ...(current.activeSessionIds || {}), [provider]: id || undefined } }, paths);
}

function activeSessionId(config: CanvasAgentConfig, provider: string) {
    return config.workspace?.activeSessionIds?.[provider as "codex" | "claude-code"] || "";
}

function legacyWorkspace(workspace: ReturnType<typeof ensureSiteWorkspace>, provider: "codex") {
    return { ...workspace, activeThreadId: workspace.activeSessionIds?.[provider] || "", pinnedThreadIds: workspace.pinnedSessionIds?.[provider] || [] };
}

function requiredProvider(req: Request) {
    const provider = String(req.body?.provider || req.query.provider || "");
    if (!provider) throw httpError(400, "provider is required");
    return provider;
}

async function requireAvailable(adapter: AgentAdapter) {
    if (!(await adapter.isAvailable())) throw httpError(503, `${adapter.displayName} is not installed or unavailable`);
}

function clientId(req: Request) {
    return String(req.body?.clientId || req.query.clientId || "") || undefined;
}

function requiredClientId(req: Request) {
    const value = clientId(req);
    if (!value) throw httpError(400, "clientId is required");
    return value;
}

function requestUrl(req: Request, config: CanvasAgentConfig) {
    return new URL(req.originalUrl || req.url || "/", config.url);
}

function legacyRequestToken(req: Request) {
    const bearer = parseBearerToken(req.headers.authorization);
    if (bearer) return bearer;
    const header = headerValue(req.headers["x-canvas-agent-token"]);
    if (header) return header;
    return requestUrl(req, { url: "http://127.0.0.1", agentId: "", origins: [] }).searchParams.get("token") || "";
}

function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => void handler(req, res).catch(next);
}

function routeParam(value: string | string[]) {
    return Array.isArray(value) ? value[0] || "" : value;
}

function objectValue(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function headerValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] || "" : value || "";
}

function httpError(status: number, message: string) {
    return Object.assign(new Error(message), { status });
}

function withAttachmentContext(prompt: string, attachments: Array<{ id: string; name: string }>) {
    if (!attachments.length) return prompt;
    const list = attachments.map((item, index) => `${index + 1}. attachmentId=${item.id}, name=${JSON.stringify(item.name)}`).join("\n");
    return `${prompt}\n\n本轮可用图片附件：\n${list}\n需要把附件放入画布或作为生成参考图时，先调用 canvas_create_attachment_nodes。`;
}

function registerShutdown(server: Server, cleanup: () => void, session: CanvasSession, adapters: AgentAdapterRegistry) {
    let stopping = false;
    const forceStop = () => {
        cleanup();
        session.shutdown();
        void adapters.shutdown(true);
        server.closeAllConnections?.();
        server.close();
        process.exitCode = 1;
    };
    const stop = () => {
        if (stopping) return forceStop();
        stopping = true;
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        process.once("SIGINT", forceStop);
        process.once("SIGTERM", forceStop);
        cleanup();
        session.shutdown();
        void adapters.shutdown().finally(() => server.close());
        const forceTimer = setTimeout(forceStop, 3000);
        forceTimer.unref();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    server.once("close", () => {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", forceStop);
        process.removeListener("SIGTERM", forceStop);
    });
}
