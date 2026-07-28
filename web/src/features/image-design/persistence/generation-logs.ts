import localforage from "localforage";
import { nanoid } from "nanoid";

import { IMAGE_DESIGN_COMPILER_VERSION, IMAGE_DESIGN_PROMPT_VERSION } from "../constants";
import type { GeneratedImage, GenerationLog, GenerationResult, ImageDesignRequestSnapshot, SafeGenerationConfig } from "../generation/types";
import type { DesignSkillId } from "../types";
import { cleanupUnusedImages, resolveImageUrl } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

export async function readGenerationLogs() {
    if (typeof window === "undefined") return [];
    const values: unknown[] = [];
    try {
        await logStore.iterate<unknown, void>((value) => {
            values.push(value);
        });
    } catch {
        return [];
    }
    const normalized = await Promise.allSettled(values.map(normalizeGenerationLog));
    return normalized.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])).sort((left, right) => right.createdAt - left.createdAt);
}

export async function getGenerationLog(id: string) {
    const value = await logStore.getItem<unknown>(id);
    return value ? normalizeGenerationLog(value) : null;
}

export async function saveGenerationLog(log: GenerationLog) {
    await logStore.setItem(log.id, serializeGenerationLog(log));
}

export async function deleteGenerationLogs(ids: string[], protectedData: unknown) {
    const idSet = new Set(ids);
    await Promise.all(ids.map((id) => logStore.removeItem(id)));
    const remaining = (await readGenerationLogs()).filter((log) => !idSet.has(log.id));
    await cleanupUnusedImages({ logs: remaining, protectedData });
}

export async function normalizeGenerationLog(value: unknown): Promise<GenerationLog> {
    const log = record(value);
    const config = normalizeConfig(log.config, log);
    const originalPrompt = string(log.originalPrompt) || string(log.prompt) || string(log.title);
    const finalPrompt = string(log.finalPrompt) || string(log.prompt) || originalPrompt;
    const references = await Promise.all(array(log.references).map(normalizeReference));
    const legacyImages = await Promise.all(array(log.images).map(normalizeImage));
    const legacySnapshot = normalizeSnapshot(
        {
            id: `${string(log.id) || "legacy"}-snapshot`,
            createdAt: number(log.createdAt) || Date.now(),
            originalPrompt,
            finalPrompt,
            config,
            references,
            designSkillId: string(log.designSkillId) || "none",
            designSkillLabel: string(log.designSkillLabel) || "无设计 Skill",
            skillOptions: record(log.skillOptions),
            platformPresetId: string(log.platformPresetId) || undefined,
            platformPresetLabel: string(log.platformPresetLabel) || undefined,
            contentType: string(log.contentType) || undefined,
            requestedSize: string(log.requestedSize) || string(log.size) || config.size,
            requestedAspectRatio: string(log.requestedAspectRatio) || aspectFromSize(string(log.requestedSize) || string(log.size) || config.size),
            promptVersion: string(log.promptVersion) || IMAGE_DESIGN_PROMPT_VERSION,
            compilerVersion: string(log.compilerVersion) || IMAGE_DESIGN_COMPILER_VERSION,
        },
        config,
        references,
    );
    const rawItems = array(log.items);
    const items = rawItems.length
        ? await Promise.all(rawItems.map((item, index) => normalizeResult(item, legacySnapshot, index)))
        : legacyImages.map(
              (image, index): GenerationResult => ({
                  id: image.id || `legacy-result-${index + 1}`,
                  status: image.storageKey ? "stored" : image.remoteUrl ? "remote_only" : "generated",
                  image,
                  snapshot: { ...legacySnapshot, id: `${legacySnapshot.id}-${index + 1}`, seriesIndex: index },
              }),
          );
    const images = items.flatMap((item) => (item.image ? [item.image] : [])).concat(legacyImages.filter((image) => !items.some((item) => item.image?.id === image.id)));
    const successCount = finiteCount(log.successCount, images.length);
    const failCount = finiteCount(log.failCount, items.filter((item) => item.status === "failed").length);
    const unknownCount = finiteCount(log.unknownCount, items.filter((item) => item.status === "unknown").length);
    const designSkillId = normalizeSkillId(log.designSkillId);

    return {
        id: string(log.id) || nanoid(),
        createdAt: number(log.createdAt) || Date.now(),
        title: string(log.title) || originalPrompt.slice(0, 18) || "未命名",
        prompt: string(log.prompt) || finalPrompt,
        originalPrompt,
        finalPrompt,
        time: string(log.time) || new Date(number(log.createdAt) || Date.now()).toLocaleString("zh-CN", { hour12: false }),
        model: string(log.model) || config.imageModel || config.model,
        config,
        references,
        durationMs: finiteCount(log.durationMs, 0),
        successCount,
        failCount,
        unknownCount,
        imageCount: finiteCount(log.imageCount, items.length || images.length || 1),
        size: string(log.size) || config.size,
        quality: string(log.quality) || config.quality,
        status: normalizeStatus(log.status, successCount, failCount, unknownCount),
        images,
        thumbnails: images.map(imageDisplayUrl).filter((url): url is string => Boolean(url)),
        items,
        designSkillId,
        designSkillLabel: string(log.designSkillLabel) || (designSkillId === "none" ? "无设计 Skill" : designSkillId),
        skillOptions: normalizeSkillOptions(log.skillOptions),
        platformPresetId: string(log.platformPresetId) || undefined,
        platformPresetLabel: string(log.platformPresetLabel) || undefined,
        contentType: string(log.contentType) || undefined,
        requestedSize: string(log.requestedSize) || string(log.size) || config.size,
        requestedAspectRatio: string(log.requestedAspectRatio) || aspectFromSize(string(log.requestedSize) || string(log.size) || config.size),
        actualDimensions: images.map((image) => ({ width: image.width, height: image.height })),
        recommendationSnapshot: log.recommendationSnapshot && typeof log.recommendationSnapshot === "object" ? (log.recommendationSnapshot as GenerationLog["recommendationSnapshot"]) : undefined,
        structuredPlan: log.structuredPlan && typeof log.structuredPlan === "object" ? (log.structuredPlan as GenerationLog["structuredPlan"]) : undefined,
        seriesGroupId: string(log.seriesGroupId) || undefined,
        promptVersion: string(log.promptVersion) || IMAGE_DESIGN_PROMPT_VERSION,
        compilerVersion: string(log.compilerVersion) || IMAGE_DESIGN_COMPILER_VERSION,
    };
}

