import { describe, expect, it } from "vitest";

import { HARD_CONSTRAINTS_BEGIN } from "./prompt-templates";
import { CreationProjectSchema, CreationSchemaError, parseCreativeBriefResponse, parsePromptVersionsResponse, safeParseCreationProject } from "./creation-schema";
import type { CreationGeneratedImage, CreationProject, PromptHardConstraints } from "@/types/creation";

const appContext = {
    id: "brief-1",
    platform: "xiaohongshu" as const,
    width: 1080,
    height: 1440,
    aspectRatio: "3:4",
    sourceContent: "催化循环包含吸附、反应与脱附。",
};

const damagedBriefResponse = `结果如下：
\`\`\`json
{
  id: 'model-id',
  mode: 'research',
  platform: 'wechat',
  width: 1,
  height: 1,
  aspectRatio: '1:1',
  sourceContent: '模型伪造的原文',
  scene: '知识卡封面',
  purpose: '解释复杂概念',
  audience: '大学生',
  coreMessage: '三步理解催化循环',
  title: '三步看懂催化循环',
  visualSubject: '居中的催化循环示意',
  composition: '主体居中并预留标题区域',
  visualStyle: '科学信息图',
  colorPalette: ['深蓝', '青色',],
  onImageText: ['吸附', '反应', '脱附'],
  requiredElements: ['循环箭头'],
  forbiddenElements: ['期刊 Logo'],
}
\`\`\``;

const hardConstraints: PromptHardConstraints = {
    platform: "xiaohongshu",
    width: 1080,
    height: 1440,
    aspectRatio: "3:4",
    subject: "催化循环示意",
    subjectPosition: "居中",
    requiredElements: ["循环箭头"],
    forbiddenElements: ["期刊 Logo"],
    requiredTexts: ["三步看懂催化循环"],
    colorPalette: ["深蓝", "青色"],
    referenceImageRequirements: [],
    safeAreaRequirements: ["顶部标题安全区"],
};

