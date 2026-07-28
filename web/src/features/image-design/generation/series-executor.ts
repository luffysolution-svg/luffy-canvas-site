import { nanoid } from "nanoid";

import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { requestImageBatch, type ImageBatchResult } from "@/services/api/image-batch";
import { ImageGenerationError } from "@/services/api/image-errors";
import type { AiConfig } from "@/stores/use-config-store";
import type { ImageGenerationOutput, ImageGenerationStatus, ReferenceImage } from "@/types/image";

import type { ImageDesignRequestSnapshot } from "./types";

export type SeriesTaskOutcome = {
    snapshot: ImageDesignRequestSnapshot;
    status: "succeeded" | "failed" | "unknown" | "cancelled";
    output?: ImageGenerationOutput;
    error?: Error;
    warnings: string[];
};

export type SeriesExecutorOptions = {
    config: AiConfig;
    snapshots: ImageDesignRequestSnapshot[];
    batchSize: number;
    anchorChainEnabled: boolean;
    supportsReferenceImages: boolean;
    maxReferenceImages?: number;
    signal?: AbortSignal;
    request?: typeof requestImageBatch;
    onStatus?: (snapshotId: string, status: ImageGenerationStatus, detail?: ImageGenerationOutput | Error) => void;
};

export async function executeImageDesignSeries(options: SeriesExecutorOptions): Promise<SeriesTaskOutcome[]> {
    if (!options.snapshots.length) return [];
    const request = options.request || requestImageBatch;
    const outcomes: SeriesTaskOutcome[] = [];
    const firstPrepared = prepareAnchoredSnapshot(options.snapshots[0], undefined, options);
    const first = await executeOne(firstPrepared.snapshot, options, request, firstPrepared.warnings);
    outcomes.push(first);
    if (options.signal?.aborted) return outcomes;

    const anchor = first.status === "succeeded" && first.output ? outputToAnchor(first.output) : undefined;
    const rest = options.snapshots.slice(1);
    const concurrency = Math.max(1, Math.min(10, Math.round(options.batchSize) || 1));
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, rest.length) }, async () => {
        for (;;) {
            if (options.signal?.aborted) return;
            const index = cursor;
            cursor += 1;
            const snapshot = rest[index];
            if (!snapshot) return;
            const prepared = prepareAnchoredSnapshot(snapshot, anchor, options);
            let outcome = await executeOne(prepared.snapshot, options, request, prepared.warnings);
            if (hasSeriesAnchor(prepared.snapshot) && outcome.status === "failed" && outcome.error instanceof ImageGenerationError && outcome.error.failureStage === "request_prepare") {
                const fallback = removeSeriesAnchorFromSnapshot(prepared.snapshot);
                outcome = await executeOne(fallback, options, request, [...prepared.warnings, "系列锚点无法读取，已自动移除锚点并改用 visual bible 重试。"]);
            }
            if (!options.signal?.aborted) outcomes.push(outcome);
        }
    });
    await Promise.all(workers);
    return outcomes.sort((left, right) => (left.snapshot.seriesIndex ?? 0) - (right.snapshot.seriesIndex ?? 0));
}

export function failedSeriesSnapshots(outcomes: SeriesTaskOutcome[]) {
    return outcomes.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.snapshot);
}

function prepareAnchoredSnapshot(snapshot: ImageDesignRequestSnapshot, anchor: ReferenceImage | undefined, options: SeriesExecutorOptions) {
    const visualBible = snapshot.structuredPlan?.visualBible || "";
    const consistentSnapshot = appendVisualBible(snapshot, visualBible);
    if (!options.anchorChainEnabled || !anchor) return { snapshot: consistentSnapshot, warnings: [] as string[] };
    if (!options.supportsReferenceImages) {
        return {
            snapshot: consistentSnapshot,
            warnings: ["当前模型未声明参考图能力，后续图片改用 visual bible 保持一致性。"],
        };
    }
    const max = options.maxReferenceImages ?? Number.MAX_SAFE_INTEGER;
    if (consistentSnapshot.references.length >= max) {
        return {
            snapshot: consistentSnapshot,
            warnings: [`用户原始参考图已达到模型上限 ${max} 张，未覆盖原图；后续图片改用 visual bible。`],
        };
    }
    return {
        snapshot: appendSeriesAnchor(consistentSnapshot, anchor),
        warnings: [] as string[],
    };
}

