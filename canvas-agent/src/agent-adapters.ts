import crypto from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import { archiveCodexThread, canvasAgentMcpCommand, interruptCodexTurn, listCodexThreads, readCodexThread, resumeCodexThread, runCodexTurn, shutdownCodexApp, startCodexThread, summarizeCodexThread } from "./agents.js";
import type { AgentAdapter, AgentSession, AgentSessionSummary, ListSessionOptions, NormalizedAgentEvent, ResumeSessionOptions, SendTurnOptions, StartSessionOptions } from "./agent-adapter.js";
import type { AgentEmit } from "./types.js";

const execFileAsync = promisify(execFile);

export class CodexAdapter implements AgentAdapter {
    readonly id = "codex";
    readonly displayName = "Codex";
    readonly capabilities = { sessions: true, history: true, deleteSession: true, attachments: true, interrupt: true, tokenUsage: true };

    constructor(private emit: AgentEmit) {}

    async isAvailable() {
        return true;
    }

    async listSessions(options: ListSessionOptions) {
        const result = await listCodexThreads(this.emit, options);
        return result.data.map(normalizeCodexSession);
    }

    async startSession(options: StartSessionOptions) {
        return normalizeCodexSession(summarizeCodexThread(await startCodexThread(this.emit, options.cwd)));
    }

    async resumeSession(sessionId: string, options: ResumeSessionOptions) {
        const result = await resumeCodexThread(this.emit, sessionId, options.cwd);
        return { ...normalizeCodexSession(summarizeCodexThread(result.thread)), messages: result.messages };
    }

    async readSession(sessionId: string, options: ResumeSessionOptions) {
        const result = await readCodexThread(this.emit, sessionId, options.cwd);
        return { ...normalizeCodexSession(result.thread), messages: result.messages };
    }

    async deleteSession(sessionId: string, options?: ResumeSessionOptions) {
        if (!options?.cwd) throw new Error("Codex session deletion requires its workspace");
        await archiveCodexThread(this.emit, sessionId, options.cwd);
    }

    async sendTurn(options: SendTurnOptions) {
        await runCodexTurn(options.prompt, options.emit, options.attachments, {
            threadId: options.sessionId,
            cwd: options.cwd,
            appEmit: this.emit,
            onStart: options.onStart,
            onThread: options.onSession,
            onTurn: options.onTurn,
            onFinish: options.onFinish,
        });
    }

    async interrupt(sessionId?: string) {
        return interruptCodexTurn(sessionId);
    }

    async shutdown(force = false) {
        shutdownCodexApp(force);
    }

    normalizeEvent(event: unknown) {
        return normalizedEvent(event);
    }
}

export class ClaudeCodeAdapter implements AgentAdapter {
    readonly id = "claude-code";
    readonly displayName = "Claude Code";
    readonly capabilities = { sessions: true, history: false, deleteSession: false, attachments: false, interrupt: true, tokenUsage: false };
    private active = new Map<string, ChildProcess>();
    private freshSessions = new Set<string>();
    private knownSessions = new Set<string>();
    private streams = new Map<string, { id: string; text: string }>();
    private toolStreams = new Map<string, { id: string; server: string; tool: string; argumentsText: string; arguments: unknown }>();
    private executable = "";

