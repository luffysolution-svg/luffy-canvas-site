import { App } from "antd";
import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImageGenerationError } from "@/services/api/image-errors";
import ImagePage from "./index";

const mocks = vi.hoisted(() => {
    const logStore = {
        getItem: vi.fn(),
        iterate: vi.fn(),
        removeItem: vi.fn(),
        setItem: vi.fn(),
    };
    return {
        addAsset: vi.fn(),
        clearImageCommand: vi.fn(),
        consumeImagePrompt: vi.fn(),
        copyText: vi.fn(),
        deleteStoredImages: vi.fn(),
        downloadImageBlob: vi.fn(),
        logStore,
        openConfigDialog: vi.fn(),
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

vi.mock("@/stores/use-config-store", () => {
    const config = {
        count: "1",
        imageModel: "test-image-model",
        model: "test-image-model",
        optimizeImageReferences: true,
        quality: "standard",
        size: "1024x1024",
    };
    const state = {
        config,
        isAiConfigReady: () => true,
        openConfigDialog: mocks.openConfigDialog,
        updateConfig: mocks.updateConfig,
    };
    return {
        modelOptionLabel: () => "测试模型",
        resolveModelChannel: () => ({ apiFormat: "openai" }),
        useConfigStore: (selector: (value: typeof state) => unknown) => selector(state),
        useEffectiveConfig: () => config,
    };
});

vi.mock("@/stores/use-theme-store", () => ({
    useThemeStore: (selector: (value: { theme: "light" }) => unknown) => selector({ theme: "light" }),
}));

vi.mock("@/stores/use-asset-store", () => ({
    useAssetStore: (selector: (value: { addAsset: typeof mocks.addAsset }) => unknown) => selector({ addAsset: mocks.addAsset }),
}));

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
    deleteStoredImages: mocks.deleteStoredImages,
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
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
        mocks.logStore.getItem.mockResolvedValue(null);
        mocks.logStore.iterate.mockResolvedValue(undefined);
        mocks.logStore.removeItem.mockResolvedValue(undefined);
        mocks.logStore.setItem.mockImplementation(async (_key, value) => value);
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

        expect(await screen.findByPlaceholderText("描述画面主体、风格、构图、光线和用途")).toHaveValue("电影感海边日落，16:9");
        expect(mocks.consumeImagePrompt).toHaveBeenCalledTimes(2);
    });

    it("keeps a generated Base64 result visible when IndexedDB persistence fails", async () => {
        const dataUrl = "data:image/png;base64,aW1hZ2U=";
        mocks.requestImageBatch.mockResolvedValue({
            results: [
                {
                    status: "fulfilled",
                    value: {
                        id: "generated-image",
                        status: "generated",
                        source: "data_url",
                        dataUrl,
                        mimeType: "image/png",
                    },
                },
            ],
            referenceOptimization: { total: 0, optimized: 0 },
        });
        mocks.uploadImage.mockRejectedValue(new Error("IndexedDB 写入失败"));
        const user = userEvent.setup();
        render(
            <App>
                <ImagePage />
            </App>,
        );

        await user.type(screen.getByPlaceholderText("描述画面主体、风格、构图、光线和用途"), "一只戴草帽的猫");
        await user.click(screen.getByRole("button", { name: "开始生成" }));

        expect(await screen.findByText("已生成")).toBeInTheDocument();
        expect(screen.getByText("IndexedDB 写入失败")).toBeInTheDocument();
        expect(screen.queryByText("生成失败")).not.toBeInTheDocument();
        expect(mocks.requestImageBatch).toHaveBeenCalledOnce();
        expect(mocks.uploadImage).toHaveBeenCalledWith(dataUrl);
    });

    it("keeps a remote result visible when explicit local saving is blocked by CORS", async () => {
        const remoteUrl = "https://cdn.example.test/remote.png";
        mocks.requestImageBatch.mockResolvedValue({
            results: [
                {
                    status: "fulfilled",
                    value: {
                        id: "remote-image",
                        status: "remote_only",
                        source: "remote_url",
                        remoteUrl,
                    },
                },
            ],
            referenceOptimization: { total: 0, optimized: 0 },
        });
        mocks.downloadImageBlob.mockRejectedValue(new ImageGenerationError("远程图片下载失败", { failureStage: "result_download", kind: "cors" }));
        const user = userEvent.setup();
        render(
            <App>
                <ImagePage />
            </App>,
        );

        await user.type(screen.getByPlaceholderText("描述画面主体、风格、构图、光线和用途"), "一张远程图片");
        await user.click(screen.getByRole("button", { name: "开始生成" }));
        expect(await screen.findByText("仅远程")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "打开原图" })).toHaveAttribute("href", remoteUrl);
        expect(screen.getByRole("link", { name: "打开原图" })).toHaveAttribute("target", "_blank");

        await user.click(screen.getByRole("button", { name: "保存到本地" }));

        expect((await screen.findAllByText("远程图片下载失败")).length).toBeGreaterThan(0);
        expect(screen.getByText("仅远程")).toBeInTheDocument();
        expect(screen.queryByText("生成失败")).not.toBeInTheDocument();
    });
});
