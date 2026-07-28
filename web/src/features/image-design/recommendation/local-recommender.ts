import { defaultSkillOptions, designSkillById } from "../registry/design-skills";
import { COMIC_LAYOUT_PANEL_RULES } from "../registry/comic";
import { resolveInfographicShortcut } from "../registry/infographic";
import { BUILTIN_PLATFORM_PRESETS, platformPresetById } from "../registry/platform-presets";
import type { DesignSkillId, ImageDesignRecommendation, SkillOptionValue } from "../types";

export type RecommendationInput = {
    content: string;
    skillId?: DesignSkillId;
    skillSelectionExplicit?: boolean;
    platformPresetId?: string;
    platformSelectionExplicit?: boolean;
    platformId?: string;
    contentType?: string;
    explicitOptions?: Record<string, SkillOptionValue>;
    savedOptions?: Record<string, SkillOptionValue>;
    referenceSummary?: string;
    modelCapabilities?: {
        provider: string;
        apiFormat: string;
        model: string;
        requestedAspectRatio?: string;
        resolvedAspectRatio?: string;
        supportsReferenceImages?: boolean;
        maxReferenceImages?: number;
        maxCount?: number;
    };
};

const CANONICAL_FALLBACKS: Partial<Record<DesignSkillId, Record<string, SkillOptionValue>>> = {
    "cover-image": {
        preset: "hand-drawn-edu",
        type: "conceptual",
        palette: "macaron",
        rendering: "hand-drawn",
        textMode: "title-only",
        mood: "balanced",
        font: "clean",
        aspectRatio: "16:9",
    },
    "xhs-images": {
        preset: "cute-share",
        style: "cute",
        layout: "balanced",
        palette: "warm",
        outlineStrategy: "information-dense",
        aspectRatio: "portrait-3-4",
    },
    infographic: {
        layout: "bento-grid",
        style: "craft-handmade",
        aspectRatio: "landscape",
    },
    "article-illustrator": {
        preset: "hand-drawn-edu",
        illustrationType: "infographic",
        style: "sketch-notes",
        palette: "macaron",
        density: "per-section",
    },
    comic: {
        preset: "none",
        artStyle: "ligne-claire",
        tone: "neutral",
        layout: "standard",
        aspectRatio: "3:4",
        dialogueDensity: "medium",
        narrationDensity: "medium",
        partialMode: "images-only",
    },
    diagram: {
        diagramType: "flowchart",
    },
};

export function recommendImageDesign(input: RecommendationInput): ImageDesignRecommendation {
    const content = `${input.content}\n${input.referenceSummary || ""}`.trim();
    const skillId = resolveSkillId(content, input.skillId, input.platformId, input.contentType, input.skillSelectionExplicit);
    const platformPresetId = resolvePlatformPresetId(input);
    const skill = designSkillById(skillId);
    const defaults = defaultSkillOptions(skillId);
    const explicit = input.explicitOptions || {};
    const saved = input.savedOptions || {};
    const infographicShortcut = skillId === "infographic" ? resolveInfographicShortcut(content) : undefined;
    const options: Record<string, SkillOptionValue> = {};
    const reasoning: Record<string, string> = {
        skillId: input.skillId && input.skillId !== "none" ? "保留用户已选择的设计 Skill。" : skillReason(skillId, content),
        platformPresetId: input.platformPresetId && input.platformPresetId !== "manual" ? "保留用户已选择的平台预设。" : platformReason(platformPresetId),
    };

    for (const group of skill.optionGroups) {
        const explicitValue = explicit[group.key];
        if (isAllowedValue(group, explicitValue, true)) {
            options[group.key] = explicitValue;
            reasoning[group.key] = "保留用户明确指定的参数。";
            continue;
        }
        const savedValue = saved[group.key];
        if (isAllowedValue(group, savedValue, true)) {
            options[group.key] = savedValue;
            reasoning[group.key] = "采用该 Skill 最近保存的偏好。";
            continue;
        }
        const shortcutValue = infographicShortcut?.[group.key as keyof typeof infographicShortcut];
        if (shortcutValue !== undefined && isAllowedValue(group, shortcutValue, true)) {
            options[group.key] = shortcutValue;
            reasoning[group.key] = content.toLowerCase().includes("high-density-info") ? "应用 high-density-info 快捷模式。" : "应用 infographic 快捷模式。";
            continue;
        }
        const recommended = recommendGroupValue(skill, group, content, options);
        options[group.key] = recommended.value ?? defaults[group.key] ?? group.defaultValue;
        reasoning[group.key] = recommended.reason || "采用该设计维度的稳妥默认值。";
    }

    return {
        skillId,
        platformPresetId,
        options,
        reasoning,
        source: "local",
        confidence: content ? 0.76 : 0.5,
        warnings: skillId === "comic" ? comicLayoutWarnings(options) : [],
    };
}

