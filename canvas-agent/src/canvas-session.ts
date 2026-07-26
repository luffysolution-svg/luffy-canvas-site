import crypto from "node:crypto";
import type { ServerResponse } from "node:http";

import { type ToolName } from "./schemas.js";
import { compactCanvasMutationResult, compactCanvasState, compactNode, isToolName, nextCanvasX, parseToolInput } from "./tools.js";
import type { AgentAttachment, CanvasNode, CanvasNodeType, CanvasSnapshot } from "./types.js";

type PendingRequest = {
    clientId: string;
    expiresAt: number;
    phase: "awaiting-approval" | "executing";
    timer: ReturnType<typeof setTimeout>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
};
type EventStreamAuth = { credentialId: string; expiresAt: number; isValid: () => boolean };
type CanvasSessionOptions = { approvalTimeoutMs?: number; executionTimeoutMs?: number };
type TurnAttachment = { clientId: string; id: string; name: string; type: string; size: number; width: number; height: number; dataUrl: string };
export type CodexState = { busy: boolean; threadId: string; turnId: string };
export type AgentState = { busy: boolean; sessionId: string; turnId: string };

const SITE_TOOLS = new Set<ToolName>([
    "site_navigate",
    "canvas_list_projects",
    "workbench_image_get_config",
    "workbench_image_generate",
    "workbench_video_get_config",
    "workbench_video_generate",
    "prompts_search",
    "assets_list",
    "assets_add",
    "generation_get_status",
]);

export class CanvasSession {
    private clients = new Map<string, ServerResponse>();
    private eventStreams = new Set<ServerResponse>();
    private clientCredentials = new Map<string, string>();
    private clientFocusOrder = new Map<string, number>();
    private pending = new Map<string, PendingRequest>();
    private canvasStates = new Map<string, CanvasSnapshot>();
    private turnAttachments = new Map<string, TurnAttachment>();
    private activeClientId = "";
    private boundClientId = "";
    private focusSequence = 0;
    private agentStates = new Map<string, AgentState>([["codex", { busy: false, sessionId: "", turnId: "" }]]);
    private readonly approvalTimeoutMs: number;
    private readonly executionTimeoutMs: number;

    constructor(options: CanvasSessionOptions = {}) {
        this.approvalTimeoutMs = positiveNumber(options.approvalTimeoutMs, 45_000);
        this.executionTimeoutMs = positiveNumber(options.executionTimeoutMs, 120_000);
    }

    private get canvasState() {
        return this.canvasStates.get(this.targetClientId) || null;
    }

    private get targetClientId() {
        return this.boundClientId || this.activeClientId;
    }

    health() {
        return { ok: true, hasCanvas: Boolean(this.canvasState), clients: this.clients.size, agentBusy: [...this.agentStates.values()].some((state) => state.busy), codexBusy: this.codexBusy };
    }

    get codexBusy() {
        return this.getAgentState("codex").busy;
    }

    get agentBusy() {
        return [...this.agentStates.values()].some((state) => state.busy);
    }

    setCodexState(patch: Partial<CodexState>) {
        this.setAgentState("codex", {
            ...(patch.busy === undefined ? {} : { busy: patch.busy }),
            ...(patch.threadId === undefined ? {} : { sessionId: patch.threadId }),
            ...(patch.turnId === undefined ? {} : { turnId: patch.turnId }),
        });
    }

    getAgentState(provider: string) {
        return this.agentStates.get(provider) || { busy: false, sessionId: "", turnId: "" };
    }

    setAgentState(provider: string, patch: Partial<AgentState>) {
        const state = { ...this.getAgentState(provider), ...patch };
        this.agentStates.set(provider, state);
        this.emitAll("agent_state", { provider, ...state });
        if (provider === "codex") this.emitAll("codex_state", { busy: state.busy, threadId: state.sessionId, turnId: state.turnId });
    }

