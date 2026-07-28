import type { StructuredPlan, StructuredPlanItem } from "../types";
import { ARTICLE_TYPE_OPTIONS } from "../registry/article-illustrator";
import { clampInteger, contentChunks, extractImmutableFacts, planId, shortTitle, sourceDigest, sourceSections } from "./text-planning";

export type ArticlePlannerOptions = {
    count?: number;
    density?: "minimal" | "balanced" | "per-section" | "rich";
    preferredType?: string;
    style?: string;
    palette?: string;
    presetRule?: string;
};

export function planArticleIllustrations(source: string, options: ArticlePlannerOptions = {}): StructuredPlan {
    const text = source.trim();
    const sections = sourceSections(text);
    const count = resolveCount(options.count, options.density, sections.length);
    const selected = sections.length < count ? contentChunks(text, count) : selectSections(sections, count);
    const items = selected.map((section, index): StructuredPlanItem => {
        const illustrationType = options.preferredType && options.preferredType !== "auto" ? options.preferredType : inferIllustrationType(section.body);
        const facts = extractImmutableFacts(section.body);
        return {
            id: `illustration-${index + 1}`,
            order: index,
            kind: "illustration",
            title: section.heading || `插图 ${index + 1}`,
            body: section.body,
            chapter: section.heading,
            purpose: illustrationPurpose(illustrationType),
            illustrationType,
            visualDescription: `${ARTICLE_TYPE_OPTIONS.find((option) => option.id === illustrationType)?.nameZh || illustrationType}：把本节的核心关系转化为一张自洽画面，不复述全文。`,
            requiredText: facts,
        };
    });

    return {
        id: planId("article", text),
        type: "article",
        title: shortTitle(text, 28),
        summary: analyzeArticle(text, sections),
        visualBible: [options.presetRule || "", `统一风格：${options.style || "由设计选项决定"}`, `统一配色：${options.palette || "由设计选项决定"}`, "整篇插图保持同一线条、光线、图标和人物设定。"].filter(Boolean).join("；"),
        items,
        sourceDigest: sourceDigest(text),
    };
}

function resolveCount(count: number | undefined, density: ArticlePlannerOptions["density"], sectionCount: number) {
    if (count !== undefined) return clampInteger(count, 1, 10);
    if (density === "minimal") return Math.min(2, Math.max(1, sectionCount));
    if (density === "rich") return Math.min(10, Math.max(6, sectionCount));
    if (density === "per-section") return Math.min(10, Math.max(1, sectionCount));
    return Math.min(5, Math.max(3, sectionCount));
}

function selectSections(sections: ReturnType<typeof sourceSections>, count: number) {
    if (sections.length <= count) return sections;
    return Array.from({ length: count }, (_, index) => sections[Math.floor((index * sections.length) / count)]);
}

function inferIllustrationType(body: string) {
    if (/\b(vs\.?|versus)\b|对比|比较|区别|优缺点|相比|实验组|对照组/i.test(body)) return "comparison";
    if (/步骤|流程|首先|然后|最后|阶段|路径/.test(body)) return "flowchart";
    if (/时间线|历史|演变|从.+到|年代|世纪/.test(body)) return "timeline";
    if (extractImmutableFacts(body).length >= 3) return "infographic";
    if (/框架|体系|层级|模型|组成|关系|架构/.test(body)) return "framework";
    return "scene";
}

function illustrationPurpose(type: string) {
    const purposes: Record<string, string> = {
        infographic: "忠实呈现关键数据和事实，降低阅读成本",
        flowchart: "解释步骤、顺序和因果关系",
        comparison: "并列展示差异与取舍",
        framework: "展示概念、层级与组成关系",
        timeline: "展示时间顺序和阶段变化",
        scene: "把抽象内容放进具体语境，帮助读者建立直觉",
        conceptual: "建立核心概念的视觉模型",
        metaphor: "用克制的视觉隐喻帮助理解抽象观点",
        data: "准确展示数字、单位和相对关系",
        decorative: "提供轻量章节节奏，不抢夺正文信息",
    };
    return purposes[type] || "补充本节难以仅靠文字表达的视觉信息";
}

function analyzeArticle(text: string, sections: ReturnType<typeof sourceSections>) {
    const tone = /研究|数据|实验|方法|结果/.test(text) ? "专业严谨" : /故事|经历|旅行|生活/.test(text) ? "叙事亲近" : "清晰解释";
    const audience = /入门|初学|新手|基础/.test(text) ? "初学读者" : /专家|工程师|研究者|从业者/.test(text) ? "专业读者" : "一般读者";
    return `主题：${shortTitle(text, 32)}；语气：${tone}；目标读者：${audience}；识别到 ${sections.length} 个内容章节。`;
}
