import { describe, expect, it } from "vitest";

import { defaultSkillOptions, designSkillById } from "../registry/design-skills";
import { platformPresetById } from "../registry/platform-presets";
import type { ImageModelContext, PromptCompileInput } from "../types";
import { compileFinalPrompt } from "./compile-final-prompt";
import { expandPresetOptions } from "./compile-skill";

const openAiModel: ImageModelContext = {
    provider: "openai",
    apiFormat: "openai",
    model: "gpt-image-2",
    quality: "auto",
    count: 1,
};

function compileInput(overrides: Partial<PromptCompileInput> = {}): PromptCompileInput {
    return {
        userPrompt: "A quiet editorial cover about renewable energy",
        designSkill: designSkillById("none"),
        skillOptions: {},
        referenceImageRoles: [],
        language: "zh-CN",
        model: openAiModel,
        ...overrides,
    };
}

describe("compileFinalPrompt", () => {
    it("keeps the original prompt byte-for-byte when no Skill or platform rule is active", () => {
        const prompt = "Keep the subject centered; preserve product identity.";

        const compiled = compileFinalPrompt(compileInput({ userPrompt: prompt }));

        expect(compiled.systemFinalPrompt).toBe(prompt);
        expect(compiled.finalPrompt).toBe(prompt);
        expect(compiled.promptSections.map((section) => section.id)).toEqual(["user", "output"]);
        expect(compiled.manualOverride).toBe(false);
    });

    it("adds the selected visible-text language only on compiled design paths", () => {
        const english = compileFinalPrompt(
            compileInput({
                designSkill: designSkillById("cover-image"),
                skillOptions: defaultSkillOptions("cover-image"),
                language: "en",
            }),
        );
        const raw = compileFinalPrompt(compileInput({ userPrompt: "只保留这句原文", language: "en" }));

        expect(english.promptSections.find((section) => section.id === "text")?.content).toContain("英文");
        expect(raw.finalPrompt).toBe("只保留这句原文");
    });

    it("emits sections in a stable canonical order independent of option insertion order", () => {
        const skill = designSkillById("cover-image");
        const platformPreset = platformPresetById("wechat-headline-cover");
        const shared = {
            designSkill: skill,
            platformPreset,
            customInstructions: "Keep the supplied headline unchanged.",
            structuredContent: "Headline: A practical guide",
            referenceImageRoles: [{ id: "reference-1", label: "Reference 1", role: "style" as const }],
        };
        const first = compileFinalPrompt(
            compileInput({
                ...shared,
                skillOptions: { type: "hero", palette: "cool", rendering: "digital" },
            }),
        );
        const second = compileFinalPrompt(
            compileInput({
                ...shared,
                skillOptions: { rendering: "digital", palette: "cool", type: "hero" },
            }),
        );
        const canonicalOrder = ["user", "goal", "structure", "custom", "layout", "composition", "style", "palette", "lighting", "text", "platform", "references", "output", "negative"];
        const sectionIds = first.promptSections.map((section) => section.id);

        expect(sectionIds).toEqual([...new Set(sectionIds)]);
        expect(sectionIds.map((id) => canonicalOrder.indexOf(id))).toEqual([...sectionIds.map((id) => canonicalOrder.indexOf(id))].sort((left, right) => left - right));
        expect(first.promptSections).toEqual(second.promptSections);
        expect(first.systemFinalPrompt).toBe(second.systemFinalPrompt);
    });

    it("uses a manual final prompt without mutating the compiled system prompt or snapshot", () => {
        const skill = designSkillById("cover-image");
        const system = compileFinalPrompt(
            compileInput({
                designSkill: skill,
                skillOptions: defaultSkillOptions(skill.id),
            }),
        );
        const overridden = compileFinalPrompt(
            compileInput({
                designSkill: skill,
                skillOptions: defaultSkillOptions(skill.id),
                manualOverride: true,
                manualFinalPrompt: "  Render only this reviewed final prompt.  ",
            }),
        );

        expect(overridden.systemFinalPrompt).toBe(system.systemFinalPrompt);
        expect(overridden.finalPrompt).toBe("Render only this reviewed final prompt.");
        expect(overridden.manualOverride).toBe(true);
        expect(overridden.reproducibilitySnapshot).toMatchObject({
            systemFinalPrompt: system.systemFinalPrompt,
            finalPrompt: "Render only this reviewed final prompt.",
            manualOverride: true,
        });
    });

    it("compiles user-provided custom option values instead of silently discarding them", () => {
        const customRule = "radial research graph with copper connectors";
        const compiled = compileFinalPrompt(
            compileInput({
                designSkill: designSkillById("diagram"),
                skillOptions: {
                    diagramType: "custom",
                    customDiagramType: customRule,
                },
            }),
        );

        expect(compiled.systemFinalPrompt).toContain(customRule);
        expect(compiled.reproducibilitySnapshot.skillOptions).toEqual({
            diagramType: "custom",
            customDiagramType: customRule,
        });
    });

    it("ignores stale hidden custom fields and text-density controls", () => {
        const cover = compileFinalPrompt(
            compileInput({
                designSkill: designSkillById("cover-image"),
                skillOptions: {
                    palette: "warm",
                    customPalette: "stale cyan palette",
                },
            }),
        );
        const comic = compileFinalPrompt(
            compileInput({
                designSkill: designSkillById("comic"),
                skillOptions: {
                    textMode: "no-text",
                    dialogueDensity: "high",
                    narrationDensity: "high",
                },
            }),
        );

        expect(cover.finalPrompt).not.toContain("stale cyan palette");
        expect(comic.finalPrompt).toContain("不得出现");
        expect(comic.finalPrompt).not.toContain("气泡数量");
        expect(comic.finalPrompt).not.toContain("旁白框数量");
    });

    it("treats the selected platform generation size as the OpenAI request constraint", () => {
        const platformPreset = platformPresetById("wechat-headline-cover");
        expect(platformPreset).toBeDefined();

        const compiled = compileFinalPrompt(compileInput({ platformPreset }));

        expect(compiled.providerMapping).toMatchObject({
            requestedSize: "1920x816",
            requestedAspectRatio: "2.35:1",
            resolvedSize: "1920x816",
            resolvedAspectRatio: "2.35:1",
            support: "unknown",
            requiresConfirmation: false,
        });
        expect(compiled.resolvedSize).toBe("1920x816");
        expect(compiled.finalPrompt).toMatch(/文字密度 [低中高]/);
        expect(compiled.finalPrompt).not.toMatch(/文字密度 (?:low|medium|high)/);
    });

    it("surfaces an explicit confirmation warning for a closest-ratio provider mapping", () => {
        const platformPreset = platformPresetById("wechat-headline-cover");
        const compiled = compileFinalPrompt(
            compileInput({
                platformPreset,
                model: {
                    ...openAiModel,
                    provider: "gemini",
                    apiFormat: "gemini",
                    model: "gemini-3.1-flash-image",
                },
            }),
        );

        expect(compiled.providerMapping).toMatchObject({
            requestedSize: "1920x816",
            requestedAspectRatio: "2.35:1",
            resolvedSize: "21:9",
            resolvedAspectRatio: "21:9",
            support: "closest-ratio",
            requiresConfirmation: true,
        });
        expect(compiled.warnings.some((warning) => warning.includes("2.35:1") && warning.includes("21:9"))).toBe(true);
    });

    it("surfaces scaled runtime mappings and records the actual request in the snapshot", () => {
        const platformPreset = platformPresetById("wechat-article-landscape");
        const compiled = compileFinalPrompt(
            compileInput({
                platformPreset,
                model: {
                    ...openAiModel,
                    provider: "qwen",
                    apiFormat: "qwen",
                    model: "qwen-image-2.0-pro",
                    requestedSize: "1920x1080",
                    requestedAspectRatio: "16:9",
                    resolvedSize: "1664x928",
                    resolvedAspectRatio: "16:9",
                    mappingSupport: "scaled",
                    mappingRequiresConfirmation: true,
                    mappingNote: "Runtime model size mapping.",
                },
            }),
        );

        expect(compiled.providerMapping).toMatchObject({
            requestedSize: "1920x1080",
            resolvedSize: "1664x928",
            support: "scaled",
            requiresConfirmation: true,
        });
        expect(compiled.warnings.some((warning) => warning.includes("1920x1080") && warning.includes("1664x928"))).toBe(true);
        expect(compiled.reproducibilitySnapshot).toMatchObject({
            resolvedSize: "1664x928",
            resolvedAspectRatio: "16:9",
        });
    });

    it("expands preset preferences only into unresolved selection strategies", () => {
        const skill = designSkillById("xhs-images");

        expect(
            expandPresetOptions(skill, {
                preset: "hand-drawn-edu",
                style: "auto",
                layout: "style-default",
                palette: "platform",
            }),
        ).toMatchObject({
            style: "sketch-notes",
            layout: "flow",
            palette: "macaron",
        });
        expect(
            expandPresetOptions(skill, {
                preset: "hand-drawn-edu",
                style: "custom",
                customStyle: "用户定制拼贴风",
                layout: "dense",
                palette: "warm",
            }),
        ).toMatchObject({
            style: "custom",
            customStyle: "用户定制拼贴风",
            layout: "dense",
            palette: "warm",
        });
    });

    it("lets platform constraints suppress a conflicting Skill aspect ratio", () => {
        const skill = designSkillById("cover-image");
        const platformPreset = platformPresetById("wechat-headline-cover");
        const aspectFragment = skill.optionGroups.find((group) => group.key === "aspectRatio")?.options?.find((option) => option.id === "3:4")?.promptFragment;

        const compiled = compileFinalPrompt(
            compileInput({
                designSkill: skill,
                platformPreset,
                skillOptions: {
                    ...defaultSkillOptions(skill.id),
                    aspectRatio: "3:4",
                },
            }),
        );

        expect(aspectFragment).toBeTruthy();
        expect(compiled.finalPrompt).not.toContain(aspectFragment);
        expect(compiled.providerMapping.requestedAspectRatio).toBe("2.35:1");
        expect(compiled.finalPrompt).toContain("2.35:1");
    });

    it("warns about incompatible explicit options without replacing either selection", () => {
        const skill = designSkillById("cover-image");
        const palette = skill.optionGroups.find((group) => group.key === "palette")?.options?.find((option) => option.id === "elegant");
        const rendering = skill.optionGroups.find((group) => group.key === "rendering")?.options?.find((option) => option.id === "pixel");

        const compiled = compileFinalPrompt(
            compileInput({
                designSkill: skill,
                skillOptions: {
                    ...defaultSkillOptions(skill.id),
                    palette: "elegant",
                    rendering: "pixel",
                },
            }),
        );

        expect(compiled.finalPrompt).toContain(palette?.promptFragment);
        expect(compiled.finalPrompt).toContain(rendering?.promptFragment);
        expect(compiled.warnings).toContainEqual(expect.stringContaining("不推荐组合"));
        expect(compiled.warnings).toContainEqual(expect.stringContaining("已尊重显式选择"));
    });

    it("does not leak internal selection strategy ids into the generated prompt", () => {
        const xhs = compileFinalPrompt(
            compileInput({
                userPrompt: "制作一组节能知识卡",
                designSkill: designSkillById("xhs-images"),
                skillOptions: {
                    preset: "hand-drawn-edu",
                    style: "auto",
                    layout: "auto",
                    palette: "style-default",
                    aspectRatio: "custom",
                    customAspectRatio: "7:10",
                },
            }),
        );
        const comic = compileFinalPrompt(
            compileInput({
                userPrompt: "绘制一页安静的科普漫画",
                designSkill: designSkillById("comic"),
                skillOptions: {
                    ...defaultSkillOptions("comic"),
                    preset: "none",
                },
            }),
        );

        expect(xhs.finalPrompt).not.toMatch(/\b(?:auto|style-default|custom)\b/);
        expect(xhs.finalPrompt).toContain("7:10");
        expect(comic.finalPrompt).not.toMatch(/\bnone\b/);
    });

    it("supports the infographic direct-reference role without weakening fact constraints", () => {
        const compiled = compileFinalPrompt(
            compileInput({
                userPrompt: "把参考图中的数据结构整理成信息图，保留 37.5%",
                designSkill: designSkillById("infographic"),
                skillOptions: defaultSkillOptions("infographic"),
                referenceImageRoles: [{ id: "reference-1", label: "参考图 1", name: "source.png", role: "direct" }],
            }),
        );

        expect(compiled.finalPrompt).toContain("把参考图作为本图内容、主体关系与视觉结构的直接依据");
        expect(compiled.finalPrompt).toContain("37.5%");
    });
});
