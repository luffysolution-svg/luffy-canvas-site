import type { StructuredPlan, StructuredPlanItem } from "../types";
import { clampInteger, conciseBody, contentChunks, planId, shortTitle, sourceDigest } from "./text-planning";

export type ComicStoryboardOptions = {
    panelCount: number;
    pageCount?: number;
    readingDirection?: "left-to-right" | "right-to-left" | "top-to-bottom";
    layout?: string;
    artStyle?: string;
    tone?: string;
    textMode?: "with-text" | "no-text";
    dialogueDensity?: string;
    narrationDensity?: string;
    characters?: string;
    setting?: string;
    presetRule?: string;
};

export function planComicStoryboard(source: string, options: ComicStoryboardOptions): StructuredPlan {
    const story = source.trim();
    const panelCount = clampInteger(options.panelCount, 1, 40);
    const pageCount = Math.min(panelCount, clampInteger(options.pageCount || Math.ceil(panelCount / 4), 1, 10));
    const chunks = contentChunks(story, panelCount);
    const items: StructuredPlanItem[] = chunks.map((chunk, index) => {
        const page = Math.min(pageCount, Math.floor((index * pageCount) / Math.max(1, panelCount)) + 1);
        const requiredText = options.textMode === "no-text" ? [] : extractQuotedText(chunk.body);
        return {
            id: `panel-${index + 1}`,
            order: index,
            kind: "panel",
            title: `第 ${page} 页 · 分镜 ${index + 1}`,
            body: chunk.body,
            chapter: `第 ${page} 页`,
            purpose: index === 0 ? "建立人物、场景和冲突" : index === chunks.length - 1 ? "完成转折或收束" : "推进动作、信息或情绪",
            visualDescription: buildPanelDirection(index, chunks.length, options),
            requiredText,
        };
    });

    return {
        id: planId("comic", story),
        type: "storyboard",
        title: shortTitle(story, 28),
        summary: `故事梗概：${buildStorySynopsis(story, chunks)}\n分镜规划：${pageCount} 页、${items.length} 个独立分镜，阅读方向为 ${readingDirectionLabel(options.readingDirection)}。`,
        visualBible: buildCharacterBible(story, options),
        items,
        sourceDigest: sourceDigest(story),
    };
}

function buildStorySynopsis(story: string, chunks: Array<{ body: string }>) {
    if (story.length <= 260) return story;
    const first = conciseBody(chunks[0]?.body || story, 110);
    const last = conciseBody(chunks.at(-1)?.body || story, 110);
    return first === last ? first : `${first}……${last}`;
}

function extractQuotedText(value: string) {
    const matches = value.match(/[“"][^”"]+[”"]|「[^」]+」|『[^』]+』/g) || [];
    return matches.map((item) => item.replace(/^[“"「『]|[”"」』]$/g, ""));
}

function buildPanelDirection(index: number, total: number, options: ComicStoryboardOptions) {
    const shot = index === 0 ? "建立镜头" : index === total - 1 ? "收束镜头" : index % 3 === 1 ? "中近景" : "动作或反应镜头";
    const textRule = options.textMode === "no-text" ? "画面内不得出现文字、气泡或旁白框" : `对话密度 ${options.dialogueDensity || "适中"}，旁白密度 ${options.narrationDensity || "适中"}；指定文字必须准确绘制`;
    return `${shot}；版式 ${options.layout || "mixed"}；${textRule}。`;
}

function buildCharacterBible(story: string, options: ComicStoryboardOptions) {
    const inferredCharacters = Array.from(story.matchAll(/([\p{Script=Han}]{2,4})(?=说|问|答|喊|低声|发现|走进|跑向|停下)/gu), (match) => match[1]).filter((value) => !/清晨|夜晚|突然|终于|然后|自己/.test(value));
    const settingHints = Array.from(new Set(story.match(/车站|教室|办公室|街道|房间|森林|山谷|海边|实验室|工厂|校园|医院|列车|站台/g) || []));
    return [
        options.presetRule || "",
        `人物：${options.characters?.trim() || (inferredCharacters.length ? `${Array.from(new Set(inferredCharacters)).join("、")}；首格确定其脸型、发型、服装、体型和标志物后全篇锁定` : "故事主角；首格确定脸型、发型、服装、体型和标志物后全篇锁定")}`,
        `场景：${options.setting?.trim() || (settingHints.length ? `${settingHints.join("、")}；固定地点方位、时间、天气和关键道具` : "故事主要地点；首格确定空间方位、时间、天气和关键道具后全篇锁定")}`,
        `画风：${options.artStyle || "保持统一"}`,
        `基调：${options.tone || "neutral"}`,
        "所有分镜保持角色比例、服装、场景方位、道具状态和光线方向连续。",
    ]
        .filter(Boolean)
        .join("；");
}

function readingDirectionLabel(value: ComicStoryboardOptions["readingDirection"]) {
    if (value === "right-to-left") return "从右到左";
    if (value === "top-to-bottom") return "从上到下";
    return "从左到右";
}