    openEvents(url: URL, res: ServerResponse, auth?: EventStreamAuth) {
        const clientId = url.searchParams.get("clientId") || crypto.randomUUID();
        const statusOnly = url.searchParams.get("role") === "status";
        this.eventStreams.add(res);
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        if (!statusOnly) {
            this.clients.set(clientId, res);
            if (auth?.credentialId) this.clientCredentials.set(clientId, auth.credentialId);
            if (!this.clientFocusOrder.has(clientId)) this.clientFocusOrder.set(clientId, 0);
            if (!this.activeClientId) {
                this.activeClientId = clientId;
                this.clientFocusOrder.set(clientId, ++this.focusSequence);
            }
        }
        const agents = Object.fromEntries(this.agentStates);
        const codex = this.getAgentState("codex");
        sendEvent(res, "hello", { ok: true, clientId, agents, codex: { busy: codex.busy, threadId: codex.sessionId, turnId: codex.turnId } });
        const timer = setInterval(() => {
            if (auth && !auth.isValid()) return void res.end();
            sendEvent(res, "ping", { time: Date.now() });
        }, 15000);
        const expiryTimer = auth ? setTimeout(() => res.end(), Math.max(1, auth.expiresAt - Date.now())) : null;
        res.on("close", () => {
            clearInterval(timer);
            if (expiryTimer) clearTimeout(expiryTimer);
            this.eventStreams.delete(res);
            if (statusOnly || this.clients.get(clientId) !== res) return;
            this.clients.delete(clientId);
            this.clientCredentials.delete(clientId);
            this.clientFocusOrder.delete(clientId);
            this.canvasStates.delete(clientId);
            if (this.boundClientId === clientId) this.boundClientId = "";
            this.pending.forEach((item, requestId) => {
                if (item.clientId !== clientId || item.phase === "executing") return;
                this.pending.delete(requestId);
                clearTimeout(item.timer);
                item.reject(new Error("请求页面已断开"));
            });
            if (this.activeClientId === clientId) this.activeClientId = [...this.clients.keys()].sort((a, b) => (this.clientFocusOrder.get(b) || 0) - (this.clientFocusOrder.get(a) || 0))[0] || "";
        });
    }

    closeEventsForCredential(credentialId: string) {
        if (!credentialId) return 0;
        let closed = 0;
        this.clientCredentials.forEach((value, clientId) => {
            if (value !== credentialId) return;
            this.clients.get(clientId)?.end();
            closed += 1;
        });
        return closed;
    }

    closeAllEvents() {
        const streams = [...this.eventStreams];
        streams.forEach((stream) => stream.end());
        return streams.length;
    }

    shutdown() {
        const closed = this.closeAllEvents();
        this.pending.forEach((item) => {
            clearTimeout(item.timer);
            item.reject(new Error("Luffy Canvas Agent 已停止"));
        });
        this.pending.clear();
        this.turnAttachments.clear();
        return closed;
    }