    async isAvailable() {
        const executable = await this.findExecutable();
        if (!executable) return false;
        try {
            await execFileAsync(executable, ["--version"], { windowsHide: true, timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async listSessions(_options: ListSessionOptions) {
        return [];
    }

    async startSession(_options: StartSessionOptions) {
        const id = crypto.randomUUID();
        this.freshSessions.add(id);
        this.knownSessions.add(id);
        return { id, title: "新会话", status: "idle" as const };
    }

    async resumeSession(sessionId: string, _options: ResumeSessionOptions) {
        const id = claudeSessionId(sessionId);
        this.freshSessions.delete(id);
        this.knownSessions.add(id);
        return { id, title: "Claude Code 会话", status: "idle" as const };
    }

    async deleteSession(_sessionId: string, _options?: ResumeSessionOptions) {
        throw new Error("Claude Code CLI does not expose a stable session deletion API");
    }

    async sendTurn(options: SendTurnOptions) {
        if (options.attachments?.length) throw new Error("Claude Code CLI attachment upload is not available in this adapter");
        const sessionId = claudeSessionId(options.sessionId);
        if (!this.knownSessions.has(sessionId)) throw new Error("Claude Code session is not known to this Agent process");
        const executable = await this.findExecutable();
        if (!executable) throw new Error("Claude Code CLI is not installed");
        if (this.active.has(sessionId)) throw new Error("Claude Code session is already running");
        const firstTurn = this.freshSessions.has(sessionId);
        const mcp = canvasAgentMcpCommand();
        const mcpConfig = JSON.stringify({ mcpServers: { "luffy-canvas": { type: "stdio", command: mcp.command, args: mcp.args } } });
        const args = claudeCodeArgs(sessionId, firstTurn, mcpConfig);
        options.onStart?.();
        options.onSession?.(sessionId);
        const child = spawn(executable, args, { cwd: options.cwd, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
        this.active.set(sessionId, child);
        child.stdin?.end(options.prompt);
        try {
            await pipeClaudeEvents(child, options.emit, this.normalizeEvent.bind(this));
            this.freshSessions.delete(sessionId);
        } finally {
            this.active.delete(sessionId);
            this.clearStreams(sessionId);
            options.onFinish?.();
        }
    }

    async interrupt(sessionId?: string) {
        const entries = sessionId ? [[sessionId, this.active.get(sessionId)] as const] : [...this.active.entries()];
        let interrupted = false;
        entries.forEach(([, child]) => {
            if (!child) return;
            interrupted = child.kill("SIGINT") || interrupted;
        });
        return interrupted;
    }

    async shutdown(force = false) {
        const children = [...this.active.values()];
        this.active.clear();
        children.forEach((child) => terminateChild(child, force));
    }

    normalizeEvent(event: unknown) {
        const value = normalizedEvent(event);
        if (!value) return null;
        const type = String(value.type || "raw");
        const sessionId = stringField(value, "session_id");
        if (type === "stream_event") {
            const streamEvent = recordField(value, "event");
            const streamIndex = String(streamEvent?.index ?? "");
            if (streamEvent?.type === "message_start") {
                const message = recordField(streamEvent, "message");
                this.streams.set(sessionId, { id: stringField(message || {}, "id") || crypto.randomUUID(), text: "" });
                return null;
            }
            if (streamEvent?.type === "content_block_start") {
                const block = recordField(streamEvent, "content_block");
                if (block?.type !== "tool_use") return null;
                const id = stringField(block, "id") || crypto.randomUUID();
                const tool = claudeMcpTool(stringField(block, "name"));
                const item = { id, ...tool, argumentsText: "", arguments: recordField(block, "input") || {} };
                this.toolStreams.set(claudeToolStreamKey(sessionId, streamIndex), item);
                return { type: "item.started", item: { id, type: "mcp_tool_call", ...tool, arguments: item.arguments, status: "in_progress" }, ...(sessionId ? { session_id: sessionId } : {}) };
            }
            const delta = recordField(streamEvent, "delta");
            if (streamEvent?.type === "content_block_delta" && delta?.type === "text_delta") {
                const current = this.streams.get(sessionId) || { id: crypto.randomUUID(), text: "" };
                current.text += stringField(delta, "text");
                this.streams.set(sessionId, current);
                return { type: "item.updated", item: { id: current.id, type: "agent_message", text: current.text }, ...(sessionId ? { session_id: sessionId } : {}) };
            }
            if (streamEvent?.type === "content_block_delta" && delta?.type === "input_json_delta") {
                const key = claudeToolStreamKey(sessionId, streamIndex);
                const current = this.toolStreams.get(key);
                if (!current) return null;
                current.argumentsText += stringField(delta, "partial_json");
                current.arguments = parseClaudeToolArguments(current.argumentsText, current.arguments);
                return { type: "item.updated", item: { id: current.id, type: "mcp_tool_call", server: current.server, tool: current.tool, arguments: current.arguments, status: "in_progress" }, ...(sessionId ? { session_id: sessionId } : {}) };
            }
            return null;
        }
        if (type === "assistant") {
            const message = recordField(value, "message");
            const text = arrayField(message, "content")
                .filter((item) => item.type === "text")
                .map((item) => stringField(item, "text"))
                .join("");
            if (!text) return null;
            const current = this.streams.get(sessionId);
            const id = stringField(message || {}, "id") || current?.id || crypto.randomUUID();
            this.streams.delete(sessionId);
            return { type: "item.completed", item: { id, type: "agent_message", text }, usage: message?.usage, ...(sessionId ? { session_id: sessionId } : {}) };
        }
        if (type === "user") {
            const message = recordField(value, "message");
            const result = arrayField(message, "content").find((item) => item.type === "tool_result");
            if (!result) return null;
            const id = stringField(result, "tool_use_id");
            const tool = [...this.toolStreams.values()].find((item) => item.id === id);
            if (!tool) return null;
            this.deleteToolStream(id);
            const content = claudeToolResultContent(result.content);
            const isError = Boolean(result.is_error);
            return {
                type: "item.completed",
                item: {
                    id,
                    type: "mcp_tool_call",
                    server: tool.server,
                    tool: tool.tool,
                    arguments: tool.arguments,
                    status: isError ? "failed" : "completed",
                    result: { content },
                    ...(isError ? { error: { message: content.map((item) => item.text).join("\n") || "Claude Code tool call failed" } } : {}),
                },
                ...(sessionId ? { session_id: sessionId } : {}),
            };
        }
        if (type === "result") {
            this.clearStreams(sessionId);
            const failed = Boolean(value.is_error) || String(value.subtype || "").startsWith("error");
            return {
                ...value,
                type: failed ? "turn.failed" : "turn.completed",
                ...(failed ? { message: claudeResultError(value) } : {}),
                ...(sessionId ? { session_id: sessionId } : {}),
            };
        }
        if (type === "system") return { ...value, type: "session.started", ...(sessionId ? { session_id: sessionId } : {}) };
        return value;
    }

    private clearStreams(sessionId: string) {
        this.streams.delete(sessionId);
        const prefix = `${sessionId}:`;
        this.toolStreams.forEach((_item, key) => {
            if (key.startsWith(prefix)) this.toolStreams.delete(key);
        });
    }

    private deleteToolStream(id: string) {
        this.toolStreams.forEach((item, key) => {
            if (item.id === id) this.toolStreams.delete(key);
        });
    }

    private async findExecutable() {
        if (this.executable) return this.executable;
        try {
            const { stdout } = await execFileAsync(process.platform === "win32" ? "where.exe" : "which", ["claude"], { windowsHide: true, timeout: 5000 });
            const candidate =
                stdout
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .find(Boolean) || "";
            if (process.platform === "win32" && !candidate.toLowerCase().endsWith(".exe")) return "";
            this.executable = candidate;
            return candidate;
        } catch {
            return "";
        }
    }
}

export function claudeCodeArgs(sessionId: string, firstTurn: boolean, mcpConfig: string) {
    const id = claudeSessionId(sessionId);
    return [
        "--bare",
        "-p",
        "--input-format",
        "text",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--mcp-config",
        mcpConfig,
        "--strict-mcp-config",
        "--tools",
        "",
        "--allowedTools",
        "mcp__luffy-canvas__*",
        firstTurn ? `--session-id=${id}` : `--resume=${id}`,
    ];
}

function claudeSessionId(value: string) {
    const id = value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error("Claude Code session id must be a UUID");
    }
    return id;
}

function claudeMcpTool(name: string) {
    const prefix = "mcp__luffy-canvas__";
    return { server: "luffy-canvas", tool: name.startsWith(prefix) ? name.slice(prefix.length) : name };
}

function claudeToolStreamKey(sessionId: string, index: string) {
    return `${sessionId}:${index}`;
}

function parseClaudeToolArguments(text: string, fallback: unknown) {
    if (!text) return fallback;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return fallback;
    }
}

function claudeToolResultContent(value: unknown) {
    if (typeof value === "string") return [{ type: "text" as const, text: value }];
    if (!Array.isArray(value)) return [{ type: "text" as const, text: JSON.stringify(value ?? null) }];
    return value.flatMap((item) => {
        if (typeof item === "string") return [{ type: "text" as const, text: item }];
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const block = item as Record<string, unknown>;
        return block.type === "text" && typeof block.text === "string" ? [{ type: "text" as const, text: block.text }] : [];
    });
}

function claudeResultError(value: Record<string, unknown>) {
    if (typeof value.result === "string" && value.result.trim()) return value.result;
    if (Array.isArray(value.errors)) return value.errors.map(String).filter(Boolean).join("\n") || "Claude Code turn failed";
    return String(value.subtype || "Claude Code turn failed");
}

function terminateChild(child: ChildProcess, force: boolean) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
        child.stdin?.end();
        child.kill(force ? "SIGKILL" : "SIGTERM");
        if (!force) {
            const timer = setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
            }, 1000);
            timer.unref();
        }
    } catch {}
}

