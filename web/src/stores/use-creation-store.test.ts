import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
    getItem: vi.fn<(_key: string) => Promise<string | null>>(async () => null),
    setItem: vi.fn<(_key: string, _value: string) => Promise<void>>(async () => undefined),
    removeItem: vi.fn<(_key: string) => Promise<void>>(async () => undefined),
}));

vi.mock("@/lib/localforage-storage", () => ({ localForageStorage: storage }));
vi.mock("@/services/image-storage", () => ({ resolveImageUrl: vi.fn(async (_key: string, fallback = "") => fallback) }));

import { flushCreationStorePersistence, useCreationStore } from "./use-creation-store";
import { createCreationCardDeck } from "@/lib/creation/card-pages";
import type { CreationGeneratedImage, CreationProject, CreativeBrief, PromptHardConstraints, PromptVersion } from "@/types/creation";

function generatedImage(id: string): CreationGeneratedImage {
    return {
        id,
        storageKey: `image:${id}`,
        mimeType: "image/png",
        providerId: "openai-compatible",
        modelId: "image-model",
        modelConfigId: "image-model",
        promptVersionId: "prompt-1",
        createdAt: "2026-01-01T00:00:00.000Z",
    };
}

function creationProject(): CreationProject {
    return {
        id: "creation-1",
        name: "测试创作",
        mode: "social",
        platformPresetId: "xiaohongshu",
        scene: "知识卡",
        additionalRequirements: "",
        sourceContent: "测试内容",
        status: "image_approved",
        lastStableStatus: "image_approved",
        briefVersions: [],
        promptVersions: [],
        candidates: [],
        generatedImages: [generatedImage("image-a"), generatedImage("image-b")],
        selectedImageId: "image-b",
        reviews: [],
        canvasInsertions: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

describe("useCreationStore canvas insertions", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await useCreationStore.persist.rehydrate();
        useCreationStore.setState({ hydrated: true, projects: [creationProject()], activeProjectId: "creation-1", storageError: undefined });
    });

    it("records the image carried by the command instead of the current selection", async () => {
        useCreationStore.getState().markCanvasInserted("creation-1", "canvas-1", "node-1", "image-a");

        const project = useCreationStore.getState().projects[0];
        expect(project.selectedImageId).toBe("image-b");
        expect(project.canvasInsertions).toEqual([expect.objectContaining({ projectId: "canvas-1", nodeId: "node-1", imageId: "image-a" })]);

        await flushCreationStorePersistence();
        expect(storage.setItem).toHaveBeenCalledWith("infinite-canvas:creation_store", expect.stringContaining('"imageId":"image-a"'));
    });

    it("restores card pages, images and review state while resetting an interrupted page to retryable", async () => {
        const value = persistedCardProject();
        storage.getItem.mockResolvedValueOnce(JSON.stringify({ state: { projects: [value], activeProjectId: value.id }, version: 0 }));

        await useCreationStore.persist.rehydrate();

        const restored = useCreationStore.getState().projects[0];
        expect(restored.cardDeck?.pages).toHaveLength(6);
        expect(restored.cardDeck?.pages.map((page) => page.id)).toEqual(value.cardDeck?.pages.map((page) => page.id));
        expect(restored.cardDeck?.pages[0]).toMatchObject({
            title: "编辑后的第二页",
            layout: "quote",
            revision: 2,
            imageId: "image-b",
            status: "stored",
            generation: {
                referencePageId: value.cardDeck?.styleAnchorPageId,
                referenceImageId: "image-a",
                pageRevision: 2,
                promptVersionId: "prompt-1",
                platformPresetId: "xiaohongshu-post",
            },
        });
        expect(restored.cardDeck?.pages[1]).toMatchObject({ imageId: "image-a", status: "stored", reviewStatus: "approved", generatedRevision: 1 });
        expect(restored.cardDeck).toMatchObject({ styleAnchorPageId: value.cardDeck?.styleAnchorPageId, styleAnchorImageId: "image-a", styleId: "style-1" });
        expect(restored.generatedImages.map((image) => image.id)).toEqual(["image-a", "image-b"]);
        expect(useCreationStore.getState().activeProjectId).toBe(value.id);
        expect(useCreationStore.getState().storageError).toBeUndefined();
    });

    it("records a composed card insertion without ending the Phase 1 single-image workflow", () => {
        const value = creationProject();
        value.generatedImages[0] = { ...value.generatedImages[0], metadata: { cardOutput: { cardDeckId: "deck-1", pageId: "page-1" } } };
        useCreationStore.setState({ projects: [value], activeProjectId: value.id });

        useCreationStore.getState().markCanvasInserted(value.id, "canvas-1", "node-card", "image-a");

        expect(useCreationStore.getState().projects[0]).toMatchObject({ status: "image_approved", lastStableStatus: "image_approved" });
        expect(useCreationStore.getState().projects[0].canvasInsertions).toContainEqual(expect.objectContaining({ nodeId: "node-card", imageId: "image-a" }));
    });
});