function resolveSkillId(content: string, selected: DesignSkillId | undefined, platform?: string, contentType?: string, selectionExplicit = false): DesignSkillId {
    if (selectionExplicit && selected === "none") return selected;
    if (selected && selected !== "none") return selected;
    const normalized = content.toLowerCase();
    if (/漫画|分镜|角色对白|comic|storyboard|四格|条漫/.test(normalized)) return "comic";
    if (/信息图|infographic|high-density-info|数据大图|swot|矩阵|漏斗|仪表盘/.test(normalized)) return "infographic";
    if (/架构图|流程图|技术栈|关系图|示意图|diagram|flowchart|architecture/.test(normalized)) return "diagram";
    if (/文章配图|插图计划|markdown|章节插图/.test(normalized) || normalized.length > 1200) return "article-illustrator";
    if (platform === "xiaohongshu" || /小红书|图卡|知识卡|清单卡/.test(normalized)) return "xhs-images";
    if (/封面|标题图|头图|cover|thumbnail/.test(normalized) || contentType?.includes("cover")) return "cover-image";
    return selected || "none";
}

function resolvePlatformPresetId(input: RecommendationInput) {
    if (input.platformSelectionExplicit && input.platformPresetId === "manual") return "manual";
    if (input.platformPresetId && input.platformPresetId !== "manual" && platformPresetById(input.platformPresetId)) return input.platformPresetId;
    const candidates = BUILTIN_PLATFORM_PRESETS.filter((preset) => !input.platformId || preset.platform === input.platformId);
    const content = input.content.toLowerCase();
    const exact = candidates.find((preset) => input.contentType && preset.contentType === input.contentType);
    if (exact) return exact.id;
    if (/小红书/.test(content)) return "xiaohongshu-note-cover";
    if (/抖音/.test(content)) return "douyin-video-cover";
    if (/youtube|缩略图/.test(content)) return "youtube-thumbnail";
    if (/哔哩哔哩|b站|bilibili/.test(content)) return "bilibili-video-cover";
    if (/公众号|微信/.test(content)) return "wechat-headline-cover";
    return candidates[0]?.id || "manual";
}

