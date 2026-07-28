import type { StructuredPlan, StructuredPlanItem } from "../types";
import { contentChunks, extractImmutableFacts, groupSourceSections, planId, shortTitle, sourceDigest, sourceSections } from "./text-planning";

export type InfographicStructureResult = {
    plan: StructuredPlan;
    warnings: string[];
    requiresSplit: boolean;
};

export function structureInfographic(source: string, options: { highDensity?: boolean; dataFidelity?: boolean; layout?: string; style?: string; aspectRatio?: string } = {}): InfographicStructureResult {
    const text = source.trim();
    let sections = sourceSections(text);
    if (sections.length === 1 && text.length > 2400) {
        const estimatedCount = Math.min(10, Math.max(2, Math.ceil(text.length / 1200)));
        const chunks = contentChunks(text, estimatedCount);
        sections =
            chunks.length > 1 && new Set(chunks.map((chunk) => chunk.body)).size > 1
                ? chunks.map((chunk, index) => ({ ...chunk, heading: `模块 ${index + 1}` }))
                : Array.from({ length: estimatedCount }, (_, index) => {
                      const start = Math.floor((index * text.length) / estimatedCount);
                      const end = Math.floor(((index + 1) * text.length) / estimatedCount);
                      return { heading: `模块 ${index + 1}`, body: text.slice(start, end) };
                  });
    }
    const groupedSections = groupSourceSections(sections, 10);
    const facts = extractImmutableFacts(text);
    const itemLimit = options.highDensity ? 10 : 8;
    const requiresSplit = text.length > 4000 || sections.length > itemLimit || facts.length > 30;
    const learningGoals = inferLearningGoals(groupedSections);
    const items: StructuredPlanItem[] = groupedSections.map((section, index) => ({
        id: `section-${index + 1}`,
        order: index,
        kind: "section",
        title: section.heading || `模块 ${index + 1}`,
        body: section.body.trim(),
        purpose: "将一组相关事实组织成独立信息模块",
        requiredText: options.dataFidelity === false ? [] : extractImmutableFacts(section.body),
    }));
    const warnings: string[] = [];
    if (requiresSplit) warnings.push("内容超过单张信息图的稳妥承载范围，建议拆成多张；系统不会擅自压缩或删除事实。");
    if (sections.length > groupedSections.length) warnings.push(`已把 ${sections.length} 个原始模块完整归并为 ${groupedSections.length} 个生成模块，避免超过单次 10 张上限。`);
    if (options.dataFidelity !== false && facts.length) warnings.push(`已锁定 ${facts.length} 个数字、单位或序号，编译时必须逐字保留。`);

    return {
        plan: {
            id: planId("infographic", text),
            type: "infographic",
            title: shortTitle(text, 28),
            summary: `学习 / 传播目标：${learningGoals.join("；")}。识别到 ${sections.length} 个原始内容模块，归并为 ${groupedSections.length} 个生成模块，并锁定 ${facts.length} 个数据片段。`,
            visualBible: [
                options.highDensity ? "使用高密度模块化网格，但保持标题、分组、数据和注释四级层次。" : "优先清晰层级和阅读路径，不用装饰挤占事实空间。",
                options.layout ? `版式：${options.layout}` : "",
                options.style ? `风格：${options.style}` : "",
                options.aspectRatio ? `画幅：${options.aspectRatio}` : "",
            ]
                .filter(Boolean)
                .join("；"),
            items,
            sourceDigest: sourceDigest(text),
            learningGoals,
        },
        warnings,
        requiresSplit,
    };
}

function inferLearningGoals(sections: Array<{ heading: string; body: string }>) {
    const candidates = sections.slice(0, 3).map((section) => section.heading || shortTitle(section.body, 22));
    return candidates.length ? candidates.map((candidate) => `理解并准确传播“${candidate}”的核心事实与关系`) : ["准确理解并传播输入内容的核心事实与关系"];
}
