import { resolveImageRequestParameters, type ImageRequestMappingKind, type ImageRequestParameters } from "@/services/api/image";
import { resolveModelChannel, type AiConfig } from "@/stores/use-config-store";

import type { ImageModelContext, MappingSupport, PlatformPreset } from "../types";
import { aspectFromSize } from "./resolve-generation-size";

export function createImageModelContext(config: AiConfig, preset?: PlatformPreset, skillRequestedSize?: string): ImageModelContext {
    const model = config.imageModel || config.model;
    const channel = resolveModelChannel(config, model);
    const requestedSize = preset ? `${preset.generationSize.width}x${preset.generationSize.height}` : normalizeSkillRequestedSize(skillRequestedSize) || config.size || "auto";
    const requestConfig = { ...config, model, imageModel: model };
    const { resolution, validationError } = resolvePlatformRequestParameters(requestConfig, requestedSize, preset);
    const requestedAspectRatio = preset?.aspectRatio || resolution.requestedAspectRatio || aspectFromSize(requestedSize) || "auto";
    const resolvedSize = resolution.resolvedSize || requestedSize;
    const resolvedAspectRatio = resolution.resolvedAspectRatio || aspectFromSize(resolvedSize) || requestedAspectRatio;
    const normalizedModel = model.toLowerCase();
    const supportsReferenceImages = normalizedModel.includes("dall-e-3") ? false : channel.apiFormat === "gemini" || channel.apiFormat === "qwen" || /(?:gpt-image|chatgpt-image|dall-e-2)/.test(normalizedModel) ? true : undefined;
    const supportsSeriesAnchor = supportsReferenceImages === true && (channel.apiFormat === "gemini" || channel.apiFormat === "qwen" || /(?:gpt-image|chatgpt-image|dall-e-2)/.test(normalizedModel));

    return {
        provider: channel.provider,
        apiFormat: channel.apiFormat,
        model,
        quality: config.quality,
        count: Math.max(1, Math.min(15, Math.round(Number(config.count)) || 1)),
        requestedSize,
        requestedAspectRatio,
        supportsReferenceImages,
        supportsSeriesAnchor,
        maxReferenceImages: channel.apiFormat === "qwen" ? 3 : undefined,
        resolvedSize,
        resolvedAspectRatio,
        mappingSupport: mappingSupport(resolution.mappingKind),
        mappingNote: resolution.warnings.join("；") || mappingDefaultNote(resolution.mappingKind),
        mappingRequiresConfirmation: resolution.requiresConfirmation,
        validationError,
    };
}

export function normalizeSkillRequestedSize(value?: string) {
    const selected = value?.trim();
    if (!selected) return undefined;
    return (
        {
            "portrait-3-4": "3:4",
            square: "1:1",
            "portrait-2-3": "2:3",
            landscape: "16:9",
            portrait: "9:16",
        }[selected] || selected
    );
}

function resolvePlatformRequestParameters(config: AiConfig, requestedSize: string, preset?: PlatformPreset): { resolution: ImageRequestParameters; validationError?: string } {
    try {
        return { resolution: resolveImageRequestParameters(config, requestedSize) };
    } catch (error) {
        const validationError = error instanceof Error ? error.message : "自定义画幅无法解析";
        if (preset) {
            try {
                const compatible = resolveImageRequestParameters(config, preset.aspectRatio);
                const fallbackMessage = `目标尺寸 ${requestedSize} 超出当前模型的直接尺寸范围，已改用同比例兼容请求${compatible.resolvedSize ? ` ${compatible.resolvedSize}` : ""}。`;
                return {
                    resolution: {
                        ...compatible,
                        requestedSize,
                        requestedAspectRatio: preset.aspectRatio,
                        warnings: [fallbackMessage, ...compatible.warnings],
                    },
                };
            } catch (fallbackError) {
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "平台画幅无法映射";
                return {
                    validationError: `${validationError}；${fallbackMessage}`,
                    resolution: invalidResolution(requestedSize, preset.aspectRatio, `${validationError}；${fallbackMessage}`),
                };
            }
        }
        let fallback: ImageRequestParameters;
        try {
            fallback = resolveImageRequestParameters(config, config.size || "auto");
        } catch {
            fallback = invalidResolution(requestedSize, undefined, validationError);
        }
        return {
            validationError,
            resolution: {
                ...fallback,
                requestedSize,
                warnings: [`自定义画幅“${requestedSize}”无效：${validationError}`],
                requiresConfirmation: true,
            },
        };
    }
}

function invalidResolution(requestedSize: string, requestedAspectRatio: string | undefined, message: string): ImageRequestParameters {
    return {
        requestedSize,
        requestedAspectRatio,
        resolvedSize: "auto",
        resolvedAspectRatio: requestedAspectRatio || "auto",
        mappingKind: "unverified",
        warnings: [`请求画幅“${requestedSize}”无效：${message}`],
        requiresConfirmation: true,
    };
}

function mappingSupport(kind: ImageRequestMappingKind): MappingSupport {
    return kind === "unverified" ? "unknown" : kind;
}

function mappingDefaultNote(kind: ImageRequestMappingKind) {
    if (kind === "exact") return "当前模型可按目标尺寸直接请求。";
    if (kind === "same-ratio") return "当前模型使用同一比例的兼容尺寸，不裁剪、不拉伸。";
    if (kind === "closest-ratio") return "当前模型仅支持接近比例，需用户确认后请求。";
    if (kind === "scaled") return "当前模型使用等比例尺寸档位，需用户确认后请求。";
    return "当前兼容渠道的精确尺寸能力无法预先验证。";
}
