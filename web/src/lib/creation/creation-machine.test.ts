import { describe, expect, it } from "vitest";

import { CreationTransitionError, currentStepForStatus, reconcileCandidateSelection, transitionCreationStatus } from "./creation-machine";
import type { CreationProject, CreationStatus, ImageCandidate } from "@/types/creation";

describe("creation-machine", () => {
    it("按审核链路显式前进", () => {
        const expected: CreationStatus[] = ["analyzing", "brief_ready", "brief_approved", "generating_prompts", "prompts_ready", "prompt_approved", "generating_images", "awaiting_image_review", "image_approved", "inserted_to_canvas"];
        let status: CreationStatus = "draft";
        expected.forEach((next) => {
            status = transitionCreationStatus(status, "NEXT");
            expect(status).toBe(next);
        });
    });

    it("返回上一审核关卡而不删除旧版本", () => {
        expect(transitionCreationStatus("brief_ready", "BACK")).toBe("draft");
        expect(transitionCreationStatus("prompts_ready", "BACK")).toBe("brief_ready");
        expect(transitionCreationStatus("awaiting_image_review", "BACK")).toBe("prompts_ready");
        expect(transitionCreationStatus("image_approved", "BACK")).toBe("awaiting_image_review");
    });

    it("失败后允许显式重试指定执行阶段", () => {
        expect(transitionCreationStatus("generating_images", "FAIL")).toBe("failed");
        expect(transitionCreationStatus("failed", { type: "RETRY", target: "generating_images" })).toBe("generating_images");
        expect(() => transitionCreationStatus("failed", "RETRY")).toThrow("重试必须指定");
    });

    it("有前置数据的稳定状态可以重新运行某一步", () => {
        expect(transitionCreationStatus("draft", { type: "RETRY", target: "analyzing" })).toBe("analyzing");
        expect(transitionCreationStatus("prompts_ready", { type: "RETRY", target: "generating_prompts" })).toBe("generating_prompts");
        expect(transitionCreationStatus("awaiting_image_review", { type: "RETRY", target: "generating_images" })).toBe("generating_images");
        expect(() => transitionCreationStatus("brief_ready", { type: "RETRY", target: "generating_prompts" })).toThrow("缺少重新运行");
        expect(() => transitionCreationStatus("prompts_ready", { type: "RETRY", target: "generating_images" })).toThrow("缺少重新运行");
        expect(() => transitionCreationStatus("brief_ready", { type: "RETRY", target: "generating_images" })).toThrow("缺少重新运行");
        expect(() => transitionCreationStatus("generating_prompts", { type: "RETRY", target: "generating_prompts" })).toThrow("稳定审核状态");
    });

    it("取消活动任务回到草稿，但不会假装撤销已经插入的画布节点", () => {
        expect(transitionCreationStatus("generating_prompts", "CANCEL")).toBe("draft");
        expect(transitionCreationStatus("failed", "CANCEL")).toBe("draft");
        expect(() => transitionCreationStatus("inserted_to_canvas", "CANCEL")).toThrow("不能通过取消回退画布变更");
    });

    it("非法前进和回退会给出明确错误", () => {
        expect(() => transitionCreationStatus("inserted_to_canvas", "NEXT")).toThrow(CreationTransitionError);
        expect(() => transitionCreationStatus("draft", "BACK")).toThrow(CreationTransitionError);
        expect(() => transitionCreationStatus("failed", "BACK")).toThrow(CreationTransitionError);
        expect(transitionCreationStatus("inserted_to_canvas", "BACK")).toBe("image_approved");
    });

    it("把执行状态映射到六步界面", () => {
        expect(currentStepForStatus("draft")).toBe(1);
        expect(currentStepForStatus("analyzing")).toBe(2);
        expect(currentStepForStatus("prompts_ready")).toBe(3);
        expect(currentStepForStatus("generating_images")).toBe(4);
        expect(currentStepForStatus("awaiting_image_review")).toBe(5);
        expect(currentStepForStatus("inserted_to_canvas")).toBe(6);
        expect(currentStepForStatus("failed", "generating_images")).toBe(4);
    });

    it("候选修改或删除导致采用图失效时回到候选审核", () => {
        const candidate = { id: "candidate-1", index: 0, promptVersionId: "prompt-1", modelConfigId: "model-1", size: "1:1", quality: "high", background: "", status: "stored", imageId: "image-1", feedback: [] } satisfies ImageCandidate;
        const project = {
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
            candidates: [candidate],
            generatedImages: [],
            selectedImageId: "image-1",
            reviews: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        } satisfies CreationProject;

        const next = reconcileCandidateSelection(project, [{ ...candidate, imageId: undefined, status: "idle" }]);

        expect(next.selectedImageId).toBeUndefined();
        expect(next.status).toBe("awaiting_image_review");
        expect(next.lastStableStatus).toBe("awaiting_image_review");
    });
});
