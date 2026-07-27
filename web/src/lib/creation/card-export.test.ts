import { describe, expect, it } from "vitest";

import { readZip } from "@/lib/zip";
import type { CreationCardDeck, CreationCardPage, CreationGeneratedImage, CreationProject } from "@/types/creation";
import { buildCardExportManifest, buildCardExportPlan, cardExportFileName, createCardDeckArchive } from "./card-export";

const now = "2026-07-28T00:00:00.000Z";

function cardPage(id: string, title: string, imageId: string, layout: CreationCardPage["layout"] = "cover"): CreationCardPage {
    return {
        id,
        title,
        body: `${title}的正文内容`,
        layout,
        revision: 1,
        generatedRevision: 1,
        status: "stored",
        reviewStatus: "approved",
        imageId,
        imageHistoryIds: [imageId],
        createdAt: now,
        updatedAt: now,
    };
}

function generatedImage(id: string): CreationGeneratedImage {
    return {
        id,
        dataUrl: "data:image/png;base64,AA==",
        width: 1080,
        height: 1440,
        mimeType: "image/png",
        providerId: "openai-compatible",
        modelId: "image-model",
        modelConfigId: "model-config-1",
        promptVersionId: "prompt-version-1",
        createdAt: now,
    };
}

const pages = [cardPage("page-1", "开场：为什么要做内容系统？", "image-1"), cardPage("page-2", "方法 / 第二步", "image-2", "editorial")];

const deck: CreationCardDeck = {
    id: "deck-1",
    platformPresetIds: ["xiaohongshu-post", "wechat-cover", "douyin-cover"],
    activePlatformPresetId: "xiaohongshu-post",
    styleId: "style-1",
    stylePrompt: "统一编辑风格",
    modelConfigId: "model-config-1",
    quality: "high",
    background: "",
    pages,
    createdAt: now,
    updatedAt: now,
};

const project = {
    id: "project-1",
    name: "内容系统 / 多平台",
    generatedImages: [generatedImage("image-1"), generatedImage("image-2")],
} as unknown as CreationProject;

describe("card-export", () => {
    it("按集中式平台顺序与页面顺序构建稳定的多平台导出计划", () => {
        const plan = buildCardExportPlan(project, deck, ["douyin-cover", "x", "wechat-cover"]);

        expect(plan.platformPresetIds).toEqual(["wechat-cover", "x-landscape", "douyin-cover"]);
        expect(plan.entries.map((entry) => entry.fileName)).toEqual([
            "wechat-cover/01-开场-为什么要做内容系统.png",
            "wechat-cover/02-方法-第二步.png",
            "x-landscape/01-开场-为什么要做内容系统.png",
            "x-landscape/02-方法-第二步.png",
            "douyin-cover/01-开场-为什么要做内容系统.png",
            "douyin-cover/02-方法-第二步.png",
        ]);
        expect(plan.entries[0]).toMatchObject({ pageId: "page-1", sourceImageId: "image-1", platformPresetId: "wechat-cover" });
        expect(plan.entries.map((entry) => [entry.renderPlan.width, entry.renderPlan.height])).toEqual([
            [900, 383],
            [900, 383],
            [1200, 675],
            [1200, 675],
            [1080, 1920],
            [1080, 1920],
        ]);
    });

    it("生成稳定安全的目录与文件名", () => {
        expect(cardExportFileName("xiaohongshu-post", 0, '  标题 / 含有:*?"非法字符  ')).toBe("xiaohongshu-post/01-标题-含有-非法字符.png");
        expect(cardExportFileName("x-landscape", 9, "")).toBe("x-landscape/10-未命名页面.png");
    });

    it("manifest 只含交付与溯源字段，不包含安全区覆盖层", () => {
        const plan = buildCardExportPlan(project, deck, ["xiaohongshu-post"]);
        const manifest = buildCardExportManifest(plan, now);

        expect(manifest.files).toHaveLength(2);
        expect(manifest.files[0]).toMatchObject({ path: "xiaohongshu-post/01-开场-为什么要做内容系统.png", width: 1080, height: 1440, backgroundImageId: "image-1" });
        expect(JSON.stringify(manifest)).not.toContain("safeArea");
        expect(JSON.stringify(manifest)).not.toContain("安全区");
    });

    it("渲染多页 PNG、附加 manifest 并返回 ZIP Blob", async () => {
        const plan = buildCardExportPlan(project, deck, ["wechat-cover"]);
        let activeRenders = 0;
        let maxActiveRenders = 0;
        const renderOrder: string[] = [];
        const result = await createCardDeckArchive({
            plan,
            exportedAt: now,
            resolveBackground: async (entry) => new Blob([entry.sourceImageId], { type: "image/png" }),
            render: async ({ plan: renderPlan }) => {
                activeRenders += 1;
                maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
                renderOrder.push(`${renderPlan.width}x${renderPlan.height}`);
                await new Promise((resolve) => setTimeout(resolve, 0));
                activeRenders -= 1;
                return new Blob([`${renderPlan.width}x${renderPlan.height}`], { type: "image/png" });
            },
        });

        expect(result.kind).toBe("zip");
        expect(maxActiveRenders).toBe(1);
        expect(renderOrder).toEqual(["900x383", "900x383"]);
        const files = await readZip(result.blob);
        expect([...files.keys()]).toEqual(["manifest.json", "wechat-cover/01-开场-为什么要做内容系统.png", "wechat-cover/02-方法-第二步.png"]);
        expect(await files.get("wechat-cover/01-开场-为什么要做内容系统.png")!.text()).toBe("900x383");
        const manifest = JSON.parse(await files.get("manifest.json")!.text());
        expect(manifest).toMatchObject({ exportedAt: now, platformPresetIds: ["wechat-cover"] });
        expect(JSON.stringify(manifest)).not.toContain("safeArea");
    });

    it("单平台单页直接返回 PNG Blob 与 manifest", async () => {
        const onePageDeck = { ...deck, pages: [pages[0]], platformPresetIds: ["x-landscape"] };
        const plan = buildCardExportPlan(project, onePageDeck, onePageDeck.platformPresetIds);
        const result = await createCardDeckArchive({
            plan,
            exportedAt: now,
            resolveBackground: async () => new Blob(["source"], { type: "image/png" }),
            render: async () => new Blob(["png"], { type: "image/png" }),
        });

        expect(result).toMatchObject({ kind: "single", fileName: "01-开场-为什么要做内容系统.png" });
        expect(result.blob.type).toBe("image/png");
        expect(result.manifest.files).toHaveLength(1);
    });
});
