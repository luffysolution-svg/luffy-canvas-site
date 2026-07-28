import axios from "axios";

import { assertModelChannelAvailable, buildApiUrl, resolveModelChannel, resolveModelRequestConfig, resolveModelScript, type AiConfig, type ModelChannel } from "@/stores/use-config-store";
import { normalizePluginImages, runModelPlugin } from "./model-plugin";
import { nanoid } from "nanoid";
import { getDataUrlByteSize } from "@/lib/image-utils";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
import { imageToDataUrl, imageToFile } from "@/services/image-storage";
import type { ImageGenerationOutput, ImageProviderMetadata, ReferenceImage } from "@/types/image";
import { qwenApiUrl, qwenCompatibleApiUrl } from "./provider-urls";
import { classifyImageGenerationError, ImageGenerationError, retryImageRequest } from "./image-errors";

export { IMAGE_REQUEST_UNKNOWN_MESSAGE, ImageRequestUnknownError } from "./image-errors";

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type ResponseToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    thoughtSignature?: string;
};

type ResponseInputMessage = AiTextMessage | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string } | { role: "tool"; tool_call_id: string; content: string };

type ResponseFunctionTool = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
        strict?: boolean;
    };
};

type ToolResponseResult = {
    content: string;
    toolCalls: ResponseToolCall[];
};

type ToolChoice = "auto" | "required" | { type: "function"; name: string };
type ResponseMessageContent = AiTextMessage["content"] | string;
type ResponseInputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
type ResponseInputItem = { role: "system" | "user" | "assistant"; content: string | ResponseInputContent[] } | { type: "function_call"; call_id: string; name: string; arguments: string } | { type: "function_call_output"; call_id: string; output: string };
type ResponseApiToolDefinition = {
    type: "function";
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
};
type ResponseApiOutputItem = { type?: "message"; content?: Array<{ type?: string; text?: string }> } | { type?: "function_call"; id?: string; call_id?: string; name?: string; arguments?: string };
type ResponseApiPayload = {
    id?: string;
    output?: ResponseApiOutputItem[];
    output_text?: string;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type ResponseStreamState = { buffer: string; text: string; payload?: ResponseApiPayload; error?: string };

type ImageApiResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string };
    code?: number;
    msg?: string;
    id?: string;
    task_id?: string;
    taskId?: string;
    request_id?: string;
    requestId?: string;
    expires_at?: number | string;
    expiresAt?: number | string;
};
type QwenImagePayload = {
    output?: {
        choices?: Array<{ message?: { content?: Array<{ image?: string }> } }>;
        results?: Array<{ url?: string }>;
        task_id?: string;
    };
    code?: string;
    message?: string;
    request_id?: string;
};
type GeminiPart = {
    text?: string;
    inlineData?: { mimeType?: string; data?: string };
    inline_data?: { mime_type?: string; mimeType?: string; data?: string };
    fileData?: { mimeType?: string; fileUri?: string };
    functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
    functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
    thoughtSignature?: string;
    thought_signature?: string;
};
type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };
type GeminiPayload = {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    models?: Array<{ name?: string }>;
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
};
type GeminiStreamState = { buffer: string; text: string; toolCalls: ResponseToolCall[]; error?: string };
export type RequestOptions = { signal?: AbortSignal };
export type ImageRequestMappingKind = "exact" | "same-ratio" | "closest-ratio" | "scaled" | "unverified";
export type ImageRequestParameters = {
    requestedSize: string;
    requestedAspectRatio?: string;
    resolvedSize?: string;
    resolvedAspectRatio?: string;
    mappingKind: ImageRequestMappingKind;
    warnings: string[];
    requiresConfirmation: boolean;
};

const QUALITY_BASE: Record<string, number> = {
    low: 1024,
    medium: 2048,
    high: 2880,
    standard: 1024,
    hd: 2048,
};
const QUALITY_ALIASES: Record<string, string> = {
    "1k": "low",
    "2k": "medium",
    "4k": "high",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";

const GEMINI_FLASH_IMAGE_RATIOS = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];
const GEMINI_PRO_IMAGE_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const GEMINI_IMAGE_SIZE_BY_QUALITY: Record<string, string> = { low: "1K", medium: "2K", high: "4K", standard: "1K", hd: "2K" };
const GEMINI_IMAGE_SIZE_PIXELS: Record<string, number> = { "512": 512, "1K": 1024, "2K": 2048, "4K": 4096 };

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    const normalized = QUALITY_ALIASES[value] || value;
    return QUALITY_BASE[normalized] ? normalized : undefined;
}

/** Only "transparent" is forwarded; any other value (incl. empty) means keep the default opaque background. */
function normalizeBackground(background: string | undefined) {
    return background?.trim().toLowerCase() === "transparent" ? "transparent" : undefined;
}

