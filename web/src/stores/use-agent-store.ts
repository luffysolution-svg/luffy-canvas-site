import { create } from "zustand";

import type { AgentApprovalMode } from "@/lib/agent/agent-permissions";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";
import { isLoopbackAgentEndpoint, readAgentTrust, readStoredAgentSession, writeAgentTrust, writeStoredAgentSession, type AgentProvider, type AgentSessionSummary, type LocalAgentSessionCredential } from "@/services/api/local-agent";

export type AgentChatRole = "user" | "assistant" | "system" | "tool" | "error";
export type AgentAttachment = { id: string; name: string; type: string; size: number; width: number; height: number; url: string; dataUrl: string };
export type AgentChatItem = { id: string; role: AgentChatRole; title?: string; text: string; meta?: string; detail?: unknown; attachments?: AgentAttachment[]; streamId?: string };
export type AgentEventLog = { id: string; time: string; title: string; text: string; raw?: unknown };
export type AgentPendingToolCall = { requestId: string; name: string; expiresAt?: number; input?: { ops?: CanvasAgentOp[]; path?: string; nodes?: unknown } & Record<string, unknown> };
export type AgentCanvasContext = { snapshot: CanvasAgentSnapshot; applyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot; undoOps: () => CanvasAgentSnapshot | null; canUndo: boolean };
export type AgentThreadSummary = AgentSessionSummary;
export type AgentPanelTab = "chat" | "setup" | "history" | "log";

const initialSession = readStoredAgentSession();
const initialUrl = typeof window === "undefined" ? "http://127.0.0.1:17371" : localStorage.getItem("canvas-agent-url") || "http://127.0.0.1:17371";
const initialProvider = typeof window === "undefined" ? "codex" : localStorage.getItem("luffy-canvas-agent-provider") || "codex";
const initialTrust = readAgentTrust();
const initialApprovalMode: AgentApprovalMode = initialSession?.agentId && initialTrust?.agentId === initialSession.agentId && initialTrust.endpoint === initialUrl.replace(/\/+$/, "") ? "always-agent" : "confirm-writes";

type AgentStore = {
    width: number;
    panelOpen: boolean;
    panelMounted: boolean;
    panelClosing: boolean;
    canvasContext: AgentCanvasContext | null;
    url: string;
    token: string;
    expiresAt?: string | number;
    agentId: string;
    pairingCode: string;
    pairingRequired: boolean;
    legacyCredential: boolean;
    legacyWarning: boolean;
    connected: boolean;
    enabled: boolean;
    silentConnect: boolean;
    provider: string;
    providers: AgentProvider[];
    prompt: string;
    attachments: AgentAttachment[];
    sending: boolean;
    waiting: boolean;
    messages: AgentChatItem[];
    eventLogs: AgentEventLog[];
    threads: AgentThreadSummary[];
    activeThreadId: string;
    workspacePath: string;
    loadingThreads: boolean;
    activeTab: AgentPanelTab;
    approvalMode: AgentApprovalMode;
    activity: string;
    connectError: string;
    pendingTool: AgentPendingToolCall | null;
    setAgentState: (patch: Partial<AgentStoreState>) => void;
    setProvider: (provider: string) => void;
    setApprovalMode: (mode: AgentApprovalMode) => void;
    setSession: (session: LocalAgentSessionCredential | null) => void;
    dismissLegacyWarning: () => void;
    openPanel: () => void;
    closePanel: () => void;
    togglePanel: () => void;
    setCanvasContext: (context: AgentCanvasContext | null) => void;
    connectAgent: (options?: { silent?: boolean }) => void;
    disconnectAgent: (patch?: Partial<AgentStoreState>) => void;
    addMessage: (item: AgentChatItem) => void;
    addEventLog: (item: AgentEventLog) => void;
    clearEventLogs: () => void;
};

type AgentStoreActions =
    | "setAgentState"
    | "setProvider"
    | "setApprovalMode"
    | "setSession"
    | "dismissLegacyWarning"
    | "connectAgent"
    | "disconnectAgent"
    | "addMessage"
    | "addEventLog"
    | "clearEventLogs"
    | "openPanel"
    | "closePanel"
    | "togglePanel"
    | "setCanvasContext";
type AgentStoreState = Omit<AgentStore, AgentStoreActions>;

export const CANVAS_AGENT_PANEL_MOTION_MS = 500;

