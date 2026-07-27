import { modelOptionName, resolveModelChannel, type AiConfig, type ChannelProvider } from "@/stores/use-config-store";
import { uploadImage } from "@/services/image-storage";
import type { CreationGeneratedImage } from "@/types/creation";
import type { ImageGenerationOutput, ImageReferenceOptimization, ReferenceImage } from "@/types/image";
import { ImageGenerationError, classifyImageGenerationError } from "./image-errors";
import { requestImageBatch } from "./image-batch";

export type ImageGenerationParameters = {
    count: 1;
    width?: number;
    height?: number;
    size: string;
    aspectRatio?: string;
    quality: string;
    background: string;
    referenceImageIds: string[];
    providerOverrides?: Record<string, unknown>;
};

export type AppliedImageGenerationParameters = {
    count: 1;
    size: string;
    aspectRatio?: string;
    quality?: string;
    background?: string;
    referenceImageIds: string[];
    providerFields?: Record<string, unknown>;
};

export type TextToImageRequest = {
    prompt: string;
    modelConfigId: string;
    promptVersionId: string;
    count?: 1;
    width?: number;
    height?: number;
    size?: string;
    aspectRatio?: string;
    quality?: string;
    background?: string;
    providerOverrides?: Record<string, unknown>;
};

export type ImageToImageRequest = TextToImageRequest & {
    referenceImage: ReferenceImage;
};

export type ImageGenerationResult = {
    image: CreationGeneratedImage;
    referenceOptimization: ImageReferenceOptimization;
};

export type ImageCandidateRequest = TextToImageRequest & {
    candidateId: string;
    referenceImage?: ReferenceImage;
};

export type ImageCandidateGenerationResult = { candidateId: string; status: "fulfilled"; value: ImageGenerationResult } | { candidateId: string; status: "rejected"; reason: ImageGenerationError };

export interface ImageGenerationGateway {
    generateTextToImage(request: TextToImageRequest, options?: { signal?: AbortSignal }): Promise<ImageGenerationResult>;
    generateImageToImage(request: ImageToImageRequest, options?: { signal?: AbortSignal }): Promise<ImageGenerationResult>;
    generateImageCandidates(requests: ImageCandidateRequest[], options?: { signal?: AbortSignal }): Promise<ImageCandidateGenerationResult[]>;
}

export function createImageGenerationGateway(baseConfig: AiConfig): ImageGenerationGateway {
    const generate = (request: TextToImageRequest, referenceImage: ReferenceImage | undefined, signal?: AbortSignal) => generateOne(baseConfig, request, referenceImage, signal);
    return {
        generateTextToImage: (request, options) => generate(request, undefined, options?.signal),
        generateImageToImage: ({ referenceImage, ...request }, options) => generate(request, referenceImage, options?.signal),
        generateImageCandidates: (requests, options) =>
            Promise.all(
                requests.map(async ({ candidateId, referenceImage, ...request }): Promise<ImageCandidateGenerationResult> => {
                    try {
                        return { candidateId, status: "fulfilled", value: await generate(request, referenceImage, options?.signal) };
                    } catch (error) {
                        return { candidateId, status: "rejected", reason: classifyImageGenerationError(error) };
                    }
                }),
            ),
    };
}

async function generateOne(baseConfig: AiConfig, request: TextToImageRequest, referenceImage?: ReferenceImage, signal?: AbortSignal): Promise<ImageGenerationResult> {
    const prompt = request.prompt.trim();
    const modelConfigId = request.modelConfigId.trim();
    const promptVersionId = request.promptVersionId.trim();
    if (!prompt) throw new ImageGenerationError("生图提示词不能为空", { failureStage: "request_prepare", kind: "unknown" });
    if (!modelConfigId) throw new ImageGenerationError("请选择生图模型", { failureStage: "request_prepare", kind: "unknown" });
    if (!promptVersionId) throw new ImageGenerationError("提示词版本 ID 不能为空", { failureStage: "request_prepare", kind: "unknown" });
    if (request.providerOverrides && Object.keys(request.providerOverrides).length) {
        throw new ImageGenerationError("当前生图适配器不支持 providerOverrides，请在模型调用脚本中配置供应商专用参数", { failureStage: "request_prepare", kind: "unknown" });
    }

    const size = resolveGatewaySize(request, baseConfig.size);
    const quality = request.quality ?? baseConfig.quality;
    const background = request.background ?? baseConfig.background;
    const channel = resolveModelChannel(baseConfig, modelConfigId);
    if ((channel.provider === "openrouter" || channel.provider === "seedream") && background.trim()) {
        throw new ImageGenerationError(`${channel.provider === "openrouter" ? "OpenRouter" : "Seedream"} 当前不支持背景参数，请关闭透明背景后重试`, { failureStage: "request_prepare", kind: "unknown" });
    }
    const requestConfig: AiConfig = {
        ...baseConfig,
        model: modelConfigId,
        imageModel: modelConfigId,
        count: "1",
        size,
        quality,
        background,
    };
    const parameters: ImageGenerationParameters = {
        count: 1,
        width: positiveInteger(request.width),
        height: positiveInteger(request.height),
        size,
        aspectRatio: request.aspectRatio?.trim() || undefined,
        quality,
        background,
        referenceImageIds: referenceImage ? [referenceImage.id] : [],
        providerOverrides: request.providerOverrides,
    };
    const batch = await requestImageBatch(requestConfig, prompt, referenceImage ? [referenceImage] : [], { signal });
    const settled = batch.results[0];
    if (!settled) throw new ImageGenerationError("接口没有返回图片", { failureStage: "response_parse", kind: "response_parse" });
    if (settled.status === "rejected") throw settled.reason;
    return {
        image: await persistGeneratedImage(settled.value, requestConfig, modelConfigId, promptVersionId, parameters),
        referenceOptimization: batch.referenceOptimization,
    };
}