/** Map "quality + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(quality: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const basePixels = quality ? QUALITY_BASE[quality] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.round(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseRatioValue(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    return { width: w, height: h };
}

function parseImageRatio(value: string) {
    const ratio = parseRatioValue(value);
    if (Math.max(ratio.width, ratio.height) / Math.min(ratio.width, ratio.height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    return ratio;
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("图像尺寸必须是正整数，例如 1024x1024");
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error("图像尺寸最长边不能超过 3840px，请调整尺寸");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error("图像总像素需在 655360 到 8294400 之间，请调整尺寸");
}

function resolveRequestSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(quality, value);
    throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
}

function isQwenImage2Model(model: string) {
    return model.toLowerCase().includes("qwen-image-2.0");
}

function isQwenCappedEditModel(model: string) {
    const value = model.toLowerCase();
    return value.includes("qwen-image-edit-max") || value.includes("qwen-image-edit-plus");
}

function isLegacyQwenEditModel(model: string) {
    const value = model.toLowerCase();
    return (value === "qwen-image-edit" || value.startsWith("qwen-image-edit-")) && !isQwenCappedEditModel(value);
}

function usesQwenFixedSizes(model: string) {
    const value = model.toLowerCase();
    return !isQwenImage2Model(value) && !value.includes("edit") && ["qwen-image-max", "qwen-image-plus", "qwen-image"].some((name) => value === name || value.startsWith(`${name}-`));
}

function resolveQwenRequestSize(model: string, quality: string | undefined, size: string) {
    const isQwenImage2 = isQwenImage2Model(model);
    const capsEdgesAt2K = isQwenCappedEditModel(model);
    const resolved = isQwenImage2 ? resolveQwenImage2Size(quality === "high" ? "medium" : quality, size) : capsEdgesAt2K ? resolveQwenEditSize(quality === "high" ? "medium" : quality, size) : resolveRequestSize(quality, size);
    const dimensions = resolved ? parseImageDimensions(resolved) : null;
    if (usesQwenFixedSizes(model) && dimensions) {
        const ratio = dimensions.width / dimensions.height;
        const sizes = [
            { ratio: 16 / 9, value: "1664x928" },
            { ratio: 4 / 3, value: "1472x1104" },
            { ratio: 1, value: "1328x1328" },
            { ratio: 3 / 4, value: "1104x1472" },
            { ratio: 9 / 16, value: "928x1664" },
        ];
        return sizes.reduce((best, current) => (Math.abs(current.ratio - ratio) < Math.abs(best.ratio - ratio) ? current : best), sizes[0]).value;
    }
    return resolved;
}

function resolveQwenEditSize(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const explicit = parseImageDimensions(value);
    if (explicit) {
        assertQwenEditSize(explicit.width, explicit.height);
        return `${explicit.width}x${explicit.height}`;
    }
    if (!value.includes(":")) throw new Error("Qwen 图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    const ratio = parseRatioValue(value);
    const aspect = ratio.width / ratio.height;
    const targetPixels = (quality ? QUALITY_BASE[quality] : QUALITY_BASE.low) ** 2;
    let width = Math.sqrt(targetPixels * aspect);
    let height = width / aspect;
    const scale = Math.min(1, 2048 / width, 2048 / height);
    width = Math.max(512, Math.min(2048, Math.round((width * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP));
    height = Math.max(512, Math.min(2048, Math.round((height * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP));
    assertQwenEditSize(width, height);
    return `${width}x${height}`;
}

function resolveQwenImage2Size(quality: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const explicit = parseImageDimensions(value);
    let dimensions = explicit;
    if (!dimensions && value.includes(":")) {
        const ratio = parseRatioValue(value);
        const targetPixels = (quality ? QUALITY_BASE[quality] : QUALITY_BASE.medium) ** 2;
        const scale = Math.sqrt(targetPixels / (ratio.width * ratio.height));
        dimensions = {
            width: Math.max(IMAGE_SIZE_STEP, Math.round((ratio.width * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP),
            height: Math.max(IMAGE_SIZE_STEP, Math.round((ratio.height * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP),
        };
    }
    if (!dimensions) throw new Error("Qwen 图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) throw new Error("Qwen 图像尺寸必须是正整数，例如 512x512");
    const pixels = dimensions.width * dimensions.height;
    if (explicit) {
        assertQwenImagePixelRange(dimensions.width, dimensions.height, "Qwen-Image 2.0");
        return `${dimensions.width}x${dimensions.height}`;
    }
    const minPixels = 512 * 512;
    const maxPixels = 2048 * 2048;
    if (pixels < minPixels) throw new Error("Qwen-Image 2.0 图像总像素不能低于 512×512");
    if (pixels <= maxPixels) return `${dimensions.width}x${dimensions.height}`;
    const scale = Math.sqrt(maxPixels / pixels);
    const width = Math.max(IMAGE_SIZE_STEP, Math.floor((dimensions.width * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP);
    const height = Math.max(IMAGE_SIZE_STEP, Math.floor((dimensions.height * scale) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP);
    return `${width}x${height}`;
}

function assertQwenImagePixelRange(width: number, height: number, modelLabel: string) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(`${modelLabel} 图像尺寸必须是正整数，例如 512x512`);
    const pixels = width * height;
    if (pixels < 512 * 512 || pixels > 2048 * 2048) throw new Error(`${modelLabel} 图像总像素需在 512×512 到 2048×2048 之间`);
}

function assertQwenEditSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 512 || width > 2048 || height < 512 || height > 2048) throw new Error("Qwen-Image Edit Max / Plus 的宽和高需分别在 512 到 2048 之间");
}

function buildGeminiImageConfig(parameters: ImageRequestParameters) {
    const image = { ...(parameters.resolvedAspectRatio ? { aspectRatio: parameters.resolvedAspectRatio } : {}), ...(parameters.resolvedSize ? { imageSize: parameters.resolvedSize } : {}) };
    return Object.keys(image).length ? { responseFormat: { image } } : {};
}

function geminiImageCapabilities(model: string) {
    const value = model.trim().toLowerCase();
    if (value.includes("gemini-3.1-flash-lite-image")) return { ratios: GEMINI_FLASH_IMAGE_RATIOS, sizes: ["512", "1K"] };
    if (value.includes("gemini-3.1-flash-image")) return { ratios: GEMINI_FLASH_IMAGE_RATIOS, sizes: ["512", "1K", "2K", "4K"] };
    if (value.includes("gemini-3-pro-image")) return { ratios: GEMINI_PRO_IMAGE_RATIOS, sizes: ["1K", "2K", "4K"] };
    return { ratios: GEMINI_PRO_IMAGE_RATIOS, sizes: [] as string[] };
}

function closestGeminiAspectRatio(value: string, supportedRatios: string[]) {
    const ratio = parseRatioValue(value);
    const target = ratio.width / ratio.height;
    return supportedRatios.reduce((best, item) => {
        const current = parseRatioValue(item);
        const bestRatio = parseRatioValue(best);
        return Math.abs(current.width / current.height - target) < Math.abs(bestRatio.width / bestRatio.height - target) ? item : best;
    });
}

function resolveGeminiImageSize(quality: string, dimensions: { width: number; height: number } | null, supportedSizes: string[], requestedSize: string) {
    if (!supportedSizes.length) return undefined;
    const normalizedQuality = normalizeQuality(quality);
    const nativeSize = Object.keys(GEMINI_IMAGE_SIZE_PIXELS).find((size) => size.toLowerCase() === requestedSize.trim().toLowerCase());
    let requested = nativeSize || (normalizedQuality ? GEMINI_IMAGE_SIZE_BY_QUALITY[normalizedQuality] : undefined);
    if (!requested && dimensions) {
        const edge = Math.max(dimensions.width, dimensions.height);
        requested = edge <= 768 ? "512" : edge <= 1536 ? "1K" : edge <= 3072 ? "2K" : "4K";
    }
    if (!requested) return undefined;
    const requestedPixels = GEMINI_IMAGE_SIZE_PIXELS[requested];
    return supportedSizes.reduce((best, item) => (Math.abs(GEMINI_IMAGE_SIZE_PIXELS[item] - requestedPixels) < Math.abs(GEMINI_IMAGE_SIZE_PIXELS[best] - requestedPixels) ? item : best));
}

export function resolveImageRequestParameters(config: AiConfig, requestedSize = config.size): ImageRequestParameters {
    const selectedModel = config.model || config.imageModel;
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const value = requestedSize.trim() || "auto";
    const requestedAspectRatio = aspectRatioFromRequestSize(value) || config.imageAspectRatio;
    const quality = normalizeQuality(config.quality);

    if (requestConfig.apiFormat === "gemini") return resolveGeminiRequestParameters(requestConfig, value, requestedAspectRatio);
    if (requestConfig.apiFormat === "qwen") return resolveQwenRequestParameters(requestConfig.model, quality, value, requestedAspectRatio);
    const channel = resolveModelChannel(config, selectedModel);
    const fixedOpenAiSizes = channel.provider === "openai" ? openAiFixedImageSizes(requestConfig.model) : null;
    if (fixedOpenAiSizes) return resolveFixedOpenAiRequestParameters(value, requestedAspectRatio, fixedOpenAiSizes);

    const resolvedSize = resolveRequestSize(quality, value);
    const resolvedAspectRatio = aspectRatioFromResolvedSize(resolvedSize);
    const knownFlexibleOpenAiModel = requestConfig.model.toLowerCase().includes("gpt-image-2");
    const unverified = Boolean(resolveModelScript(config, selectedModel, "image")) || channel.provider !== "openai" || !knownFlexibleOpenAiModel;
    const resolvedMappingKind = classifySizeMapping(value, requestedAspectRatio, resolvedSize, resolvedAspectRatio);
    const mappingKind = unverified ? "unverified" : resolvedMappingKind;
    const warnings = mappingWarnings(value, requestedAspectRatio, resolvedSize, resolvedAspectRatio, resolvedMappingKind);
    if (unverified) {
        warnings.push(channel.provider === "openai" ? "当前 OpenAI 图片型号未声明可验证的灵活尺寸能力，尺寸会按解析结果传递，请在生成前确认。" : "当前为 OpenAI 兼容或自定义调用，尺寸会按解析结果原样传递，但端点是否支持无法预先验证。");
    }
    return imageRequestParameters(value, requestedAspectRatio, resolvedSize, resolvedAspectRatio, mappingKind, warnings);
}

function openAiFixedImageSizes(model: string) {
    const value = model.toLowerCase();
    if (value.includes("dall-e-2")) return ["1024x1024"];
    if (value.includes("gpt-image-1") || value.includes("chatgpt-image-latest") || value.includes("dall-e-3")) return ["1024x1024", "1024x1536", "1536x1024"];
    return null;
}

function resolveFixedOpenAiRequestParameters(requestedSize: string, requestedAspectRatio: string | undefined, sizes: string[]): ImageRequestParameters {
    if (requestedSize.toLowerCase() === "auto") return imageRequestParameters(requestedSize, undefined, undefined, undefined, "exact", []);
    const targetRatio = requestedAspectRatio ? ratioNumber(requestedAspectRatio) : 1;
    const resolvedSize = sizes.reduce((best, current) => {
        const bestRatio = ratioNumber(aspectRatioFromResolvedSize(best) || "1:1");
        const currentRatio = ratioNumber(aspectRatioFromResolvedSize(current) || "1:1");
        return Math.abs(currentRatio - targetRatio) < Math.abs(bestRatio - targetRatio) ? current : best;
    });
    const resolvedAspectRatio = aspectRatioFromResolvedSize(resolvedSize);
    const mappingKind: ImageRequestMappingKind = requestedSize === resolvedSize ? "exact" : requestedAspectRatio && resolvedAspectRatio && aspectRatiosEqual(requestedAspectRatio, resolvedAspectRatio) ? "scaled" : "closest-ratio";
    const warnings = mappingWarnings(requestedSize, requestedAspectRatio, resolvedSize, resolvedAspectRatio, mappingKind);
    warnings.push(`当前 OpenAI 模型使用固定尺寸档位，实际请求为 ${resolvedSize}。`);
    return imageRequestParameters(requestedSize, requestedAspectRatio, resolvedSize, resolvedAspectRatio, mappingKind, warnings);
}

function ratioNumber(value: string) {
    const ratio = parseRatioValue(value);
    return ratio.width / ratio.height;
}

function resolveGeminiRequestParameters(config: AiConfig, requestedSize: string, requestedAspectRatio?: string): ImageRequestParameters {
    const dimensions = parseImageDimensions(requestedSize);
    const capabilities = geminiImageCapabilities(config.model);
    const resolvedAspectRatio = requestedAspectRatio ? closestGeminiAspectRatio(dimensions ? `${dimensions.width}:${dimensions.height}` : requestedAspectRatio, capabilities.ratios) : undefined;
    const resolvedSize = resolveGeminiImageSize(config.quality, dimensions, capabilities.sizes, requestedSize);
    let mappingKind: ImageRequestMappingKind = "exact";
    if (requestedAspectRatio && resolvedAspectRatio && !aspectRatiosEqual(requestedAspectRatio, resolvedAspectRatio)) mappingKind = "closest-ratio";
    else if (dimensions && !resolvedSize) mappingKind = "unverified";
    else if (dimensions) mappingKind = "scaled";

    const warnings = mappingWarnings(requestedSize, requestedAspectRatio, resolvedSize, resolvedAspectRatio, mappingKind);
    if (mappingKind === "scaled") warnings.push(`Gemini 不接收精确像素尺寸，实际请求使用 ${resolvedSize || "模型默认尺寸"} 与 ${resolvedAspectRatio || "模型默认比例"}。`);
    if (mappingKind === "unverified") warnings.push("当前 Gemini 模型没有已知的图像尺寸档位，精确像素将由模型决定。");
    return imageRequestParameters(requestedSize, requestedAspectRatio, resolvedSize, resolvedAspectRatio, mappingKind, warnings);
}

function resolveQwenRequestParameters(model: string, quality: string | undefined, requestedSize: string, requestedAspectRatio?: string): ImageRequestParameters {
    if (isLegacyQwenEditModel(model) && requestedSize.toLowerCase() !== "auto") {
        return imageRequestParameters(requestedSize, requestedAspectRatio, undefined, undefined, "unverified", ["旧版 Qwen 图片编辑接口不接收尺寸参数，实际尺寸将由模型决定。"]);
    }

    const resolvedSize = resolveQwenRequestSize(model, quality, requestedSize);
    const resolvedAspectRatio = aspectRatioFromResolvedSize(resolvedSize);
    const mappingKind = classifySizeMapping(requestedSize, requestedAspectRatio, resolvedSize, resolvedAspectRatio);
    const warnings = mappingWarnings(requestedSize, requestedAspectRatio, resolvedSize, resolvedAspectRatio, mappingKind);
    if (usesQwenFixedSizes(model) && requestedSize.toLowerCase() !== "auto" && resolvedSize !== requestedSize) warnings.push(`当前 Qwen 模型仅支持固定尺寸，实际请求使用 ${resolvedSize}。`);
    if (quality === "high" && (isQwenImage2Model(model) || isQwenCappedEditModel(model))) warnings.push("当前 Qwen 模型按 2K 上限解析尺寸，高质量设置不会扩大到 4K。");
    return imageRequestParameters(requestedSize, requestedAspectRatio, resolvedSize, resolvedAspectRatio, mappingKind, warnings);
}

function imageRequestParameters(requestedSize: string, requestedAspectRatio: string | undefined, resolvedSize: string | undefined, resolvedAspectRatio: string | undefined, mappingKind: ImageRequestMappingKind, warnings: string[]): ImageRequestParameters {
    return {
        requestedSize,
        requestedAspectRatio,
        resolvedSize,
        resolvedAspectRatio,
        mappingKind,
        warnings: Array.from(new Set(warnings)),
        requiresConfirmation: mappingKind === "closest-ratio" || mappingKind === "scaled" || mappingKind === "unverified",
    };
}

function classifySizeMapping(requestedSize: string, requestedAspectRatio?: string, resolvedSize?: string, resolvedAspectRatio?: string): ImageRequestMappingKind {
    if (requestedSize.toLowerCase() === "auto" || (!resolvedSize && !requestedAspectRatio)) return "exact";
    if (requestedSize === resolvedSize && (!requestedAspectRatio || !resolvedAspectRatio || aspectRatiosEqual(requestedAspectRatio, resolvedAspectRatio))) return "exact";
    if (requestedAspectRatio && resolvedAspectRatio && !aspectRatiosClose(requestedAspectRatio, resolvedAspectRatio)) return "closest-ratio";
    if (parseImageDimensions(requestedSize) && requestedSize !== resolvedSize) return "scaled";
    return resolvedSize ? "same-ratio" : "unverified";
}

function mappingWarnings(requestedSize: string, requestedAspectRatio: string | undefined, resolvedSize: string | undefined, resolvedAspectRatio: string | undefined, mappingKind: ImageRequestMappingKind) {
    const warnings: string[] = [];
    if (mappingKind === "closest-ratio") warnings.push(`请求比例 ${requestedAspectRatio || requestedSize} 已映射为最接近的 ${resolvedAspectRatio || "模型默认比例"}${resolvedSize ? `（${resolvedSize}）` : ""}。`);
    if (mappingKind === "scaled") warnings.push(`请求尺寸 ${requestedSize} 已映射为 ${resolvedSize || "模型默认尺寸"}。`);
    if (mappingKind === "same-ratio" && requestedAspectRatio && resolvedAspectRatio && !aspectRatiosEqual(requestedAspectRatio, resolvedAspectRatio)) {
        warnings.push(`请求比例 ${requestedAspectRatio} 因模型尺寸或像素对齐实际解析为 ${resolvedAspectRatio}${resolvedSize ? `（${resolvedSize}）` : ""}。`);
    }
    return warnings;
}

function aspectRatioFromRequestSize(value: string) {
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions && dimensions.width > 0 && dimensions.height > 0) return reducedAspectRatio(dimensions.width, dimensions.height);
    if (!value.includes(":")) return undefined;
    const ratio = parseRatioValue(value);
    return `${formatRatioPart(ratio.width)}:${formatRatioPart(ratio.height)}`;
}

function aspectRatioFromResolvedSize(value?: string) {
    const dimensions = value ? parseImageDimensions(value) : null;
    return dimensions && dimensions.width > 0 && dimensions.height > 0 ? reducedAspectRatio(dimensions.width, dimensions.height) : undefined;
}

function reducedAspectRatio(width: number, height: number) {
    const divisor = greatestCommonDivisor(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number) {
    let a = Math.abs(Math.round(left));
    let b = Math.abs(Math.round(right));
    while (b) [a, b] = [b, a % b];
    return a || 1;
}

function formatRatioPart(value: number) {
    return Number(value.toFixed(6)).toString();
}

function aspectRatiosEqual(left: string, right: string) {
    return aspectRatioDifference(left, right) < 1e-8;
}

function aspectRatiosClose(left: string, right: string) {
    return aspectRatioDifference(left, right) <= 0.01;
}

function aspectRatioDifference(left: string, right: string) {
    const leftRatio = parseRatioValue(left);
    const rightRatio = parseRatioValue(right);
    const expected = leftRatio.width / leftRatio.height;
    const actual = rightRatio.width / rightRatio.height;
    return Math.abs(actual - expected) / expected;
}

function resolveImageOutput(item: Record<string, unknown>, metadata: ImageProviderMetadata): ImageGenerationOutput | null {
    const itemMetadata = {
        expiresAt: readExpiry(item.expires_at ?? item.expiresAt) ?? metadata.expiresAt,
        providerTaskId: stringField(item.task_id ?? item.taskId) || metadata.providerTaskId,
        providerRequestId: stringField(item.request_id ?? item.requestId) || metadata.providerRequestId,
    };
    const mimeType = stringField(item.mime_type ?? item.mimeType) || undefined;
    if (typeof item.url === "string" && item.url) {
        return { id: nanoid(), status: "remote_only", source: "remote_url", remoteUrl: item.url, mimeType, ...itemMetadata };
    }
    if (typeof item.b64_json === "string" && item.b64_json) {
        const dataUrl = item.b64_json.startsWith("data:") ? item.b64_json : `data:${mimeType || "image/png"};base64,${item.b64_json}`;
        return { id: nanoid(), status: "generated", source: "data_url", dataUrl, mimeType: mimeType || dataUrl.match(/^data:([^;,]+)/)?.[1], ...itemMetadata };
    }
    if (typeof item.dataUrl === "string" && item.dataUrl) {
        return imageOutputFromString(item.dataUrl, itemMetadata);
    }
    return null;
}

function parseImagePayload(payload: ImageApiResponse, headers?: unknown) {
    if (typeof payload.code === "number" && payload.code !== 0) {
        throw new Error(payload.msg || "请求失败");
    }
    const metadata = responseProviderMetadata(payload, headers);
    const images = payload.data?.map((item) => resolveImageOutput(item, metadata)).filter((value): value is ImageGenerationOutput => Boolean(value)) || [];

    if (images.length === 0) {
        throw new ImageGenerationError("接口没有返回图片", { failureStage: "response_parse", kind: "response_parse" });
    }

    return images;
}

function imageOutputFromString(value: string, metadata: ImageProviderMetadata = {}): ImageGenerationOutput {
    if (/^https?:\/\//i.test(value)) return { id: nanoid(), status: "remote_only", source: "remote_url", remoteUrl: value, ...metadata };
    const dataUrl = value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
    return { id: nanoid(), status: "generated", source: "data_url", dataUrl, mimeType: dataUrl.match(/^data:([^;,]+)/)?.[1], ...metadata };
}

function pluginImageOutput(image: ReturnType<typeof normalizePluginImages>[number]): ImageGenerationOutput {
    const output = imageOutputFromString(image.value, {
        expiresAt: readExpiry(image.expiresAt),
        providerTaskId: image.providerTaskId,
        providerRequestId: image.providerRequestId,
    });
    return image.mimeType ? { ...output, mimeType: image.mimeType } : output;
}

function responseProviderMetadata(payload: ImageApiResponse, headers?: unknown): ImageProviderMetadata {
    return {
        expiresAt: readExpiry(payload.expires_at ?? payload.expiresAt),
        providerTaskId: stringField(payload.task_id ?? payload.taskId ?? payload.id) || undefined,
        providerRequestId: stringField(payload.request_id ?? payload.requestId) || readHeader(headers, "x-request-id") || readHeader(headers, "request-id") || undefined,
    };
}

function stringField(value: unknown) {
    return typeof value === "string" && value ? value : "";
}

function readExpiry(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value;
    if (typeof value !== "string" || !value) return undefined;
    const number = Number(value);
    if (Number.isFinite(number)) return number < 10_000_000_000 ? number * 1000 : number;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : undefined;
}

function readHeader(headers: unknown, name: string) {
    if (!headers || typeof headers !== "object") return "";
    const getter = (headers as { get?: (key: string) => unknown }).get;
    if (typeof getter === "function") return stringField(getter.call(headers, name));
    const record = headers as Record<string, unknown>;
    return stringField(record[name] ?? record[name.toLowerCase()]);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        const responseData = error.response?.data;
        if (!error.response) return "无法连接接口，请检查 Base URL、网络连接，以及服务是否允许浏览器跨域（CORS）请求";
        return responseData?.msg || responseData?.message || responseData?.error?.message || readStatusError(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return "无法连接接口，请检查 Base URL、网络连接，以及服务是否允许浏览器跨域（CORS）请求";
    return error instanceof Error ? error.message : fallback;
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}：${status}` : fallback;
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(config: AiConfig, path: string) {
    if (config.apiFormat === "qwen") return qwenCompatibleApiUrl(config.baseUrl, path);
    return buildApiUrl(config.baseUrl, path);
}

function requestedImageResponseFormat(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    if (channel.apiFormat === "gemini" || channel.apiFormat === "qwen") return undefined;
    if (channel.imageResponseFormat !== "auto") return channel.imageResponseFormat;
    return "b64_json";
}

function aiHeaders(config: Pick<AiConfig, "apiKey" | "authType">, contentType?: string) {
    return {
        ...(config.authType === "none" ? {} : { Authorization: `Bearer ${config.apiKey}` }),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function geminiBaseUrl(config: Pick<AiConfig, "baseUrl">) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    return lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
}

function geminiModelName(model: string) {
    return model.trim().replace(/^models\//, "");
}

function geminiApiUrl(config: Pick<AiConfig, "baseUrl" | "model">, action?: "generateContent" | "streamGenerateContent") {
    const baseUrl = geminiBaseUrl(config);
    if (!action) return `${baseUrl}/models`;
    return `${baseUrl}/models/${encodeURIComponent(geminiModelName(config.model))}:${action}`;
}

function geminiHeaders(config: Pick<AiConfig, "apiKey" | "authType">) {
    return {
        ...(config.authType === "none" ? {} : { "x-goog-api-key": config.apiKey }),
        "Content-Type": "application/json",
    };
}

function withSystemMessage<T extends ResponseInputMessage>(config: AiConfig, messages: T[]): ResponseInputMessage[] {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

function toResponseInput(messages: ResponseInputMessage[]): ResponseInputItem[] {
    return messages.flatMap((message): ResponseInputItem[] => {
        if ("type" in message) return [message];
        if (message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
        return [{ role: message.role, content: toResponseContent(message.content || "") }];
    });
}

function toResponseContent(content: ResponseMessageContent): string | ResponseInputContent[] {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? { type: "input_text" as const, text: item.text } : { type: "input_image" as const, image_url: item.image_url.url }));
}

function toResponseTool(tool: ResponseFunctionTool): ResponseApiToolDefinition {
    return {
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict,
    };
}

function parseToolResponse(payload: ResponseApiPayload): ToolResponseResult {
    const output = payload.output || [];
    const content =
        payload.output_text ||
        output
            .flatMap((item) => (item.type === "message" ? item.content || [] : []))
            .map((item) => item.text || "")
            .join("");
    const toolCalls = output
        .filter((item): item is Extract<ResponseApiOutputItem, { type?: "function_call" }> => item.type === "function_call")
        .map((item) => ({
            id: item.call_id || item.id || "",
            type: "function" as const,
            function: { name: item.name || "", arguments: item.arguments || "{}" },
        }))
        .filter((item) => item.id && item.function.name);
    return { content, toolCalls };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function responseErrorMessage(value: unknown) {
    if (!isRecord(value)) return "";
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    return stringValue(value.msg) || stringValue(error?.message) || stringValue(responseError?.message);
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function validateResponsePayload(payload: ResponseApiPayload) {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "请求失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function validateGeminiPayload(payload: GeminiPayload) {
    if (payload.error?.message) throw new Error(payload.error.message);
    if (payload.promptFeedback?.blockReason) throw new Error(`Gemini 拒绝了本次请求：${payload.promptFeedback.blockReason}`);
}

async function readFetchError(response: Response, fallback: string) {
    const text = await response.text();
    if (!text) return readStatusError(response.status, fallback);
    try {
        return responseErrorMessage(JSON.parse(text)) || readStatusError(response.status, fallback);
    } catch {
        return text.slice(0, 300) || readStatusError(response.status, fallback);
    }
}

function consumeResponseStreamBlock(block: string, state: ResponseStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as Record<string, unknown>;
    const type = stringValue(event.type);
    const errorMessage = responseErrorMessage(event);
    if (errorMessage) state.error = errorMessage;
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
        state.text += event.delta;
        onDelta?.(state.text);
    }
    if (type === "response.output_text.done" && !state.text && typeof event.text === "string") {
        state.text = event.text;
        onDelta?.(state.text);
    }
    if (type === "response.completed" && isRecord(event.response)) {
        state.payload = event.response as ResponseApiPayload;
    } else if (Array.isArray(event.output)) {
        state.payload = event as ResponseApiPayload;
    }
}

function consumeResponseStreamText(state: ResponseStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeResponseStreamBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeResponseStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

async function requestStreamingResponse(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const response = await fetch(aiApiUrl(config, "/responses"), {
        method: "POST",
        headers: { ...aiHeaders(config, "application/json"), Accept: "text/event-stream" },
        body: JSON.stringify({ ...body, stream: true }),
        signal: options?.signal,
    });
    if (!response.ok) throw new Error(await readFetchError(response, "请求失败"));
    if (!response.body) {
        const payload = (await response.json()) as ResponseApiPayload;
        validateResponsePayload(payload);
        return parseToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: ResponseStreamState = { buffer: "", text: "" };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeResponseStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeResponseStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    if (!state.payload) return { content: state.text, toolCalls: [] };
    validateResponsePayload(state.payload);
    const result = parseToolResponse(state.payload);
    return { ...result, content: state.text || result.content };
}

function toGeminiBody(config: AiConfig, messages: ResponseInputMessage[], extra?: Record<string, unknown>) {
    const systemText = [config.systemPrompt.trim(), ...messages.flatMap((message) => (!("type" in message) && message.role === "system" ? [geminiTextContent(message.content)] : []))].filter(Boolean).join("\n\n");
    const contents = toGeminiContents(messages.filter((message) => ("type" in message ? true : message.role !== "system")));
    return {
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        ...extra,
    };
}

function toGeminiContents(messages: ResponseInputMessage[]): GeminiContent[] {
    const callNameById = new Map<string, string>();
    return messages.flatMap((message): GeminiContent[] => {
        if ("type" in message) {
            callNameById.set(message.call_id, message.name);
            return [{ role: "model", parts: [{ functionCall: { id: message.call_id, name: message.name, args: jsonObject(message.arguments) }, ...(message.thoughtSignature ? { thoughtSignature: message.thoughtSignature } : {}) }] }];
        }
        if (message.role === "tool") {
            const name = callNameById.get(message.tool_call_id) || "tool_result";
            return [{ role: "user", parts: [{ functionResponse: { id: message.tool_call_id, name, response: { result: jsonValue(message.content) } } }] }];
        }
        return [{ role: message.role === "assistant" ? "model" : "user", parts: toGeminiParts(message.content) }];
    });
}

function toGeminiParts(content: ResponseMessageContent): GeminiPart[] {
    if (!Array.isArray(content)) return [{ text: String(content || "") }];
    return content.map((item) => (item.type === "text" ? { text: item.text } : toGeminiImagePart(item.image_url.url)));
}

function toGeminiImagePart(url: string): GeminiPart {
    const match = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
    return { fileData: { fileUri: url, mimeType: "image/png" } };
}

function geminiTextContent(content: ResponseMessageContent) {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? item.text : item.image_url.url)).join("\n");
}

function jsonObject(value: string): Record<string, unknown> {
    const parsed = jsonValue(value);
    return isRecord(parsed) ? parsed : {};
}

function jsonValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function toGeminiToolOptions(tools: ResponseFunctionTool[], toolChoice: ToolChoice) {
    if (!tools.length) return {};
    const functionDeclarations = tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));
    const functionCallingConfig = typeof toolChoice === "object" ? { mode: "ANY", allowedFunctionNames: [toolChoice.name] } : { mode: toolChoice === "required" ? "ANY" : "AUTO" };
    return {
        tools: [{ functionDeclarations }],
        toolConfig: { functionCallingConfig },
    };
}

async function requestGeminiStreamingResponse(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const response = await fetch(`${geminiApiUrl(config, "streamGenerateContent")}?alt=sse`, {
        method: "POST",
        headers: geminiHeaders(config),
        body: JSON.stringify(body),
        signal: options?.signal,
    });
    if (!response.ok) throw new Error(await readFetchError(response, "请求失败"));
    if (!response.body) {
        const payload = (await response.json()) as GeminiPayload;
        return parseGeminiToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: GeminiStreamState = { buffer: "", text: "", toolCalls: [] };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeGeminiStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeGeminiStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    return { content: state.text, toolCalls: state.toolCalls };
}

function consumeGeminiStreamText(state: GeminiStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        const index = match.index ?? 0;
        consumeGeminiStreamBlock(state.buffer.slice(0, index), state, onDelta);
        state.buffer = state.buffer.slice(index + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeGeminiStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

function consumeGeminiStreamBlock(block: string, state: GeminiStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const result = parseGeminiToolResponse(JSON.parse(data) as GeminiPayload);
    if (result.content) {
        state.text += result.content;
        onDelta?.(state.text);
    }
    state.toolCalls.push(...result.toolCalls);
}

function parseGeminiToolResponse(payload: GeminiPayload): ToolResponseResult {
    validateGeminiPayload(payload);
    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const content = parts.map((part) => part.text || "").join("");
    const toolCalls = parts
        .map((part) => part.functionCall)
        .filter((call): call is NonNullable<GeminiPart["functionCall"]> => Boolean(call?.name))
        .map((call) => {
            const part = parts.find((item) => item.functionCall === call);
            const thoughtSignature = part?.thoughtSignature || part?.thought_signature;
            return {
                id: call.id || nanoid(),
                type: "function" as const,
                function: { name: call.name || "", arguments: JSON.stringify(call.args || {}) },
                ...(thoughtSignature ? { thoughtSignature } : {}),
            };
        });
    return { content, toolCalls };
}

async function requestGeminiImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, parameters: ImageRequestParameters, options?: RequestOptions) {
    const concurrency = references.length || config.quality.toLowerCase() === "high" || /4k/i.test(config.size) ? 1 : 2;
    return (await runLimitedRequests(count, concurrency, () => requestGeminiImagesOnce(config, prompt, references, parameters, options))).flat();
}

async function requestGeminiImagesOnce(config: AiConfig, prompt: string, references: ReferenceImage[], parameters: ImageRequestParameters, options?: RequestOptions) {
    const parts: GeminiPart[] = [{ text: prompt }];
    for (const image of references) {
        parts.push(toGeminiImagePart(await imageToDataUrl(image)));
    }
    const response = await retryImageRequest(
        () =>
            axios.post<GeminiPayload>(
                geminiApiUrl(config, "generateContent"),
                {
                    ...toGeminiBody(config, [{ role: "user", content: prompt }], { generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...buildGeminiImageConfig(parameters) } }),
                    contents: [{ role: "user", parts }],
                },
                { headers: geminiHeaders(config), signal: options?.signal },
            ),
        { signal: options?.signal },
    );
    return parseGeminiImagePayload(response.data, response.headers);
}

function parseGeminiImagePayload(payload: GeminiPayload, headers?: unknown) {
    validateGeminiPayload(payload);
    const metadata: ImageProviderMetadata = {
        providerRequestId: readHeader(headers, "x-request-id") || readHeader(headers, "x-goog-request-id") || undefined,
    };
    const images =
        payload.candidates
            ?.flatMap((candidate) => candidate.content?.parts || [])
            .map((part): ImageGenerationOutput | null => {
                const inlineData = part.inlineData || (part.inline_data ? { mimeType: part.inline_data.mimeType || part.inline_data.mime_type, data: part.inline_data.data } : undefined);
                if (part.fileData?.fileUri) return { id: nanoid(), status: "remote_only", source: "remote_url", remoteUrl: part.fileData.fileUri, mimeType: part.fileData.mimeType, ...metadata };
                if (inlineData?.data) {
                    const mimeType = inlineData.mimeType || "image/png";
                    return { id: nanoid(), status: "generated", source: "data_url", dataUrl: `data:${mimeType};base64,${inlineData.data}`, mimeType, ...metadata };
                }
                return null;
            })
            .filter((value): value is ImageGenerationOutput => Boolean(value)) || [];
    if (!images.length) throw new ImageGenerationError("Gemini 接口没有返回图片", { failureStage: "response_parse", kind: "response_parse" });
    return images;
}

async function runLimitedRequests<T>(count: number, concurrency: number, request: (index: number) => Promise<T>) {
    const results = new Array<T>(count);
    let nextIndex = 0;
    await Promise.all(
        Array.from({ length: Math.min(count, concurrency) }, async () => {
            for (;;) {
                const index = nextIndex;
                nextIndex += 1;
                if (index >= count) return;
                results[index] = await request(index);
            }
        }),
    );
    return results;
}

async function requestQwenImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, size: string | undefined, options?: RequestOptions) {
    if (references.length > 3) throw new Error("Qwen 图片编辑最多支持 3 张参考图");
    const content: Array<{ image: string } | { text: string }> = [];
    for (const image of references) {
        const dataUrl = await imageToDataUrl(image);
        const mimeType = (dataUrl.match(/^data:([^;,]+)/)?.[1] || image.type || "").toLowerCase();
        if (mimeType && !["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/x-ms-bmp", "image/tiff", "image/webp", "image/gif"].includes(mimeType)) throw new Error("Qwen 参考图仅支持 JPG、JPEG、PNG、BMP、TIFF、WEBP 或 GIF 格式");
        if ((image.bytes || getDataUrlByteSize(dataUrl)) > 10 * 1024 * 1024) throw new Error("Qwen 单张参考图不能超过 10MB");
        content.push({ image: dataUrl });
    }
    content.push({ text: withSystemPrompt(config, prompt) });
    const model = config.model.toLowerCase();
    const maxBatchSize = ["qwen-image-2.0", "qwen-image-edit-max", "qwen-image-edit-plus"].some((name) => model.includes(name)) ? 6 : 1;
    const isLegacyEdit = isLegacyQwenEditModel(model);
    const batches: number[] = [];
    for (let remaining = count; remaining > 0; remaining -= maxBatchSize) batches.push(Math.min(maxBatchSize, remaining));
    const images: ImageGenerationOutput[] = [];
    for (const batchSize of batches) {
        const response = await retryImageRequest(
            () =>
                axios.post<QwenImagePayload>(
                    qwenApiUrl(config.baseUrl, "services/aigc/multimodal-generation/generation"),
                    {
                        model: config.model,
                        input: { messages: [{ role: "user", content }] },
                        parameters: {
                            n: batchSize,
                            ...(!isLegacyEdit && size ? { size: size.replace("x", "*") } : {}),
                            ...(!isLegacyEdit ? { prompt_extend: true } : {}),
                            watermark: false,
                        },
                    },
                    { headers: aiHeaders(config, "application/json"), signal: options?.signal },
                ),
            { signal: options?.signal },
        );
        images.push(...parseQwenImagePayload(response.data, response.headers));
    }
    return images.slice(0, count);
}

function parseQwenImagePayload(payload: QwenImagePayload, headers?: unknown) {
    if (payload.code) throw new Error(payload.message || payload.code);
    const urls = [...(payload.output?.choices || []).flatMap((choice) => choice.message?.content || []).map((item) => item.image), ...(payload.output?.results || []).map((item) => item.url)].filter((url): url is string => Boolean(url));
    if (!urls.length) throw new ImageGenerationError("Qwen 接口没有返回图片", { failureStage: "response_parse", kind: "response_parse" });
    const metadata: ImageProviderMetadata = {
        providerTaskId: payload.output?.task_id,
        providerRequestId: payload.request_id || readHeader(headers, "x-request-id") || undefined,
    };
    return urls.map((url) => imageOutputFromString(url, metadata));
}

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) {
    const selectedModel = config.model || config.imageModel;
    assertModelChannelAvailable(config, selectedModel);
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const requestParameters = resolveImageRequestParameters(config);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const responseFormat = requestedImageResponseFormat(config, selectedModel);
    const script = resolveModelScript(config, selectedModel, "image");
    if (script) {
        const quality = normalizeQuality(config.quality);
        const background = normalizeBackground(config.background);
        try {
            const result = await retryImageRequest(
                () =>
                    runModelPlugin({
                        capability: "image",
                        script,
                        config: requestConfig,
                        prompt: withSystemPrompt(requestConfig, prompt),
                        images: [],
                        params: { size: requestParameters.resolvedSize, quality, count: n, responseFormat, ...(background ? { background } : {}) },
                        signal: options?.signal,
                    }),
                { signal: options?.signal },
            );
            return normalizePluginImages(result).map(pluginImageOutput);
        } catch (error) {
            throw classifyImageGenerationError(error);
        }
    }
    if (requestConfig.apiFormat === "gemini") {
        try {
            return await requestGeminiImages(requestConfig, prompt, [], n, requestParameters, options);
        } catch (error) {
            throw classifyImageGenerationError(error);
        }
    }
    if (requestConfig.apiFormat === "qwen") {
        try {
            return await requestQwenImages(requestConfig, prompt, [], n, requestParameters.resolvedSize, options);
        } catch (error) {
            throw classifyImageGenerationError(error);
        }
    }
    const quality = normalizeQuality(config.quality);
    const background = normalizeBackground(config.background);
    try {
        const response = await retryImageRequest(
            () =>
                axios.post<ImageApiResponse>(
                    aiApiUrl(requestConfig, "/images/generations"),
                    {
                        model: requestConfig.model,
                        prompt: withSystemPrompt(requestConfig, prompt),
                        n,
                        ...(quality ? { quality } : {}),
                        ...(requestParameters.resolvedSize ? { size: requestParameters.resolvedSize } : {}),
                        ...(background ? { background } : {}),
                        ...(responseFormat ? { response_format: responseFormat } : {}),
                        output_format: IMAGE_OUTPUT_FORMAT,
                    },
                    {
                        headers: aiHeaders(requestConfig, "application/json"),
                        signal: options?.signal,
                    },
                ),
            { signal: options?.signal },
        );
        const images = parseImagePayload(response.data, response.headers);
        return images;
    } catch (error) {
        throw classifyImageGenerationError(error);
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, options?: RequestOptions) {
    const selectedModel = config.model || config.imageModel;
    assertModelChannelAvailable(config, selectedModel);
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const requestParameters = resolveImageRequestParameters(config);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const responseFormat = requestedImageResponseFormat(config, selectedModel);
    const script = resolveModelScript(config, selectedModel, "image");
    if (script) {
        const quality = normalizeQuality(config.quality);
        const background = normalizeBackground(config.background);
        const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
        const maskDataUrl = mask ? await imageToDataUrl(mask) : undefined;
        try {
            const result = await retryImageRequest(
                () =>
                    runModelPlugin({
                        capability: "image",
                        script,
                        config: requestConfig,
                        prompt: withSystemPrompt(requestConfig, requestPrompt),
                        images: refs,
                        mask: maskDataUrl,
                        params: { size: requestParameters.resolvedSize, quality, count: n, responseFormat, ...(background ? { background } : {}) },
                        signal: options?.signal,
                    }),
                { signal: options?.signal },
            );
            return normalizePluginImages(result).map(pluginImageOutput);
        } catch (error) {
            throw classifyImageGenerationError(error);
        }
    }
    if (requestConfig.apiFormat === "gemini") {
        if (mask) throw new Error("Gemini 调用格式暂不支持蒙版编辑");
        try {
            return await requestGeminiImages(requestConfig, requestPrompt, references, n, requestParameters, options);
        } catch (error) {
            throw classifyImageGenerationError(error);
        }
    }
    if (requestConfig.apiFormat === "qwen") {
        if (mask) throw new Error("Qwen 调用格式暂不支持蒙版编辑");
        try {
            return await requestQwenImages(requestConfig, requestPrompt, references, n, requestParameters.resolvedSize, options);
        } catch (error) {
            throw classifyImageGenerationError(error);
        }
    }
    const quality = normalizeQuality(config.quality);
    const background = normalizeBackground(config.background);
    const formData = new FormData();
    formData.set("model", requestConfig.model);
    formData.set("prompt", withSystemPrompt(requestConfig, requestPrompt));
    formData.set("n", String(n));
    if (responseFormat) formData.set("response_format", responseFormat);
    formData.set("output_format", IMAGE_OUTPUT_FORMAT);
    if (quality) {
        formData.set("quality", quality);
    }
    if (requestParameters.resolvedSize) {
        formData.set("size", requestParameters.resolvedSize);
    }
    if (background) {
        formData.set("background", background);
    }
    const files = await Promise.all(references.map(imageToFile));
    files.forEach((file) => formData.append("image", file));
    if (mask) formData.set("mask", await imageToFile(mask));

    try {
        const response = await retryImageRequest(() => axios.post<ImageApiResponse>(aiApiUrl(requestConfig, "/images/edits"), formData, { headers: aiHeaders(requestConfig), signal: options?.signal }), { signal: options?.signal });
        const images = parseImagePayload(response.data, response.headers);
        return images;
    } catch (error) {
        throw classifyImageGenerationError(error);
    }
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    assertModelChannelAvailable(config, config.model || config.textModel);
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    const script = resolveModelScript(config, config.model || config.textModel, "text");
    if (script) {
        try {
            const answer = await runModelPlugin<string>({
                capability: "text",
                script,
                config: requestConfig,
                messages: withSystemMessage(requestConfig, messages),
                signal: options?.signal,
                onDelta,
            });
            const text = String(answer ?? "").trim() || "没有返回内容";
            if (text === "没有返回内容") onDelta(text);
            return text;
        } catch (error) {
            throw new Error(readAxiosError(error, "请求失败"));
        }
    }
    try {
        if (requestConfig.apiFormat === "gemini") {
            const answer = (await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, messages), onDelta, options)).content || "没有返回内容";
            if (answer === "没有返回内容") onDelta(answer);
            return answer;
        }
        const answer =
            (
                await requestStreamingResponse(
                    requestConfig,
                    {
                        model: requestConfig.model,
                        input: toResponseInput(withSystemMessage(requestConfig, messages)),
                    },
                    onDelta,
                    options,
                )
            ).content || "没有返回内容";
        if (answer === "没有返回内容") onDelta(answer);
        return answer;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function fetchImageModels(config: Pick<AiConfig, "baseUrl" | "apiKey" | "authType" | "apiFormat">) {
    try {
        if (config.apiFormat === "gemini") {
            const response = await axios.get<GeminiPayload>(geminiApiUrl({ ...defaultGeminiConfig, ...config }), { headers: geminiHeaders({ ...defaultGeminiConfig, ...config }) });
            validateGeminiPayload(response.data);
            return (response.data.models || [])
                .map((model) => model.name?.replace(/^models\//, ""))
                .filter((id): id is string => Boolean(id))
                .sort((a, b) => a.localeCompare(b));
        }
        const modelsUrl = config.apiFormat === "qwen" ? qwenCompatibleApiUrl(config.baseUrl, "models") : buildApiUrl(config.baseUrl, "/models");
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(modelsUrl, {
            headers: aiHeaders(config),
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}

export async function fetchChannelModels(channel: ModelChannel) {
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, authType: channel.authType, apiFormat: channel.apiFormat });
}

const defaultGeminiConfig: Pick<AiConfig, "baseUrl" | "apiKey" | "authType" | "apiFormat" | "model" | "systemPrompt"> = {
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "",
    authType: "bearer",
    apiFormat: "gemini",
    model: "",
    systemPrompt: "",
};
