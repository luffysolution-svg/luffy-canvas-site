import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    generateTextToImage: vi.fn(),
    generateImageCandidates: vi.fn(),
    isAiConfigReady: vi.fn(() => true),
    openConfigDialog: vi.fn(),
    message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    storage: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => undefined),
        removeItem: vi.fn(async () => undefined),
    },
}));

vi.mock("antd", () => ({ App: { useApp: () => ({ message: mocks.message }) } }));
vi.mock("@/lib/localforage-storage", () => ({ localForageStorage: mocks.storage }));
vi.mock("@/services/api/image-generation-gateway", () => ({
    createImageGenerationGateway: () => ({
        generateTextToImage: mocks.generateTextToImage,
        generateImageCandidates: mocks.generateImageCandidates,
    }),
}));
vi.mock("@/stores/use-config-store", () => ({
    useEffectiveConfig: () => ({ imageModel: "channel::image-model", quality: "high", background: "" }),
    useConfigStore: (selector: (state: { isAiConfigReady: typeof mocks.isAiConfigReady; openConfigDialog: typeof mocks.openConfigDialog }) => unknown) => selector({ isAiConfigReady: mocks.isAiConfigReady, openConfigDialog: mocks.openConfigDialog }),
}));

import { createCreationCardDeck } from "@/lib/creation/card-pages";
import type { ImageCandidateRequest } from "@/services/api/image-generation-gateway";
import { useCreationStore } from "@/stores/use-creation-store";
import type { CreationGeneratedImage, CreationProject, PromptVersion } from "@/types/creation";
import { useCardDeckWorkflow } from "./use-card-deck-workflow";

const NOW = "2026-07-28T00:00:00.000Z";

function image(id: string): CreationGeneratedImage {
    return {
        id,
        url: `blob:${id}`,
        storageKey: `image:${id}`,
        mimeType: "image/png",
        providerId: "openai-compatible",
        modelId: "image-model",
        modelConfigId: "channel::image-model",
        promptVersionId: "prompt-1",
        createdAt: NOW,
    };
}

function project(pageCount = 6): CreationProject {
    const prompt: PromptVersion = {
        id: "prompt-1",
        label: "统一卡片风格",
        content: "克制的编辑式插画，统一米白与深灰配色",
        reasoning: "保持连续页面一致",
        style: "minimalist",
        kind: "manual",
        sourceBriefVersionId: "brief-1",
        hardConstraints: {
            platform: "xiaohongshu",
            width: 1080,
            height: 1440,
            aspectRatio: "3:4",
            requiredElements: [],
            forbiddenElements: [],
            requiredTexts: [],
            colorPalette: ["米白", "深灰"],
            referenceImageRequirements: [],
            safeAreaRequirements: [],
        },
        createdAt: NOW,
    };
    const sourceContent = Array.from({ length: Math.max(pageCount, 1) }, (_, index) => `# 第 ${index + 1} 页\n第 ${index + 1} 页正文。`).join("\n\n");
    const cardDeck = createCreationCardDeck({
        sourceContent,
        targetPageCount: pageCount,
        modelConfigId: "channel::image-model",
        quality: "high",
        background: "",
        styleId: "style-1",
        idFactory: (() => {
            let index = 0;
            return () => `id-${++index}`;
        })(),
        now: () => NOW,
    });
    return {
        id: "creation-1",
        name: "多页卡片编排测试",
        mode: "social",
        platformPresetId: "xiaohongshu-post",
        scene: "知识卡",
        additionalRequirements: "",
        sourceContent,
        status: "prompt_approved",
        lastStableStatus: "prompt_approved",
        briefVersions: [],
        promptVersions: [prompt],
        selectedPromptVersionId: prompt.id,
        candidates: [],
        generatedImages: [],
        reviews: [{ id: "review-1", gate: "prompt", action: "approved", targetId: prompt.id, createdAt: NOW }],
        cardDeck,
        canvasInsertions: [],
        createdAt: NOW,
        updatedAt: NOW,
    };
}

