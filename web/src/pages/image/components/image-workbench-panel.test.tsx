import { App } from "antd";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultImageDesignPreferences } from "@/features/image-design/persistence/preferences";
import { XHS_IMAGES_SKILL } from "@/features/image-design/registry/design-skills";
import { useImageDesignStore } from "@/features/image-design/store/use-image-design-store";
import type { CompiledPrompt, ResolvedProviderMapping, StructuredPlan } from "@/features/image-design/types";
import type { AiConfig } from "@/stores/use-config-store";

import { ImageWorkbenchPanel, type ImageWorkbenchPanelProps } from "./image-workbench-panel";

vi.mock("./image-generation-settings", () => ({
    ImageGenerationSettings: () => null,
}));

vi.mock("./reference-images-field", () => ({
    ReferenceImagesField: () => <div aria-label="参考图" />,
}));

beforeAll(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});

beforeEach(() => {
    useImageDesignStore.setState({
        ...createDefaultImageDesignPreferences(),
        selectedSkillId: XHS_IMAGES_SKILL.id,
        hydrated: true,
    });
});

describe("ImageWorkbenchPanel", () => {
    it("keeps a manual final Prompt entry available when automatic preview is disabled", () => {
        useImageDesignStore.setState({
            finalPromptPreviewEnabled: false,
            finalPromptPreviewOpen: false,
        });
        renderWorkbench();

        expect(screen.queryByRole("textbox", { name: "最终组合提示词" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "查看最终 Prompt" }));

        expect(useImageDesignStore.getState()).toMatchObject({
            finalPromptPreviewEnabled: true,
            finalPromptPreviewOpen: true,
        });
        expect(screen.getAllByRole("textbox", { name: "最终组合提示词" })[0]).toHaveValue("系统编译提示词");
    }, 10_000);

    it("forwards single-item generation and invalidates stale compilation after editing", () => {
        const plan = seriesPlanFixture();
        const onGeneratePlanItem = vi.fn();
        const onPlanChange = vi.fn();
        renderWorkbench({ plan, onGeneratePlanItem, onPlanChange });

        fireEvent.click(screen.getByText("已有卡片"));
        fireEvent.click(screen.getByRole("button", { name: "单独生成" }));
        expect(onGeneratePlanItem).toHaveBeenCalledWith(plan.items[0]);

        fireEvent.change(screen.getByDisplayValue("已有卡片"), { target: { value: "编辑后的卡片" } });

        expect(onPlanChange).toHaveBeenCalledOnce();
        expect(onPlanChange.mock.calls[0][0].items[0]).toEqual({
            ...plan.items[0],
            title: "编辑后的卡片",
            finalPrompt: undefined,
            status: "idle",
            error: undefined,
        });
    }, 10_000);
});

function renderWorkbench(overrides: Partial<ImageWorkbenchPanelProps> = {}) {
    return render(
        <App>
            <ImageWorkbenchPanel {...createProps(overrides)} />
        </App>,
    );
}

function createProps(overrides: Partial<ImageWorkbenchPanelProps>): ImageWorkbenchPanelProps {
    const compiled = compiledPromptFixture();
    return {
        prompt: "生成一组旅行卡片",
        references: [],
        config: configFixture(),
        skill: XHS_IMAGES_SKILL,
        skillOptions: {},
        compiled,
        finalPrompt: compiled.finalPrompt,
        manualOverride: false,
        customInstructions: "",
        negativeInstructions: "",
        recommendation: null,
        recommending: false,
        plan: null,
        planWarnings: [],
        results: [],
        running: false,
        elapsedMs: 0,
        onPromptChange: vi.fn(),
        onReferencesChange: vi.fn(),
        onConfigChange: vi.fn(),
        onFinalPromptChange: vi.fn(),
        onRestoreFinalPrompt: vi.fn(),
        onRecompile: vi.fn(),
        onReplaceOriginal: vi.fn(),
        onCustomInstructionsChange: vi.fn(),
        onNegativeInstructionsChange: vi.fn(),
        onRecommend: vi.fn(),
        onApplyRecommendation: vi.fn(),
        onDismissRecommendation: vi.fn(),
        onCreatePlan: vi.fn(),
        onPlanChange: vi.fn(),
        onGeneratePlanItem: vi.fn(),
        onRetryFailed: vi.fn(),
        onGenerate: vi.fn(),
        onCancel: vi.fn(),
        onOpenHistory: vi.fn(),
        onOpenPromptLibrary: vi.fn(),
        onOpenPromptOptimizer: vi.fn(),
        onOpenAssets: vi.fn(),
        onOpenPreferences: vi.fn(),
        onOpenGenerationSettings: vi.fn(),
        onMissingConfig: vi.fn(),
        ...overrides,
    };
}

function seriesPlanFixture(): StructuredPlan {
    return {
        id: "series-plan",
        type: "series",
        title: "旅行卡片",
        summary: "一张已生成卡片",
        visualBible: "统一使用蓝绿色调",
        sourceDigest: "digest",
        items: [
            {
                id: "item-1",
                order: 0,
                kind: "content",
                title: "已有卡片",
                body: "海边旅行",
                finalPrompt: "旧的单项最终提示词",
                status: "failed",
                error: "旧错误",
            },
        ],
    };
}

function compiledPromptFixture(): CompiledPrompt {
    const providerMapping: ResolvedProviderMapping = {
        provider: "openai",
        model: "test-image-model",
        requestedSize: "1024x1024",
        requestedAspectRatio: "1:1",
        resolvedSize: "1024x1024",
        resolvedAspectRatio: "1:1",
        support: "exact",
        requiresConfirmation: false,
        note: "测试映射",
    };
    const promptSections = [{ id: "user" as const, label: "用户主题", content: "生成一组旅行卡片" }];
    return {
        systemFinalPrompt: "系统编译提示词",
        finalPrompt: "系统编译提示词",
        negativePromptFragments: [],
        resolvedSize: "1024x1024",
        resolvedAspectRatio: "1:1",
        resolvedQuality: "standard",
        resolvedCount: 1,
        promptSections,
        warnings: [],
        providerMapping,
        manualOverride: false,
        reproducibilitySnapshot: {
            compilerVersion: "1",
            promptVersion: "1",
            designSkillId: XHS_IMAGES_SKILL.id,
            skillOptions: {},
            referenceImageRoles: [],
            language: "zh-CN",
            promptSections,
            systemFinalPrompt: "系统编译提示词",
            finalPrompt: "系统编译提示词",
            manualOverride: false,
            resolvedSize: "1024x1024",
            resolvedAspectRatio: "1:1",
            resolvedQuality: "standard",
            resolvedCount: 1,
            providerMapping,
        },
    };
}

function configFixture(): AiConfig {
    return {
        channelMode: "remote",
        baseUrl: "https://api.example.test/v1",
        apiKey: "test-key",
        authType: "bearer",
        apiFormat: "openai",
        channels: [],
        model: "test-image-model",
        imageModel: "test-image-model",
        videoModel: "",
        textModel: "",
        audioModel: "",
        audioVoice: "",
        audioFormat: "",
        audioSpeed: "",
        audioInstructions: "",
        videoSeconds: "",
        vquality: "",
        videoGenerateAudio: "",
        videoWatermark: "",
        videoReferenceMode: "",
        systemPrompt: "",
        models: ["test-image-model"],
        quality: "standard",
        size: "1024x1024",
        background: "auto",
        count: "1",
        canvasImageCount: "1",
        optimizeImageReferences: true,
    };
}
