import { socialPlatformLabel } from "@/constant/creation";
import type { CreationPromptStyle, CreativeBrief, PromptHardConstraints, SocialPlatform } from "@/types/creation";

export const HARD_CONSTRAINTS_BEGIN = "[LUFFY_HARD_CONSTRAINTS_BEGIN]";
export const HARD_CONSTRAINTS_END = "[LUFFY_HARD_CONSTRAINTS_END]";

export const CREATIVE_BRIEF_SYSTEM_PROMPT = `你是社交媒体视觉创作策划助手。请只返回一个 JSON 对象，不要返回 Markdown、解释或额外字段。
平台、画布尺寸、宽高比、任务 ID 与原文由应用管理，不属于你的输出字段。不要猜测或改写这些字段。
请输出以下字段：scene、purpose、audience、coreMessage、title、subtitle（可选）、visualSubject、composition、visualStyle、colorPalette、onImageText、requiredElements、forbiddenElements、analysisReasoning（可选）。
所有必填字符串必须明确且非空；数组必须为字符串数组。analysisReasoning 只写简短的决策摘要，不要输出隐藏思维过程。`;

export const PROMPT_OPTIMIZATION_SYSTEM_PROMPT = `你是生图提示词优化助手。请只返回 {"versions": [...]} JSON，不要返回 Markdown、解释或额外字段。
每个版本只能包含 label、content、reasoning、style 四个字段。style 必须来自调用方给出的候选值。
content 负责改善画面描述，但不得声称已经执行生成。应用会在解析后程序化附加平台、尺寸、文字、必需元素和禁止元素等硬约束。`;

export type CreativeBriefPromptContext = {
    platform: SocialPlatform;
    width: number;
    height: number;
    aspectRatio: string;
};

export function buildCreativeBriefRequestPrompt(sourceContent: string, context: CreativeBriefPromptContext) {
    return `请根据以下原始内容生成社交媒体创作方案。

应用上下文（仅用于分析，不要复制到 JSON 输出）：
- 平台：${socialPlatformLabel(context.platform)}（${context.platform}）
- 尺寸：${context.width} × ${context.height}
- 宽高比：${context.aspectRatio}

原始内容：
${sourceContent.trim()}`;
}

export function buildPromptVersionsRequestPrompt(brief: CreativeBrief, originalPrompt: string, styles: CreationPromptStyle[]) {
    return `请基于已批准的创作方案优化生图提示词，每个指定风格生成一个版本。

指定风格：${styles.join("、")}

已批准方案摘要：
- 场景：${brief.scene}
- 目的：${brief.purpose}
- 受众：${brief.audience}
- 核心信息：${brief.coreMessage}
- 视觉主体：${brief.visualSubject}
- 构图：${brief.composition}
- 视觉风格：${brief.visualStyle}

原始提示词：
${originalPrompt}`;
}

export function hardConstraintsFromBrief(brief: CreativeBrief): PromptHardConstraints {
    return {
        platform: brief.platform,
        width: brief.width,
        height: brief.height,
        aspectRatio: brief.aspectRatio,
        subject: brief.visualSubject,
        subjectPosition: brief.composition,
        requiredElements: uniqueStrings(brief.requiredElements),
        forbiddenElements: uniqueStrings(brief.forbiddenElements),
        requiredTexts: uniqueStrings([brief.title, brief.subtitle || "", ...brief.onImageText]),
        colorPalette: uniqueStrings(brief.colorPalette),
        referenceImageRequirements: [],
        safeAreaRequirements: [],
    };
}

export function buildOriginalPrompt(brief: CreativeBrief) {
    const base = [
        `为${socialPlatformLabel(brief.platform)}创作一张${brief.scene}视觉图。`,
        `创作目的：${brief.purpose}。`,
        `目标受众：${brief.audience}。`,
        `核心信息：${brief.coreMessage}。`,
        `视觉主体：${brief.visualSubject}。`,
        `构图：${brief.composition}。`,
        `视觉风格：${brief.visualStyle}。`,
    ].join("\n");
    return appendHardConstraints(base, hardConstraintsFromBrief(brief));
}

export function appendHardConstraints(prompt: string, constraints: PromptHardConstraints) {
    const base = removeHardConstraintBlock(prompt).trim();
    const lines = [
        HARD_CONSTRAINTS_BEGIN,
        "以下内容是应用注入的不可删除硬约束，任何优化和迭代都必须完整保留：",
        `平台：${constraints.platform}`,
        `画布尺寸：${constraints.width} × ${constraints.height}`,
        `宽高比：${constraints.aspectRatio}`,
        constraints.subject ? `视觉主体：${constraints.subject}` : "",
        constraints.subjectCount ? `主体数量：${constraints.subjectCount}` : "",
        constraints.subjectPosition ? `主体位置与构图：${constraints.subjectPosition}` : "",
        `准确文字内容（由 Luffy Canvas 后置叠加；生图时为这些文字预留清晰区域，不生成乱码）：${renderValues(constraints.requiredTexts)}`,
        `必须出现的元素：${renderValues(constraints.requiredElements)}`,
        `禁止出现的元素：${renderValues(constraints.forbiddenElements)}`,
        `颜色：${renderValues(constraints.colorPalette)}`,
        `参考图要求：${renderValues(constraints.referenceImageRequirements)}`,
        `安全区要求：${renderValues(constraints.safeAreaRequirements)}`,
        constraints.outputFormat ? `输出格式：${constraints.outputFormat}` : "",
        HARD_CONSTRAINTS_END,
    ].filter(Boolean);
    return `${base}${base ? "\n\n" : ""}${lines.join("\n")}`;
}

function removeHardConstraintBlock(prompt: string) {
    const start = prompt.indexOf(HARD_CONSTRAINTS_BEGIN);
    if (start < 0) return prompt;
    const end = prompt.indexOf(HARD_CONSTRAINTS_END, start);
    if (end < 0) return prompt.slice(0, start);
    return `${prompt.slice(0, start)}${prompt.slice(end + HARD_CONSTRAINTS_END.length)}`;
}

function renderValues(values: string[]) {
    const normalized = uniqueStrings(values);
    return normalized.length ? normalized.map((value) => JSON.stringify(value)).join("、") : "无";
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
