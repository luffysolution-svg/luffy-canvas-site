import { App } from "antd";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { CreationProject, PromptHardConstraints, PromptVersion } from "@/types/creation";
import { CandidateReviewPanel } from "./candidate-review-panel";

vi.mock("@/components/model-picker", () => ({ ModelPicker: () => <div>测试生图模型</div> }));
vi.mock("@/stores/use-config-store", () => ({
    useEffectiveConfig: () => ({}),
    useConfigStore: (selector: (state: { openConfigDialog: () => void }) => unknown) => selector({ openConfigDialog: vi.fn() }),
}));

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

const prompt: PromptVersion = {
    id: "prompt-1",
    label: "极简知识卡",
    content: "一张极简知识卡",
    reasoning: "减少视觉噪声",
    style: "minimalist",
    kind: "optimized",
    sourceBriefVersionId: "brief-version-1",
    hardConstraints: constraints,
    createdAt: "2026-07-28T00:00:00.000Z",
};

function project(secondStatus: "failed" | "unknown" = "failed"): CreationProject {
    const image = {
        id: "image-1",
        url: "data:image/png;base64,AA==",
        mimeType: "image/png",
        providerId: "openai-compatible",
        modelId: "image-model",
        modelConfigId: "channel::image-model",
        promptVersionId: prompt.id,
        createdAt: "2026-07-28T00:00:00.000Z",
    };
    return {
        id: "creation-1",
        name: "审核台测试",
        mode: "social",
        platformPresetId: "xiaohongshu",
        scene: "知识卡",
        additionalRequirements: "",
        sourceContent: "测试文章",
        status: "awaiting_image_review",
        lastStableStatus: "awaiting_image_review",
        briefVersions: [],
        promptVersions: [prompt],
        selectedPromptVersionId: prompt.id,
        candidates: [
            { id: "candidate-1", index: 0, promptVersionId: prompt.id, modelConfigId: "channel::image-model", size: "3:4", quality: "auto", background: "", status: "stored", imageId: image.id, image, feedback: [] },
            {
                id: "candidate-2",
                index: 1,
                promptVersionId: prompt.id,
                modelConfigId: "channel::image-model",
                size: "3:4",
                quality: "auto",
                background: "",
                status: secondStatus,
                error: { id: "error-1", stage: "image_model", message: "生成失败", retryStatus: "generating_images", createdAt: "2026-07-28T00:00:00.000Z" },
                feedback: [],
            },
        ],
        generatedImages: [image],
        selectedImageId: image.id,
        reviews: [],
        canvasInsertions: [],
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
    };
}

function renderPanel(value: CreationProject, overrides: Partial<ComponentProps<typeof CandidateReviewPanel>> = {}) {
    const props: ComponentProps<typeof CandidateReviewPanel> = {
        project: value,
        busy: false,
        onCandidateCountChange: vi.fn(),
        onCandidateChange: vi.fn(),
        onGenerateAll: vi.fn(),
        onRetryCandidate: vi.fn(),
        onApproveCandidate: vi.fn(),
        onUseAsReference: vi.fn(),
        onMarkIssue: vi.fn(),
        onSaveAsset: vi.fn(),
        onEditPrompt: vi.fn(),
        onInsert: vi.fn(),
        onRemoveCandidate: vi.fn(),
        ...overrides,
    };
    render(
        <App>
            <CandidateReviewPanel {...props} />
        </App>,
    );
    return props;
}

describe("CandidateReviewPanel", () => {
    it("运行全部与失败列重试使用不同回调，成功列不会被失败重试带上", async () => {
        const user = userEvent.setup();
        const props = renderPanel(project());

        await user.click(screen.getByRole("button", { name: "运行全部候选" }));
        await user.click(screen.getByRole("button", { name: "重试" }));

        expect(props.onGenerateAll).toHaveBeenCalledOnce();
        expect(props.onRetryCandidate).toHaveBeenCalledOnce();
        expect(props.onRetryCandidate).toHaveBeenCalledWith("candidate-2");
    });

    it("待确认列禁用直接重试，避免可能重复扣费", () => {
        renderPanel(project("unknown"));
        const card = screen.getByText("Candidate 02").closest("article");
        expect(card).not.toBeNull();
        expect(within(card!).getByRole("button", { name: "重新生成" })).toBeDisabled();
        expect(within(card!).getByText("生成结果待确认")).toBeInTheDocument();
    });

    it.each(["draft", "prompts_ready"] as const)("%s 状态下旧候选不能采用或插入", (status) => {
        const value = project();
        value.status = status;
        value.lastStableStatus = status;
        renderPanel(value);

        const card = screen.getByText("Candidate 01").closest("article");
        expect(card).not.toBeNull();
        expect(within(card!).getByRole("button", { name: "已采用" })).toBeDisabled();
        expect(within(card!).getByRole("button", { name: "插入画布" })).toBeDisabled();
    });
});
