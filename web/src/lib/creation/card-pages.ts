import { nanoid } from "nanoid";

import { resolveSocialPlatformPreset } from "@/constant/creation";
import type { CreationCardDeck, CreationCardLayout, CreationCardPage } from "@/types/creation";

const MIN_CARD_PAGES = 1;
const MAX_CARD_PAGES = 10;
const DEFAULT_CARD_PAGES = 6;

type FactoryOptions = {
    idFactory?: () => string;
    now?: () => string;
};

export type SplitCreationCardPagesOptions = FactoryOptions & {
    targetPageCount?: number;
    defaultTitle?: string;
};

export type CreateCreationCardPageInput = Partial<Omit<CreationCardPage, "id" | "createdAt" | "updatedAt">> & Pick<CreationCardPage, "title" | "body">;

export type CreateCreationCardDeckOptions = FactoryOptions & {
    sourceContent: string;
    targetPageCount?: number;
    primaryPlatformPresetId?: string;
    platformPresetIds?: string[];
    modelConfigId: string;
    quality: string;
    background: string;
    styleId?: string;
    stylePrompt?: string;
};

export type CreationCardPagePatch = Partial<Pick<CreationCardPage, "title" | "body" | "layout">>;

type ContentSegment = { title: string; body: string };

export function splitCreationCardPages(sourceContent: string, options: SplitCreationCardPagesOptions = {}) {
    const source = sourceContent.replace(/\r\n?/g, "\n").trim();
    if (!source) throw new Error("拆页内容不能为空");
    const initial = extractContentSegments(source, options.defaultTitle || "内容概览");
    const target = options.targetPageCount === undefined ? inferPageCount(source, initial.length) : clampPageCount(options.targetPageCount);
    const segments = fitSegmentCount(initial, target);
    const timestamp = (options.now || defaultNow)();
    const idFactory = options.idFactory || nanoid;
    return segments.map((segment, index) =>
        createCreationCardPage(
            {
                title: segment.title || `第 ${index + 1} 页`,
                body: segment.body,
                layout: inferLayout(segment, index),
            },
            { idFactory, now: () => timestamp },
        ),
    );
}

