import { describe, expect, it } from "vitest";

import {
    addCreationCardPage,
    createCreationCardDeck,
    createCreationCardPage,
    moveCreationCardPage,
    removeCreationCardPage,
    splitCreationCardPages,
    updateCreationCardPage,
} from "./card-pages";

const timestamp = "2026-07-28T00:00:00.000Z";

describe("card pages", () => {
    it("按 Markdown 标题生成可排序的 6 页卡片", () => {
        let id = 0;
        const pages = splitCreationCardPages(
            ["# 总览", "核心观点。", "## 背景", "背景说明。", "## 方法", "方法说明。", "## 结果", "结果说明。", "## 案例", "案例说明。", "## 总结", "行动建议。"].join("\n"),
            { targetPageCount: 6, idFactory: () => `page-${++id}`, now: () => timestamp },
        );

        expect(pages).toHaveLength(6);
        expect(pages.map((page) => page.title)).toEqual(["总览", "背景", "方法", "结果", "案例", "总结"]);
        expect(pages[0]).toMatchObject({ id: "page-1", layout: "cover", revision: 1, status: "idle", reviewStatus: "pending", createdAt: timestamp });
        expect(pages.slice(1).every((page) => page.layout === "editorial")).toBe(true);
    });

    it("普通文章可指定 1–10 页并按句子拆分", () => {
        const article = Array.from({ length: 20 }, (_, index) => `第 ${index + 1} 个观点需要清晰解释。`).join("");
        expect(splitCreationCardPages(article, { targetPageCount: 6 })).toHaveLength(6);
        expect(splitCreationCardPages(article, { targetPageCount: 100 })).toHaveLength(10);
        expect(splitCreationCardPages(article, { targetPageCount: 0 })).toHaveLength(1);
    });

    it("直接从文章创建默认 6 页 deck，并规范化平台 ID", () => {
        let id = 0;
        const deck = createCreationCardDeck({
            sourceContent: "第一部分。第二部分。第三部分。第四部分。第五部分。第六部分。",
            primaryPlatformPresetId: "xiaohongshu",
            platformPresetIds: ["wechat", "x-landscape", "xiaohongshu-post"],
            modelConfigId: "channel::image-model",
            quality: "high",
            background: "",
            stylePrompt: "统一米白和深红配色",
            idFactory: () => `id-${++id}`,
            now: () => timestamp,
        });

        expect(deck).toMatchObject({
            id: "id-1",
            activePlatformPresetId: "xiaohongshu-post",
            platformPresetIds: ["xiaohongshu-post", "wechat-cover", "x-landscape"],
            styleId: "id-2",
            stylePrompt: "统一米白和深红配色",
            modelConfigId: "channel::image-model",
            quality: "high",
            createdAt: timestamp,
        });
        expect(deck.pages).toHaveLength(6);
    });

    it("编辑页面增加 revision、重置审核与生成状态，但保留旧图", () => {
        const base = createCreationCardPage({ title: "旧标题", body: "旧正文", layout: "cover" }, { idFactory: () => "page-1", now: () => timestamp });
        const page = {
            ...base,
            generatedRevision: 1,
            status: "stored" as const,
            reviewStatus: "approved" as const,
            imageId: "image-1",
            imageHistoryIds: ["image-0", "image-1"],
            error: { id: "error-1", stage: "image_model" as const, message: "旧错误", createdAt: timestamp },
            generation: {
                id: "generation-1",
                batchId: "batch-1",
                styleId: "style-1",
                pageRevision: 1,
                promptVersionId: "prompt-1",
                platformPresetId: "xiaohongshu-post",
                modelConfigId: "channel::image-model",
                quality: "high",
                background: "",
                status: "stored" as const,
                imageId: "image-1",
                createdAt: timestamp,
                updatedAt: timestamp,
            },
        };

        const next = updateCreationCardPage([page], page.id, { title: "新标题", layout: "split" }, { now: () => "2026-07-28T01:00:00.000Z" });

        expect(next[0]).toMatchObject({
            title: "新标题",
            layout: "split",
            revision: 2,
            generatedRevision: 1,
            status: "idle",
            reviewStatus: "pending",
            imageId: "image-1",
            imageHistoryIds: ["image-0", "image-1"],
            updatedAt: "2026-07-28T01:00:00.000Z",
        });
        expect(next[0].error).toBeUndefined();
        expect(next[0].generation).toBeUndefined();
        expect(page.revision).toBe(1);
    });

    it("增删移动只返回新顺序并遵守 1–10 页边界", () => {
        const page = (id: string) => createCreationCardPage({ title: id, body: id }, { idFactory: () => id, now: () => timestamp });
        const first = page("first");
        const second = page("second");
        const third = page("third");

        expect(addCreationCardPage([first, third], second, 1).map((item) => item.id)).toEqual(["first", "second", "third"]);
        expect(moveCreationCardPage([first, second, third], "first", 2).map((item) => item.id)).toEqual(["second", "third", "first"]);
        expect(removeCreationCardPage([first, second], "first")).toEqual([second]);
        expect(() => removeCreationCardPage([first], "first")).toThrow("至少保留 1 页");
        expect(() => addCreationCardPage(Array.from({ length: 10 }, (_, index) => page(`page-${index}`)), page("extra"))).toThrow("最多支持 10 页");
    });
});
