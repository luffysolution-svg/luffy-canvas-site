import { describe, expect, it, vi } from "vitest";

import type { ImageBatchResult } from "@/services/api/image-batch";
import { ImageGenerationError, ImageRequestUnknownError } from "@/services/api/image-errors";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";
import type { ImageGenerationOutput, ReferenceImage } from "@/types/image";

import type { StructuredPlan } from "../types";
import { executeImageDesignSeries, failedSeriesSnapshots } from "./series-executor";
import type { ImageDesignRequestSnapshot } from "./types";

const visualBible = "固定暖灰色板、圆角网格、同一角色服装与手绘线条";

function snapshot(index: number, references: ReferenceImage[] = []): ImageDesignRequestSnapshot {
    return {
        id: `snapshot-${index}`,
        createdAt: 1_700_000_000_000 + index,
        originalPrompt: `Original ${index}`,
        finalPrompt: `Final ${index}`,
        config: {
            model: "default::gpt-image-2",
            imageModel: "default::gpt-image-2",
            quality: "high",
            size: "1536x2048",
            count: "1",
            background: "",
            optimizeImageReferences: true,
        },
        references,
        designSkillId: "xhs-images",
        designSkillLabel: "小红书系列图",
        skillOptions: {},
        platformPresetId: "xiaohongshu-note-cover",
        platformPresetLabel: "小红书 · 图文笔记封面",
        contentType: "note-cover",
        requestedSize: "1536x2048",
        requestedAspectRatio: "3:4",
        structuredPlan: seriesPlan(),
        seriesGroupId: "series-1",
        seriesIndex: index,
        promptVersion: "prompt-v1",
        compilerVersion: "compiler-v1",
    };
}

function seriesPlan(): StructuredPlan {
    return {
        id: "series-1",
        type: "series",
        title: "系列",
        summary: "三张系列图",
        visualBible,
        sourceDigest: "digest",
        items: [
            { id: "item-0", order: 0, kind: "cover", title: "封面", body: "封面正文" },
            { id: "item-1", order: 1, kind: "content", title: "内容", body: "内容正文" },
            { id: "item-2", order: 2, kind: "summary", title: "总结", body: "总结正文" },
        ],
    };
}

function userReference(id = "user-reference"): ReferenceImage {
    return {
        id,
        name: `${id}.png`,
        type: "image/png",
        dataUrl: "data:image/png;base64,VVNFUg==",
        role: "subject",
        source: "user",
    };
}

function generated(id: string): ImageGenerationOutput {
    return {
        id,
        status: "generated",
        source: "data_url",
        dataUrl: `data:image/png;base64,${id}`,
        mimeType: "image/png",
    };
}

function fulfilled(id: string): ImageBatchResult {
    return {
        results: [{ status: "fulfilled", value: generated(id) }],
        referenceOptimization: { total: 0, optimized: 0 },
    };
}

function rejected(reason: Error): ImageBatchResult {
    return {
        results: [{ status: "rejected", reason }],
        referenceOptimization: { total: 0, optimized: 0 },
    };
}

