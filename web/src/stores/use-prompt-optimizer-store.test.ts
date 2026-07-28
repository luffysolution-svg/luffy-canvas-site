import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => {
    const values = new Map<string, string>();
    return {
        values,
        getItem: vi.fn(async (name: string) => values.get(name) ?? null),
        setItem: vi.fn(async (name: string, value: string) => void values.set(name, value)),
        removeItem: vi.fn(async (name: string) => void values.delete(name)),
    };
});

vi.mock("@/lib/localforage-storage", () => ({
    localForageStorage: {
        getItem: storageMock.getItem,
        setItem: storageMock.setItem,
        removeItem: storageMock.removeItem,
    },
}));

import { PROMPT_OPTIMIZATION_HISTORY_LIMIT, sanitizePromptOptimizationHistory, type PromptOptimizationVersion, usePromptOptimizerStore } from "./use-prompt-optimizer-store";

const STORE_KEY = "infinite-canvas:prompt_optimizer_store:v1";

describe("prompt optimizer history store", () => {
    beforeEach(() => {
        usePromptOptimizerStore.setState({ versions: [], hydrated: false });
        storageMock.values.clear();
        storageMock.getItem.mockClear();
        storageMock.setItem.mockClear();
        storageMock.removeItem.mockClear();
    });

    it("writes, removes and clears versions through the shared persisted store", () => {
        const version = createVersion(1);

        usePromptOptimizerStore.getState().addVersion(version);

        expect(usePromptOptimizerStore.getState().versions).toEqual([version]);
        const stored = JSON.parse(storageMock.values.get(STORE_KEY) || "{}") as { state?: { versions?: PromptOptimizationVersion[] } };
        expect(stored.state?.versions).toEqual([version]);

        usePromptOptimizerStore.getState().removeVersion(version.id);
        expect(usePromptOptimizerStore.getState().versions).toEqual([]);

        usePromptOptimizerStore.getState().addVersion(createVersion(2));
        usePromptOptimizerStore.getState().clearHistory();
        expect(usePromptOptimizerStore.getState().versions).toEqual([]);
    });

    it("keeps only the 20 most recent unique versions", () => {
        for (let index = 1; index <= PROMPT_OPTIMIZATION_HISTORY_LIMIT + 5; index += 1) {
            usePromptOptimizerStore.getState().addVersion(createVersion(index));
        }

        const versions = usePromptOptimizerStore.getState().versions;
        expect(versions).toHaveLength(PROMPT_OPTIMIZATION_HISTORY_LIMIT);
        expect(versions.map((version) => version.createdAt)).toEqual(Array.from({ length: 20 }, (_, index) => 25 - index));

        usePromptOptimizerStore.getState().addVersion({ ...createVersion(25), optimizedPrompt: "替换后的结果" });
        expect(usePromptOptimizerStore.getState().versions).toHaveLength(PROMPT_OPTIMIZATION_HISTORY_LIMIT);
        expect(usePromptOptimizerStore.getState().versions[0].optimizedPrompt).toBe("替换后的结果");
    });

    it("filters malformed records, invalid modes and unsafe timestamps during hydration", async () => {
        const valid = createVersion(3);
        storageMock.values.set(
            STORE_KEY,
            JSON.stringify({
                state: {
                    versions: [valid, { ...createVersion(4), mode: "unknown" }, { ...createVersion(5), createdAt: Number.MAX_SAFE_INTEGER }, { ...createVersion(6), sourcePrompt: "" }, null],
                },
                version: 0,
            }),
        );

        await usePromptOptimizerStore.persist.rehydrate();

        expect(usePromptOptimizerStore.getState()).toMatchObject({ versions: [valid], hydrated: true });
    });

    it("recovers from malformed persisted JSON without exposing stale history", async () => {
        storageMock.values.set(STORE_KEY, "not-json");

        await usePromptOptimizerStore.persist.rehydrate();

        expect(usePromptOptimizerStore.getState()).toMatchObject({ versions: [], hydrated: true });
    });

    it("sanitizes arbitrary history input without throwing", () => {
        const older = createVersion(1);
        const newer = { ...older, optimizedPrompt: "较新的同 ID 版本", createdAt: 2 };

        expect(sanitizePromptOptimizationHistory([older, newer, { ...createVersion(3), createdAt: Number.NaN }, { ...createVersion(4), requirements: 42 }])).toEqual([createVersion(4), newer]);
        expect(sanitizePromptOptimizationHistory({ versions: [older] })).toEqual([]);
    });
});

function createVersion(createdAt: number): PromptOptimizationVersion {
    return {
        id: `version-${createdAt}`,
        sourcePrompt: `原始提示词 ${createdAt}`,
        optimizedPrompt: `优化结果 ${createdAt}`,
        mode: "general",
        createdAt,
    };
}
