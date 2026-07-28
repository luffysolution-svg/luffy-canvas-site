import type { StructuredPlan, StructuredPlanItem } from "../types";

const SENTENCE_BREAK = /(?<=[。！？!?；;])\s*|\n+/;
const NUMBER_OR_UNIT = /(?:\b\d+(?:[.,]\d+)*(?:%|‰|℃|°C|kg|g|mg|km|m|cm|mm|h|min|s|MB|GB|TB|kW|MW|亿元|万元|万|亿|年|月|日)?(?![A-Za-z0-9_]))|(?:第[一二三四五六七八九十百千万\d]+[章节步项])/gi;

export type SourceSection = {
    heading: string;
    body: string;
};

export function sourceSections(source: string): SourceSection[] {
    const normalized = source.replace(/\r\n?/g, "\n").trim();
    if (!normalized) return [];
    const sections: SourceSection[] = [];
    let heading = "";
    let body: string[] = [];
    const flush = () => {
        const content = body.join("\n").trim();
        if (heading || content) sections.push({ heading: heading || shortTitle(content, 24), body: content });
        heading = "";
        body = [];
    };

    for (const rawLine of normalized.split("\n")) {
        const line = rawLine.trim();
        const match = line.match(/^#{1,6}\s+(.+)$/) || (line.length <= 80 ? line.match(/^(?:第[一二三四五六七八九十百千万\d]+[章节篇部分]\s*[:：]?\s*.+|(?:\d+|[一二三四五六七八九十]+)[、.．)]\s*.+)$/) : null);
        if (match) {
            flush();
            heading = (match[1] || match[0]).replace(/^#{1,6}\s+/, "").trim();
        } else if (!line) {
            if (body.length) flush();
        } else if (line) {
            body.push(line.replace(/^[-*+]\s+/, ""));
        }
    }
    flush();
    return sections.length ? sections : [{ heading: shortTitle(normalized, 24), body: normalized }];
}

export function groupSourceSections(sections: SourceSection[], maxGroups: number) {
    const groupCount = Math.max(1, Math.min(Math.trunc(maxGroups), sections.length));
    if (!sections.length) return [];
    return Array.from({ length: groupCount }, (_, index) => {
        const start = Math.floor((index * sections.length) / groupCount);
        const end = Math.floor(((index + 1) * sections.length) / groupCount);
        const slice = sections.slice(start, Math.max(start + 1, end));
        return {
            heading: slice.length === 1 ? slice[0].heading : `${slice[0].heading} — ${slice.at(-1)?.heading}`,
            body: slice.length === 1 ? slice[0].body : slice.map((section) => [section.heading ? `【${section.heading}】` : "", section.body].filter(Boolean).join("\n")).join("\n\n"),
        };
    });
}

export function contentChunks(source: string, count: number) {
    const sections = sourceSections(source);
    if (sections.length >= count) return distributeSections(sections, count);
    const sentences = sections.flatMap((section) =>
        section.body
            .split(SENTENCE_BREAK)
            .map((value) => value.trim())
            .filter(Boolean)
            .map((body) => ({ heading: section.heading, body })),
    );
    const candidates = sentences.length ? sentences : sections;
    const chunks = distributeSections(candidates, count);
    for (let index = chunks.length; index < count; index += 1) {
        const fallback = candidates[index % candidates.length];
        chunks.push({
            heading: `要点 ${index + 1}`,
            body: fallback?.body || source.trim(),
        });
    }
    return chunks;
}

function distributeSections(sections: SourceSection[], count: number) {
    if (!sections.length || count <= 0) return [];
    const result: SourceSection[] = [];
    for (let index = 0; index < Math.min(count, sections.length); index += 1) {
        const start = Math.floor((index * sections.length) / Math.min(count, sections.length));
        const end = Math.floor(((index + 1) * sections.length) / Math.min(count, sections.length));
        const slice = sections.slice(start, Math.max(start + 1, end));
        result.push({
            heading: slice[0].heading,
            body: slice
                .map((section) => section.body)
                .filter(Boolean)
                .join("\n"),
        });
    }
    return result;
}

export function shortTitle(value: string, max = 20) {
    const plain = value
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim();
    const first = plain.split(/[。！？!?；;\n]/)[0] || plain;
    return first.length > max ? `${first.slice(0, max).trim()}…` : first || "未命名内容";
}

export function conciseBody(value: string, max = 180) {
    const plain = value.replace(/\s+/g, " ").trim();
    return plain.length > max ? `${plain.slice(0, max).trim()}…` : plain;
}

export function extractImmutableFacts(value: string) {
    return Array.from(new Set(value.match(NUMBER_OR_UNIT) || []));
}

export function sourceDigest(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function reorderPlanItems(items: StructuredPlanItem[], activeId: string, offset: number) {
    const index = items.findIndex((item) => item.id === activeId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next.map((item, order) => ({ ...item, order }));
}

export function planId(prefix: string, source: string) {
    return `${prefix}-${sourceDigest(source).slice(-8)}`;
}

export function clampInteger(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));
}

export function planItemPromptSource(plan: StructuredPlan) {
    return [`创作主题：${plan.title}`, plan.summary ? `内容摘要：${plan.summary}` : ""].filter(Boolean).join("\n");
}

export function withPlanVisualBible(customInstructions: string, plan?: StructuredPlan | null) {
    const custom = customInstructions.trim();
    const bible = plan?.visualBible ? `系列视觉圣经：${plan.visualBible}` : "";
    return [custom, bible && !custom.includes(bible) ? bible : ""].filter(Boolean).join("\n");
}