async function persistGeneratedImage(output: ImageGenerationOutput, config: AiConfig, modelConfigId: string, promptVersionId: string, parameters: ImageGenerationParameters): Promise<CreationGeneratedImage> {
    const channel = resolveModelChannel(config, modelConfigId);
    const provenance = {
        providerId: channel.provider,
        modelId: modelOptionName(modelConfigId),
        modelConfigId,
        promptVersionId,
        createdAt: new Date().toISOString(),
    };
    const providerMetadata = {
        channelId: channel.id,
        provider: channel.provider,
        providerTaskId: output.providerTaskId,
        providerRequestId: output.providerRequestId,
        expiresAt: output.expiresAt,
        parameters,
        appliedParameters: appliedParameters(channel.provider, parameters),
    };
    const source = output.source === "data_url" ? output.dataUrl : output.remoteUrl;
    try {
        const stored = await uploadImage(source);
        return {
            id: output.id,
            url: stored.url,
            ...(output.source === "remote_url" ? { remoteUrl: output.remoteUrl } : {}),
            storageKey: stored.storageKey,
            width: stored.width,
            height: stored.height,
            bytes: stored.bytes,
            mimeType: stored.mimeType || output.mimeType || "image/png",
            ...provenance,
            metadata: providerMetadata,
        };
    } catch (error) {
        return {
            id: output.id,
            ...(output.source === "data_url" ? { dataUrl: output.dataUrl } : { url: output.remoteUrl, remoteUrl: output.remoteUrl }),
            mimeType: output.mimeType || "image/png",
            ...provenance,
            metadata: providerMetadata,
            persistenceError: error instanceof Error ? error.message : "图片未能保存到本地",
        };
    }
}

function appliedParameters(provider: ChannelProvider, parameters: ImageGenerationParameters): AppliedImageGenerationParameters {
    const normalizedQuality = parameters.quality.trim().toLowerCase();
    const quality = normalizedQuality && normalizedQuality !== "auto" ? parameters.quality : undefined;
    const openRouterImageSize = provider === "openrouter" ? ({ low: "1K", standard: "1K", "1k": "1K", medium: "2K", hd: "2K", "2k": "2K", high: "4K", "4k": "4K" } as Record<string, string>)[normalizedQuality] : undefined;
    return {
        count: 1,
        size: parameters.size,
        aspectRatio: parameters.aspectRatio,
        quality,
        ...(provider !== "openrouter" && provider !== "seedream" && parameters.background === "transparent" ? { background: parameters.background } : {}),
        referenceImageIds: parameters.referenceImageIds,
        ...(openRouterImageSize ? { providerFields: { image_size: openRouterImageSize } } : {}),
    };
}

function resolveGatewaySize(request: Pick<TextToImageRequest, "size" | "aspectRatio" | "width" | "height">, fallback: string) {
    const explicit = request.size?.trim();
    if (explicit) return explicit;
    const aspectRatio = request.aspectRatio?.trim();
    if (aspectRatio) return aspectRatio;
    const width = positiveInteger(request.width);
    const height = positiveInteger(request.height);
    return width && height ? reducedRatio(width, height) : fallback;
}

function positiveInteger(value: number | undefined) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function reducedRatio(width: number, height: number) {
    let a = width;
    let b = height;
    while (b) [a, b] = [b, a % b];
    return `${width / a}:${height / a}`;
}
