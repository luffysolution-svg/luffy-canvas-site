import { App } from "antd";
import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageGenerationError } from "@/services/api/image-errors";
import type { GenerationLog } from "@/features/image-design/generation/types";
import { createDefaultImageDesignPreferences } from "@/features/image-design/persistence/preferences";
import { useImageDesignStore } from "@/features/image-design/store/use-image-design-store";
import type { ImageDesignRecommendation, SkillOptionValue, StructuredPlan } from "@/features/image-design/types";
import ImagePage from "./index";

const PROMPT_PLACEHOLDER = "描述主题、必须保留的信息、目标受众和使用场景；也可以直接粘贴文章、Markdown 或故事。";

const mocks = vi.hoisted(() => {
    const logValues = new Map<string, unknown>();
    const persistedValues = new Map<string, string>();
    const logStore = {
        getItem: vi.fn(async (key: string) => logValues.get(key) ?? null),
        iterate: vi.fn(async (iterator: (value: unknown, key: string, iterationNumber: number) => unknown) => {
            let iterationNumber = 1;
            for (const [key, value] of logValues) {
                const result = await iterator(value, key, iterationNumber++);
                if (result !== undefined) return result;
            }
            return undefined;
        }),
        removeItem: vi.fn(async (key: string) => void logValues.delete(key)),
        setItem: vi.fn(async (key: string, value: unknown) => {
            logValues.set(key, value);
            return value;
        }),
    };
    const localforage = {
        config: vi.fn(),
        getItem: vi.fn(async (key: string) => persistedValues.get(key) ?? null),
        setItem: vi.fn(async (key: string, value: string) => {
            persistedValues.set(key, value);
            return value;
        }),
        removeItem: vi.fn(async (key: string) => void persistedValues.delete(key)),
        iterate: vi.fn(async (iterator: (value: string, key: string, iterationNumber: number) => unknown) => {
            let iterationNumber = 1;
            for (const [key, value] of persistedValues) {
                const result = await iterator(value, key, iterationNumber++);
                if (result !== undefined) return result;
            }
            return undefined;
        }),
    };
    const channel = {
        id: "test-channel",
        name: "测试渠道",
        provider: "openai",
        baseUrl: "https://api.example.test/v1",
        apiKey: "test-key",
        authType: "bearer",
        apiFormat: "openai",
        imageResponseFormat: "b64_json",
        imageBatchMode: "native",
        models: [{ name: "test-image-model", capabilities: ["image"] }],
    };
    const config = {
        channelMode: "remote",
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        authType: channel.authType,
        apiFormat: channel.apiFormat,
        channels: [channel],
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
        quality: "auto",
        size: "1024x1024",
        background: "",
        count: "1",
        canvasImageCount: "1",
        optimizeImageReferences: true,
    };
    return {
        addAsset: vi.fn(),
        assets: [],
        channel,
        clearImageCommand: vi.fn(),
        config,
        consumeImagePrompt: vi.fn(),
        copyText: vi.fn(),
        downloadImageBlob: vi.fn(),
        localforage,
        logStore,
        logValues,
        openConfigDialog: vi.fn(),
        persistedValues,
        readImageMeta: vi.fn(),
        requestImageBatch: vi.fn(),
        resolveImageUrl: vi.fn(),
        storeImageBlob: vi.fn(),
        updateAgentTask: vi.fn(),
        updateConfig: vi.fn(),
        uploadImage: vi.fn(),
    };
});

vi.mock("localforage", () => ({
    default: {
        config: mocks.localforage.config,
        getItem: mocks.localforage.getItem,
        setItem: mocks.localforage.setItem,
        removeItem: mocks.localforage.removeItem,
        iterate: mocks.localforage.iterate,
        createInstance: () => mocks.logStore,
    },
}));

vi.mock("@/components/image-settings-panel", () => ({
    ImageSettingsPanel: () => null,
}));

vi.mock("@/components/model-picker", () => ({
    ModelPicker: () => null,
}));

vi.mock("@/components/prompts/prompt-select-dialog", () => ({
    PromptSelectDialog: () => null,
}));

vi.mock("@/components/prompts/image-prompt-optimizer", () => ({
    ImagePromptOptimizerDialog: () => null,
}));

vi.mock("@/components/canvas/asset-picker-modal", () => ({
    AssetPickerModal: () => null,
}));

