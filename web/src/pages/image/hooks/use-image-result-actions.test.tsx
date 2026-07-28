import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationResult, ImageDesignRequestSnapshot } from "@/features/image-design/generation/types";
import { COMIC_SKILL } from "@/features/image-design/registry/design-skills";
import { useImageDesignStore } from "@/features/image-design/store/use-image-design-store";
import type { ImageModelContext, StructuredPlan, StructuredPlanItem } from "@/features/image-design/types";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import type { ImageDesignGenerationController } from "./use-image-design-generation";
import { useImageResultActions, type UseImageResultActionsInput } from "./use-image-result-actions";

const mocks = vi.hoisted(() => ({
    addAsset: vi.fn(),
    isAiConfigReady: vi.fn(() => true),
    message: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
    },
    modal: {
        confirm: vi.fn(),
    },
    openConfigDialog: vi.fn(),
}));

vi.mock("antd", () => ({
    App: {
        useApp: () => ({ message: mocks.message, modal: mocks.modal }),
    },
}));

vi.mock("@/stores/use-asset-store", () => ({
    useAssetStore: (selector: (state: { addAsset: typeof mocks.addAsset }) => unknown) => selector({ addAsset: mocks.addAsset }),
}));

vi.mock("@/stores/use-config-store", () => ({
    useConfigStore: (selector: (state: { isAiConfigReady: typeof mocks.isAiConfigReady; openConfigDialog: typeof mocks.openConfigDialog }) => unknown) =>
        selector({
            isAiConfigReady: mocks.isAiConfigReady,
            openConfigDialog: mocks.openConfigDialog,
        }),
}));

describe("useImageResultActions comic page retries", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isAiConfigReady.mockReturnValue(true);
    });

    it("keeps the saved page-one anchor when recompiling a later comic page", async () => {
        const plan = storyboardPlan();
        const anchor = seriesAnchor();
        const firstPage = resultForPage(plan, 0, "generated");
        const secondPage = resultForPage(plan, 1, "failed", [anchor]);
        const retry = vi.fn(async (result: GenerationResult) => completedResult(result));
        useImageDesignStore.setState({ seriesPlan: plan, anchorChainEnabled: true });
        const { result } = renderHook(() =>
            useImageResultActions(
                actionInput({
                    generation: generationController([firstPage, secondPage], retry),
                    seriesPlan: plan,
                }),
            ),
        );

        await act(async () => {
            await result.current.recompile(secondPage);
        });

        expect(retry).toHaveBeenCalledOnce();
        const recompiled = retry.mock.calls[0][0];
        expect(recompiled.snapshot.seriesIndex).toBe(1);
        expect(recompiled.snapshot.references).toContainEqual(anchor);
        expect(recompiled.snapshot.reproducibilitySnapshot?.referenceImageRoles).toContainEqual(
            expect.objectContaining({
                id: anchor.id,
                role: "series-anchor",
            }),
        );
    });

    it("retries only failed comic pages with their exact snapshots and leaves successful pages untouched", async () => {
        const plan = storyboardPlan();
        const firstPage = resultForPage(plan, 0, "generated");
        const failedPage = resultForPage(plan, 1, "failed", [seriesAnchor()]);
        const thirdPage = resultForPage(plan, 2, "generated");
        const retry = vi.fn(async (result: GenerationResult) => completedResult(result));
        useImageDesignStore.setState({ seriesPlan: plan, anchorChainEnabled: true });
        const { result } = renderHook(() =>
            useImageResultActions(
                actionInput({
                    generation: generationController([firstPage, failedPage, thirdPage], retry),
                    seriesPlan: plan,
                }),
            ),
        );

        await act(async () => {
            await result.current.retryFailed();
        });

        expect(retry).toHaveBeenCalledOnce();
        expect(retry.mock.calls[0][0]).toBe(failedPage);
        expect(retry.mock.calls[0][0].snapshot).toBe(failedPage.snapshot);
        const items = useImageDesignStore.getState().seriesPlan?.items || [];
        expect(items.filter((item) => item.chapter === "第 2 页").map((item) => item.status)).toEqual(["succeeded", "succeeded"]);
        expect(items.find((item) => item.id === "panel-1")).toMatchObject({ status: "succeeded", finalPrompt: "保留成功页一 Prompt" });
        expect(items.find((item) => item.id === "panel-4")).toMatchObject({ status: "succeeded", finalPrompt: "保留成功页三 Prompt" });
    });

    it("generates one panel from its reviewed prompt and keeps the first-page anchor", async () => {
        const plan = storyboardPlan();
        const firstPage = resultForPage(plan, 0, "generated");
        const retry = vi.fn(async (result: GenerationResult) => completedResult(result));
        useImageDesignStore.setState({ seriesPlan: plan, anchorChainEnabled: true });
        const { result } = renderHook(() =>
            useImageResultActions(
                actionInput({
                    generation: generationController([firstPage], retry),
                    seriesPlan: plan,
                }),
            ),
        );

        await act(async () => {
            await result.current.generatePlanItem(plan.items[1]);
        });

        expect(retry).toHaveBeenCalledOnce();
        const generated = retry.mock.calls[0][0];
        expect(generated.snapshot.structuredItem?.id).toBe("panel-2");
        expect(generated.snapshot.finalPrompt).toBe("保留分镜二 Prompt");
        expect(generated.snapshot.references).toContainEqual(
            expect.objectContaining({
                role: "series-anchor",
                source: "series-anchor",
            }),
        );
    });
});

