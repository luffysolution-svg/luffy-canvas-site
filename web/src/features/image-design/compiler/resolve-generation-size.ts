import type { ImageModelContext, MappingSupport, PlatformPreset, ResolvedProviderMapping } from "../types";

export function resolveGenerationSize(platformPreset: PlatformPreset | undefined, model: ImageModelContext): ResolvedProviderMapping {
    const staticMapping = platformPreset?.providerMappings[model.provider];
    const platformSize = platformPreset ? `${platformPreset.generationSize.width}x${platformPreset.generationSize.height}` : "";
    const requestedSize = model.requestedSize || platformSize || "auto";
    const requestedAspectRatio = model.requestedAspectRatio || platformPreset?.aspectRatio || aspectFromSize(requestedSize) || "auto";
    const resolvedSize = model.resolvedSize || staticMapping?.requestSize || requestedSize;
    const resolvedAspectRatio = model.resolvedAspectRatio || staticMapping?.requestAspectRatio || aspectFromSize(resolvedSize) || requestedAspectRatio;
    const support: MappingSupport = model.mappingSupport || staticMapping?.support || (resolvedSize === requestedSize ? "exact" : "unknown");
    const requiresConfirmation = Boolean(model.mappingRequiresConfirmation || support === "closest-ratio" || support === "scaled");
    const note = model.mappingNote || staticMapping?.note || (support === "exact" ? "按当前尺寸直接请求。" : "当前渠道的精确尺寸能力尚未验证。");

    return {
        provider: model.provider,
        model: model.model,
        requestedSize,
        requestedAspectRatio,
        resolvedSize,
        resolvedAspectRatio,
        support,
        requiresConfirmation,
        note,
    };
}

export function aspectFromSize(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return value.includes(":") ? value : "";
    const width = Number(match[1]);
    const height = Number(match[2]);
    const divisor = greatestCommonDivisor(width, height);
    return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(left: number, right: number): number {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b) [a, b] = [b, a % b];
    return a || 1;
}
