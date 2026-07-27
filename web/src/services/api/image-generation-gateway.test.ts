import { beforeEach, describe, expect, it, vi } from "vitest";

import { uploadImage } from "@/services/image-storage";
import { channelProviderPreset, defaultConfig, encodeChannelModel, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import type { ImageGenerationOutput, ReferenceImage } from "@/types/image";
import { requestImageBatch } from "./image-batch";
import { createImageGenerationGateway } from "./image-generation-gateway";

vi.mock("@/services/image-storage", () => ({ uploadImage: vi.fn() }));
vi.mock("./image-batch", () => ({ requestImageBatch: vi.fn() }));

const mockUploadImage = vi.mocked(uploadImage);
const mockRequestImageBatch = vi.mocked(requestImageBatch);
const MODEL_VALUE = encodeChannelModel("midway", "image-model");

function gatewayConfig(): AiConfig {
    const channel: ModelChannel = {
        id: "midway",
        name: "中转站",
        provider: "openai-compatible",
        baseUrl: "https://provider.test",
        apiKey: "secret-key",
        authType: "bearer",
        apiFormat: "openai",
        imageResponseFormat: "auto",
        imageBatchMode: "split",
        models: [{ name: "image-model", capabilities: ["image"] }],
    };
    return { ...defaultConfig, channels: [channel], models: [MODEL_VALUE], model: MODEL_VALUE, imageModel: MODEL_VALUE };
}

function generatedOutput(id = "output-1"): ImageGenerationOutput {
    return { id, status: "generated", source: "data_url", dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", providerRequestId: "provider-request" };
}

function batchResult(output: ImageGenerationOutput = generatedOutput()) {
    return { results: [{ status: "fulfilled" as const, value: output }], referenceOptimization: { total: 0, optimized: 0 } };
}

beforeEach(() => {
    mockUploadImage.mockReset();
    mockRequestImageBatch.mockReset();
    mockRequestImageBatch.mockResolvedValue(batchResult());
    mockUploadImage.mockResolvedValue({ url: "blob:stored", storageKey: "image:stored", width: 1080, height: 1440, bytes: 100, mimeType: "image/png" });
});

describe("image generation gateway", () => {
    it("provides explicit OpenRouter and Seedream channel presets", () => {
        expect(channelProviderPreset("openrouter")).toMatchObject({ baseUrl: "https://openrouter.ai/api/v1", imageBatchMode: "split" });
        expect(channelProviderPreset("seedream")).toMatchObject({ baseUrl: "https://ark.cn-beijing.volces.com/api/v3", apiFormat: "openai", imageBatchMode: "split" });
    });

    it("forces one image, selects the requested model, persists it and records provenance", async () => {
        const gateway = createImageGenerationGateway(gatewayConfig());

        const result = await gateway.generateTextToImage({ prompt: "知识卡背景", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-v1", width: 1080, height: 1440, quality: "high" });

        const [requestConfig, prompt, references] = mockRequestImageBatch.mock.calls[0];
        expect(requestConfig).toMatchObject({ model: MODEL_VALUE, imageModel: MODEL_VALUE, count: "1", size: "3:4", quality: "high" });
        expect(prompt).toBe("知识卡背景");
        expect(references).toEqual([]);
        expect(mockUploadImage).toHaveBeenCalledWith("data:image/png;base64,AA==");
        expect(result.image).toMatchObject({
            id: "output-1",
            url: "blob:stored",
            storageKey: "image:stored",
            providerId: "openai-compatible",
            modelId: "image-model",
            modelConfigId: MODEL_VALUE,
            promptVersionId: "prompt-v1",
            width: 1080,
            height: 1440,
            metadata: {
                channelId: "midway",
                providerRequestId: "provider-request",
                parameters: { count: 1, width: 1080, height: 1440, size: "3:4" },
                appliedParameters: { count: 1, size: "3:4", quality: "high", referenceImageIds: [] },
            },
        });
        expect(result.image.metadata).not.toHaveProperty("apiKey");
    });

    it("records the OpenRouter image size that was actually applied", async () => {
        const config = gatewayConfig();
        config.channels = config.channels.map((channel) => ({ ...channel, provider: "openrouter" as const }));

        const result = await createImageGenerationGateway(config).generateTextToImage({ prompt: "知识卡背景", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-openrouter", size: "3:4", quality: "high" });

        expect(result.image.metadata).toMatchObject({
            parameters: { size: "3:4", quality: "high", background: "" },
            appliedParameters: { count: 1, size: "3:4", quality: "high", referenceImageIds: [], providerFields: { image_size: "4K" } },
        });
        expect(result.image.metadata?.appliedParameters as Record<string, unknown>).not.toHaveProperty("background");
    });

    it("passes one reference image and the abort signal through the existing batch service", async () => {
        const gateway = createImageGenerationGateway(gatewayConfig());
        const reference: ReferenceImage = { id: "ref-1", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" };
        const signal = new AbortController().signal;

        await gateway.generateImageToImage({ prompt: "继续生成", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-v2", referenceImage: reference }, { signal });

        expect(mockRequestImageBatch).toHaveBeenCalledWith(expect.objectContaining({ count: "1" }), "继续生成", [reference], { signal });
    });

    it("keeps a successful remote result when local persistence fails", async () => {
        const remote: ImageGenerationOutput = { id: "remote-1", status: "remote_only", source: "remote_url", remoteUrl: "https://cdn.test/image.png", mimeType: "image/png" };
        mockRequestImageBatch.mockResolvedValueOnce(batchResult(remote));
        mockUploadImage.mockRejectedValueOnce(new Error("CORS blocked"));

        const result = await createImageGenerationGateway(gatewayConfig()).generateTextToImage({ prompt: "远程图片", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-v3" });

        expect(result.image).toMatchObject({ id: "remote-1", url: remote.remoteUrl, remoteUrl: remote.remoteUrl, persistenceError: "CORS blocked" });
    });

    it("keeps Base64 data visible when IndexedDB persistence fails", async () => {
        mockUploadImage.mockRejectedValueOnce(new Error("IndexedDB full"));

        const result = await createImageGenerationGateway(gatewayConfig()).generateTextToImage({ prompt: "本地图片", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-local" });

        expect(result.image).toMatchObject({ id: "output-1", dataUrl: "data:image/png;base64,AA==", persistenceError: "IndexedDB full" });
    });

    it("rejects unsupported provider overrides instead of silently ignoring them", async () => {
        const gateway = createImageGenerationGateway(gatewayConfig());

        await expect(gateway.generateTextToImage({ prompt: "override", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-v4", providerOverrides: { custom_size: "large" } })).rejects.toMatchObject({
            failureStage: "request_prepare",
            message: expect.stringContaining("providerOverrides"),
        });
        expect(mockRequestImageBatch).not.toHaveBeenCalled();
    });

    it.each(["openrouter", "seedream"] as const)("rejects an unsupported %s background before sending the request", async (provider) => {
        const config = gatewayConfig();
        config.channels = config.channels.map((channel) => ({ ...channel, provider }));
        const gateway = createImageGenerationGateway(config);

        await expect(gateway.generateTextToImage({ prompt: "transparent", modelConfigId: MODEL_VALUE, promptVersionId: `prompt-${provider}`, background: "transparent" })).rejects.toMatchObject({
            failureStage: "request_prepare",
            message: expect.stringContaining("不支持背景参数"),
        });
        expect(mockRequestImageBatch).not.toHaveBeenCalled();
    });

    it("preserves fulfilled candidates when another candidate fails", async () => {
        mockRequestImageBatch.mockResolvedValueOnce(batchResult(generatedOutput("ok"))).mockResolvedValueOnce({ results: [{ status: "rejected", reason: new Error("provider failed") }], referenceOptimization: { total: 0, optimized: 0 } });
        const gateway = createImageGenerationGateway(gatewayConfig());

        const results = await gateway.generateImageCandidates([
            { candidateId: "candidate-1", prompt: "first", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-v1" },
            { candidateId: "candidate-2", prompt: "second", modelConfigId: MODEL_VALUE, promptVersionId: "prompt-v2" },
        ]);

        expect(results[0]).toMatchObject({ candidateId: "candidate-1", status: "fulfilled", value: { image: { id: "ok" } } });
        expect(results[1]).toMatchObject({ candidateId: "candidate-2", status: "rejected", reason: { message: "provider failed" } });
        expect(mockRequestImageBatch.mock.calls.every(([config]) => config.count === "1")).toBe(true);
    });
});
