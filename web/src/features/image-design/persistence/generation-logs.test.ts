import localforage from "localforage";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IMAGE_DESIGN_COMPILER_VERSION, IMAGE_DESIGN_PROMPT_VERSION } from "../constants";
import type { GeneratedImage } from "../generation/types";
import { deleteGenerationLogs, getGenerationLog, normalizeGenerationLog, saveGenerationLog, serializeGenerationLog } from "./generation-logs";

const imageStorageMocks = vi.hoisted(() => ({
    cleanupUnusedImages: vi.fn(async () => undefined),
    resolveImageUrl: vi.fn(async (_storageKey?: string, fallback = "") => fallback),
}));

vi.mock("@/services/image-storage", () => imageStorageMocks);

const persistedLogs = localforage.createInstance({
    name: "infinite-canvas",
    storeName: "image_generation_logs",
});

beforeEach(async () => {
    await persistedLogs.clear();
    imageStorageMocks.cleanupUnusedImages.mockClear();
    imageStorageMocks.resolveImageUrl.mockClear();
});

const legacyValue = {
    id: "legacy-log",
    createdAt: 1_700_000_000_000,
    title: "旧版生图记录",
    prompt: "旧版只有 prompt 字段",
    model: "gpt-image-1",
    size: "1024x1024",
    quality: "high",
    imageCount: 1,
    durationMs: 3210,
    references: [
        {
            id: "legacy-reference",
            name: "reference.png",
            type: "image/png",
            dataUrl: "data:image/png;base64,UkVG",
        },
    ],
    images: [
        {
            id: "legacy-image",
            dataUrl: "data:image/png;base64,SU1BR0U=",
            durationMs: 3210,
            width: 1024,
            height: 1024,
            mimeType: "image/png",
        },
    ],
};

describe("generation log compatibility", () => {
    it("normalizes a legacy prompt-and-images record into snapshot-backed results", async () => {
        const normalized = await normalizeGenerationLog(legacyValue);

        expect(normalized).toMatchObject({
            id: "legacy-log",
            originalPrompt: "旧版只有 prompt 字段",
            finalPrompt: "旧版只有 prompt 字段",
            prompt: "旧版只有 prompt 字段",
            model: "gpt-image-1",
            size: "1024x1024",
            quality: "high",
            successCount: 1,
            failCount: 0,
            unknownCount: 0,
            imageCount: 1,
            status: "成功",
            designSkillId: "none",
            promptVersion: IMAGE_DESIGN_PROMPT_VERSION,
            compilerVersion: IMAGE_DESIGN_COMPILER_VERSION,
        });
        expect(normalized.references).toEqual([expect.objectContaining({ id: "legacy-reference", dataUrl: "data:image/png;base64,UkVG" })]);
        expect(normalized.items).toEqual([
            expect.objectContaining({
                id: "legacy-image",
                status: "generated",
                image: expect.objectContaining({ id: "legacy-image", width: 1024, height: 1024 }),
                snapshot: expect.objectContaining({
                    originalPrompt: "旧版只有 prompt 字段",
                    finalPrompt: "旧版只有 prompt 字段",
                    designSkillId: "none",
                    seriesIndex: 0,
                }),
            }),
        ]);
    });

    it("round-trips normalized legacy records through localforage backed by fake IndexedDB", async () => {
        const normalized = await normalizeGenerationLog(legacyValue);

        await saveGenerationLog(normalized);
        const restored = await getGenerationLog(normalized.id);

        expect(restored).toMatchObject({
            id: normalized.id,
            originalPrompt: normalized.originalPrompt,
            finalPrompt: normalized.finalPrompt,
            status: "成功",
            designSkillId: "none",
        });
        expect(restored?.items[0].snapshot).toMatchObject({
            originalPrompt: normalized.originalPrompt,
            finalPrompt: normalized.finalPrompt,
        });

        await deleteGenerationLogs([normalized.id], { activeProject: true });
        await expect(getGenerationLog(normalized.id)).resolves.toBeNull();
        expect(imageStorageMocks.cleanupUnusedImages).toHaveBeenCalledWith({
            logs: [],
            protectedData: { activeProject: true },
        });
    });

    it("strips duplicate data URLs only when a durable storage key exists", async () => {
        const normalized = await normalizeGenerationLog(legacyValue);
        const storedImage: GeneratedImage = {
            ...normalized.images[0],
            storageKey: "image:stored-result",
            dataUrl: "data:image/png;base64,U1RPUkVE",
        };
        const storedReference = {
            ...normalized.references[0],
            storageKey: "image:stored-reference",
            dataUrl: "data:image/png;base64,U1RPUkVEX1JFRg==",
        };
        const value = {
            ...normalized,
            references: [storedReference],
            images: [storedImage],
            thumbnails: [storedImage.dataUrl!],
            items: [
                {
                    ...normalized.items[0],
                    image: storedImage,
                    snapshot: {
                        ...normalized.items[0].snapshot,
                        references: [storedReference],
                    },
                },
            ],
        };

        const serialized = serializeGenerationLog(value);

        expect(serialized.thumbnails).toEqual([]);
        expect(serialized.references[0]).toMatchObject({ storageKey: "image:stored-reference", dataUrl: "" });
        expect(serialized.images[0]).toMatchObject({ storageKey: "image:stored-result", dataUrl: "" });
        expect(serialized.items[0].image).toMatchObject({ storageKey: "image:stored-result", dataUrl: "" });
        expect(serialized.items[0].snapshot.references[0]).toMatchObject({ storageKey: "image:stored-reference", dataUrl: "" });
        expect(value.images[0].dataUrl).toBe("data:image/png;base64,U1RPUkVE");
    });

    it("preserves explicit empty snapshot request fields instead of inheriting a newer log config", async () => {
        const base = await normalizeGenerationLog(legacyValue);
        const normalized = await normalizeGenerationLog({
            ...base,
            config: {
                ...base.config,
                background: "opaque",
                systemPrompt: "new system prompt",
                imageAspectRatio: "16:9",
            },
            items: [
                {
                    ...base.items[0],
                    snapshot: {
                        ...base.items[0].snapshot,
                        config: {
                            ...base.items[0].snapshot.config,
                            background: "",
                            systemPrompt: "",
                            imageAspectRatio: undefined,
                        },
                    },
                },
            ],
        });

        expect(normalized.config).toMatchObject({
            background: "opaque",
            systemPrompt: "new system prompt",
            imageAspectRatio: "16:9",
        });
        expect(normalized.items[0].snapshot.config).toMatchObject({
            background: "",
            systemPrompt: "",
            imageAspectRatio: undefined,
        });
    });
});