export function createCreationCardPage(input: CreateCreationCardPageInput, options: FactoryOptions = {}): CreationCardPage {
    const timestamp = (options.now || defaultNow)();
    return {
        id: (options.idFactory || nanoid)(),
        title: input.title.trim(),
        body: input.body.trim(),
        layout: input.layout || "editorial",
        revision: input.revision || 1,
        generatedRevision: input.generatedRevision,
        status: input.status || "idle",
        reviewStatus: input.reviewStatus || "pending",
        imageId: input.imageId,
        imageHistoryIds: [...(input.imageHistoryIds || [])],
        error: input.error,
        generation: input.generation,
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

export function createCreationCardDeck(options: CreateCreationCardDeckOptions): CreationCardDeck {
    const primary = requirePlatformPreset(options.primaryPlatformPresetId || "xiaohongshu-post");
    const platformPresetIds = uniquePresetIds([primary.id, ...(options.platformPresetIds || [])]);
    const idFactory = options.idFactory || nanoid;
    const timestamp = (options.now || defaultNow)();
    return {
        id: idFactory(),
        platformPresetIds,
        activePlatformPresetId: primary.id,
        styleId: options.styleId?.trim() || idFactory(),
        stylePrompt: options.stylePrompt?.trim() || "统一配色、字体层级、留白与视觉元素，保持整组卡片风格一致。",
        modelConfigId: options.modelConfigId,
        quality: options.quality,
        background: options.background,
        pages: splitCreationCardPages(options.sourceContent, {
            targetPageCount: options.targetPageCount ?? DEFAULT_CARD_PAGES,
            idFactory,
            now: () => timestamp,
        }),
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

export function addCreationCardPage(pages: CreationCardPage[], page: CreationCardPage, index = pages.length) {
    if (pages.length >= MAX_CARD_PAGES) throw new Error("卡片最多支持 10 页");
    if (pages.some((item) => item.id === page.id)) throw new Error("卡片页 ID 已存在");
    const next = [...pages];
    next.splice(clampIndex(index, next.length + 1), 0, page);
    return next;
}

export function removeCreationCardPage(pages: CreationCardPage[], pageId: string) {
    if (!pages.some((page) => page.id === pageId)) return pages;
    if (pages.length <= MIN_CARD_PAGES) throw new Error("卡片至少保留 1 页");
    return pages.filter((page) => page.id !== pageId);
}

export function moveCreationCardPage(pages: CreationCardPage[], pageId: string, toIndex: number) {
    const fromIndex = pages.findIndex((page) => page.id === pageId);
    if (fromIndex < 0) return pages;
    const target = clampIndex(toIndex, pages.length);
    if (fromIndex === target) return pages;
    const next = [...pages];
    const [page] = next.splice(fromIndex, 1);
    next.splice(target, 0, page);
    return next;
}

export function updateCreationCardPage(pages: CreationCardPage[], pageId: string, patch: CreationCardPagePatch, options: Pick<FactoryOptions, "now"> = {}) {
    const page = pages.find((item) => item.id === pageId);
    if (!page) return pages;
    const nextValues = {
        title: patch.title === undefined ? page.title : patch.title.trim(),
        body: patch.body === undefined ? page.body : patch.body.trim(),
        layout: patch.layout === undefined ? page.layout : patch.layout,
    };
    if (nextValues.title === page.title && nextValues.body === page.body && nextValues.layout === page.layout) return pages;
    const updatedAt = (options.now || defaultNow)();
    return pages.map((item) =>
        item.id === pageId
            ? {
                  ...item,
                  ...nextValues,
                  revision: item.revision + 1,
                  status: "idle" as const,
                  reviewStatus: "pending" as const,
                  error: undefined,
                  generation: undefined,
                  updatedAt,
              }
            : item,
    );
}

function extractContentSegments(source: string, defaultTitle: string) {
    const lines = source.split("\n");
    const hasHeading = lines.some((line) => /^\s{0,3}#{1,6}\s+\S/.test(line));
    if (!hasHeading) {
        return source
            .split(/\n\s*\n+/)
            .map((body) => body.trim())
            .filter(Boolean)
            .map((body, index) => ({ title: inferredTitle(body, index ? `第 ${index + 1} 页` : defaultTitle), body }));
    }

    const segments: ContentSegment[] = [];
    let title = defaultTitle;
    let body: string[] = [];
    const push = () => {
        const content = body.join("\n").trim();
        if (content || title !== defaultTitle || !segments.length) segments.push({ title, body: content });
        body = [];
    };
    for (const line of lines) {
        const heading = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
        if (!heading) {
            body.push(line);
            continue;
        }
        if (body.some((item) => item.trim()) || title !== defaultTitle) push();
        title = cleanTitle(heading[1]);
    }
    push();
    return segments.filter((segment) => segment.title || segment.body);
}

function fitSegmentCount(source: ContentSegment[], target: number) {
    const segments = source.map((segment) => ({ ...segment }));
    while (segments.length > target) {
        let mergeIndex = 0;
        for (let index = 1; index < segments.length - 1; index += 1) {
            if (segmentLength(segments[index]) + segmentLength(segments[index + 1]) < segmentLength(segments[mergeIndex]) + segmentLength(segments[mergeIndex + 1])) mergeIndex = index;
        }
        const first = segments[mergeIndex];
        const second = segments[mergeIndex + 1];
        segments.splice(mergeIndex, 2, { title: first.title || second.title, body: [first.body, second.title ? `## ${second.title}` : "", second.body].filter(Boolean).join("\n\n") });
    }
    while (segments.length < target) {
        let splitIndex = 0;
        for (let index = 1; index < segments.length; index += 1) if (segmentLength(segments[index]) > segmentLength(segments[splitIndex])) splitIndex = index;
        const split = splitSegment(segments[splitIndex]);
        if (!split) {
            segments.push({ title: `第 ${segments.length + 1} 页`, body: "" });
            continue;
        }
        segments.splice(splitIndex, 1, ...split);
    }
    return segments;
}

function splitSegment(segment: ContentSegment): [ContentSegment, ContentSegment] | null {
    const sentences = segment.body.match(/[^。！？!?；;\n]+[。！？!?；;]?/g)?.map((value) => value.trim()).filter(Boolean) || [];
    if (sentences.length > 1) {
        const half = Math.ceil(sentences.reduce((total, sentence) => total + sentence.length, 0) / 2);
        let length = 0;
        let index = 0;
        while (index < sentences.length - 1 && length < half) length += sentences[index++].length;
        return [
            { title: segment.title, body: sentences.slice(0, index).join("") },
            { title: `${segment.title}（续）`, body: sentences.slice(index).join("") },
        ];
    }
    if (segment.body.length < 2) return null;
    const middle = Math.floor(segment.body.length / 2);
    const breakAt = nearestBreak(segment.body, middle);
    return [
        { title: segment.title, body: segment.body.slice(0, breakAt).trim() },
        { title: `${segment.title}（续）`, body: segment.body.slice(breakAt).trim() },
    ];
}

function inferLayout(segment: ContentSegment, index: number): CreationCardLayout {
    if (index === 0) return "cover";
    if (/^\s*>/m.test(segment.body)) return "quote";
    if (/!\[[^\]]*\]\([^)]*\)|^\s*\|.+\|\s*$/m.test(segment.body)) return "split";
    return "editorial";
}

function inferredTitle(body: string, fallback: string) {
    const line = body.split("\n").find((value) => value.trim()) || "";
    const value = cleanTitle(line.replace(/^[-*+]\s+/, "").split(/[。！？!?；;]/, 1)[0]);
    return value ? `${value.slice(0, 24)}${value.length > 24 ? "…" : ""}` : fallback;
}

function cleanTitle(value: string) {
    return value.replace(/[*_`~]/g, "").trim();
}

function inferPageCount(source: string, segmentCount: number) {
    return clampPageCount(Math.max(segmentCount, Math.ceil(source.length / 360)));
}

function clampPageCount(value: number) {
    return Math.max(MIN_CARD_PAGES, Math.min(MAX_CARD_PAGES, Math.floor(value) || MIN_CARD_PAGES));
}

function clampIndex(value: number, length: number) {
    return Math.max(0, Math.min(Math.max(0, length - 1), Math.floor(value) || 0));
}

function segmentLength(segment: ContentSegment) {
    return segment.title.length + segment.body.length;
}

function nearestBreak(value: string, middle: number) {
    for (let offset = 0; offset < middle; offset += 1) {
        const right = middle + offset;
        if (right < value.length && /\s/.test(value[right])) return right;
        const left = middle - offset;
        if (left > 0 && /\s/.test(value[left])) return left;
    }
    return middle;
}

function uniquePresetIds(values: string[]) {
    return Array.from(new Set(values.map((value) => requirePlatformPreset(value).id)));
}

function requirePlatformPreset(value: string) {
    const preset = resolveSocialPlatformPreset(value);
    if (!preset) throw new Error(`未知平台规格：${value}`);
    return preset;
}

function defaultNow() {
    return new Date().toISOString();
}
