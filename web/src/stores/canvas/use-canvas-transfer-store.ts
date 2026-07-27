import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasCreationSource } from "@/types/canvas";

export type CanvasTransferStatus = "queued" | "consuming" | "completed" | "failed";

export type CanvasImageInsertInput = {
    projectId: string;
    creationProjectId: string;
    batchId?: string;
    batchIndex?: number;
    batchSize?: number;
    nodeId?: string;
    title?: string;
    storageKey: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    prompt?: string;
    remoteUrl?: string;
    creationSource: Partial<CanvasCreationSource> & { generatedImageId: string };
};

export type CanvasImageInsertCommand = {
    id: string;
    kind: "insert_image";
    status: CanvasTransferStatus;
    projectId: string;
    creationProjectId: string;
    batchId?: string;
    batchIndex?: number;
    batchSize?: number;
    nodeId: string;
    title: string;
    storageKey: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    prompt?: string;
    remoteUrl?: string;
    creationSource: CanvasCreationSource;
    attempts: number;
    error?: string;
    createdAt: string;
    updatedAt: string;
};

type CanvasTransferStore = {
    hydrated: boolean;
    commands: CanvasImageInsertCommand[];
    queueInsert: (input: CanvasImageInsertInput) => CanvasImageInsertCommand;
    consume: (projectId: string) => CanvasImageInsertCommand | null;
    release: (commandId: string) => void;
    complete: (commandId: string) => void;
    fail: (commandId: string, error: string) => void;
};

const MAX_COMMANDS = 50;

export function resetInterruptedCanvasTransfers(commands: CanvasImageInsertCommand[]) {
    const now = new Date().toISOString();
    return commands.map((command) => (command.status === "consuming" ? { ...command, status: "queued" as const, updatedAt: now } : command));
}

export function selectPendingCanvasTransfer(commands: CanvasImageInsertCommand[], projectId: string) {
    const consuming = commands.find((command) => command.projectId === projectId && command.status === "consuming");
    if (consuming) return consuming;
    const queued = commands.filter((command) => command.projectId === projectId && command.status === "queued");
    const first = queued[0];
    if (!first?.batchId) return first || null;
    return queued.filter((command) => command.batchId === first.batchId).sort((left, right) => (left.batchIndex ?? Number.MAX_SAFE_INTEGER) - (right.batchIndex ?? Number.MAX_SAFE_INTEGER))[0] || null;
}

export const useCanvasTransferStore = create<CanvasTransferStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            commands: [],
            queueInsert: (input) => {
                if (!get().hydrated) throw new Error("画布插入队列尚未加载完成");
                if (!input.projectId.trim() || !input.creationProjectId.trim()) throw new Error("插入画布缺少目标项目");
                if (!input.storageKey.startsWith("image:")) throw new Error("图片必须先保存到本地才能插入画布");
                if (!input.creationSource.generatedImageId.trim()) throw new Error("插入画布缺少候选图片记录");
                const batch = normalizeBatch(input);
                const now = new Date().toISOString();
                const command: CanvasImageInsertCommand = {
                    id: nanoid(),
                    kind: "insert_image",
                    status: "queued",
                    projectId: input.projectId,
                    creationProjectId: input.creationProjectId,
                    ...batch,
                    nodeId: input.nodeId || `image-${nanoid()}`,
                    title: input.title || "创作候选图",
                    storageKey: input.storageKey,
                    width: input.width,
                    height: input.height,
                    bytes: input.bytes,
                    mimeType: input.mimeType,
                    prompt: input.prompt,
                    remoteUrl: input.remoteUrl,
                    creationSource: { ...input.creationSource, creationProjectId: input.creationProjectId },
                    attempts: 0,
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({ commands: [command, ...state.commands].slice(0, MAX_COMMANDS) }));
                return command;
            },
            consume: (projectId) => {
                const command = selectPendingCanvasTransfer(get().commands, projectId);
                if (!command || command.status !== "queued") return null;
                const consumed = { ...command, status: "consuming" as const, attempts: command.attempts + 1, updatedAt: new Date().toISOString(), error: undefined };
                set((state) => ({ commands: state.commands.map((item) => (item.id === command.id ? consumed : item)) }));
                return consumed;
            },
            release: (commandId) => {
                const now = new Date().toISOString();
                set((state) => ({ commands: state.commands.map((command) => (command.id === commandId && command.status === "consuming" ? { ...command, status: "queued", updatedAt: now } : command)) }));
            },
            complete: (commandId) => {
                const now = new Date().toISOString();
                set((state) => ({ commands: state.commands.map((command) => (command.id === commandId ? { ...command, status: "completed", error: undefined, updatedAt: now } : command)) }));
            },
            fail: (commandId, error) => {
                const now = new Date().toISOString();
                set((state) => ({ commands: state.commands.map((command) => (command.id === commandId ? { ...command, status: "failed", error, updatedAt: now } : command)) }));
            },
        }),
        {
            name: "infinite-canvas:canvas_transfer_store",
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ commands: state.commands }),
            onRehydrateStorage: () => (state) => {
                useCanvasTransferStore.setState({ hydrated: true, commands: resetInterruptedCanvasTransfers(state?.commands || []) });
            },
        },
    ),
);

function normalizeBatch(input: Pick<CanvasImageInsertInput, "batchId" | "batchIndex" | "batchSize">) {
    const batchId = input.batchId?.trim();
    const { batchIndex, batchSize } = input;
    const hasBatchFields = Boolean(batchId) || batchIndex !== undefined || batchSize !== undefined;
    if (!hasBatchFields) return {};
    if (!batchId || batchIndex === undefined || batchSize === undefined || !Number.isInteger(batchIndex) || !Number.isInteger(batchSize) || batchIndex < 0 || batchSize < 1 || batchIndex >= batchSize) {
        throw new Error("批量插入参数无效");
    }
    return { batchId, batchIndex, batchSize };
}
