import type { StructuredPlan, StructuredPlanItem } from "../types";
import { clampInteger, conciseBody, contentChunks, planId, shortTitle, sourceDigest } from "./text-planning";

export type CardSeriesPlannerOptions = {
    count: number;
    style?: string;
    palette?: string;
    layout?: string;
    title?: string;
    outlineStrategy?: CardOutlineStrategy;
    presetRule?: string;
};

export type CardOutlineStrategy = "story-driven" | "information-dense" | "visual-first";

export function planCardSeries(source: string, options: CardSeriesPlannerOptions): StructuredPlan {
    const text = source.trim();
    const count = clampInteger(options.count, 1, 10);
    const title = options.title?.trim() || shortTitle(text, 22);
    const strategy = options.outlineStrategy || "information-dense";
    const contentCount = count <= 2 ? Math.max(0, count - 1) : count - 2;
    const chunks = contentChunks(text, Math.max(1, contentCount));
    const items: StructuredPlanItem[] = [];

    if (count === 1) {
        items.push({
            id: "card-1",
            order: 0,
            kind: "content",
            title,
            body: text,
            purpose: strategyPurpose(strategy, 0, 1),
        });
    } else {
        items.push({
            id: "card-1",
            order: 0,
            kind: "cover",
            title: coverTitle(title, strategy),
            body: conciseBody(text, 72),
            purpose: coverPurpose(strategy),
        });
        chunks.slice(0, contentCount).forEach((chunk, index) => {
            items.push({
                id: `card-${index + 2}`,
                order: index + 1,
                kind: "content",
                title: contentTitle(chunk, index, contentCount, strategy),
                body: chunk.body,
                purpose: strategyPurpose(strategy, index, contentCount),
            });
        });
        if (count >= 3) {
            items.push({
                id: `card-${count}`,
                order: count - 1,
                kind: "summary",
                title: summaryTitle(strategy),
                body: buildSummary(chunks, strategy),
                purpose: summaryPurpose(strategy),
            });
        }
    }

    return {
        id: planId("series", text),
        type: "series",
        title,
        summary: `${strategyLabel(strategy)}，共 ${items.length} 张：${items.map((item) => item.title).join("、")}`,
        visualBible: buildVisualBible(options),
        items,
        sourceDigest: sourceDigest(text),
    };
}

function coverTitle(title: string, strategy: CardOutlineStrategy) {
    if (strategy === "story-driven") return `故事钩子 · ${title}`;
    if (strategy === "visual-first") return `视觉主题 · ${title}`;
    return title;
}

function coverPurpose(strategy: CardOutlineStrategy) {
    if (strategy === "story-driven") return "用悬念、冲突或变化建立故事钩子";
    if (strategy === "visual-first") return "先建立强主视觉和系列节奏，文字只负责点题";
    return "建立系列主题和首屏吸引力";
}

function contentTitle(chunk: { heading: string; body: string }, index: number, total: number, strategy: CardOutlineStrategy) {
    const base = chunk.heading || shortTitle(chunk.body, strategy === "visual-first" ? 10 : 16);
    if (strategy === "story-driven") {
        const stage = index === 0 ? "起因" : index === total - 1 ? "转折" : "推进";
        return `${stage} · ${base}`;
    }
    if (strategy === "visual-first") return `视觉 ${index + 1} · ${shortTitle(base, 10)}`;
    return chunk.heading || `知识模块 ${index + 1}`;
}

function strategyPurpose(strategy: CardOutlineStrategy, index: number, total: number) {
    if (strategy === "story-driven") {
        if (index === 0) return "交代人物、处境或起因，让读者进入故事";
        if (index === total - 1) return "揭示转折、结果或认知变化";
        return "沿时间与因果推进事件、冲突和选择";
    }
    if (strategy === "visual-first") return "用一个独立主视觉承载当前信息，标题短而准确";
    return "解释一个独立知识模块，并保留对应事实与证据";
}

function summaryTitle(strategy: CardOutlineStrategy) {
    if (strategy === "story-driven") return "故事收束";
    if (strategy === "visual-first") return "视觉回响";
    return "总结";
}

function summaryPurpose(strategy: CardOutlineStrategy) {
    if (strategy === "story-driven") return "收束故事弧，并给出结论或下一步行动";
    if (strategy === "visual-first") return "用统一视觉母题回扣系列重点，减少重复文字";
    return "收束知识模块并强化可记忆结论";
}

function buildSummary(chunks: Array<{ heading: string; body: string }>, strategy: CardOutlineStrategy) {
    if (strategy === "story-driven") {
        const first = chunks[0];
        const middle = chunks[Math.floor((chunks.length - 1) / 2)];
        const last = chunks.at(-1);
        return [
            first ? `起因：${first.heading || shortTitle(first.body, 16)}` : "",
            middle && middle !== first && middle !== last ? `推进：${middle.heading || shortTitle(middle.body, 16)}` : "",
            last && last !== first ? `收束：${last.heading || shortTitle(last.body, 16)}` : "",
        ]
            .filter(Boolean)
            .join("\n");
    }
    const lines = chunks.slice(0, 5).map((chunk, index) => `${index + 1}. ${chunk.heading || shortTitle(chunk.body, 16)}`);
    if (strategy === "visual-first") return `视觉节奏：${lines.map((line) => line.replace(/^\d+\.\s*/, "")).join(" → ")}`;
    return lines.join("\n") || "回顾核心观点并给出清晰结论。";
}

function buildVisualBible(options: CardSeriesPlannerOptions) {
    return [
        `大纲策略：${strategyLabel(options.outlineStrategy || "information-dense")}`,
        options.presetRule || "",
        `系列风格：${options.style || "保持首图确定的统一视觉风格"}`,
        `系列配色：${options.palette || "保持首图主色、辅色和强调色不变"}`,
        `系列版式：${options.layout || "统一网格、边距、字体层级和装饰语言"}`,
        "后续图片保持同一角色、图标语言、笔触、材质和标题系统；只改变当前卡片内容。",
    ]
        .filter(Boolean)
        .join("；");
}

function strategyLabel(strategy: CardOutlineStrategy) {
    if (strategy === "story-driven") return "故事驱动";
    if (strategy === "visual-first") return "视觉优先";
    return "信息密集";
}
