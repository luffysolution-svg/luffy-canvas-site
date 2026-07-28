import { describe, expect, it } from "vitest";

import { designSkillById } from "../registry/design-skills";
import { buildRecommendationMessages } from "./ai-recommender";
import { recommendImageDesign } from "./local-recommender";
import { normalizeAiRecommendation } from "./normalize-recommendation";

describe("recommendImageDesign", () => {
    it.each([
        ["四格漫画里，角色先争论再和解。", "comic"],
        ["请画系统架构图，说明 API、队列和数据库关系。", "diagram"],
        ["将增长率、收入和用户数整理成数据大图。", "infographic"],
        ["做一张高辨识度的视频缩略图封面。", "cover-image"],
        ["整理成小红书知识卡和清单卡。", "xhs-images"],
    ] as const)("selects a matching local Skill for %s", (content, skillId) => {
        expect(recommendImageDesign({ content }).skillId).toBe(skillId);
    });

    it("uses the article workflow for long-form input", () => {
        const recommendation = recommendImageDesign({
            content: Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 节介绍一个独立论点、适用边界、证据和实践建议。`).join("\n"),
        });

        expect(recommendation.skillId).toBe("article-illustrator");
    });

    it("preserves explicit choices before saved preferences and inferred defaults", () => {
        const recommendation = recommendImageDesign({
            content: "制作一张冷静、严谨的研究报告封面。",
            skillId: "cover-image",
            explicitOptions: { palette: "dark" },
            savedOptions: { palette: "warm", rendering: "painterly" },
        });

        expect(recommendation.skillId).toBe("cover-image");
        expect(recommendation.options).toMatchObject({
            palette: "dark",
            rendering: "painterly",
        });
        expect(recommendation.reasoning.palette).toContain("用户");
        expect(recommendation.reasoning.rendering).toContain("偏好");
    });

    it("keeps an explicitly selected platform preset even when content suggests another platform", () => {
        const recommendation = recommendImageDesign({
            content: "小红书图文笔记封面",
            platformPresetId: "youtube-thumbnail",
        });

        expect(recommendation.platformPresetId).toBe("youtube-thumbnail");
    });

    it.each([
        ["cover-image", { preset: "hand-drawn-edu", type: "conceptual", palette: "macaron", aspectRatio: "16:9" }],
        ["xhs-images", { preset: "cute-share", style: "cute", layout: "balanced", aspectRatio: "portrait-3-4" }],
        ["infographic", { layout: "bento-grid", style: "craft-handmade", aspectRatio: "landscape" }],
        ["article-illustrator", { preset: "hand-drawn-edu", illustrationType: "infographic", style: "sketch-notes" }],
        [
            "comic",
            {
                preset: "none",
                artStyle: "ligne-claire",
                tone: "neutral",
                layout: "standard",
                aspectRatio: "3:4",
                dialogueDensity: "medium",
                narrationDensity: "medium",
                partialMode: "images-only",
            },
        ],
        ["diagram", { diagramType: "flowchart" }],
    ] as const)("returns stable concrete fallbacks for %s", (skillId, expected) => {
        const recommendation = recommendImageDesign({
            content: "没有额外风格关键词的中性测试内容",
            skillId,
            skillSelectionExplicit: true,
        });

        expect(recommendation.options).toMatchObject(expected);
        expect(Object.values(recommendation.options)).not.toContain("auto");
        expect(Object.values(recommendation.options)).not.toContain("style-default");
        expect(Object.values(recommendation.options)).not.toContain("platform");
    });

    it("preserves explicit no-Skill and manual-platform selections", () => {
        const recommendation = recommendImageDesign({
            content: "四格漫画与小红书封面",
            skillId: "none",
            skillSelectionExplicit: true,
            platformPresetId: "manual",
            platformSelectionExplicit: true,
        });

        expect(recommendation).toMatchObject({
            skillId: "none",
            platformPresetId: "manual",
            options: {},
        });
    });

    it.each([
        ["high-density-info：把全部指标制作成一张长图", { layout: "dense-modules", style: "morandi-journal", aspectRatio: "portrait", highDensity: true }],
        ["infographic：把全部指标制作成一张通用信息图", { layout: "bento-grid", style: "craft-handmade", aspectRatio: "landscape", highDensity: false }],
    ] as const)("turns the %s shortcut into concrete infographic options", (content, expected) => {
        const recommendation = recommendImageDesign({ content });

        expect(recommendation.skillId).toBe("infographic");
        expect(recommendation.options).toMatchObject(expected);
        expect(recommendation.reasoning.layout).toContain("快捷模式");
        expect(recommendation.reasoning.style).toContain("快捷模式");
        expect(recommendation.reasoning.aspectRatio).toContain("快捷模式");
        expect(recommendation.reasoning.highDensity).toContain("快捷模式");
    });

    it("lets explicit infographic options override shortcut values", () => {
        const recommendation = recommendImageDesign({
            content: "high-density-info：把全部指标制作成一张长图",
            explicitOptions: { layout: "linear-progression", highDensity: false },
        });

        expect(recommendation.options).toMatchObject({
            layout: "linear-progression",
            style: "morandi-journal",
            aspectRatio: "portrait",
            highDensity: false,
        });
        expect(recommendation.reasoning.layout).toContain("用户");
        expect(recommendation.reasoning.highDensity).toContain("用户");
    });

    it("derives comic reading direction and panel count from the selected layout", () => {
        const recommendation = recommendImageDesign({
            content: "制作一页从上到下阅读的移动端条漫",
            skillId: "comic",
            skillSelectionExplicit: true,
        });

        expect(recommendation.options).toMatchObject({
            layout: "webtoon",
            readingDirection: "top-to-bottom",
            pageCount: 1,
            panelCount: 3,
            partialMode: "images-only",
        });
    });

    it("warns about a conflicting explicit comic layout without overwriting it", () => {
        const recommendation = recommendImageDesign({
            content: "移动端条漫",
            skillId: "comic",
            skillSelectionExplicit: true,
            explicitOptions: {
                layout: "webtoon",
                readingDirection: "left-to-right",
                pageCount: 1,
                panelCount: 2,
            },
        });

        expect(recommendation.options).toMatchObject({
            layout: "webtoon",
            readingDirection: "left-to-right",
            panelCount: 2,
        });
        expect(recommendation.warnings).toEqual(expect.arrayContaining([expect.stringContaining("已尊重"), expect.stringContaining("每页 3–5 格")]));
    });

    it("includes the active image-model capabilities in the AI recommendation request", () => {
        const messages = buildRecommendationMessages({
            content: "技术架构图",
            modelCapabilities: {
                provider: "qwen",
                apiFormat: "qwen",
                model: "qwen-image-edit",
                requestedAspectRatio: "16:9",
                resolvedAspectRatio: "16:9",
                supportsReferenceImages: true,
                maxReferenceImages: 3,
                maxCount: 15,
            },
        });

        expect(messages.at(-1)?.content).toContain('"model":"qwen-image-edit"');
        expect(messages.at(-1)?.content).toContain('"supportsReferenceImages":true');
        expect(messages.at(-1)?.content).toContain('"maxReferenceImages":3');
    });
});

describe("normalizeAiRecommendation", () => {
    it("falls back cleanly when the model response is not valid JSON", () => {
        const input = { content: "一张技术文章封面", skillId: "cover-image" as const };
        const fallback = recommendImageDesign(input);

        const normalized = normalizeAiRecommendation("I recommend a blueprint cover.", fallback, input);

        expect(normalized).toMatchObject({
            skillId: fallback.skillId,
            platformPresetId: fallback.platformPresetId,
            options: fallback.options,
            reasoning: fallback.reasoning,
            confidence: fallback.confidence,
            source: "fallback",
        });
        expect(normalized.warnings.some((warning) => warning.includes("JSON"))).toBe(true);
    });

    it("accepts fenced JSON, clamps numeric fields and preserves explicit user options", () => {
        const input = {
            content: "把故事拆成四格漫画。",
            skillId: "comic" as const,
            platformPresetId: "wechat-headline-cover",
            explicitOptions: { artStyle: "manga" },
        };
        const fallback = recommendImageDesign(input);
        const response = `\`\`\`json
{
  "skillId": "diagram",
  "platformPresetId": "xiaohongshu-note-cover",
  "options": {
    "artStyle": "invented-style",
    "layout": "cinematic",
    "panelCount": 999
  },
  "reasoning": {
    "layout": "A cinematic rhythm supports the story."
  },
  "confidence": 2
}
\`\`\``;

        const normalized = normalizeAiRecommendation(response, fallback, input);

        expect(normalized).toMatchObject({
            skillId: "comic",
            platformPresetId: "wechat-headline-cover",
            source: "ai",
            confidence: 1,
            options: {
                artStyle: "manga",
                layout: "cinematic",
                panelCount: 40,
            },
        });
        expect(normalized.reasoning.artStyle).toContain("用户");
    });

    it("uses fallback ids and options for unknown registry values", () => {
        const input = { content: "技术流程图" };
        const fallback = recommendImageDesign(input);
        const normalized = normalizeAiRecommendation(
            JSON.stringify({
                skillId: "made-up-skill",
                platformPresetId: "made-up-preset",
                options: { diagramType: "made-up-type" },
            }),
            fallback,
            input,
        );

        expect(normalized.skillId).toBe(fallback.skillId);
        expect(normalized.platformPresetId).toBe(fallback.platformPresetId);
        expect(normalized.options.diagramType).toBe(fallback.options.diagramType);
    });

    it("does not leak option keys from the fallback Skill when AI selects another valid Skill", () => {
        const input = { content: "制作一张概念封面" };
        const fallback = recommendImageDesign(input);
        expect(fallback.skillId).toBe("cover-image");

        const normalized = normalizeAiRecommendation(
            JSON.stringify({
                skillId: "comic",
                platformPresetId: "manual",
                options: { artStyle: "manga", panelCount: 4 },
            }),
            fallback,
            input,
        );
        const comicKeys = new Set(designSkillById("comic").optionGroups.map((group) => group.key));

        expect(normalized.skillId).toBe("comic");
        expect(normalized.options).toMatchObject({ artStyle: "manga", panelCount: 4 });
        expect(Object.keys(normalized.options).every((key) => comicKeys.has(key))).toBe(true);
        expect(normalized.options).not.toHaveProperty("type");
        expect(normalized.options).not.toHaveProperty("rendering");
    });

    it("rejects AI selection strategies such as auto and keeps concrete fallbacks", () => {
        const input = { content: "中性的文章封面", skillId: "cover-image" as const };
        const fallback = recommendImageDesign(input);
        const normalized = normalizeAiRecommendation(
            JSON.stringify({
                skillId: "cover-image",
                platformPresetId: "manual",
                options: { type: "auto", palette: "style-default" },
            }),
            fallback,
            input,
        );

        expect(normalized.options.type).toBe(fallback.options.type);
        expect(normalized.options.palette).toBe(fallback.options.palette);
    });
});