export class AgentAdapterRegistry {
    private adapters: AgentAdapter[];

    constructor(emit: AgentEmit, adapters?: AgentAdapter[]) {
        this.adapters = adapters || [new CodexAdapter(emit), new ClaudeCodeAdapter()];
    }

    get(id: string) {
        const adapter = this.adapters.find((item) => item.id === id);
        if (!adapter) throw new Error(`Unknown agent provider: ${id}`);
        return adapter;
    }

    async providers() {
        return await Promise.all(
            this.adapters.map(async (adapter) => ({
                id: adapter.id,
                displayName: adapter.displayName,
                available: await adapter.isAvailable(),
                capabilities: {
                    ...adapter.capabilities,
                    listSessions: adapter.capabilities.history,
                    resumeSession: adapter.capabilities.history,
                },
            })),
        );
    }

    async shutdown(force = false) {
        await Promise.allSettled(
            this.adapters.map(async (adapter) => {
                if (adapter.shutdown) return await adapter.shutdown(force);
                await adapter.interrupt();
            }),
        );
    }
}

function normalizeCodexSession(value: Record<string, unknown>): AgentSession {
    return {
        id: String(value.id || ""),
        title: String(value.preview || value.title || "Codex 会话"),
        status: "idle",
        ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
        ...(typeof value.createdAt === "string" || typeof value.createdAt === "number" ? { createdAt: value.createdAt } : {}),
        ...(typeof value.updatedAt === "string" || typeof value.updatedAt === "number" ? { updatedAt: value.updatedAt } : {}),
    };
}

