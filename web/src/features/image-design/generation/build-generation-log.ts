import { nanoid } from "nanoid";

import type { GenerationLog, GenerationResult } from "./types";

export type BuildGenerationLogInput = {
    results: GenerationResult[];
    model: string;
    durationMs: number;
    cancelled?: boolean;
};

export function buildGenerationLog(input: BuildGenerationLogInput): GenerationLog {
    const first = input.results[0]?.snapshot;
    if (!first) throw new Error("生成记录至少需要一个请求快照");
    const images = input.results.flatMap((result) => (result.image ? [result.image] : []));
    const successCount = input.results.filter((result) => Boolean(result.image) && !["failed", "unknown"].includes(result.status)).length;
    const failCount = input.results.filter((result) => result.status === "failed").length;
    const unknownCount = input.results.filter((result) => result.status === "unknown").length;
    const cancelledCount = input.results.filter((result) => result.status === "cancelled").length;
    const status: GenerationLog["status"] = input.cancelled ? "已取消" : successCount && (failCount || unknownCount || cancelledCount) ? "部分成功" : successCount ? "成功" : unknownCount ? "待确认" : cancelledCount ? "已取消" : "失败";

    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: first.originalPrompt.slice(0, 18) || "未命名",
        prompt: first.finalPrompt,
        originalPrompt: first.originalPrompt,
        finalPrompt: first.finalPrompt,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        model: input.model,
        config: { ...first.config, count: String(input.results.length) },
        references: first.references,
        durationMs: input.durationMs,
        successCount,
        failCount,
        unknownCount,
        imageCount: input.results.length,
        size: first.config.size,
        quality: first.config.quality,
        status,
        images,
        thumbnails: images.map((image) => image.dataUrl || image.remoteUrl || "").filter(Boolean),
        items: input.results,
        designSkillId: first.designSkillId,
        designSkillLabel: first.designSkillLabel,
        skillOptions: first.skillOptions,
        platformPresetId: first.platformPresetId,
        platformPresetLabel: first.platformPresetLabel,
        contentType: first.contentType,
        requestedSize: first.requestedSize,
        requestedAspectRatio: first.requestedAspectRatio,
        actualDimensions: images.map((image) => ({ width: image.width, height: image.height })),
        recommendationSnapshot: first.recommendationSnapshot,
        structuredPlan: first.structuredPlan,
        seriesGroupId: first.seriesGroupId,
        promptVersion: first.promptVersion,
        compilerVersion: first.compilerVersion,
    };
}

export function replaceGenerationLogResult(log: GenerationLog, result: GenerationResult): GenerationLog {
    const sessionPlan = result.snapshot.structuredPlan;
    const items = log.items.map((item) => {
        const next = item.id === result.id ? result : item;
        return sessionPlan ? { ...next, snapshot: { ...next.snapshot, structuredPlan: sessionPlan } } : next;
    });
    const rebuilt = buildGenerationLog({
        results: items,
        model: log.model,
        durationMs: log.durationMs,
        cancelled: log.status === "已取消",
    });
    return {
        ...rebuilt,
        id: log.id,
        createdAt: log.createdAt,
        time: log.time,
        title: log.title,
        config: { ...result.snapshot.config, count: String(items.length) },
        model: result.snapshot.config.imageModel || result.snapshot.config.model || log.model,
        size: result.snapshot.config.size,
        quality: result.snapshot.config.quality,
        references: result.snapshot.references.filter((reference) => reference.source !== "series-anchor"),
        designSkillId: result.snapshot.designSkillId,
        designSkillLabel: result.snapshot.designSkillLabel,
        skillOptions: result.snapshot.skillOptions,
        platformPresetId: result.snapshot.platformPresetId,
        platformPresetLabel: result.snapshot.platformPresetLabel,
        contentType: result.snapshot.contentType,
        requestedSize: result.snapshot.requestedSize,
        requestedAspectRatio: result.snapshot.requestedAspectRatio,
        recommendationSnapshot: result.snapshot.recommendationSnapshot,
        structuredPlan: result.snapshot.structuredPlan,
        seriesGroupId: result.snapshot.seriesGroupId,
        promptVersion: result.snapshot.promptVersion,
        compilerVersion: result.snapshot.compilerVersion,
        items,
    };
}