describe("creation-schema", () => {
    it("修复 fenced 损坏 JSON，并始终以应用平台和尺寸覆盖模型值", () => {
        const brief = parseCreativeBriefResponse(damagedBriefResponse, appContext);
        expect(brief.id).toBe("brief-1");
        expect(brief.mode).toBe("social");
        expect(brief.platform).toBe("xiaohongshu");
        expect(brief.width).toBe(1080);
        expect(brief.height).toBe(1440);
        expect(brief.aspectRatio).toBe("3:4");
        expect(brief.sourceContent).toBe(appContext.sourceContent);
    });

    it("拒绝模型 payload 中未声明的业务字段", () => {
        const response = damagedBriefResponse.replace("forbiddenElements: ['期刊 Logo'],", "forbiddenElements: ['期刊 Logo'],\n  unsupportedClaim: '虚构结论',");
        expect(() => parseCreativeBriefResponse(response, appContext)).toThrow();
    });

    it("严格拒绝缺少必填字段的创作方案", () => {
        const response = damagedBriefResponse.replace("  coreMessage: '三步理解催化循环',\n", "");
        expect(() => parseCreativeBriefResponse(response, appContext)).toThrow(CreationSchemaError);
    });

    it("严格解析提示词版本并为每个版本程序化附加硬约束", () => {
        const response = `\`\`\`json
        {versions: [
          {label: '自然语言版', content: '一张清晰的知识卡', reasoning: '强化信息层级', style: 'general-natural-language'},
          {label: '小红书版', content: '高可读性的知识卡封面', reasoning: '突出封面钩子', style: 'xiaohongshu-knowledge-card'},
        ]}
        \`\`\``;
        let index = 0;
        const versions = parsePromptVersionsResponse(response, {
            sourceBriefVersionId: "brief-version-1",
            hardConstraints,
            parentId: "original-version",
            createdAt: "2026-07-28T00:00:00.000Z",
            idFactory: () => `prompt-${++index}`,
        });
        expect(versions).toHaveLength(2);
        expect(versions[0].rawContent).toBe("一张清晰的知识卡");
        expect(versions[0].content).toContain(HARD_CONSTRAINTS_BEGIN);
        expect(versions[0].content).toContain("画布尺寸：1080 × 1440");
        expect(versions[1].hardConstraints).toEqual(hardConstraints);
    });

    it("拒绝提示词版本的额外字段和未知风格", () => {
        const extraField = JSON.stringify({ versions: [{ label: "版本", content: "提示词", reasoning: "说明", style: "minimalist", extra: true }] });
        const unknownStyle = JSON.stringify({ versions: [{ label: "版本", content: "提示词", reasoning: "说明", style: "unknown-style" }] });
        const options = { sourceBriefVersionId: "brief-version-1", hardConstraints };
        expect(() => parsePromptVersionsResponse(extraField, options)).toThrow(CreationSchemaError);
        expect(() => parsePromptVersionsResponse(unknownStyle, options)).toThrow(CreationSchemaError);
    });

    it("严格校验可恢复的完整项目及图片归档引用", () => {
        const brief = parseCreativeBriefResponse(damagedBriefResponse, appContext);
        const promptVersion = parsePromptVersionsResponse(JSON.stringify({ versions: [{ label: "极简版", content: "知识卡封面", reasoning: "减少干扰", style: "minimalist" }] }), {
            sourceBriefVersionId: "brief-version-1",
            hardConstraints,
            createdAt: "2026-07-28T00:00:00.000Z",
            idFactory: () => "prompt-version-1",
        })[0];
        const image: CreationGeneratedImage = {
            id: "image-1",
            storageKey: "image:stored-1",
            mimeType: "image/png",
            providerId: "openai-compatible",
            modelId: "image-model",
            modelConfigId: "model-config-1",
            promptVersionId: promptVersion.id,
            createdAt: "2026-07-28T00:00:00.000Z",
        };
        const project: CreationProject = {
            id: "project-1",
            name: "催化循环知识卡",
            mode: "social",
            platformPresetId: "xiaohongshu-post",
            scene: "知识卡封面",
            additionalRequirements: "避免小字号",
            sourceContent: appContext.sourceContent,
            status: "awaiting_image_review",
            lastStableStatus: "awaiting_image_review",
            briefVersions: [{ id: "brief-version-1", brief, source: "model", createdAt: "2026-07-28T00:00:00.000Z" }],
            selectedBriefVersionId: "brief-version-1",
            promptVersions: [promptVersion],
            selectedPromptVersionId: promptVersion.id,
            candidates: [{ id: "candidate-1", index: 0, promptVersionId: promptVersion.id, modelConfigId: "model-config-1", size: "1080x1440", quality: "high", background: "", status: "stored", imageId: image.id, image, feedback: [] }],
            generatedImages: [image],
            selectedImageId: image.id,
            reviews: [],
            createdAt: "2026-07-28T00:00:00.000Z",
            updatedAt: "2026-07-28T00:00:00.000Z",
        };
        expect(CreationProjectSchema.safeParse(project).success).toBe(true);
        expect(safeParseCreationProject({ ...project, selectedImageId: "missing-image" }).success).toBe(false);
        expect(safeParseCreationProject({ ...project, unknownField: true }).success).toBe(false);

        const cardDeck = {
            id: "deck-1",
            platformPresetIds: ["xiaohongshu-post", "wechat-cover"],
            activePlatformPresetId: "xiaohongshu-post",
            styleId: "style-1",
            stylePrompt: "统一米白与深蓝配色",
            modelConfigId: "model-config-1",
            quality: "high",
            background: "",
            styleAnchorPageId: "page-1",
            styleAnchorImageId: image.id,
            pages: [
                {
                    id: "page-1",
                    title: "三步看懂催化循环",
                    body: "吸附、反应与脱附",
                    layout: "cover",
                    revision: 1,
                    generatedRevision: 1,
                    status: "stored",
                    reviewStatus: "approved",
                    imageId: image.id,
                    imageHistoryIds: [image.id],
                    generation: {
                        id: "generation-1",
                        batchId: "batch-1",
                        styleId: "style-1",
                        pageRevision: 1,
                        promptVersionId: promptVersion.id,
                        platformPresetId: "xiaohongshu-post",
                        modelConfigId: "model-config-1",
                        providerId: "openai-compatible",
                        modelId: "image-model",
                        referencePageId: "page-1",
                        referenceImageId: image.id,
                        quality: "high",
                        background: "",
                        status: "stored",
                        imageId: image.id,
                        createdAt: "2026-07-28T00:00:00.000Z",
                        updatedAt: "2026-07-28T00:00:00.000Z",
                    },
                    createdAt: "2026-07-28T00:00:00.000Z",
                    updatedAt: "2026-07-28T00:00:00.000Z",
                },
            ],
            createdAt: "2026-07-28T00:00:00.000Z",
            updatedAt: "2026-07-28T00:00:00.000Z",
        } as const;
        expect(safeParseCreationProject({ ...project, cardDeck }).success).toBe(true);
        expect(safeParseCreationProject({ ...project, cardDeck: { ...cardDeck, activePlatformPresetId: "douyin-cover" } }).success).toBe(false);
        expect(safeParseCreationProject({ ...project, cardDeck: { ...cardDeck, styleAnchorImageId: "missing-image" } }).success).toBe(false);
        expect(
            safeParseCreationProject({
                ...project,
                cardDeck: {
                    ...cardDeck,
                    pages: [{ ...cardDeck.pages[0], generation: { ...cardDeck.pages[0].generation, promptVersionId: "missing-prompt" } }],
                },
            }).success,
        ).toBe(false);
        expect(safeParseCreationProject({ ...project, cardDeck: { ...cardDeck, pages: [{ ...cardDeck.pages[0], extra: true }] } }).success).toBe(false);
    });
});