export function serializeGenerationLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map(stripReferenceData),
        items: log.items.map((item) => ({
            ...item,
            image: item.image ? stripImageData(item.image) : undefined,
            snapshot: {
                ...item.snapshot,
                references: item.snapshot.references.map(stripReferenceData),
            },
        })),
        images: log.images.map(stripImageData),
        thumbnails: [],
    };
}

async function normalizeResult(value: unknown, fallback: ImageDesignRequestSnapshot, index: number): Promise<GenerationResult> {
    const result = record(value);
    const image = result.image ? await normalizeImage(result.image) : undefined;
    const snapshotRecord = record(result.snapshot);
    const snapshotReferences = Array.isArray(snapshotRecord.references) ? await Promise.all(snapshotRecord.references.map(normalizeReference)) : fallback.references;
    const snapshot = normalizeSnapshot(snapshotRecord, fallback.config, snapshotReferences, fallback);
    return {
        id: string(result.id) || image?.id || `result-${index + 1}`,
        status: normalizeResultStatus(result.status, image),
        image,
        error: string(result.error) || undefined,
        warnings: array(result.warnings).filter((item): item is string => typeof item === "string" && Boolean(item.trim())),
        failureStage: typeof result.failureStage === "string" ? (result.failureStage as GenerationResult["failureStage"]) : undefined,
        snapshot,
        startedAt: number(result.startedAt) || undefined,
        completedAt: number(result.completedAt) || undefined,
    };
}

function normalizeSnapshot(value: unknown, config: SafeGenerationConfig, references: ReferenceImage[], fallback?: ImageDesignRequestSnapshot): ImageDesignRequestSnapshot {
    const snapshot = record(value);
    const originalPrompt = string(snapshot.originalPrompt) || fallback?.originalPrompt || "";
    const finalPrompt = string(snapshot.finalPrompt) || fallback?.finalPrompt || originalPrompt;
    return {
        id: string(snapshot.id) || fallback?.id || nanoid(),
        createdAt: number(snapshot.createdAt) || fallback?.createdAt || Date.now(),
        originalPrompt,
        finalPrompt,
        config: normalizeConfig(snapshot.config, config),
        references,
        designSkillId: normalizeSkillId(snapshot.designSkillId || fallback?.designSkillId),
        designSkillLabel: string(snapshot.designSkillLabel) || fallback?.designSkillLabel || "无设计 Skill",
        skillOptions: normalizeSkillOptions(snapshot.skillOptions || fallback?.skillOptions),
        platformPresetId: string(snapshot.platformPresetId) || fallback?.platformPresetId,
        platformPresetLabel: string(snapshot.platformPresetLabel) || fallback?.platformPresetLabel,
        contentType: string(snapshot.contentType) || fallback?.contentType,
        requestedSize: string(snapshot.requestedSize) || fallback?.requestedSize || config.size,
        requestedAspectRatio: string(snapshot.requestedAspectRatio) || fallback?.requestedAspectRatio || aspectFromSize(config.size),
        recommendationSnapshot: snapshot.recommendationSnapshot && typeof snapshot.recommendationSnapshot === "object" ? (snapshot.recommendationSnapshot as ImageDesignRequestSnapshot["recommendationSnapshot"]) : fallback?.recommendationSnapshot,
        structuredPlan: snapshot.structuredPlan && typeof snapshot.structuredPlan === "object" ? (snapshot.structuredPlan as ImageDesignRequestSnapshot["structuredPlan"]) : fallback?.structuredPlan,
        structuredItem: snapshot.structuredItem && typeof snapshot.structuredItem === "object" ? (snapshot.structuredItem as ImageDesignRequestSnapshot["structuredItem"]) : fallback?.structuredItem,
        seriesGroupId: string(snapshot.seriesGroupId) || fallback?.seriesGroupId,
        seriesIndex: Number.isInteger(snapshot.seriesIndex) ? (snapshot.seriesIndex as number) : fallback?.seriesIndex,
        promptVersion: string(snapshot.promptVersion) || fallback?.promptVersion || IMAGE_DESIGN_PROMPT_VERSION,
        compilerVersion: string(snapshot.compilerVersion) || fallback?.compilerVersion || IMAGE_DESIGN_COMPILER_VERSION,
        reproducibilitySnapshot: snapshot.reproducibilitySnapshot && typeof snapshot.reproducibilitySnapshot === "object" ? (snapshot.reproducibilitySnapshot as ImageDesignRequestSnapshot["reproducibilitySnapshot"]) : fallback?.reproducibilitySnapshot,
    };
}