describe("executeImageDesignSeries", () => {
    it("generates image 1 first and appends it as the only new anchor for later images", async () => {
        const request = vi.fn(async (_config: AiConfig, _prompt: string, _references: ReferenceImage[] = [], _options?: unknown): Promise<ImageBatchResult> => fulfilled(`output-${request.mock.calls.length}`));

        const outcomes = await executeImageDesignSeries({
            config: defaultConfig,
            snapshots: [snapshot(0), snapshot(1, [userReference("reference-1")]), snapshot(2)],
            batchSize: 2,
            anchorChainEnabled: true,
            supportsReferenceImages: true,
            maxReferenceImages: 3,
            request,
        });

        expect(request).toHaveBeenCalledTimes(3);
        expect(request.mock.calls[0][2]).toEqual([]);
        expect(request.mock.calls[0][1]).toContain(`系列视觉圣经：${visualBible}`);
        for (const call of request.mock.calls.slice(1)) {
            const references = call[2] || [];
            expect(references.at(-1)).toMatchObject({
                name: "系列第 1 张生成结果",
                role: "series-anchor",
                source: "series-anchor",
                dataUrl: expect.stringContaining("output-1"),
            });
        }
        expect(request.mock.calls[1][2]?.[0]).toMatchObject({ id: "reference-1", source: "user" });
        expect(outcomes.map((outcome) => outcome.status)).toEqual(["succeeded", "succeeded", "succeeded"]);
        expect(outcomes.map((outcome) => outcome.snapshot.seriesIndex)).toEqual([0, 1, 2]);
    });

    it("keeps original references and falls back to the visual bible at the model limit", async () => {
        const reference = userReference();
        const request = vi.fn(async (_config: AiConfig, _prompt: string, _references: ReferenceImage[] = [], _options?: unknown): Promise<ImageBatchResult> => fulfilled(`output-${request.mock.calls.length}`));

        const outcomes = await executeImageDesignSeries({
            config: defaultConfig,
            snapshots: [snapshot(0), snapshot(1, [reference])],
            batchSize: 1,
            anchorChainEnabled: true,
            supportsReferenceImages: true,
            maxReferenceImages: 1,
            request,
        });

        expect(request.mock.calls[1][2]).toEqual([reference]);
        expect(request.mock.calls[1][1]).toContain(`系列视觉圣经：${visualBible}`);
        expect(outcomes[1].snapshot.references).toEqual([reference]);
        expect(outcomes[1].snapshot.finalPrompt).toContain(visualBible);
        expect(outcomes[1].warnings.some((warning) => warning.includes("上限 1"))).toBe(true);
    });

    it("uses the visual bible when the model has no declared reference-image support", async () => {
        const request = vi.fn(async (_config: AiConfig, _prompt: string, _references: ReferenceImage[] = [], _options?: unknown): Promise<ImageBatchResult> => fulfilled(`output-${request.mock.calls.length}`));

        const outcomes = await executeImageDesignSeries({
            config: defaultConfig,
            snapshots: [snapshot(0), snapshot(1)],
            batchSize: 1,
            anchorChainEnabled: true,
            supportsReferenceImages: false,
            request,
        });

        for (const call of request.mock.calls) {
            expect(call[2]).toEqual([]);
            expect(call[1]).toContain(visualBible);
            expect(call[1]).not.toContain("作为系列视觉锚点");
        }
        expect(outcomes[1].warnings.some((warning) => warning.includes("未声明参考图能力"))).toBe(true);
    });

    it("returns only definitively failed snapshots for a selective retry", async () => {
        const request = vi
            .fn(async (_config: AiConfig, _prompt: string, _references: ReferenceImage[] = [], _options?: unknown): Promise<ImageBatchResult> => fulfilled("unused"))
            .mockResolvedValueOnce(fulfilled("anchor"))
            .mockResolvedValueOnce(rejected(new Error("definitive failure")))
            .mockResolvedValueOnce(rejected(new ImageRequestUnknownError({ message: "result unknown" })));

        const outcomes = await executeImageDesignSeries({
            config: defaultConfig,
            snapshots: [snapshot(0), snapshot(1), snapshot(2)],
            batchSize: 1,
            anchorChainEnabled: false,
            supportsReferenceImages: true,
            request,
        });

        expect(outcomes.map((outcome) => outcome.status)).toEqual(["succeeded", "failed", "unknown"]);
        expect(failedSeriesSnapshots(outcomes).map((item) => item.id)).toEqual(["snapshot-1"]);
    });

    it("automatically retries with the visual bible when a remote series anchor cannot be prepared", async () => {
        const request = vi
            .fn(async (_config: AiConfig, _prompt: string, _references: ReferenceImage[] = [], _options?: unknown): Promise<ImageBatchResult> => fulfilled("unused"))
            .mockResolvedValueOnce(fulfilled("anchor"))
            .mockResolvedValueOnce(rejected(new ImageGenerationError("锚点下载失败", { failureStage: "request_prepare", kind: "url_download" })))
            .mockResolvedValueOnce(fulfilled("fallback"));

        const outcomes = await executeImageDesignSeries({
            config: defaultConfig,
            snapshots: [snapshot(0), snapshot(1)],
            batchSize: 1,
            anchorChainEnabled: true,
            supportsReferenceImages: true,
            request,
        });

        expect(request).toHaveBeenCalledTimes(3);
        expect(request.mock.calls[1][2]?.some((reference) => reference.source === "series-anchor")).toBe(true);
        expect(request.mock.calls[2][2]?.some((reference) => reference.source === "series-anchor")).toBe(false);
        expect(request.mock.calls[2][1]).toContain(visualBible);
        expect(request.mock.calls[2][1]).not.toContain("作为系列视觉锚点");
        expect(outcomes[1]).toMatchObject({ status: "succeeded", warnings: [expect.stringContaining("自动移除锚点")] });
    });
});