function actionInput(overrides: Partial<UseImageResultActionsInput>): UseImageResultActionsInput {
    return {
        generation: generationController([], vi.fn()),
        effectiveConfig: {
            model: "test-image-model",
            imageModel: "test-image-model",
            quality: "high",
            size: "1024x1024",
            imageAspectRatio: "1:1",
            count: "1",
            background: "",
            optimizeImageReferences: false,
        } as AiConfig,
        prompt: "角色跨越三页完成一次冒险",
        references: [],
        setReferences: vi.fn(),
        compiled: null,
        finalPrompt: "",
        manualOverride: false,
        customInstructions: "",
        negativeInstructions: "",
        skill: COMIC_SKILL,
        skillOptions: { aspectRatio: "1:1", anchorChain: true },
        seriesPlan: null,
        recommendation: null,
        promptReferences: [],
        language: "zh-CN",
        modelContext: modelContext(),
        model: "test-image-model",
        ...overrides,
    };
}

function modelContext(): ImageModelContext {
    return {
        provider: "openai",
        apiFormat: "openai",
        model: "test-image-model",
        quality: "high",
        count: 1,
        requestedSize: "1024x1024",
        requestedAspectRatio: "1:1",
        resolvedSize: "1024x1024",
        resolvedAspectRatio: "1:1",
        mappingSupport: "exact",
        mappingNote: "精确支持",
        mappingRequiresConfirmation: false,
        supportsReferenceImages: true,
        supportsSeriesAnchor: true,
        maxReferenceImages: 3,
    };
}

function generationController(results: GenerationResult[], retry: (result: GenerationResult) => Promise<GenerationResult>): ImageDesignGenerationController {
    return {
        results,
        retry,
        replaceResult: vi.fn(),
    } as unknown as ImageDesignGenerationController;
}

function storyboardPlan(): StructuredPlan {
    return {
        id: "comic-plan",
        type: "storyboard",
        title: "三页漫画",
        summary: "三页连续剧情",
        visualBible: "固定角色脸型、蓝色外套、暖灰场景与同一墨线风格",
        sourceDigest: "comic-source",
        items: [
            panel("panel-1", 0, "第 1 页", "succeeded", "保留成功页一 Prompt"),
            panel("panel-2", 1, "第 2 页", "failed", "保留分镜二 Prompt"),
            panel("panel-3", 2, "第 2 页", "failed", "保留分镜三 Prompt"),
            panel("panel-4", 3, "第 3 页", "succeeded", "保留成功页三 Prompt"),
        ],
    };
}

function panel(id: string, order: number, chapter: string, status: StructuredPlanItem["status"], finalPrompt: string): StructuredPlanItem {
    return {
        id,
        order,
        kind: "panel",
        title: `分镜 ${order + 1}`,
        body: `分镜正文 ${order + 1}`,
        chapter,
        status,
        finalPrompt,
    };
}

function resultForPage(plan: StructuredPlan, index: number, status: GenerationResult["status"], references: ReferenceImage[] = []): GenerationResult {
    const chapter = `第 ${index + 1} 页`;
    return {
        id: `result-page-${index + 1}`,
        status,
        error: status === "failed" ? "页面生成失败" : undefined,
        image:
            status === "generated"
                ? {
                      id: `image-page-${index + 1}`,
                      dataUrl: `data:image/png;base64,PAGE${index + 1}`,
                      durationMs: 10,
                      mimeType: "image/png",
                  }
                : undefined,
        snapshot: pageSnapshot(plan, index, chapter, references),
    };
}

function pageSnapshot(plan: StructuredPlan, index: number, chapter: string, references: ReferenceImage[]): ImageDesignRequestSnapshot {
    return {
        id: `snapshot-page-${index + 1}`,
        createdAt: 1_700_000_000_000 + index,
        originalPrompt: "角色跨越三页完成一次冒险",
        finalPrompt: `保存的第 ${index + 1} 页最终 Prompt`,
        config: {
            model: "test-image-model",
            imageModel: "test-image-model",
            quality: "high",
            size: "1024x1024",
            imageAspectRatio: "1:1",
            count: "1",
            background: "",
            optimizeImageReferences: false,
        },
        references,
        designSkillId: "comic",
        designSkillLabel: "漫画 / 分镜",
        skillOptions: { aspectRatio: "1:1", anchorChain: true },
        requestedSize: "1024x1024",
        requestedAspectRatio: "1:1",
        structuredPlan: plan,
        structuredItem: {
            id: `${plan.id}-page-${index + 1}`,
            order: index,
            kind: "page",
            title: chapter,
            chapter,
            body: `${chapter}完整页面`,
        },
        seriesGroupId: plan.id,
        seriesIndex: index,
        promptVersion: "comic-test",
        compilerVersion: "comic-test",
    };
}

function completedResult(result: GenerationResult): GenerationResult {
    return {
        ...result,
        status: "generated",
        error: undefined,
        image: {
            id: `completed-${result.id}`,
            dataUrl: "data:image/png;base64,COMPLETED",
            durationMs: 10,
            mimeType: "image/png",
        },
    };
}

function seriesAnchor(): ReferenceImage {
    return {
        id: "series-anchor-page-1",
        name: "第一页锚点",
        type: "image/png",
        dataUrl: "data:image/png;base64,ANCHOR",
        role: "series-anchor",
        source: "series-anchor",
    };
}
