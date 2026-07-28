import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";
import { IMAGE_PROMPT_OPTIMIZATION_MODES, type ImagePromptOptimizationMode } from "@/services/api/prompt-optimizer";

export const PROMPT_OPTIMIZATION_HISTORY_LIMIT = 20;

export type PromptOptimizationVersion = {
    id: string;
    sourcePrompt: string;
    optimizedPrompt: string;
    mode: ImagePromptOptimizationMode;
    requirements?: string;
    createdAt: number;
};

type PromptOptimizerStore = {
    versions: PromptOptimizationVersion[];
    hydrated: boolean;
    addVersion: (version: PromptOptimizationVersion) => void;
    removeVersion: (id: string) => void;
    clearHistory: () => void;
};

const PROMPT_OPTIMIZER_STORE_KEY = "infinite-canvas:prompt_optimizer_store:v1";
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000;
const VALID_MODES = new Set<ImagePromptOptimizationMode>(IMAGE_PROMPT_OPTIMIZATION_MODES.map((mode) => mode.value));

export function sanitizePromptOptimizationHistory(value: unknown): PromptOptimizationVersion[] {
    if (!Array.isArray(value)) return [];

    const versions = value
        .map(sanitizeVersion)
        .filter((version): version is PromptOptimizationVersion => Boolean(version))
        .sort((left, right) => right.createdAt - left.createdAt);
    const seenIds = new Set<string>();

    return versions
        .filter((version) => {
            if (seenIds.has(version.id)) return false;
            seenIds.add(version.id);
            return true;
        })
        .slice(0, PROMPT_OPTIMIZATION_HISTORY_LIMIT);
}

export const usePromptOptimizerStore = create<PromptOptimizerStore>()(
    persist(
        (set) => ({
            versions: [],
            hydrated: false,
            addVersion: (version) =>
                set((state) => ({
                    versions: sanitizePromptOptimizationHistory([version, ...state.versions]),
                })),
            removeVersion: (id) => set((state) => ({ versions: state.versions.filter((version) => version.id !== id) })),
            clearHistory: () => set({ versions: [] }),
        }),
        {
            name: PROMPT_OPTIMIZER_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => ({ versions: state.versions }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<PromptOptimizerStore>;
                return { ...current, versions: sanitizePromptOptimizationHistory(persistedState.versions) };
            },
            onRehydrateStorage: () => () => usePromptOptimizerStore.setState({ hydrated: true }),
        },
    ),
);

function sanitizeVersion(value: unknown): PromptOptimizationVersion | null {
    if (!value || typeof value !== "object") return null;

    const record = value as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const sourcePrompt = typeof record.sourcePrompt === "string" ? record.sourcePrompt : "";
    const optimizedPrompt = typeof record.optimizedPrompt === "string" ? record.optimizedPrompt : "";
    const mode = record.mode as ImagePromptOptimizationMode;
    const createdAt = record.createdAt;

    if (!id || !sourcePrompt.trim() || !optimizedPrompt.trim() || !VALID_MODES.has(mode)) return null;
    if (typeof createdAt !== "number" || !Number.isSafeInteger(createdAt) || createdAt <= 0 || createdAt > MAX_DATE_TIMESTAMP) return null;

    const requirements = typeof record.requirements === "string" && record.requirements.trim() ? record.requirements : undefined;
    return { id, sourcePrompt, optimizedPrompt, mode, ...(requirements ? { requirements } : {}), createdAt };
}
