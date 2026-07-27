import { jsonrepair } from "jsonrepair";
import { nanoid } from "nanoid";
import { z } from "zod";

import { CREATION_PROMPT_STYLE_IDS, SOCIAL_PLATFORM_IDS, SOCIAL_PLATFORM_PRESET_IDS } from "@/constant/creation";
import { appendHardConstraints } from "@/lib/creation/prompt-templates";
import type { CreativeBrief, PromptHardConstraints, PromptVersion, SocialPlatform } from "@/types/creation";

const nonEmptyString = z.string().trim().min(1);
const idSchema = nonEmptyString;
const dateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "必须是有效时间");
const stringListSchema = z.array(nonEmptyString).max(64);

export const socialPlatformSchema = z.enum(SOCIAL_PLATFORM_IDS);
export const creationPromptStyleSchema = z.enum(CREATION_PROMPT_STYLE_IDS);
export const creationStatusSchema = z.enum(["draft", "analyzing", "brief_ready", "brief_approved", "generating_prompts", "prompts_ready", "prompt_approved", "generating_images", "awaiting_image_review", "image_approved", "inserted_to_canvas", "failed"]);
export const creationStableStatusSchema = z.enum(["draft", "brief_ready", "brief_approved", "prompts_ready", "prompt_approved", "awaiting_image_review", "image_approved", "inserted_to_canvas"]);
export const creationRetryStatusSchema = z.enum(["analyzing", "generating_prompts", "generating_images"]);
export const creationCandidateStatusSchema = z.enum(["idle", "queued", "generating", "generated", "downloading", "stored", "remote_only", "unknown", "failed"]);
export const creationCardLayoutSchema = z.enum(["cover", "editorial", "split", "quote"]);
export const creationCardReviewStatusSchema = z.enum(["pending", "approved", "changes_requested", "rejected"]);

export const creativeBriefSchema = z.strictObject({
    id: idSchema,
    mode: z.literal("social"),
    platform: socialPlatformSchema,
    scene: nonEmptyString,
    purpose: nonEmptyString,
    audience: nonEmptyString,
    coreMessage: nonEmptyString,
    title: nonEmptyString,
    subtitle: nonEmptyString.optional(),
    visualSubject: nonEmptyString,
    composition: nonEmptyString,
    visualStyle: nonEmptyString,
    colorPalette: stringListSchema.min(1),
    aspectRatio: nonEmptyString,
    width: z.number().int().positive().max(32_768),
    height: z.number().int().positive().max(32_768),
    onImageText: stringListSchema,
    requiredElements: stringListSchema,
    forbiddenElements: stringListSchema,
    sourceContent: nonEmptyString,
    analysisReasoning: nonEmptyString.optional(),
});

export const CreativeBriefSchema = creativeBriefSchema;

const creativeBriefModelPayloadSchema = z.strictObject({
    scene: nonEmptyString,
    purpose: nonEmptyString,
    audience: nonEmptyString,
    coreMessage: nonEmptyString,
    title: nonEmptyString,
    subtitle: nonEmptyString.optional(),
    visualSubject: nonEmptyString,
    composition: nonEmptyString,
    visualStyle: nonEmptyString,
    colorPalette: stringListSchema.min(1),
    onImageText: stringListSchema,
    requiredElements: stringListSchema,
    forbiddenElements: stringListSchema,
    analysisReasoning: nonEmptyString.optional(),
});

export const promptHardConstraintsSchema = z.strictObject({
    platform: socialPlatformSchema,
    width: z.number().int().positive().max(32_768),
    height: z.number().int().positive().max(32_768),
    aspectRatio: nonEmptyString,
    subject: nonEmptyString.optional(),
    subjectCount: z.number().int().positive().optional(),
    subjectPosition: nonEmptyString.optional(),
    requiredElements: stringListSchema,
    forbiddenElements: stringListSchema,
    requiredTexts: stringListSchema,
    colorPalette: stringListSchema,
    referenceImageRequirements: stringListSchema,
    safeAreaRequirements: stringListSchema,
    outputFormat: nonEmptyString.optional(),
});