function recommendGroupValue(skill: ReturnType<typeof designSkillById>, group: ReturnType<typeof designSkillById>["optionGroups"][number], content: string, resolved: Record<string, SkillOptionValue>) {
    const normalized = content.toLowerCase();
    if (skill.id === "comic") {
        const layout = typeof resolved.layout === "string" ? resolved.layout : "";
        const rule = COMIC_LAYOUT_PANEL_RULES[layout];
        if (group.key === "readingDirection" && rule) {
            return { value: rule.reading, score: 0, reason: `采用“${layout}”版式规定的阅读方向。` };
        }
        if (group.key === "panelCount" && rule) {
            const pages = typeof resolved.pageCount === "number" ? resolved.pageCount : 1;
            return { value: rule.min * pages, score: 0, reason: `按“${layout}”版式与 ${pages} 页规划推荐格数。` };
        }
    }
    let best: { value?: SkillOptionValue; score: number; reason: string } = { score: -1, reason: "" };
    for (const option of group.options || []) {
        if (option.id === "auto" || option.id === "custom" || option.id === "style-default" || option.id === "platform") continue;
        const keywordMatches = option.recommendation.keywords.reduce((total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? 1 : 0), 0);
        const score = keywordMatches * 100 + (option.recommendation.priority || 0);
        if (keywordMatches > 0 && score > best.score) best = { value: option.id, score, reason: option.recommendation.reason };
    }
    if (best.value !== undefined) return best;
    const presetGroup = skill.optionGroups.find((candidate) => candidate.key === "preset");
    const preset = presetGroup?.options?.find((option) => option.id === resolved.preset);
    const preferred = preset?.compatibility.preferredWith?.[group.key]?.find((value) => group.options?.some((option) => option.id === value));
    if (preferred) return { value: preferred, score: 0, reason: `采用“${preset?.nameZh}”预设携带的${group.label}。` };
    const canonical = CANONICAL_FALLBACKS[skill.id]?.[group.key];
    if (isAllowedValue(group, canonical, true)) return { value: canonical, score: 0, reason: `没有更强内容信号，采用稳定的${group.label}回退值。` };
    const firstConcrete = group.options?.find((option) => !["auto", "custom", "style-default", "platform"].includes(option.id));
    if (firstConcrete) return { value: firstConcrete.id, score: 0, reason: `没有更强内容信号，采用注册表中的稳定${group.label}值。` };
    return best;
}

function comicLayoutWarnings(options: Record<string, SkillOptionValue>) {
    const layout = typeof options.layout === "string" ? options.layout : "";
    const rule = COMIC_LAYOUT_PANEL_RULES[layout];
    if (!rule) return [];
    const pages = typeof options.pageCount === "number" ? Math.max(1, options.pageCount) : 1;
    const panels = typeof options.panelCount === "number" ? options.panelCount : 0;
    const warnings: string[] = [];
    if (panels < rule.min * pages || panels > rule.max * pages) {
        warnings.push(`“${layout}”版式建议每页 ${rule.min}–${rule.max} 格；已尊重当前 ${pages} 页 / ${panels} 格设置，请生成前检查页面节奏。`);
    }
    if (typeof options.readingDirection === "string" && options.readingDirection !== rule.reading) {
        warnings.push(`“${layout}”版式通常使用 ${rule.reading}；已尊重当前阅读方向，请检查分格与气泡顺序。`);
    }
    return warnings;
}

function isAllowedValue(group: ReturnType<typeof designSkillById>["optionGroups"][number], value: SkillOptionValue | undefined, allowCustom: boolean) {
    if (value === undefined) return false;
    if (group.control === "number") return typeof value === "number" && Number.isFinite(value) && value >= (group.min ?? Number.MIN_SAFE_INTEGER) && value <= (group.max ?? Number.MAX_SAFE_INTEGER);
    if (group.control === "switch") return typeof value === "boolean";
    if (group.control === "text" || group.control === "textarea") return allowCustom && typeof value === "string" && Boolean(value.trim());
    return typeof value === "string" && !["auto", "style-default"].includes(value) && Boolean(group.options?.some((option) => option.id === value));
}

function skillReason(skillId: DesignSkillId, content: string) {
    if (skillId === "comic") return "内容包含故事、人物或分镜信号，适合漫画工作流。";
    if (skillId === "infographic") return "内容包含数据或结构化传播目标，适合专业信息图。";
    if (skillId === "diagram") return "内容强调流程、架构或关系，适合技术图解。";
    if (skillId === "article-illustrator") return "输入较长或含章节结构，适合先生成文章插图计划。";
    if (skillId === "xhs-images") return "内容面向社交媒体图卡或小红书场景。";
    if (skillId === "cover-image") return "内容需要建立单一主题焦点和标题层级。";
    return content ? "没有发现必须套用设计 Skill 的强信号，保留原始生图方式。" : "等待输入内容后再推荐。";
}

function platformReason(id: string) {
    const preset = platformPresetById(id);
    return preset ? `内容与${preset.platformLabel}「${preset.label}」的展示场景匹配。` : "未自动施加平台尺寸，保留当前手动参数。";
}