function appendVisualBible(snapshot: ImageDesignRequestSnapshot, visualBible: string) {
    if (!visualBible || snapshot.finalPrompt.includes(visualBible)) return snapshot;
    const content = `系列视觉圣经：${visualBible}`;
    const updated = appendRuntimePromptSection(snapshot, "custom", "用户自定义规则", content, content);
    const reproducibility = updated.reproducibilitySnapshot;
    return reproducibility
        ? {
              ...updated,
              reproducibilitySnapshot: {
                  ...reproducibility,
                  customInstructions: reproducibility.customInstructions?.includes(content) ? reproducibility.customInstructions : [reproducibility.customInstructions, content].filter(Boolean).join("\n"),
              },
          }
        : updated;
}

function appendSeriesAnchor(snapshot: ImageDesignRequestSnapshot, anchor: ReferenceImage) {
    const anchorIndex = snapshot.references.length;
    const label = imageReferenceLabel(anchorIndex);
    const content = `${label}（系列第 1 张生成结果）：作为系列视觉锚点，保持角色、风格、配色和版式连续。`;
    const updated = appendRuntimePromptSection(snapshot, "references", "参考图", content, `参考图：\n${content}`);
    const reproducibility = updated.reproducibilitySnapshot;
    return {
        ...updated,
        references: [...snapshot.references, anchor],
        reproducibilitySnapshot: reproducibility
            ? {
                  ...reproducibility,
                  referenceImageRoles: [...(reproducibility.referenceImageRoles || []), { id: anchor.id, label, name: anchor.name, role: "series-anchor" as const }],
              }
            : undefined,
    };
}

function appendRuntimePromptSection(snapshot: ImageDesignRequestSnapshot, id: "custom" | "references", label: string, content: string, manualAppend: string): ImageDesignRequestSnapshot {
    const reproducibility = snapshot.reproducibilitySnapshot;
    if (!reproducibility) return { ...snapshot, finalPrompt: snapshot.finalPrompt.includes(content) ? snapshot.finalPrompt : `${snapshot.finalPrompt}\n\n${manualAppend}` };
    const promptSections = upsertPromptSection(reproducibility.promptSections, id, label, content);
    const systemFinalPrompt = renderPromptSections(promptSections);
    const finalPrompt = reproducibility.manualOverride ? (snapshot.finalPrompt.includes(content) ? snapshot.finalPrompt : `${snapshot.finalPrompt}\n\n${manualAppend}`) : systemFinalPrompt;
    return {
        ...snapshot,
        finalPrompt,
        reproducibilitySnapshot: {
            ...reproducibility,
            promptSections,
            systemFinalPrompt,
            finalPrompt,
        },
    };
}

export function removeSeriesAnchorFromSnapshot(snapshot: ImageDesignRequestSnapshot): ImageDesignRequestSnapshot {
    const anchorIndex = snapshot.references.findIndex((reference) => reference.source === "series-anchor");
    if (anchorIndex < 0) return snapshot;
    const anchor = snapshot.references[anchorIndex];
    const reproducibility = snapshot.reproducibilitySnapshot;
    const label = reproducibility?.referenceImageRoles?.find((reference) => reference.id === anchor.id)?.label || imageReferenceLabel(anchorIndex);
    if (!reproducibility) {
        return {
            ...snapshot,
            references: snapshot.references.filter((reference) => reference !== anchor),
            finalPrompt: removeAnchorPromptFragments(snapshot.finalPrompt, label),
        };
    }
    const promptSections = removeAnchorPromptSection(reproducibility.promptSections, label);
    const systemFinalPrompt = renderPromptSections(promptSections);
    const finalPrompt = reproducibility.manualOverride ? removeAnchorPromptFragments(snapshot.finalPrompt, label) : systemFinalPrompt;
    return {
        ...snapshot,
        references: snapshot.references.filter((reference) => reference !== anchor),
        finalPrompt,
        reproducibilitySnapshot: {
            ...reproducibility,
            referenceImageRoles: (reproducibility.referenceImageRoles || []).filter((reference) => reference.id !== anchor.id),
            promptSections,
            systemFinalPrompt,
            finalPrompt,
        },
    };
}