vi.mock("@/features/image-design/components/image-design-preferences-drawer", () => ({
    ImageDesignPreferencesDrawer: () => null,
}));

vi.mock("./components/image-generation-settings", () => ({
    ImageGenerationSettings: () => null,
}));

vi.mock("./components/image-history-panel", () => ({
    ImageHistoryPanel: ({ logs, onPreviewLog }: { logs: GenerationLog[]; onPreviewLog: (log: GenerationLog) => void }) => (
        <>
            {logs.map((log) => (
                <button key={log.id} type="button" onClick={() => onPreviewLog(log)}>
                    恢复记录 {log.id}
                </button>
            ))}
        </>
    ),
}));

vi.mock("./components/image-workbench-panel", () => ({
    ImageWorkbenchPanel: ({
        prompt,
        recommendation,
        plan,
        skillOptions,
        onPromptChange,
        onApplyRecommendation,
        onPlanChange,
        onGenerate,
    }: {
        prompt: string;
        recommendation: ImageDesignRecommendation | null;
        plan: StructuredPlan | null;
        skillOptions: Record<string, SkillOptionValue>;
        onPromptChange: (value: string) => void;
        onApplyRecommendation: () => void;
        onPlanChange: (plan: StructuredPlan) => void;
        onGenerate: () => void;
    }) => (
        <>
            <textarea placeholder={PROMPT_PLACEHOLDER} value={prompt} onChange={(event) => onPromptChange(event.target.value)} />
            <div data-testid="skill-partial-mode">{String(skillOptions.partialMode || "")}</div>
            <button type="button" disabled={!prompt.trim()} onClick={onGenerate}>
                开始生成
            </button>
            {recommendation ? (
                <button type="button" onClick={onApplyRecommendation}>
                    应用推荐
                </button>
            ) : null}
            {plan ? (
                <>
                    <div data-testid="plan-count">{plan.items.length}</div>
                    <div data-testid="plan-final-prompts">{plan.items.filter((item) => Boolean(item.finalPrompt)).length}</div>
                    <button
                        type="button"
                        onClick={() =>
                            onPlanChange({
                                ...plan,
                                items: plan.items.map((item, index) => (index === 0 ? { ...item, finalPrompt: "用户编辑并锁定的第一页 Prompt" } : item)),
                            })
                        }
                    >
                        编辑首项 Prompt
                    </button>
                </>
            ) : null}
        </>
    ),
}));

vi.mock("@/stores/use-config-store", () => {
    const state = {
        config: mocks.config,
        isAiConfigReady: () => true,
        openConfigDialog: mocks.openConfigDialog,
        updateConfig: mocks.updateConfig,
    };
    return {
        assertModelChannelAvailable: vi.fn(),
        buildApiUrl: (baseUrl: string, path: string) => `${baseUrl}${path}`,
        modelMatchesCapability: () => false,
        modelOptionLabel: () => "测试模型",
        modelOptionName: (value: string) => value,
        resolveModelChannel: () => mocks.channel,
        resolveModelRequestConfig: (config: typeof mocks.config, value: string) => ({
            ...config,
            model: value,
            baseUrl: mocks.channel.baseUrl,
            apiKey: mocks.channel.apiKey,
            authType: mocks.channel.authType,
            apiFormat: mocks.channel.apiFormat,
        }),
        resolveModelScript: () => undefined,
        useConfigStore: (selector: (value: typeof state) => unknown) => selector(state),
        useEffectiveConfig: () => mocks.config,
    };
});

vi.mock("@/stores/use-theme-store", () => ({
    useThemeStore: (selector: (value: { theme: "light" }) => unknown) => selector({ theme: "light" }),
}));

vi.mock("@/stores/use-asset-store", () => {
    const state = { addAsset: mocks.addAsset, assets: mocks.assets };
    return {
        useAssetStore: (selector: (value: typeof state) => unknown) => selector(state),
    };
});

vi.mock("@/stores/use-workbench-agent-store", () => {
    const state = {
        imageCommand: null,
        clearImageCommand: mocks.clearImageCommand,
        updateTask: mocks.updateAgentTask,
    };
    return {
        useWorkbenchAgentStore: (selector: (value: typeof state) => unknown) => selector(state),
    };
});

vi.mock("@/hooks/use-copy-text", () => ({
    useCopyText: () => mocks.copyText,
}));

