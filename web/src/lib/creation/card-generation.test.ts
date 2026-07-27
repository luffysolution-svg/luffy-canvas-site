import { describe, expect, it } from "vitest";

import { createCreationCardDeck } from "./card-pages";
import { applyCreationCardGenerationOutcomes, generatedImageReference } from "./card-generation";
import type { CreationCardGeneration, CreationGeneratedImage, CreationProject } from "@/types/creation";

const NOW = "2026-07-28T00:00:00.000Z";

function image(id: string, promptVersionId = "prompt-1"): CreationGeneratedImage {
    return {
        id,
        storageKey: `image:${id}`,
        url: `blob:${id}`,
        mimeType: "image/png",
        providerId: "openai-compatible",
        modelId: "image-model",
        modelConfigId: "channel::image-model",
        promptVersionId,
        createdAt: NOW,
    };
}

function generation(pageId: string, imageId?: string): CreationCardGeneration {
    return {
        id: `generation-${pageId}`,
        batchId: "batch-1",
        styleId: "style-1",
        pageRevision: 1,
        promptVersionId: "prompt-1",
        platformPresetId: "xiaohongshu-post",
        modelConfigId: "channel::image-model",
        quality: "high",
        background: "",
        status: imageId ? "stored" : "failed",
        imageId,
        createdAt: NOW,
        updatedAt: NOW,
    };
}

function project(): CreationProject {
    const cardDeck = createCreationCardDeck({
        sourceContent: "# 第一部分\n第一段内容。\n\n# 第二部分\n第二段内容。\n\n# 第三部分\n第三段内容。",
        targetPageCount: 6,
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
        name: "六页卡片",
        mode: "social",
        platformPresetId: "xiaohongshu-post",
        scene: "知识卡",
        additionalRequirements: "",
        sourceContent: "测试文章",
        status: "prompt_approved",
        lastStableStatus: "prompt_approved",
        briefVersions: [],
        promptVersions: [],
        candidates: [],
        generatedImages: [],
        reviews: [],
        cardDeck,
        canvasInsertions: [],
        createdAt: NOW,
        updatedAt: NOW,
    };
}

describe("card generation state", () => {
    it("归档六页批量结果并固定第一张成功图为风格锚点", () => {
        const value = project();
        const outcomes = value.cardDeck!.pages.map((page, index) => {
            const output = image(`image-${index + 1}`);
            return { pageId: page.id, image: output, generation: generation(page.id, output.id) };
        });

        const next = applyCreationCardGenerationOutcomes(value, outcomes);

        expect(next.generatedImages).toHaveLength(6);
        expect(next.cardDeck?.pages.every((page) => page.status === "stored" && page.reviewStatus === "pending" && page.generatedRevision === page.revision)).toBe(true);
        expect(next.cardDeck).toMatchObject({ styleAnchorPageId: outcomes[0].pageId, styleAnchorImageId: "image-1" });
    });

    it("单页重绘只替换目标页，其他成功页及审核状态保持不变", () => {
        const value = project();
        const initial = value.cardDeck!.pages.map((page, index) => {
            const output = image(`old-${index + 1}`);
            return { pageId: page.id, image: output, generation: generation(page.id, output.id) };
        });
        const generated = applyCreationCardGenerationOutcomes(value, initial);
        generated.cardDeck!.pages = generated.cardDeck!.pages.map((page, index) => ({ ...page, reviewStatus: index === 2 ? "changes_requested" : "approved" }));
        const beforePages = generated.cardDeck!.pages.map((page) => structuredClone(page));
        const target = generated.cardDeck!.pages[2];
        const redrawn = image("redrawn-3");

        const next = applyCreationCardGenerationOutcomes(generated, [{ pageId: target.id, image: redrawn, generation: { ...generation(target.id, redrawn.id), batchId: "single-redraw" } }]);

        expect(next.cardDeck?.pages[2]).toMatchObject({ imageId: "redrawn-3", reviewStatus: "pending", imageHistoryIds: ["old-3", "redrawn-3"] });
        [0, 1, 3, 4, 5].forEach((index) => expect(next.cardDeck?.pages[index]).toEqual(beforePages[index]));
        expect(next.generatedImages.map((item) => item.id)).toContain("old-3");
    });

    it("重绘失败保留上一张成功图并只标记目标页", () => {
        const value = project();
        const target = value.cardDeck!.pages[1];
        const previous = image("previous");
        const generated = applyCreationCardGenerationOutcomes(value, [{ pageId: target.id, image: previous, generation: generation(target.id, previous.id) }]);
        const failure = { id: "error-1", stage: "image_model" as const, message: "生成失败", retryStatus: "generating_images" as const, candidateId: target.id, createdAt: NOW };

        const next = applyCreationCardGenerationOutcomes(generated, [{ pageId: target.id, error: failure, generation: { ...generation(target.id), error: failure } }]);

        expect(next.cardDeck?.pages[1]).toMatchObject({ imageId: "previous", status: "failed", reviewStatus: "changes_requested", error: failure });
        expect(next.generatedImages).toEqual([previous]);
    });

    it("内容在生成期间被修改时保留请求对应的旧修订号", () => {
        const value = project();
        const target = value.cardDeck!.pages[0];
        value.cardDeck!.pages[0] = { ...target, title: "生成期间修改后的标题", revision: 2 };
        const output = image("stale-revision");

        const next = applyCreationCardGenerationOutcomes(value, [{ pageId: target.id, image: output, generation: generation(target.id, output.id) }]);

        expect(next.cardDeck?.pages[0]).toMatchObject({ revision: 2, generatedRevision: 1, imageId: output.id });
    });

    it("把持久化生成图转换为可复用的风格参考图", () => {
        expect(generatedImageReference(image("anchor"))).toMatchObject({ id: "anchor", dataUrl: "blob:anchor", storageKey: "image:anchor", type: "image/png" });
    });
});
