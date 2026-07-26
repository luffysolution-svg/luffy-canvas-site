import type { AgentAttachment, AgentEmit } from "./types.js";

export type AgentProviderCapabilities = {
    sessions: boolean;
    history: boolean;
    deleteSession: boolean;
    attachments: boolean;
    interrupt: boolean;
    tokenUsage: boolean;
};

export type AgentSessionSummary = {
    id: string;
    title: string;
    status: "idle" | "running";
    cwd?: string;
    createdAt?: string | number;
    updatedAt?: string | number;
};

export type AgentSession = AgentSessionSummary & {
    messages?: unknown[];
};

export type ListSessionOptions = { cwd: string; searchTerm?: string; limit?: number };
export type StartSessionOptions = { cwd: string };
export type ResumeSessionOptions = { cwd: string };
export type SendTurnOptions = {
    sessionId: string;
    cwd: string;
    prompt: string;
    attachments?: AgentAttachment[];
    emit: AgentEmit;
    onStart?: () => void;
    onSession?: (sessionId: string) => void;
    onTurn?: (turnId: string) => void;
    onFinish?: () => void;
};
export type NormalizedAgentEvent = Record<string, unknown> & { type: string };

export interface AgentAdapter {
    readonly id: string;
    readonly displayName: string;
    readonly capabilities: AgentProviderCapabilities;
    isAvailable(): Promise<boolean>;
    listSessions(options: ListSessionOptions): Promise<AgentSessionSummary[]>;
    startSession(options: StartSessionOptions): Promise<AgentSession>;
    resumeSession(sessionId: string, options: ResumeSessionOptions): Promise<AgentSession>;
    readSession?(sessionId: string, options: ResumeSessionOptions): Promise<AgentSession>;
    deleteSession(sessionId: string, options?: ResumeSessionOptions): Promise<void>;
    sendTurn(options: SendTurnOptions): Promise<void>;
    interrupt(sessionId?: string): Promise<boolean>;
    shutdown?(force?: boolean): Promise<void>;
    normalizeEvent(event: unknown): NormalizedAgentEvent | null;
}
