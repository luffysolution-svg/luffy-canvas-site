import { describe, expect, it } from "vitest";

import type { CreationProject, ImageCandidate } from "@/types/creation";
import { canApproveCreationCandidate, canQueueCreationCanvasInsert } from "./use-creation-workflow";

const image = {
    id: "image-1",
    url: "data:image/png;base64,AA==",
    mimeType: "image/png",
    providerId: "openai-compatible",
    modelId: "image-model",
    modelConfigId: "channel::image-model",
    promptVersionId: "prompt-1",
    createdAt: "2026-07-28T00:00:00.000Z",
};

const candidate: ImageCandidate = {
    id: "candidate-1",
    index: 0,
    promptVersionId: "prompt-1",
    modelConfigId: "channel::image-model",
    size: "3:4",
    quality: "auto",
    background: "",
    status: "stored",
    imageId: image.id,
    image,
    feedback: [],
};

function project(status: CreationProject["status"]): CreationProject {
    return {
        id: "creation-1",
        name: "审核台测试",
        mode: "social",
        platformPresetId: "xiaohongshu",
        scene: "知识卡",
        additionalRequirements: "",
        sourceContent: "测试文章",
        status,
        lastStableStatus: status === "draft" ? "draft" : status === "prompts_ready" ? "prompts_ready" : status === "awaiting_image_review" ? "awaiting_image_review" : "image_approved",
        briefVersions: [],
        promptVersions: [],
        candidates: [candidate],
        generatedImages: [image],
        selectedImageId: image.id,
        reviews: [],
        canvasInsertions: [],
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
    };
}

describe("creation workflow review guards", () => {
    it.each(["draft", "prompts_ready"] as const)("%s 状态拒绝采用或插入旧候选", (status) => {
        const value = project(status);
        expect(canApproveCreationCandidate(value, candidate)).toBe(false);
        expect(canQueueCreationCanvasInsert(value, candidate)).toBe(false);
    });

    it("候选审核态只允许采用，批准且仍选中该图后才允许插入", () => {
        const review = project("awaiting_image_review");
        expect(canApproveCreationCandidate(review, candidate)).toBe(true);
        expect(canQueueCreationCanvasInsert(review, candidate)).toBe(false);

        const approved = project("image_approved");
        expect(canQueueCreationCanvasInsert(approved, candidate)).toBe(true);
        expect(canQueueCreationCanvasInsert({ ...approved, selectedImageId: "other-image" }, candidate)).toBe(false);
    });
});