export const promptVersionSchema = z.strictObject({
    id: idSchema,
    label: nonEmptyString,
    content: nonEmptyString,
    rawContent: nonEmptyString.optional(),
    reasoning: nonEmptyString,
    style: creationPromptStyleSchema,
    kind: z.enum(["original", "optimized", "manual", "restored"]),
    sourceBriefVersionId: idSchema,
    parentId: idSchema.optional(),
    hardConstraints: promptHardConstraintsSchema,
    createdAt: dateTimeSchema,
});

export const briefVersionSchema = z.strictObject({
    id: idSchema,
    brief: creativeBriefSchema,
    createdAt: dateTimeSchema,
    source: z.enum(["model", "manual"]),
    parentId: idSchema.optional(),
    approvedAt: dateTimeSchema.optional(),
});

export const creationErrorSchema = z.strictObject({
    id: idSchema,
    stage: z.enum(["text_model", "image_model", "network", "parse", "storage", "unknown"]),
    message: nonEmptyString,
    retryStatus: creationRetryStatusSchema.optional(),
    candidateId: idSchema.optional(),
    details: nonEmptyString.optional(),
    createdAt: dateTimeSchema,
});

export const creationCardGenerationSchema = z.strictObject({
    id: idSchema,
    batchId: idSchema,
    styleId: idSchema,
    pageRevision: z.number().int().positive(),
    promptVersionId: idSchema,
    platformPresetId: z.enum(SOCIAL_PLATFORM_PRESET_IDS),
    modelConfigId: idSchema,
    providerId: nonEmptyString.optional(),
    modelId: nonEmptyString.optional(),
    referencePageId: idSchema.optional(),
    referenceImageId: idSchema.optional(),
    quality: nonEmptyString,
    background: z.string(),
    status: creationCandidateStatusSchema,
    imageId: idSchema.optional(),
    error: creationErrorSchema.optional(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
});

export const creationCardPageSchema = z
    .strictObject({
        id: idSchema,
        title: z.string(),
        body: z.string(),
        layout: creationCardLayoutSchema,
        revision: z.number().int().positive(),
        generatedRevision: z.number().int().positive().optional(),
        status: creationCandidateStatusSchema,
        reviewStatus: creationCardReviewStatusSchema,
        imageId: idSchema.optional(),
        imageHistoryIds: z.array(idSchema),
        error: creationErrorSchema.optional(),
        generation: creationCardGenerationSchema.optional(),
        createdAt: dateTimeSchema,
        updatedAt: dateTimeSchema,
    })
    .superRefine((page, context) => {
        if (page.generatedRevision && page.generatedRevision > page.revision) context.addIssue({ code: "custom", path: ["generatedRevision"], message: "生成版本不能晚于页面版本" });
        if (new Set(page.imageHistoryIds).size !== page.imageHistoryIds.length) context.addIssue({ code: "custom", path: ["imageHistoryIds"], message: "页面图片历史不能重复" });
        if (page.imageId && !page.imageHistoryIds.includes(page.imageId)) context.addIssue({ code: "custom", path: ["imageId"], message: "当前页面图片必须保留在图片历史中" });
        if (page.generation && page.generation.pageRevision > page.revision) context.addIssue({ code: "custom", path: ["generation", "pageRevision"], message: "生成任务不能引用未来页面版本" });
    });

export const creationCardDeckSchema = z
    .strictObject({
        id: idSchema,
        platformPresetIds: z.array(z.enum(SOCIAL_PLATFORM_PRESET_IDS)).min(1).max(SOCIAL_PLATFORM_PRESET_IDS.length),
        activePlatformPresetId: z.enum(SOCIAL_PLATFORM_PRESET_IDS),
        styleId: idSchema,
        stylePrompt: z.string(),
        modelConfigId: z.string(),
        quality: nonEmptyString,
        background: z.string(),
        styleAnchorPageId: idSchema.optional(),
        styleAnchorImageId: idSchema.optional(),
        pages: z.array(creationCardPageSchema).min(1).max(10),
        createdAt: dateTimeSchema,
        updatedAt: dateTimeSchema,
    })
    .superRefine((deck, context) => {
        if (new Set(deck.platformPresetIds).size !== deck.platformPresetIds.length) context.addIssue({ code: "custom", path: ["platformPresetIds"], message: "平台规格不能重复" });
        if (!deck.platformPresetIds.includes(deck.activePlatformPresetId)) context.addIssue({ code: "custom", path: ["activePlatformPresetId"], message: "当前平台规格必须包含在目标规格中" });
        const pageIds = new Set(deck.pages.map((page) => page.id));
        if (pageIds.size !== deck.pages.length) context.addIssue({ code: "custom", path: ["pages"], message: "卡片页 ID 不能重复" });
        if (deck.styleAnchorPageId && !pageIds.has(deck.styleAnchorPageId)) context.addIssue({ code: "custom", path: ["styleAnchorPageId"], message: "风格锚点页面不存在" });
        deck.pages.forEach((page, index) => {
            const generation = page.generation;
            if (generation?.referencePageId && !pageIds.has(generation.referencePageId)) context.addIssue({ code: "custom", path: ["pages", index, "generation", "referencePageId"], message: "生成任务引用的页面不存在" });
        });
    });

export const CreationCardDeckSchema = creationCardDeckSchema;

export const creationImageFeedbackSchema = z.strictObject({
    id: idSchema,
    issue: z.enum(["text_error", "composition_error", "subject_error", "style_mismatch", "safe_area_conflict", "scientific_error", "unsupported_inference", "other"]),
    note: nonEmptyString.optional(),
    createdAt: dateTimeSchema,
});

export const creationGeneratedImageSchema = z.strictObject({
    id: idSchema,
    url: nonEmptyString.optional(),
    remoteUrl: nonEmptyString.optional(),
    dataUrl: nonEmptyString.optional(),
    storageKey: nonEmptyString.optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    bytes: z.number().int().nonnegative().optional(),
    mimeType: nonEmptyString,
    providerId: nonEmptyString,
    modelId: nonEmptyString,
    modelConfigId: nonEmptyString,
    promptVersionId: nonEmptyString,
    createdAt: dateTimeSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
    persistenceError: nonEmptyString.optional(),
});

export const imageCandidateSchema = z
    .strictObject({
        id: idSchema,
        index: z.number().int().nonnegative(),
        promptVersionId: idSchema,
        modelConfigId: idSchema,
        size: nonEmptyString,
        quality: nonEmptyString,
        background: z.string(),
        status: creationCandidateStatusSchema,
        imageId: idSchema.optional(),
        image: creationGeneratedImageSchema.optional(),
        error: creationErrorSchema.optional(),
        feedback: z.array(creationImageFeedbackSchema),
        referenceImageId: idSchema.optional(),
    })
    .superRefine((candidate, context) => {
        if (candidate.imageId && candidate.image && candidate.imageId !== candidate.image.id) context.addIssue({ code: "custom", path: ["imageId"], message: "imageId 必须与 image.id 一致" });
        if (candidate.image && candidate.image.promptVersionId !== candidate.promptVersionId) context.addIssue({ code: "custom", path: ["image", "promptVersionId"], message: "候选图必须引用候选使用的提示词版本" });
        if (candidate.image && candidate.image.modelConfigId !== candidate.modelConfigId) context.addIssue({ code: "custom", path: ["image", "modelConfigId"], message: "候选图必须引用候选使用的模型配置" });
    });

export const creationReviewRecordSchema = z.strictObject({
    id: idSchema,
    gate: z.enum(["brief", "prompt", "image"]),
    action: z.enum(["approved", "changes_requested", "rejected", "issue_reported"]),
    targetId: idSchema,
    comment: nonEmptyString.optional(),
    createdAt: dateTimeSchema,
});

export const canvasInsertionRecordSchema = z.strictObject({
    id: idSchema,
    projectId: idSchema,
    nodeId: idSchema,
    imageId: idSchema,
    insertedAt: dateTimeSchema,
});

export const creationProjectSchema = z
    .strictObject({
        id: idSchema,
        name: nonEmptyString,
        mode: z.literal("social"),
        platformPresetId: idSchema,
        scene: z.string(),
        additionalRequirements: z.string(),
        sourceContent: z.string(),
        status: creationStatusSchema,
        lastStableStatus: creationStableStatusSchema,
        briefVersions: z.array(briefVersionSchema),
        selectedBriefVersionId: idSchema.optional(),
        promptVersions: z.array(promptVersionSchema),
        selectedPromptVersionId: idSchema.optional(),
        candidates: z.array(imageCandidateSchema),
        generatedImages: z.array(creationGeneratedImageSchema),
        selectedImageId: idSchema.optional(),
        referenceImageId: idSchema.optional(),
        reviews: z.array(creationReviewRecordSchema),
        error: creationErrorSchema.optional(),
        cardDeck: creationCardDeckSchema.optional(),
        canvasInsertions: z.array(canvasInsertionRecordSchema).optional(),
        createdAt: dateTimeSchema,
        updatedAt: dateTimeSchema,
    })
    .superRefine((project, context) => {
        const briefIds = new Set(project.briefVersions.map((version) => version.id));
        const promptIds = new Set(project.promptVersions.map((version) => version.id));
        const imageIds = new Set(project.generatedImages.map((image) => image.id));
        if (project.selectedBriefVersionId && !briefIds.has(project.selectedBriefVersionId)) context.addIssue({ code: "custom", path: ["selectedBriefVersionId"], message: "选中的创作方案版本不存在" });
        if (project.selectedPromptVersionId && !promptIds.has(project.selectedPromptVersionId)) context.addIssue({ code: "custom", path: ["selectedPromptVersionId"], message: "选中的提示词版本不存在" });
        if (project.selectedImageId && !imageIds.has(project.selectedImageId)) context.addIssue({ code: "custom", path: ["selectedImageId"], message: "选中的图片不存在于生成历史" });
        project.promptVersions.forEach((version, index) => {
            if (!briefIds.has(version.sourceBriefVersionId)) context.addIssue({ code: "custom", path: ["promptVersions", index, "sourceBriefVersionId"], message: "提示词引用的创作方案版本不存在" });
        });
        project.generatedImages.forEach((image, index) => {
            if (!promptIds.has(image.promptVersionId)) context.addIssue({ code: "custom", path: ["generatedImages", index, "promptVersionId"], message: "生成图片引用的提示词版本不存在" });
        });
        project.candidates.forEach((candidate, index) => {
            if (!promptIds.has(candidate.promptVersionId)) context.addIssue({ code: "custom", path: ["candidates", index, "promptVersionId"], message: "候选项引用的提示词版本不存在" });
            const candidateImageId = candidate.imageId || candidate.image?.id;
            if (candidateImageId && !imageIds.has(candidateImageId)) context.addIssue({ code: "custom", path: ["candidates", index, "imageId"], message: "候选图必须归档到 generatedImages" });
        });
        const deck = project.cardDeck;
        if (deck) {
            const pageIds = new Set(deck.pages.map((page) => page.id));
            if (deck.styleAnchorImageId && !imageIds.has(deck.styleAnchorImageId)) context.addIssue({ code: "custom", path: ["cardDeck", "styleAnchorImageId"], message: "风格锚点图片不存在于生成历史" });
            deck.pages.forEach((page, pageIndex) => {
                const referencedImageIds = [page.imageId, ...page.imageHistoryIds, page.generation?.imageId, page.generation?.referenceImageId].filter((id): id is string => Boolean(id));
                referencedImageIds.forEach((imageId) => {
                    if (!imageIds.has(imageId)) context.addIssue({ code: "custom", path: ["cardDeck", "pages", pageIndex, "imageHistoryIds"], message: "卡片页引用的图片不存在于生成历史" });
                });
                const generation = page.generation;
                if (generation && !promptIds.has(generation.promptVersionId)) context.addIssue({ code: "custom", path: ["cardDeck", "pages", pageIndex, "generation", "promptVersionId"], message: "页面生成任务引用的提示词版本不存在" });
                if (generation?.referencePageId && !pageIds.has(generation.referencePageId)) context.addIssue({ code: "custom", path: ["cardDeck", "pages", pageIndex, "generation", "referencePageId"], message: "页面生成任务引用的页面不存在" });
            });
        }
        if (project.status === "failed" && !project.error) context.addIssue({ code: "custom", path: ["error"], message: "失败状态必须保存错误信息" });
    });

export const CreationProjectSchema = creationProjectSchema;

export type CreativeBriefAppContext = {
    id: string;
    platform: SocialPlatform;
    width: number;
    height: number;
    aspectRatio: string;
    sourceContent: string;
};

const creativeBriefAppContextSchema = z.strictObject({
    id: idSchema,
    platform: socialPlatformSchema,
    width: z.number().int().positive().max(32_768),
    height: z.number().int().positive().max(32_768),
    aspectRatio: nonEmptyString,
    sourceContent: nonEmptyString,
});

export function parseCreativeBriefResponse(response: string, appContext: CreativeBriefAppContext): CreativeBrief {
    const context = creativeBriefAppContextSchema.parse(appContext);
    try {
        const parsed = unwrapSingleKey(parseCreationJsonResponse(response), "brief");
        const payload = creativeBriefModelPayloadSchema.parse(withoutApplicationOwnedBriefFields(parsed));
        return creativeBriefSchema.parse({
            ...payload,
            id: context.id,
            mode: "social",
            platform: context.platform,
            width: context.width,
            height: context.height,
            aspectRatio: context.aspectRatio,
            sourceContent: context.sourceContent,
        });
    } catch (error) {
        if (error instanceof CreationSchemaError) throw error;
        throw new CreationSchemaError("创作方案结构校验失败", error);
    }
}

const promptVersionPayloadSchema = z.strictObject({
    label: nonEmptyString,
    content: nonEmptyString,
    reasoning: nonEmptyString,
    style: creationPromptStyleSchema,
});

export const promptVersionsResponseSchema = z.strictObject({
    versions: z.array(promptVersionPayloadSchema).min(1).max(6),
});

export type ParsePromptVersionsOptions = {
    sourceBriefVersionId: string;
    hardConstraints: PromptHardConstraints;
    parentId?: string;
    kind?: PromptVersion["kind"];
    createdAt?: string;
    idFactory?: () => string;
};

export function parsePromptVersionsResponse(response: string, options: ParsePromptVersionsOptions): PromptVersion[] {
    try {
        const payload = promptVersionsResponseSchema.parse(parseCreationJsonResponse(response));
        const hardConstraints = promptHardConstraintsSchema.parse(options.hardConstraints);
        const sourceBriefVersionId = idSchema.parse(options.sourceBriefVersionId);
        const createdAt = dateTimeSchema.parse(options.createdAt || new Date().toISOString());
        const idFactory = options.idFactory || nanoid;
        return payload.versions.map((version) =>
            promptVersionSchema.parse({
                id: idFactory(),
                label: version.label,
                content: appendHardConstraints(version.content, hardConstraints),
                rawContent: version.content,
                reasoning: version.reasoning,
                style: version.style,
                kind: options.kind || "optimized",
                sourceBriefVersionId,
                parentId: options.parentId,
                hardConstraints,
                createdAt,
            }),
        );
    } catch (error) {
        if (error instanceof CreationSchemaError) throw error;
        throw new CreationSchemaError("提示词版本结构校验失败", error);
    }
}

export class CreationSchemaError extends Error {
    readonly cause?: unknown;

    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "CreationSchemaError";
        this.cause = cause;
    }
}