    updateState(body: unknown, clientId?: string) {
        const targetClientId = clientId || this.activeClientId;
        if (!targetClientId) return;
        this.canvasStates.set(targetClientId, { ...((body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>), clientId: targetClientId } as CanvasSnapshot);
    }

    activateClient(clientId: string) {
        if (!this.clients.has(clientId)) throw new Error("当前网页未连接");
        this.activeClientId = clientId;
        this.clientFocusOrder.set(clientId, ++this.focusSequence);
    }

    bindClient(clientId: string) {
        if (!this.clients.has(clientId)) throw new Error("当前网页未连接");
        this.boundClientId = clientId;
    }

    releaseClient(clientId: string) {
        if (this.boundClientId === clientId) this.boundClientId = "";
    }

    setTurnAttachments(clientId: string, attachments: AgentAttachment[]) {
        this.turnAttachments.clear();
        return attachments.flatMap((item, index) => {
            if (!item.dataUrl?.startsWith("data:image/")) return [];
            const id = item.id?.trim() || `attachment-${crypto.randomUUID()}`;
            const attachment: TurnAttachment = {
                clientId,
                id,
                name: item.name?.trim() || `图片 ${index + 1}`,
                type: item.type?.startsWith("image/") ? item.type : item.dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png",
                size: positiveNumber(item.size, 0),
                width: positiveNumber(item.width, 1024),
                height: positiveNumber(item.height, 1024),
                dataUrl: item.dataUrl,
            };
            this.turnAttachments.set(id, attachment);
            return [{ id, name: attachment.name, type: attachment.type, size: attachment.size, width: attachment.width, height: attachment.height }];
        });
    }

    clearTurnAttachments(clientId?: string) {
        this.turnAttachments.forEach((item, id) => {
            if (!clientId || item.clientId === clientId) this.turnAttachments.delete(id);
        });
    }

    getTurnAttachment(clientId: string, attachmentId: string) {
        const attachment = this.turnAttachments.get(attachmentId);
        if (!attachment) throw new Error(`找不到本轮图片附件：${attachmentId}`);
        if (attachment.clientId !== clientId) throw new Error("图片附件不属于当前 turn 的发起标签页");
        return attachment;
    }

    resolveResult(clientId: string, body: { requestId?: string; error?: string; result?: unknown }) {
        const item = body.requestId ? this.pending.get(body.requestId) : null;
        if (!item || !body.requestId || item.clientId !== clientId) return false;
        this.pending.delete(body.requestId);
        clearTimeout(item.timer);
        body.error ? item.reject(new Error(body.error)) : item.resolve(body.result);
        return true;
    }

    claimRequest(clientId: string, requestId: string) {
        const item = this.pending.get(requestId);
        if (!item || item.clientId !== clientId || item.phase !== "awaiting-approval" || item.expiresAt <= Date.now()) return false;
        clearTimeout(item.timer);
        item.phase = "executing";
        item.expiresAt = Date.now() + this.executionTimeoutMs;
        item.timer = setTimeout(() => {
            if (this.pending.get(requestId) !== item) return;
            this.pending.delete(requestId);
            item.reject(new Error("画布操作执行超时，执行结果未知；请先检查画布或生成状态，不要自动重试"));
        }, this.executionTimeoutMs);
        return true;
    }

    emitAll(type: string, payload: unknown) {
        this.clients.forEach((client) => sendEvent(client, type, payload));
    }

    emitThread(type: string, threadId: string, payload: Record<string, unknown> = {}) {
        this.emitAll(type, { ...payload, threadId });
    }

    async callTool(name: unknown, rawInput: unknown) {
        if (!isToolName(name)) throw new Error(`未知工具：${String(name)}`);
        let tool: ToolName = name;
        let input = parseToolInput(tool, rawInput) as Record<string, unknown>;
        if (SITE_TOOLS.has(tool)) {
            if (!this.clients.size) throw new Error("当前没有已连接网页");
            return await this.requestCanvasTool(tool, input);
        }
        const readTool = ["canvas_get_state", "canvas_get_selection", "canvas_export_snapshot"].includes(tool);
        if (readTool && (!this.clients.size || !this.canvasState)) throw new Error("当前没有已连接画布");
        if (tool === "canvas_get_state" || tool === "canvas_export_snapshot") return compactCanvasState(this.canvasState);
        if (tool === "canvas_get_selection") {
            const ids = new Set(this.canvasState?.selectedNodeIds || []);
            return { nodes: (this.canvasState?.nodes || []).filter((node) => ids.has(node.id)).map(compactNode) };
        }
        if (tool === "canvas_create_attachment_nodes") return await this.createAttachmentNodes(input as { attachmentIds: string[]; x?: number; y?: number; gap?: number; direction?: "row" | "column" });
        if (tool === "canvas_create_node") {
            const data = input as { nodeType: CanvasNodeType; title?: string; x?: number; y?: number; width?: number; height?: number; metadata?: Record<string, unknown> };
            input = { ops: [{ type: "add_node", nodeType: data.nodeType, title: data.title, position: { x: data.x ?? nextCanvasX(this.canvasState), y: data.y ?? 0 }, width: data.width, height: data.height, metadata: data.metadata }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_text_node") {
            const text = input as { text?: string; x?: number; y?: number; title?: string; width?: number; height?: number };
            input = { ops: [textNodeOp(text, text.x ?? nextCanvasX(this.canvasState), text.y ?? 0)] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_text_nodes") {
            const data = input as { items: Array<{ text: string; title?: string; x?: number; y?: number; width?: number; height?: number }>; x?: number; y?: number; gap?: number; direction?: "row" | "column" };
            const x = Number(data.x ?? nextCanvasX(this.canvasState));
            const y = Number(data.y ?? 0);
            const gap = Number(data.gap ?? 40);
            input = {
                ops: data.items.map((item, index) => textNodeOp(item, item.x ?? (data.direction === "row" ? x + index * (340 + gap) : x), item.y ?? (data.direction === "row" ? y : y + index * (240 + gap)))),
            };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_image_prompt_flow") {
            input = { ops: generationFlowOps({ ...(input as Record<string, unknown>), mode: "image" }, this.canvasState) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_config_node") {
            const data = input as Record<string, unknown>;
            const x = Number(data.x ?? nextCanvasX(this.canvasState));
            const y = Number(data.y ?? 0);
            const configId = `config-${crypto.randomUUID()}`;
            const mode = generationMode(data.mode);
            const prompt = String(data.prompt || "");
            input = { ops: [configNodeOp(configId, data, x, y), ...(data.autoRun ? [runGenerationOp(configId, mode, prompt)] : [])] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_create_generation_flow") {
            input = { ops: generationFlowOps(input as Record<string, unknown>, this.canvasState) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_generate_text" || tool === "canvas_generate_image" || tool === "canvas_generate_video" || tool === "canvas_generate_audio") {
            input = { ops: generationFlowOps({ ...(input as Record<string, unknown>), mode: tool.replace("canvas_generate_", ""), autoRun: true }, this.canvasState) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_update_node") {
            const data = input as { id: string; patch?: Record<string, unknown>; metadata?: Record<string, unknown> };
            input = { ops: [{ type: "update_node", id: data.id, patch: data.patch, metadata: data.metadata }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_update_node_text") {
            const data = input as { id: string; text: string; title?: string };
            input = { ops: [{ type: "update_node", id: data.id, patch: { ...(data.title ? { title: data.title } : {}) }, metadata: { content: data.text, status: "success" } }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_move_nodes") {
            const data = input as { items: Array<{ id: string; x?: number; y?: number; dx?: number; dy?: number }> };
            input = {
                ops: data.items.map((item) => {
                    const current = findNode(this.canvasState, item.id);
                    return { type: "update_node", id: item.id, patch: { position: { x: item.x ?? (current?.position.x || 0) + (item.dx || 0), y: item.y ?? (current?.position.y || 0) + (item.dy || 0) } } };
                }),
            };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_resize_node") {
            const data = input as { id: string; width: number; height: number; freeResize?: boolean };
            input = { ops: [{ type: "update_node", id: data.id, patch: { width: data.width, height: data.height }, metadata: data.freeResize === undefined ? undefined : { freeResize: data.freeResize } }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_delete_nodes") {
            input = { ops: [{ type: "delete_node", ids: (input as { ids: string[] }).ids }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_connect_nodes") {
            const data = input as { connections: Array<{ fromNodeId: string; toNodeId: string }> };
            input = { ops: data.connections.map((connection) => ({ type: "connect_nodes", ...connection })) };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_select_nodes") {
            input = { ops: [{ type: "select_nodes", ids: (input as { ids: string[] }).ids }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_set_viewport") {
            input = { ops: [{ type: "set_viewport", viewport: (input as { viewport: unknown }).viewport }] };
            tool = "canvas_apply_ops";
        }
        if (tool === "canvas_run_generation") {
            const data = input as { nodeId: string; mode?: string; prompt?: string };
            input = { ops: [runGenerationOp(data.nodeId, generationMode(data.mode), data.prompt)] };
            tool = "canvas_apply_ops";
        }
        if (tool !== "canvas_apply_ops") throw new Error(`未知工具：${tool}`);
        if (!this.clients.size) throw new Error("当前没有已连接画布");
        return compactCanvasMutationResult(await this.requestCanvasTool(tool, input));
    }

    private async createAttachmentNodes(input: { attachmentIds: string[]; x?: number; y?: number; gap?: number; direction?: "row" | "column" }) {
        const clientId = this.targetClientId;
        if (!this.clients.has(clientId)) throw new Error("当前没有已连接画布");
        const attachments = input.attachmentIds.map((id) => this.getTurnAttachment(clientId, id));
        const x = Number(input.x ?? nextCanvasX(this.canvasState));
        const y = Number(input.y ?? 0);
        const gap = Number(input.gap ?? 40);
        const direction = input.direction || "row";
        let offset = 0;
        const nodes = attachments.map((attachment) => {
            const size = fitAttachmentNodeSize(attachment.width, attachment.height);
            const node = {
                id: `image-${crypto.randomUUID()}`,
                attachmentId: attachment.id,
                title: attachment.name,
                position: { x: direction === "row" ? x + offset : x, y: direction === "column" ? y + offset : y },
                width: size.width,
                height: size.height,
            };
            offset += (direction === "row" ? size.width : size.height) + gap;
            return node;
        });
        await this.requestCanvasTool("canvas_create_attachment_nodes", { nodes });
        return { nodes: nodes.map(({ id, attachmentId, title }) => ({ id, attachmentId, title })) };
    }

    private async requestCanvasTool(name: ToolName, input: Record<string, unknown>) {
        const requestId = crypto.randomUUID();
        const clientId = this.targetClientId;
        const client = this.clients.get(clientId);
        if (!client) throw new Error("当前没有已连接画布");
        const expiresAt = Date.now() + this.approvalTimeoutMs;
        const result = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error("画布操作等待确认超时"));
            }, this.approvalTimeoutMs);
            this.pending.set(requestId, {
                clientId,
                expiresAt,
                phase: "awaiting-approval",
                timer,
                resolve,
                reject,
            });
        });
        sendEvent(client, "tool_call", { requestId, name, input, expiresAt });
        return await result;
    }
}

function sendEvent(res: ServerResponse, type: string, payload: unknown) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function textNodeOp(input: { id?: string; text?: string; title?: string; width?: number; height?: number }, x: number, y: number) {
    return { type: "add_node", id: input.id, nodeType: "text", title: input.title, position: { x, y }, width: input.width, height: input.height, metadata: { content: input.text || "", status: "success", fontSize: 14 } };
}

function configNodeOp(id: string, input: Record<string, unknown>, x: number, y: number) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    return {
        type: "add_node",
        id,
        nodeType: "config",
        title: String(input.title || generationTitle(mode)),
        position: { x, y },
        width: typeof input.width === "number" ? input.width : undefined,
        height: typeof input.height === "number" ? input.height : undefined,
        metadata: cleanRecord({
            generationMode: mode,
            composerContent: prompt,
            prompt,
            status: "idle",
            model: input.model,
            size: input.size,
            quality: input.quality,
            count: input.count,
            seconds: input.seconds,
            vquality: input.vquality,
            generateAudio: input.generateAudio,
            watermark: input.watermark,
            audioVoice: input.audioVoice,
            audioFormat: input.audioFormat,
            audioSpeed: input.audioSpeed,
            audioInstructions: input.audioInstructions,
        }),
    };
}

function generationFlowOps(input: Record<string, unknown>, state: CanvasSnapshot | null) {
    const mode = generationMode(input.mode);
    const prompt = String(input.prompt || "");
    const x = Number(input.x ?? nextCanvasX(state));
    const y = Number(input.y ?? 0);
    const textId = `text-${crypto.randomUUID()}`;
    const configId = `config-${crypto.randomUUID()}`;
    const referenceNodeIds = Array.isArray(input.referenceNodeIds) ? input.referenceNodeIds.filter((id): id is string => typeof id === "string") : [];
    const tokens = [`@[node:${textId}]`, ...referenceNodeIds.map((id) => `@[node:${id}]`)];
    const configInput = { ...input, prompt: tokens.join("\n") };
    return [
        textNodeOp({ id: textId, text: prompt, title: String(input.title || "提示词") }, x, y),
        configNodeOp(configId, configInput, x + 420, y),
        { type: "connect_nodes", fromNodeId: textId, toNodeId: configId },
        ...referenceNodeIds.map((fromNodeId) => ({ type: "connect_nodes", fromNodeId, toNodeId: configId })),
        { type: "select_nodes", ids: [configId] },
        ...(input.autoRun ? [runGenerationOp(configId, mode, tokens.join("\n"))] : []),
    ];
}

function runGenerationOp(nodeId: string, mode: "text" | "image" | "video" | "audio", prompt?: string) {
    return { type: "run_generation", nodeId, mode, prompt };
}

function generationMode(value: unknown): "text" | "image" | "video" | "audio" {
    return value === "text" || value === "video" || value === "audio" ? value : "image";
}

function generationTitle(mode: "text" | "image" | "video" | "audio") {
    if (mode === "text") return "文本生成";
    if (mode === "video") return "视频生成";
    if (mode === "audio") return "音频生成";
    return "图片生成";
}

function findNode(state: CanvasSnapshot | null, id: string): CanvasNode | undefined {
    return (state?.nodes || []).find((node) => node.id === id);
}

function cleanRecord(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function positiveNumber(value: unknown, fallback: number) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function fitAttachmentNodeSize(width: number, height: number) {
    const scale = Math.min(1, 640 / width, 640 / height);
    return { width: width * scale, height: height * scale };
}