vi.mock("@/services/api/image-batch", () => ({
    requestImageBatch: mocks.requestImageBatch,
}));

vi.mock("@/services/prompt-optimizer-transfer", () => ({
    consumeImagePrompt: mocks.consumeImagePrompt,
}));

vi.mock("@/services/image-storage", () => ({
    cleanupUnusedImages: vi.fn(),
    downloadImageBlob: mocks.downloadImageBlob,
    resolveImageUrl: mocks.resolveImageUrl,
    storeImageBlob: mocks.storeImageBlob,
    uploadImage: mocks.uploadImage,
}));

vi.mock("@/lib/image-utils", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/image-utils")>()),
    readImageMeta: mocks.readImageMeta,
}));

describe("ImagePage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.logValues.clear();
        mocks.persistedValues.clear();
        mocks.requestImageBatch.mockReset();
        mocks.config.model = "test-image-model";
        mocks.config.imageModel = "test-image-model";
        useImageDesignStore.setState({
            ...createDefaultImageDesignPreferences(),
            quickMode: true,
            confirmBeforeGeneration: true,
            useAiRecommendation: false,
            hydrated: true,
            skillSelectionExplicit: false,
            platformSelectionExplicit: false,
            explicitSkillOptionKeys: {},
        });
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
        mocks.consumeImagePrompt.mockReturnValue("");
        mocks.resolveImageUrl.mockImplementation(async (_storageKey, fallback = "") => fallback);
        mocks.readImageMeta.mockResolvedValue({ width: 1024, height: 1024, mimeType: "image/png" });
    });

    it("consumes a staged optimized prompt into the image prompt field", async () => {
        mocks.consumeImagePrompt.mockReturnValueOnce("电影感海边日落，16:9");

        render(
            <StrictMode>
                <App>
                    <ImagePage />
                </App>
            </StrictMode>,
        );

        expect(await screen.findByPlaceholderText(PROMPT_PLACEHOLDER)).toHaveValue("电影感海边日落，16:9");
        expect(mocks.consumeImagePrompt).toHaveBeenCalledTimes(2);
    });

    it("runs local recommendation, applies it and starts quick generation from one click", async () => {
        useImageDesignStore.setState({ quickMode: true, confirmBeforeGeneration: false });
        useImageDesignStore.getState().selectSkill("none");
        useImageDesignStore.getState().selectPlatformPreset("manual");
        mocks.config.model = "gpt-image-1";
        mocks.config.imageModel = "gpt-image-1";
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("quick-result"));
        renderPage();

        const promptField = screen.getByPlaceholderText(PROMPT_PLACEHOLDER);
        fireEvent.change(promptField, { target: { value: "保持原始提示词快速生成" } });
        fireEvent.click(screen.getAllByRole("button", { name: "开始生成" })[0]);

        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(mocks.logStore.setItem).toHaveBeenCalled());
        const log = mocks.logStore.setItem.mock.calls.at(-1)?.[1] as GenerationLog;
        expect(log.recommendationSnapshot).toMatchObject({ applied: true, skillId: "none", platformPresetId: "manual" });
    });

    it("keeps guided mode at recommendation review until the user applies it", async () => {
        useImageDesignStore.setState({ quickMode: false, confirmBeforeGeneration: true });
        useImageDesignStore.getState().selectSkill("none");
        useImageDesignStore.getState().selectPlatformPreset("manual");
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("guided-result"));
        renderPage();

        fireEvent.change(screen.getByPlaceholderText(PROMPT_PLACEHOLDER), { target: { value: "引导模式测试" } });
        fireEvent.click(screen.getAllByRole("button", { name: "开始生成" })[0]);

        expect(await screen.findByRole("button", { name: "应用推荐" })).toBeInTheDocument();
        expect(mocks.requestImageBatch).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "应用推荐" }));
        fireEvent.click(screen.getAllByRole("button", { name: "开始生成" })[0]);
        fireEvent.click(await screen.findByRole("button", { name: "确认并生成" }));

        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledOnce());
    });

    it.each([
        ["storyboard-only", 0],
        ["prompts-only", 4],
    ] as const)("executes comic %s mode without an image request", async (partialMode, expectedPromptCount) => {
        useImageDesignStore.setState({ quickMode: true, confirmBeforeGeneration: false });
        useImageDesignStore.getState().selectSkill("comic");
        useImageDesignStore.getState().selectPlatformPreset("manual");
        useImageDesignStore.getState().updateSkillOption("comic", "partialMode", partialMode);
        useImageDesignStore.getState().updateSkillOption("comic", "panelCount", 4);
        useImageDesignStore.getState().updateSkillOption("comic", "pageCount", 1);
        renderPage();

        fireEvent.change(screen.getByPlaceholderText(PROMPT_PLACEHOLDER), { target: { value: "林舟进入车站，发现时钟倒转，最后找到答案。" } });
        fireEvent.click(screen.getAllByRole("button", { name: "开始生成" })[0]);

        await vi.waitFor(() => expect(screen.getByTestId("plan-count")).toHaveTextContent("4"));
        expect(screen.getByTestId("plan-final-prompts")).toHaveTextContent(String(expectedPromptCount));
        expect(mocks.requestImageBatch).not.toHaveBeenCalled();
    });

    it("generates one complete comic image per page while retaining independent panel prompts", async () => {
        useImageDesignStore.setState({ quickMode: true, confirmBeforeGeneration: true });
        useImageDesignStore.getState().selectSkill("comic");
        useImageDesignStore.getState().selectPlatformPreset("manual");
        useImageDesignStore.getState().updateSkillOption("comic", "partialMode", "images-only");
        useImageDesignStore.getState().updateSkillOption("comic", "layout", "four-panel");
        useImageDesignStore.getState().updateSkillOption("comic", "panelCount", 8);
        useImageDesignStore.getState().updateSkillOption("comic", "pageCount", 2);
        mocks.requestImageBatch.mockImplementation(async () => remoteBatch(`comic-page-${mocks.requestImageBatch.mock.calls.length}`));
        renderPage();

        await confirmGeneration("林舟进入车站。阿岚追来。两人发现线索。列车启动。场景切到雨夜。角色发生争论。钟声响起。故事最终和解。");

        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledTimes(2));
        expect(mocks.requestImageBatch.mock.calls[0][1]).toContain("生成完整的第 1 页多格漫画页面");
        expect(mocks.requestImageBatch.mock.calls[0][1]).toContain("该格独立 Prompt");
        expect(mocks.requestImageBatch.mock.calls[1][1]).toContain("生成完整的第 2 页多格漫画页面");
    });

    it("lets images-only comic generation consume prompts saved by prompts-only mode", async () => {
        useImageDesignStore.setState({ quickMode: true, confirmBeforeGeneration: false });
        useImageDesignStore.getState().selectSkill("comic");
        useImageDesignStore.getState().selectPlatformPreset("manual");
        useImageDesignStore.getState().updateSkillOption("comic", "partialMode", "prompts-only");
        useImageDesignStore.getState().updateSkillOption("comic", "panelCount", 2);
        useImageDesignStore.getState().updateSkillOption("comic", "pageCount", 1);
        mocks.config.model = "gpt-image-1";
        mocks.config.imageModel = "gpt-image-1";
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("saved-prompt-page"));
        renderPage();

        fireEvent.change(screen.getByPlaceholderText(PROMPT_PLACEHOLDER), { target: { value: "林舟进入车站，阿岚随后发现时钟倒转。" } });
        fireEvent.click(screen.getAllByRole("button", { name: "开始生成" })[0]);
        await vi.waitFor(() => expect(screen.getByTestId("plan-final-prompts")).toHaveTextContent("2"));
        fireEvent.click(screen.getByRole("button", { name: "编辑首项 Prompt" }));

        useImageDesignStore.getState().updateSkillOption("comic", "partialMode", "images-only");
        await vi.waitFor(() => expect(screen.getByTestId("skill-partial-mode")).toHaveTextContent("images-only"));
        fireEvent.click(screen.getAllByRole("button", { name: "开始生成" })[0]);
        fireEvent.click(await screen.findByRole("button", { name: "确认并生成" }, { timeout: 5_000 }));

        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledOnce());
        expect(mocks.requestImageBatch.mock.calls[0][1]).toContain("用户编辑并锁定的第一页 Prompt");
    });

    it("keeps a generated Base64 result visible when IndexedDB persistence fails", async () => {
        const dataUrl = "data:image/png;base64,aW1hZ2U=";
        mocks.requestImageBatch.mockResolvedValue(
            batchResult({
                id: "generated-image",
                status: "generated",
                source: "data_url",
                dataUrl,
                mimeType: "image/png",
            }),
        );
        mocks.uploadImage.mockRejectedValue(new Error("IndexedDB 写入失败"));
        renderPage();

        await confirmGeneration("一只戴草帽的猫");

        expect(await screen.findByText("已生成")).toBeInTheDocument();
        expect(screen.getByText("IndexedDB 写入失败")).toBeInTheDocument();
        expect(screen.queryByText("生成失败")).not.toBeInTheDocument();
        expect(mocks.requestImageBatch).toHaveBeenCalledOnce();
        expect(mocks.uploadImage).toHaveBeenCalledWith(dataUrl);
    });

    it("keeps a remote result visible when explicit local saving is blocked by CORS", async () => {
        const remoteUrl = "https://cdn.example.test/remote.png";
        mocks.requestImageBatch.mockResolvedValue(
            batchResult({
                id: "remote-image",
                status: "remote_only",
                source: "remote_url",
                remoteUrl,
            }),
        );
        mocks.downloadImageBlob.mockRejectedValue(new ImageGenerationError("远程图片下载失败", { failureStage: "result_download", kind: "cors" }));
        renderPage();

        await confirmGeneration("一张远程图片");
        expect(await screen.findByText("仅远程")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "打开原图" })).toHaveAttribute("href", remoteUrl);
        expect(screen.getByRole("link", { name: "打开原图" })).toHaveAttribute("target", "_blank");

        fireEvent.click(screen.getByRole("button", { name: "保存到本地" }));

        expect((await screen.findAllByText("远程图片下载失败")).length).toBeGreaterThan(0);
        expect(screen.getByText("仅远程")).toBeInTheDocument();
        expect(screen.queryByText("生成失败")).not.toBeInTheDocument();
    });

    it("sends the original prompt unchanged with no Skill and the manual platform", async () => {
        const prompt = "保留这句原始提示，不追加规则";
        useImageDesignStore.getState().selectSkill("none");
        useImageDesignStore.getState().selectPlatformPreset("manual");
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("manual-result"));
        renderPage();

        await confirmGeneration(prompt);

        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledOnce());
        expect(mocks.requestImageBatch.mock.calls[0][1]).toBe(prompt);
        expect(mocks.requestImageBatch.mock.calls[0][0]).toMatchObject({ size: "1024x1024", count: "1" });
    });

    it("sends the compiled final prompt and resolved platform size after selecting a Skill", async () => {
        useImageDesignStore.getState().selectSkill("cover-image");
        useImageDesignStore.getState().selectPlatformPreset("wechat-headline-cover");
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("compiled-result"));
        renderPage();

        const prompt = "AI 如何改变产品设计";
        await confirmGeneration(prompt);

        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledOnce());
        const [requestConfig, finalPrompt] = mocks.requestImageBatch.mock.calls[0];
        expect(finalPrompt).toContain(prompt);
        expect(finalPrompt).not.toBe(prompt);
        expect(finalPrompt).toContain("平台规则");
        expect(requestConfig.size).toBe("1920x816");
    });

    it("persists the reproducible request snapshot in the generation log", async () => {
        useImageDesignStore.getState().selectSkill("cover-image");
        useImageDesignStore.getState().selectPlatformPreset("wechat-headline-cover");
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("logged-result"));
        renderPage();

        await confirmGeneration("需要保存快照的封面");

        await vi.waitFor(() => expect(mocks.logStore.setItem).toHaveBeenCalled());
        const storedLog = mocks.logStore.setItem.mock.calls.at(-1)?.[1] as {
            originalPrompt: string;
            finalPrompt: string;
            items: Array<{ snapshot: { originalPrompt: string; finalPrompt: string; config: { size: string }; reproducibilitySnapshot?: { compilerVersion: string; promptVersion: string } } }>;
        };
        expect(storedLog.originalPrompt).toBe("需要保存快照的封面");
        expect(storedLog.finalPrompt).not.toBe(storedLog.originalPrompt);
        expect(storedLog.items[0].snapshot).toMatchObject({
            originalPrompt: storedLog.originalPrompt,
            finalPrompt: storedLog.finalPrompt,
            config: { size: "1920x816" },
            reproducibilitySnapshot: {
                compilerVersion: expect.any(String),
                promptVersion: expect.any(String),
            },
        });
    });

    it("restores prompt, Skill, platform, options, recommendation and results by clicking a log", async () => {
        useImageDesignStore.getState().selectSkill("cover-image");
        useImageDesignStore.getState().updateSkillOption("cover-image", "palette", "cool");
        useImageDesignStore.getState().selectPlatformPreset("wechat-headline-cover");
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("restore-result"));
        renderPage();

        await confirmGeneration("需要完整恢复的封面主题");
        await vi.waitFor(() => expect(mocks.logStore.setItem).toHaveBeenCalled());
        const saved = mocks.logStore.setItem.mock.calls.at(-1)?.[1] as GenerationLog;

        fireEvent.change(screen.getByPlaceholderText(PROMPT_PLACEHOLDER), { target: { value: "临时的新主题" } });
        useImageDesignStore.getState().selectSkill("none");
        useImageDesignStore.getState().selectPlatformPreset("manual");
        const restoreButtons = await screen.findAllByRole("button", { name: `恢复记录 ${saved.id}` });
        fireEvent.click(restoreButtons[0]);

        expect(screen.getByPlaceholderText(PROMPT_PLACEHOLDER)).toHaveValue("需要完整恢复的封面主题");
        expect(useImageDesignStore.getState()).toMatchObject({
            selectedSkillId: "cover-image",
            selectedPresetId: "wechat-headline-cover",
            skillOptions: { "cover-image": expect.objectContaining({ palette: "cool" }) },
        });
        expect(screen.getByText("仅远程")).toBeInTheDocument();
        expect(saved.recommendationSnapshot).toMatchObject({ applied: true, skillId: "cover-image", platformPresetId: "wechat-headline-cover" });
    });

    it("uses the saved snapshot for exact retry and current compilation for recompile", async () => {
        useImageDesignStore.getState().selectSkill("cover-image");
        useImageDesignStore.getState().selectPlatformPreset("wechat-headline-cover");
        mocks.requestImageBatch.mockResolvedValue(remoteBatch("retry-result"));
        renderPage();

        await confirmGeneration("旧主题：城市夜景");
        await screen.findByText("仅远程");
        const savedPrompt = mocks.requestImageBatch.mock.calls[0][1] as string;
        const promptField = screen.getByPlaceholderText(PROMPT_PLACEHOLDER);
        fireEvent.change(promptField, { target: { value: "新主题：清晨森林" } });

        fireEvent.click(screen.getByRole("button", { name: "重试" }));
        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledTimes(2));
        expect(mocks.requestImageBatch.mock.calls[1][1]).toBe(savedPrompt);
        expect(mocks.requestImageBatch.mock.calls[1][0]).toMatchObject({ size: "1920x816", count: "1" });

        await vi.waitFor(() => expect(screen.getByRole("button", { name: "重新编译" })).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: "重新编译" }));
        const confirmButtons = await screen.findAllByRole("button", { name: "确认并生成" });
        fireEvent.click(confirmButtons.at(-1)!);
        await vi.waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledTimes(3));
        const recompiledPrompt = mocks.requestImageBatch.mock.calls[2][1] as string;
        expect(recompiledPrompt).toContain("新主题：清晨森林");
        expect(recompiledPrompt).not.toBe(savedPrompt);
        expect(mocks.requestImageBatch.mock.calls[2][0]).toMatchObject({ size: "1920x816", count: "1" });
    }, 15_000);
});

function renderPage() {
    return render(
        <App>
            <ImagePage />
        </App>,
    );
}

async function confirmGeneration(prompt: string) {
    const promptField = screen.getByPlaceholderText(PROMPT_PLACEHOLDER);
    fireEvent.change(promptField, { target: { value: prompt } });
    fireEvent.click(screen.getAllByRole("button", { name: "开始生成" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "确认并生成" }));
}

function remoteBatch(id: string) {
    return batchResult({
        id,
        status: "remote_only",
        source: "remote_url",
        remoteUrl: `https://cdn.example.test/${id}.png`,
    });
}

function batchResult(value: Record<string, unknown>) {
    return {
        results: [{ status: "fulfilled" as const, value }],
        referenceOptimization: { total: 0, optimized: 0 },
    };
}
