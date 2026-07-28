import type { AiConfig } from "@/stores/use-config-store";
import type { ImageFailureStage, ImageGenerationStatus, ReferenceImage } from "@/types/image";

import type { DesignSkillId, ImageDesignRecommendation, ReproducibilitySnapshot, SkillOptionValue, StructuredPlan, StructuredPlanItem } from "../types";

export type GeneratedImage = {
    id: string;
    dataUrl?: string;
    remoteUrl?: string;
    storageKey?: string;
    durationMs: number;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    expiresAt?: number;
    providerTaskId?: string;
    providerRequestId?: string;
    failureStage?: ImageFailureStage;
    persistenceError?: string;
};

export type SafeGenerationConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "imageAspectRatio" | "count" | "background" | "optimizeImageReferences"> & Partial<Pick<AiConfig, "systemPrompt">>;

export type ImageDesignRequestSnapshot = {
    id: string;
    createdAt: number;
    originalPrompt: string;
    finalPrompt: string;
    config: SafeGenerationConfig;
    references: ReferenceImage[];
    designSkillId: DesignSkillId;
    designSkillLabel: string;
    skillOptions: Record<string, SkillOptionValue>;
    platformPresetId?: string;
    platformPresetLabel?: string;
    contentType?: string;
    requestedSize: string;
    requestedAspectRatio: string;
    recommendationSnapshot?: ImageDesignRecommendation;
    structuredPlan?: StructuredPlan;
    structuredItem?: StructuredPlanItem;
    seriesGroupId?: string;
    seriesIndex?: number;
    promptVersion: string;
    compilerVersion: string;
    reproducibilitySnapshot?: ReproducibilitySnapshot;
};

export type GenerationResult = {
    id: string;
    status: ImageGenerationStatus;
    image?: GeneratedImage;
    error?: string;
    warnings?: string[];
    failureStage?: ImageFailureStage;
    snapshot: ImageDesignRequestSnapshot;
    startedAt?: number;
    completedAt?: number;
};

export type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    originalPrompt: string;
    finalPrompt: string;
    time: string;
    model: string;
    config: SafeGenerationConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    unknownCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "成功" | "失败" | "待确认" | "部分成功" | "已取消";
    images: GeneratedImage[];
    thumbnails: string[];
    items: GenerationResult[];
    designSkillId: DesignSkillId;
    designSkillLabel: string;
    skillOptions: Record<string, SkillOptionValue>;
    platformPresetId?: string;
    platformPresetLabel?: string;
    contentType?: string;
    requestedSize: string;
    requestedAspectRatio: string;
    actualDimensions?: Array<{ width?: number; height?: number }>;
    recommendationSnapshot?: ImageDesignRecommendation;
    structuredPlan?: StructuredPlan;
    seriesGroupId?: string;
    promptVersion: string;
    compilerVersion: string;
};