function persistedCardProject(): CreationProject {
    const timestamp = "2026-01-01T00:00:00.000Z";
    const constraints: PromptHardConstraints = {
        platform: "xiaohongshu",
        width: 1080,
        height: 1440,
        aspectRatio: "3:4",
        requiredElements: [],
        forbiddenElements: [],
        requiredTexts: [],
        colorPalette: ["米白"],
        referenceImageRequirements: [],
        safeAreaRequirements: [],
    };
    const brief: CreativeBrief = {
        id: "brief-1",
        mode: "social",
        platform: "xiaohongshu",
        scene: "知识卡",
        purpose: "解释主题",
        audience: "读者",
        coreMessage: "核心信息",
        title: "六页知识卡",
        visualSubject: "编辑式插画",
        composition: "主体居中",
        visualStyle: "统一编辑风格",
        colorPalette: ["米白"],
        aspectRatio: "3:4",
        width: 1080,
        height: 1440,
        onImageText: [],
        requiredElements: [],
        forbiddenElements: [],
        sourceContent: "测试文章",
    };
    const prompt: PromptVersion = {
        id: "prompt-1",
        label: "统一风格",
        content: "统一风格视觉底图",
        reasoning: "保持系列一致",
        style: "minimalist",
        kind: "optimized",
        sourceBriefVersionId: "brief-version-1",
        hardConstraints: constraints,
        createdAt: timestamp,
    };
    const project = creationProject();
    project.status = "prompt_approved";
    project.lastStableStatus = "prompt_approved";
    project.briefVersions = [{ id: "brief-version-1", brief, source: "model", approvedAt: timestamp, createdAt: timestamp }];
    project.selectedBriefVersionId = "brief-version-1";
    project.promptVersions = [prompt];
    project.selectedPromptVersionId = prompt.id;
    project.cardDeck = createCreationCardDeck({
        sourceContent: "第一段。第二段。第三段。第四段。第五段。第六段。",
        targetPageCount: 6,
        modelConfigId: "image-model",
        quality: "high",
        background: "",
        styleId: "style-1",
        now: () => timestamp,
    });
    const firstPage = project.cardDeck.pages[0];
    const secondPage = project.cardDeck.pages[1];
    project.cardDeck.styleAnchorPageId = firstPage.id;
    project.cardDeck.styleAnchorImageId = "image-a";
    const anchorPage: typeof firstPage = {
        ...firstPage,
        status: "generating",
        reviewStatus: "approved",
        imageId: "image-a",
        imageHistoryIds: ["image-a"],
        generatedRevision: firstPage.revision,
        generation: {
            id: "generation-1",
            batchId: "batch-1",
            styleId: project.cardDeck.styleId,
            pageRevision: firstPage.revision,
            promptVersionId: prompt.id,
            platformPresetId: "xiaohongshu-post",
            modelConfigId: "image-model",
            providerId: "openai-compatible",
            modelId: "image-model",
            quality: "high",
            background: "",
            status: "generating",
            imageId: "image-a",
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    };
    const referencedPage: typeof secondPage = {
        ...secondPage,
        title: "编辑后的第二页",
        layout: "quote" as const,
        revision: 2,
        generatedRevision: 2,
        status: "stored" as const,
        imageId: "image-b",
        imageHistoryIds: ["image-b"],
        generation: {
            id: "generation-2",
            batchId: "batch-1",
            styleId: project.cardDeck.styleId,
            pageRevision: 2,
            promptVersionId: prompt.id,
            platformPresetId: "xiaohongshu-post",
            modelConfigId: "image-model",
            providerId: "openai-compatible",
            modelId: "image-model",
            referencePageId: firstPage.id,
            referenceImageId: "image-a",
            quality: "high",
            background: "",
            status: "stored" as const,
            imageId: "image-b",
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    };
    project.cardDeck.pages = [referencedPage, anchorPage, ...project.cardDeck.pages.slice(2)];
    return project;
}
