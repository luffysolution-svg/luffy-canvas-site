import type { SocialPlatformPreset } from "@/constant/creation";
import { appendHardConstraints } from "@/lib/creation/prompt-templates";
import type { CreationCardDeck, CreationCardPage, CreationProject, PromptHardConstraints, PromptVersion } from "@/types/creation";

export type BuildCardPagePromptInput = {
    project: CreationProject;
    deck: CreationCardDeck;
    page: CreationCardPage;
    promptVersion: PromptVersion;
    preset: SocialPlatformPreset;
    pageIndex: number;
};

export type CardPagePrompt = {
    prompt: string;
    content: string;
    styleFingerprint: string;
    hardConstraints: PromptHardConstraints;
};

const NO_TEXT_REQUIREMENT = "只生成无文字视觉底图，不得生成任何标题、正文、字母、数字、水印、Logo 或二维码；准确标题与正文由 Luffy Canvas 后置合成";

export function buildCardPagePrompt(input: BuildCardPagePromptInput): CardPagePrompt {
    const { project, deck, page, promptVersion, preset } = input;
    const pageNumber = Math.max(1, Math.floor(input.pageIndex) + 1);
    const styleFingerprint = buildCardStyleFingerprint(deck, promptVersion);
    const hardConstraints = buildCardPageHardConstraints(page, promptVersion, preset, styleFingerprint);
    const basePrompt = promptVersion.rawContent?.trim() || promptVersion.content.trim();
    const pagePrompt = [
        basePrompt,
        "[LUFFY_CARD_PAGE_CONTEXT]",
        `任务：${project.name}`,
        `平台与规格：${preset.label}，${preset.width} × ${preset.height}（${preset.aspectRatio}）`,
        `页码：第 ${pageNumber} 页，共 ${deck.pages.length} 页`,
        `页面布局：${layoutDescription(page.layout)}`,
        `页面语义标题：${page.title.trim()}`,
        `页面语义正文：${page.body.trim()}`,
        `统一风格 ID：${deck.styleId}`,
        `统一风格指纹：${styleFingerprint}`,
        `统一风格说明：${deck.stylePrompt.trim()}`,
        `文字合成规则：${NO_TEXT_REQUIREMENT}。请仅根据标题和正文理解画面语义，并为后置文字排版保留清晰、低干扰区域。`,
        project.additionalRequirements.trim() ? `项目补充要求：${project.additionalRequirements.trim()}` : "",
        "[/LUFFY_CARD_PAGE_CONTEXT]",
    ]
        .filter(Boolean)
        .join("\n");
    const content = appendHardConstraints(pagePrompt, hardConstraints);
    return { prompt: content, content, styleFingerprint, hardConstraints };
}

export function buildCardStyleFingerprint(deck: Pick<CreationCardDeck, "styleId" | "stylePrompt">, promptVersion: PromptVersion) {
    const styleSource = JSON.stringify({
        styleId: deck.styleId.trim(),
        stylePrompt: deck.stylePrompt.trim(),
        promptVersionId: promptVersion.id,
        promptStyle: promptVersion.style,
        prompt: promptVersion.rawContent?.trim() || promptVersion.content.trim(),
        subject: promptVersion.hardConstraints.subject || "",
        composition: promptVersion.hardConstraints.subjectPosition || "",
        colors: promptVersion.hardConstraints.colorPalette,
    });
    return `${deck.styleId.trim() || "card-style"}:${fnv1a(styleSource)}`;
}

export function buildCardPageHardConstraints(page: CreationCardPage, promptVersion: PromptVersion, preset: SocialPlatformPreset, styleFingerprint: string): PromptHardConstraints {
    const base = promptVersion.hardConstraints;
    const safe = preset.safeArea;
    return {
        ...base,
        platform: preset.platform,
        width: preset.width,
        height: preset.height,
        aspectRatio: preset.aspectRatio,
        subjectPosition: `${layoutDescription(page.layout)}；为后置标题和正文预留低干扰区域`,
        requiredElements: uniqueStrings(base.requiredElements),
        forbiddenElements: uniqueStrings([...base.forbiddenElements, "画面内文字", "乱码", "字母与数字", "水印", "Logo", "二维码"]),
        requiredTexts: uniqueStrings([page.title, page.body]),
        colorPalette: uniqueStrings(base.colorPalette),
        referenceImageRequirements: uniqueStrings([...base.referenceImageRequirements, `所有页面必须保持统一风格指纹 ${styleFingerprint}`]),
        safeAreaRequirements: uniqueStrings([...base.safeAreaRequirements, `内容安全区：顶部 ${safe.top}px、右侧 ${safe.right}px、底部 ${safe.bottom}px、左侧 ${safe.left}px 内不得放置关键视觉主体`, ...preset.notes]),
        outputFormat: NO_TEXT_REQUIREMENT,
    };
}

function layoutDescription(layout: CreationCardPage["layout"]) {
    return {
        cover: "封面式构图，主视觉集中并为醒目标题留出区域",
        editorial: "编辑式构图，信息层级清晰并留出连续正文区域",
        split: "分栏式构图，视觉主体与文字留白区域明确分离",
        quote: "引语式构图，中心区域克制留白并弱化背景干扰",
    }[layout];
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function fnv1a(value: string) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36).padStart(7, "0");
}
