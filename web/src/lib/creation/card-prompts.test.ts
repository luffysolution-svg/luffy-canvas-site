import { describe, expect, it } from "vitest";

import { resolveSocialPlatformPreset } from "@/constant/creation";
import type { CreationCardDeck, CreationCardPage, CreationProject, PromptVersion } from "@/types/creation";
import { buildCardPagePrompt, buildCardStyleFingerprint } from "./card-prompts";

const now = "2026-07-28T00:00:00.000Z";

const promptVersion: PromptVersion = {
    id: "prompt-1",
    label: "统一极简风格",
    content: "克制的米白与深蓝编辑视觉",
    rawContent: "克制的米白与深蓝编辑视觉",
    reasoning: "统一系列卡片",
    style: "minimalist",
    kind: "optimized",
    sourceBriefVersionId: "brief-1",
    hardConstraints: {
        platform: "xiaohongshu",
        width: 1080,
        height: 1440,
        aspectRatio: "3:4",
        subject: "抽象城市与人物剪影",
        subjectPosition: "视觉主体居中",
        requiredElements: ["克制留白"],
        forbiddenElements: ["品牌标志"],
        requiredTexts: [],
        colorPalette: ["米白", "深蓝"],
        referenceImageRequirements: [],
        safeAreaRequirements: [],
    },
    createdAt: now,
};

const page: CreationCardPage = {
    id: "page-1",
    title: "六步建立内容系统",
    body: "从定位、结构到复盘，把一次灵感变成可以持续迭代的方法。",
    layout: "editorial",
    revision: 1,
    status: "idle",
    reviewStatus: "pending",
    imageHistoryIds: [],
    createdAt: now,
    updatedAt: now,
};

const deck: CreationCardDeck = {
    id: "deck-1",
    platformPresetIds: ["xiaohongshu-post", "douyin-cover"],
    activePlatformPresetId: "xiaohongshu-post",
    styleId: "style-editorial-blue",
    stylePrompt: "米白纸张质感、深蓝几何块、克制编辑排版留白",
    modelConfigId: "model-1",
    quality: "high",
    background: "",
    pages: [page, { ...page, id: "page-2", title: "第二步" }],
    createdAt: now,
    updatedAt: now,
};

const project = {
    id: "project-1",
    name: "内容系统卡片",
    additionalRequirements: "避免照片写实感",
} as CreationProject;

describe("card-prompts", () => {
    it("构造带统一风格、页面语义和平台安全区的无文字底图提示词", () => {
        const preset = resolveSocialPlatformPreset("douyin-cover")!;
        const result = buildCardPagePrompt({ project, deck, page, promptVersion, preset, pageIndex: 0 });

        expect(result.content).toContain("统一风格 ID：style-editorial-blue");
        expect(result.content).toContain(`统一风格指纹：${result.styleFingerprint}`);
        expect(result.content).toContain("页面语义标题：六步建立内容系统");
        expect(result.content).toContain("只生成无文字视觉底图");
        expect(result.content).toContain("准确标题与正文由 Luffy Canvas 后置合成");
        expect(result.hardConstraints).toMatchObject({ platform: "douyin", width: 1080, height: 1920, aspectRatio: "9:16" });
        expect(result.hardConstraints.requiredTexts).toEqual([page.title, page.body]);
        expect(result.hardConstraints.safeAreaRequirements.join(" ")).toContain("顶部 160px、右侧 120px、底部 300px、左侧 80px");
        expect(result.hardConstraints.forbiddenElements).toEqual(expect.arrayContaining(["画面内文字", "乱码", "水印"]));
    });

    it("同一 deck 与 PromptVersion 的所有页面共享稳定风格指纹", () => {
        const otherPage = { ...page, id: "page-2", title: "完全不同的页面语义", layout: "quote" as const };
        const xiaohongshu = buildCardPagePrompt({ project, deck, page, promptVersion, preset: resolveSocialPlatformPreset("xiaohongshu-post")!, pageIndex: 0 });
        const wechat = buildCardPagePrompt({ project, deck, page: otherPage, promptVersion, preset: resolveSocialPlatformPreset("wechat-cover")!, pageIndex: 1 });

        expect(xiaohongshu.styleFingerprint).toBe(wechat.styleFingerprint);
        expect(xiaohongshu.hardConstraints.width).not.toBe(wechat.hardConstraints.width);
    });

    it("风格说明变化时生成新的风格指纹", () => {
        const first = buildCardStyleFingerprint(deck, promptVersion);
        const second = buildCardStyleFingerprint({ ...deck, stylePrompt: "高饱和霓虹拼贴" }, promptVersion);
        expect(first).not.toBe(second);
    });
});