function normalizedEvent(event: unknown): NormalizedAgentEvent | null {
    if (!event || typeof event !== "object" || Array.isArray(event)) return null;
    const value = event as Record<string, unknown>;
    return typeof value.type === "string" ? (value as NormalizedAgentEvent) : null;
}

function stringField(value: Record<string, unknown>, key: string) {
    return typeof value[key] === "string" ? value[key] : "";
}

function recordField(value: Record<string, unknown> | undefined, key: string) {
    const field = value?.[key];
    return field && typeof field === "object" && !Array.isArray(field) ? (field as Record<string, unknown>) : undefined;
}

function arrayField(value: Record<string, unknown> | undefined, key: string) {
    const field = value?.[key];
    return Array.isArray(field) ? field.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function pipeClaudeEvents(child: ChildProcess, emit: AgentEmit, normalize: (event: unknown) => NormalizedAgentEvent | null) {
    return new Promise<void>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => {
            stdout += chunk.toString();
            const lines = stdout.split(/\r?\n/);
            stdout = lines.pop() || "";
            lines.filter(Boolean).forEach((line) => {
                try {
                    const event = normalize(JSON.parse(line));
                    if (event) emit("agent_event", { agent: "claude-code", provider: "claude-code", ...event });
                } catch {
                    emit("agent_event", { agent: "claude-code", provider: "claude-code", type: "raw", text: line });
                }
            });
        });
        child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
            emit("agent_log", { provider: "claude-code", text: chunk.toString() });
        });
        child.once("error", reject);
        child.once("close", (code) => {
            if (code && code !== 130) reject(new Error(stderr.trim() || `Claude Code exited with code ${code}`));
            else resolve();
        });
    });
}