function hasSeriesAnchor(snapshot: ImageDesignRequestSnapshot) {
    return snapshot.references.some((reference) => reference.source === "series-anchor");
}

function upsertPromptSection(sections: NonNullable<ImageDesignRequestSnapshot["reproducibilitySnapshot"]>["promptSections"], id: "custom" | "references", label: string, content: string) {
    const existing = sections.find((section) => section.id === id);
    if (existing) {
        return sections.map((section) => (section.id === id && !section.content.includes(content) ? { ...section, content: `${section.content}\n${content}` } : section));
    }
    const order = ["user", "goal", "structure", "custom", "layout", "composition", "style", "palette", "lighting", "text", "platform", "references", "output", "negative"];
    return [...sections, { id, label, content }].toSorted((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
}

function removeAnchorPromptSection(sections: NonNullable<ImageDesignRequestSnapshot["reproducibilitySnapshot"]>["promptSections"], label: string) {
    return sections.flatMap((section) => {
        if (section.id !== "references") return [section];
        const next = removeAnchorPromptFragments(section.content, label);
        return next ? [{ ...section, content: next }] : [];
    });
}

function removeAnchorPromptFragments(prompt: string, label: string) {
    return prompt
        .split("\n")
        .map((line) =>
            line
                .split("；")
                .filter((fragment) => !(fragment.includes(label) && fragment.includes("系列视觉锚点")))
                .join("；"),
        )
        .filter((line, index, lines) => line.trim() || (index > 0 && index < lines.length - 1))
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function renderPromptSections(sections: NonNullable<ImageDesignRequestSnapshot["reproducibilitySnapshot"]>["promptSections"]) {
    return sections.map((section) => `${section.label}：\n${section.content}`).join("\n\n");
}

async function executeOne(snapshot: ImageDesignRequestSnapshot, options: SeriesExecutorOptions, request: typeof requestImageBatch, warnings: string[] = []): Promise<SeriesTaskOutcome> {
    if (options.signal?.aborted) return { snapshot, status: "cancelled", warnings };
    const config = { ...options.config, ...snapshot.config, count: "1" };
    let batch: ImageBatchResult;
    try {
        batch = await request(config, snapshot.finalPrompt, snapshot.references, {
            signal: options.signal,
            onStatus: (_index, status, detail) => {
                if (!options.signal?.aborted) options.onStatus?.(snapshot.id, status, detail);
            },
        });
    } catch (error) {
        if (options.signal?.aborted) return { snapshot, status: "cancelled", error: asError(error), warnings };
        return { snapshot, status: "failed", error: asError(error), warnings };
    }
    if (options.signal?.aborted) return { snapshot, status: "cancelled", warnings };
    const result = batch.results[0];
    if (result?.status === "fulfilled") return { snapshot, status: "succeeded", output: result.value, warnings };
    const error = asError(result?.reason || new Error("接口没有返回图片"));
    return {
        snapshot,
        status: error instanceof ImageGenerationError && error.resultUnknown ? "unknown" : error instanceof ImageGenerationError && error.kind === "aborted" ? "cancelled" : "failed",
        error,
        warnings,
    };
}

function outputToAnchor(output: ImageGenerationOutput): ReferenceImage {
    const value = output.source === "data_url" ? output.dataUrl : output.remoteUrl;
    return {
        id: nanoid(),
        name: "系列第 1 张生成结果",
        type: output.mimeType || "image/png",
        dataUrl: value,
        url: output.source === "remote_url" ? output.remoteUrl : undefined,
        role: "series-anchor",
        source: "series-anchor",
    };
}

function asError(value: unknown) {
    return value instanceof Error ? value : new Error(typeof value === "string" ? value : "生成失败");
}
