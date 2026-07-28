import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import type { CompiledPrompt, DesignSkillDefinition, ImageDesignRecommendation, PlatformPreset, SkillOptionValue, StructuredPlan, StructuredPlanItem } from "../types";
import type { ImageDesignRequestSnapshot, SafeGenerationConfig } from "./types";

export type BuildRequestSnapshotInput = {
    originalPrompt: string;
    compiled: CompiledPrompt;
    config: AiConfig;
    references: ReferenceImage[];
    skill: DesignSkillDefinition;
    skillOptions: Record<string, SkillOptionValue>;
    platformPreset?: PlatformPreset;
    recommendation?: ImageDesignRecommendation;
    structuredPlan?: StructuredPlan;
    structuredItem?: StructuredPlanItem;
    seriesGroupId?: string;
    seriesIndex?: number;
};

export function buildImageDesignRequestSnapshot(input: BuildRequestSnapshotInput) {
    const model = input.config.imageModel || input.config.model;
    const safeConfig: SafeGenerationConfig = {
        model,
        imageModel: model,
        quality: input.compiled.resolvedQuality,
        size: input.compiled.resolvedSize,
        imageAspectRatio: input.compiled.resolvedAspectRatio,
        count: String(input.compiled.resolvedCount),
        background: input.config.background,
        systemPrompt: input.config.systemPrompt,
        optimizeImageReferences: input.config.optimizeImageReferences,
    };
    const persistent: ImageDesignRequestSnapshot = {
        id: nanoid(),
        createdAt: Date.now(),
        originalPrompt: input.originalPrompt.trim(),
        finalPrompt: input.compiled.finalPrompt,
        config: safeConfig,
        references: [...input.references],
        designSkillId: input.skill.id,
        designSkillLabel: input.skill.label,
        skillOptions: { ...input.skillOptions },
        platformPresetId: input.platformPreset?.id,
        platformPresetLabel: input.platformPreset ? `${input.platformPreset.platformLabel} · ${input.platformPreset.label}` : undefined,
        contentType: input.platformPreset?.contentType,
        requestedSize: input.compiled.providerMapping.requestedSize,
        requestedAspectRatio: input.compiled.providerMapping.requestedAspectRatio,
        recommendationSnapshot: input.recommendation,
        structuredPlan: input.structuredPlan,
        structuredItem: input.structuredItem,
        seriesGroupId: input.seriesGroupId,
        seriesIndex: input.seriesIndex,
        promptVersion: input.compiled.reproducibilitySnapshot.promptVersion,
        compilerVersion: input.compiled.reproducibilitySnapshot.compilerVersion,
        reproducibilitySnapshot: input.compiled.reproducibilitySnapshot,
    };
    return {
        executionConfig: { ...input.config, ...safeConfig },
        persistent,
    };
}