export const useAgentStore = create<AgentStore>((set, get) => ({
    width: typeof window === "undefined" ? 440 : Number(localStorage.getItem("canvas-agent-panel-width")) || 440,
    panelOpen: false,
    panelMounted: true,
    panelClosing: false,
    canvasContext: null,
    url: initialUrl,
    token: initialSession?.token || "",
    expiresAt: initialSession?.expiresAt,
    agentId: initialSession?.agentId || "",
    pairingCode: "",
    pairingRequired: !initialSession?.token,
    legacyCredential: Boolean(initialSession?.legacy),
    legacyWarning: Boolean(initialSession?.legacy),
    connected: false,
    enabled: false,
    silentConnect: false,
    provider: initialProvider,
    providers: [],
    prompt: "",
    attachments: [],
    sending: false,
    waiting: false,
    messages: [],
    eventLogs: [],
    threads: [],
    activeThreadId: "",
    workspacePath: "",
    loadingThreads: false,
    activeTab: "setup",
    approvalMode: initialApprovalMode,
    activity: "就绪",
    connectError: "",
    pendingTool: null,
    setAgentState: (patch) => set(patch),
    setProvider: (provider) => {
        if (!provider || provider === get().provider) return;
        if (typeof window !== "undefined") localStorage.setItem("luffy-canvas-agent-provider", provider);
        set({
            provider,
            messages: [],
            eventLogs: [],
            threads: [],
            activeThreadId: "",
            attachments: [],
            workspacePath: "",
            loadingThreads: false,
            sending: false,
            waiting: false,
            pendingTool: null,
            activeTab: "setup",
            activity: "已切换 Provider",
        });
    },
    setApprovalMode: (approvalMode) => {
        const { agentId, url } = get();
        if (approvalMode === "always-agent") {
            if (!agentId) return;
            writeAgentTrust({ agentId, endpoint: url });
        } else {
            writeAgentTrust(null);
        }
        set({ approvalMode });
    },
    setSession: (session) => {
        writeStoredAgentSession(session);
        set({
            token: session?.token || "",
            expiresAt: session?.expiresAt,
            agentId: session?.agentId || "",
            pairingRequired: !session?.token,
            legacyCredential: Boolean(session?.legacy),
            legacyWarning: Boolean(session?.legacy),
            ...(session ? {} : { enabled: false, connected: false, approvalMode: "confirm-writes" as const }),
        });
    },
    dismissLegacyWarning: () => set({ legacyWarning: false }),
    openPanel: () => set({ panelOpen: true, panelMounted: true, panelClosing: false }),
    closePanel: () => {
        if (!get().panelMounted || get().panelClosing) return;
        set({ panelOpen: false, panelClosing: true });
        setTimeout(() => {
            if (get().panelClosing) set({ panelClosing: false });
        }, CANVAS_AGENT_PANEL_MOTION_MS);
    },
    togglePanel: () => (get().panelOpen ? get().closePanel() : get().openPanel()),
    setCanvasContext: (canvasContext) => set({ canvasContext }),
    connectAgent: (options) => {
        const silent = options?.silent ?? false;
        const endpoint = get().url.trim().replace(/\/+$/, "");
        const token = get().token.trim();
        if (!endpoint || !token) return set({ connectError: silent ? "" : "请先完成本地 Agent 配对", pairingRequired: true });
        if (!isLoopbackAgentEndpoint(endpoint)) return set({ connectError: silent ? "" : "本地 Agent 地址必须是 loopback origin" });
        if (typeof window !== "undefined") localStorage.setItem("canvas-agent-url", endpoint);
        set({ url: endpoint, enabled: true, silentConnect: silent, activity: "连接中", connectError: "" });
    },
    disconnectAgent: (patch = {}) =>
        set((state) => ({
            enabled: false,
            connected: false,
            silentConnect: false,
            waiting: false,
            sending: false,
            pendingTool: null,
            activity: "离线",
            ...(state.approvalMode === "session-write" ? { approvalMode: "confirm-writes" as const } : {}),
            ...patch,
        })),
    addMessage: (item) => set((state) => ({ messages: [...state.messages.slice(-120), item] })),
    addEventLog: (item) => set((state) => ({ eventLogs: [...state.eventLogs.slice(-160), item] })),
    clearEventLogs: () => set({ eventLogs: [] }),
}));