async function normalizeReference(value: unknown): Promise<ReferenceImage> {
    const reference = record(value);
    const storageKey = string(reference.storageKey) || undefined;
    return {
        ...(reference as ReferenceImage),
        id: string(reference.id) || nanoid(),
        name: string(reference.name) || "参考图",
        type: string(reference.type) || "image/png",
        dataUrl: await resolveImageUrl(storageKey, string(reference.dataUrl)),
        storageKey,
    };
}

async function normalizeImage(value: unknown): Promise<GeneratedImage> {
    const image = record(value);
    const storageKey = string(image.storageKey) || undefined;
    return {
        ...(image as GeneratedImage),
        id: string(image.id) || nanoid(),
        dataUrl: storageKey ? await resolveImageUrl(storageKey, string(image.dataUrl)) : string(image.dataUrl) || undefined,
        remoteUrl: string(image.remoteUrl) || undefined,
        storageKey,
        durationMs: finiteCount(image.durationMs, 0),
    };
}

function normalizeConfig(value: unknown, fallback: unknown): SafeGenerationConfig {
    const config = record(value);
    const legacy = record(fallback);
    const valueFor = (key: keyof SafeGenerationConfig) => (Object.prototype.hasOwnProperty.call(config, key) ? config[key] : legacy[key]);
    const count = string(valueFor("count")) || String(finiteCount(legacy.imageCount, 1));
    return {
        model: string(valueFor("model")) || string(legacy.model),
        imageModel: string(valueFor("imageModel")) || string(legacy.imageModel) || string(legacy.model),
        quality: string(valueFor("quality")) || "auto",
        size: string(valueFor("size")) || "auto",
        imageAspectRatio: string(valueFor("imageAspectRatio")) || undefined,
        count,
        background: string(valueFor("background")),
        systemPrompt: string(valueFor("systemPrompt")),
        optimizeImageReferences: typeof config.optimizeImageReferences === "boolean" ? config.optimizeImageReferences : typeof legacy.optimizeImageReferences === "boolean" ? legacy.optimizeImageReferences : true,
    };
}

function stripReferenceData(reference: ReferenceImage) {
    return { ...reference, dataUrl: reference.storageKey ? "" : reference.dataUrl };
}

function stripImageData(image: GeneratedImage) {
    return { ...image, dataUrl: image.storageKey ? "" : image.dataUrl };
}

function normalizeSkillOptions(value: unknown) {
    const options = record(value);
    return Object.fromEntries(Object.entries(options).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))) as GenerationLog["skillOptions"];
}

function normalizeSkillId(value: unknown): DesignSkillId {
    return ["none", "cover-image", "xhs-images", "infographic", "article-illustrator", "comic", "diagram"].includes(string(value)) ? (value as DesignSkillId) : "none";
}

function normalizeResultStatus(value: unknown, image?: GeneratedImage): GenerationResult["status"] {
    const status = string(value);
    if (["queued", "generating", "generated", "downloading", "stored", "remote_only", "unknown", "failed", "cancelled"].includes(status)) return status as GenerationResult["status"];
    return image?.storageKey ? "stored" : image?.remoteUrl ? "remote_only" : image ? "generated" : "failed";
}

function normalizeStatus(value: unknown, successCount: number, failCount: number, unknownCount: number): GenerationLog["status"] {
    const status = string(value);
    if (["成功", "失败", "待确认", "部分成功", "已取消"].includes(status)) return status as GenerationLog["status"];
    if (successCount && (failCount || unknownCount)) return "部分成功";
    if (successCount) return "成功";
    if (unknownCount) return "待确认";
    return "失败";
}

function aspectFromSize(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/);
    if (!match) return value.includes(":") ? value : "auto";
    const width = Number(match[1]);
    const height = Number(match[2]);
    return `${width}:${height}`;
}

function imageDisplayUrl(image: GeneratedImage) {
    return image.dataUrl || image.remoteUrl || "";
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function string(value: unknown) {
    return typeof value === "string" ? value : "";
}

function number(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function finiteCount(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