export function parseCreationJsonResponse(response: string): unknown {
    const candidates = jsonCandidates(response);
    let lastError: unknown;
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            lastError = error;
        }
        try {
            return JSON.parse(jsonrepair(candidate));
        } catch (error) {
            lastError = error;
        }
    }
    throw new CreationSchemaError("模型响应不是可修复的 JSON", lastError);
}

function withoutApplicationOwnedBriefFields(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = { ...(value as Record<string, unknown>) };
    ["id", "mode", "platform", "width", "height", "aspectRatio", "sourceContent"].forEach((key) => delete record[key]);
    return record;
}

function unwrapSingleKey(value: unknown, key: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 1 && key in record ? record[key] : value;
}

function jsonCandidates(response: string) {
    const value = response.replace(/^\uFEFF/, "").trim();
    const candidates: string[] = [];
    for (const match of value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(match[1].trim());
    candidates.push(value);
    const objectStart = value.indexOf("{");
    const objectEnd = value.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) candidates.push(value.slice(objectStart, objectEnd + 1));
    const arrayStart = value.indexOf("[");
    const arrayEnd = value.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(value.slice(arrayStart, arrayEnd + 1));
    return Array.from(new Set(candidates.filter(Boolean)));
}

export function safeParseCreationProject(value: unknown) {
    return creationProjectSchema.safeParse(value);
}