describe("useCardDeckWorkflow generation orchestration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isAiConfigReady.mockReturnValue(true);
    });

    it("固定首个成功页为风格参考，并在单页重绘时只请求目标页", async () => {
        const value = project();
        useCreationStore.setState({ hydrated: true, projects: [value], activeProjectId: value.id, storageError: undefined });
        mocks.generateTextToImage.mockResolvedValue({ image: image("anchor") });
        mocks.generateImageCandidates.mockImplementation(async (requests: ImageCandidateRequest[]) =>
            requests.map((request) => ({ candidateId: request.candidateId, status: "fulfilled" as const, value: { image: image(`batch-${request.candidateId}`) } })),
        );
        const { result } = renderHook(() => useCardDeckWorkflow(value));

        await act(async () => result.current.generatePages());

        const initialRequests = mocks.generateImageCandidates.mock.calls[0][0] as ImageCandidateRequest[];
        expect(mocks.generateTextToImage).toHaveBeenCalledTimes(1);
        expect(initialRequests).toHaveLength(5);
        expect(initialRequests.every((request) => request.referenceImage?.id === "anchor")).toBe(true);
        const generated = useCreationStore.getState().projects[0];
        expect(generated.cardDeck).toMatchObject({ styleAnchorPageId: value.cardDeck?.pages[0].id, styleAnchorImageId: "anchor" });
        expect(generated.cardDeck?.pages.slice(1).every((page) => page.generation?.referencePageId === value.cardDeck?.pages[0].id && page.generation?.referenceImageId === "anchor")).toBe(true);

        const target = generated.cardDeck!.pages[2];
        const untouched = generated.cardDeck!.pages.map((page) => structuredClone(page));
        mocks.generateImageCandidates.mockResolvedValueOnce([{ candidateId: target.id, status: "fulfilled", value: { image: image("redrawn-target") } }]);

        await act(async () => result.current.generatePages([target.id]));

        const redrawRequests = mocks.generateImageCandidates.mock.calls[1][0] as ImageCandidateRequest[];
        expect(mocks.generateTextToImage).toHaveBeenCalledTimes(1);
        expect(redrawRequests).toEqual([expect.objectContaining({ candidateId: target.id, referenceImage: expect.objectContaining({ id: "anchor" }) })]);
        const redrawn = useCreationStore.getState().projects[0].cardDeck!.pages;
        expect(redrawn[2]).toMatchObject({ imageId: "redrawn-target", imageHistoryIds: [target.imageId, "redrawn-target"], reviewStatus: "pending" });
        [0, 1, 3, 4, 5].forEach((index) => expect(redrawn[index]).toEqual(untouched[index]));
    });

    it("旧请求取消后完成时不会解除新请求的忙碌态或写入旧结果", async () => {
        const value = project(1);
        useCreationStore.setState({ hydrated: true, projects: [value], activeProjectId: value.id, storageError: undefined });
        const oldRequest = deferred<{ image: CreationGeneratedImage }>();
        const newRequest = deferred<{ image: CreationGeneratedImage }>();
        mocks.generateTextToImage.mockImplementationOnce(() => oldRequest.promise).mockImplementationOnce(() => newRequest.promise);
        const { result } = renderHook(() => useCardDeckWorkflow(value));
        let firstRun!: Promise<void>;
        let secondRun!: Promise<void>;

        act(() => {
            firstRun = result.current.generatePages();
        });
        await waitFor(() => expect(mocks.generateTextToImage).toHaveBeenCalledTimes(1));
        act(() => result.current.cancelGeneration());
        act(() => {
            secondRun = result.current.generatePages();
        });
        await waitFor(() => expect(mocks.generateTextToImage).toHaveBeenCalledTimes(2));

        await act(async () => {
            oldRequest.resolve({ image: image("old-result") });
            await firstRun;
        });
        expect(result.current.busy).toBe(true);
        expect(useCreationStore.getState().projects[0].generatedImages).toEqual([]);

        await act(async () => {
            newRequest.resolve({ image: image("new-result") });
            await secondRun;
        });
        expect(result.current.busy).toBe(false);
        expect(useCreationStore.getState().projects[0].generatedImages.map((item) => item.id)).toEqual(["new-result"]);
    });
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((next) => {
        resolve = next;
    });
    return { promise, resolve };
}
