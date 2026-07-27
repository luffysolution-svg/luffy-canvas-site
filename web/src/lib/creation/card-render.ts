import type { SocialPlatformPreset } from "@/constant/creation";
import type { CreationCardLayout, CreationCardPage } from "@/types/creation";

export type CardRect = { x: number; y: number; width: number; height: number };

export type CardBackgroundPrimitive = {
    kind: "background";
    fit: "cover";
    destination: CardRect;
    source?: CardRect;
};

export type CardOverlayPrimitive = {
    kind: "overlay";
    rect: CardRect;
    fill: string;
};

export type CardTextPrimitive = {
    kind: "text";
    role: "title" | "body";
    text: string;
    rect: CardRect;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    color: string;
    align: CanvasTextAlign;
    maxLines: number;
};

export type CardRenderPrimitive = CardBackgroundPrimitive | CardOverlayPrimitive | CardTextPrimitive;

export type CardRenderPlan = {
    pageId: string;
    platformPresetId: string;
    width: number;
    height: number;
    orientation: "portrait" | "landscape";
    layout: CreationCardLayout;
    primitives: CardRenderPrimitive[];
};

export type BuildCardRenderPlanInput = {
    page: CreationCardPage;
    preset: SocialPlatformPreset;
    background?: { width: number; height: number };
};

export type RenderCardPageInput = {
    plan: CardRenderPlan;
    background: Blob | string;
};

const FONT_FAMILY = '"Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

export function buildCardRenderPlan({ page, preset, background }: BuildCardRenderPlanInput): CardRenderPlan {
    const width = preset.width;
    const height = preset.height;
    const orientation = height > width ? "portrait" : "landscape";
    const bounds = contentBounds(preset);
    const typography = textGeometry(page.layout, orientation, bounds, width, height);
    const backgroundPrimitive: CardBackgroundPrimitive = {
        kind: "background",
        fit: "cover",
        destination: { x: 0, y: 0, width, height },
        ...(background ? { source: computeCoverCrop(background.width, background.height, width, height) } : {}),
    };
    return {
        pageId: page.id,
        platformPresetId: preset.id,
        width,
        height,
        orientation,
        layout: page.layout,
        primitives: [
            backgroundPrimitive,
            ...overlayPrimitives(page.layout, orientation, width, height),
            textPrimitive("title", page.title, typography.title, typography.titleSize, typography.titleLineHeight, typography.titleLines, typography.align),
            textPrimitive("body", page.body, typography.body, typography.bodySize, typography.bodyLineHeight, typography.bodyLines, typography.align),
        ],
    };
}

export function computeCoverCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): CardRect {
    const sw = positiveDimension(sourceWidth);
    const sh = positiveDimension(sourceHeight);
    const tw = positiveDimension(targetWidth);
    const th = positiveDimension(targetHeight);
    const sourceRatio = sw / sh;
    const targetRatio = tw / th;
    if (sourceRatio > targetRatio) {
        const width = sh * targetRatio;
        return { x: (sw - width) / 2, y: 0, width, height: sh };
    }
    const height = sw / targetRatio;
    return { x: 0, y: (sh - height) / 2, width: sw, height };
}

export async function renderCardPageToBlob({ plan, background }: RenderCardPageInput): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持卡片画板渲染");
    const image = await loadBackground(background);
    try {
        context.fillStyle = "#f5f2eb";
        context.fillRect(0, 0, plan.width, plan.height);
        for (const primitive of plan.primitives) {
            if (primitive.kind === "background") {
                const source = primitive.source || computeCoverCrop(image.width, image.height, primitive.destination.width, primitive.destination.height);
                context.drawImage(image.source, source.x, source.y, source.width, source.height, primitive.destination.x, primitive.destination.y, primitive.destination.width, primitive.destination.height);
            } else if (primitive.kind === "overlay") {
                context.fillStyle = primitive.fill;
                context.fillRect(primitive.rect.x, primitive.rect.y, primitive.rect.width, primitive.rect.height);
            } else {
                drawText(context, primitive);
            }
        }
        return await canvasToPng(canvas);
    } finally {
        image.close?.();
    }
}

export function wrapCardText(text: string, maxWidth: number, maxLines: number, measure: (value: string) => number) {
    const normalized = text.replace(/\r\n?/g, "\n").trim();
    if (!normalized || maxLines <= 0) return [];
    const lines: string[] = [];
    for (const paragraph of normalized.split(/\n+/)) {
        let line = "";
        for (const character of Array.from(paragraph.trim())) {
            const next = `${line}${character}`;
            if (line && measure(next) > maxWidth) {
                lines.push(line.trimEnd());
                line = character.trimStart();
                if (lines.length === maxLines) break;
            } else {
                line = next;
            }
        }
        if (lines.length === maxLines) break;
        if (line) lines.push(line.trimEnd());
        if (lines.length === maxLines) break;
    }
    const truncated = lines.slice(0, maxLines);
    if (truncated.length === maxLines && normalizedContent(truncated) !== normalizedContent(normalized.split(/\n+/))) {
        truncated[maxLines - 1] = ellipsize(truncated[maxLines - 1], maxWidth, measure);
    }
    return truncated;
}

function contentBounds(preset: SocialPlatformPreset): CardRect {
    const horizontalPadding = Math.max(20, Math.round(preset.width * 0.025));
    const verticalPadding = Math.max(16, Math.round(preset.height * 0.02));
    const left = clampInset(preset.safeArea.left, preset.width) + horizontalPadding;
    const right = clampInset(preset.safeArea.right, preset.width) + horizontalPadding;
    const top = clampInset(preset.safeArea.top, preset.height) + verticalPadding;
    const bottom = clampInset(preset.safeArea.bottom, preset.height) + verticalPadding;
    return {
        x: left,
        y: top,
        width: Math.max(1, preset.width - left - right),
        height: Math.max(1, preset.height - top - bottom),
    };
}

function textGeometry(layout: CreationCardLayout, orientation: CardRenderPlan["orientation"], bounds: CardRect, width: number, height: number) {
    const portrait = orientation === "portrait";
    const titleSize = Math.round(portrait ? width * 0.066 : height * 0.105);
    const bodySize = Math.round(portrait ? width * 0.034 : height * 0.052);
    const titleLineHeight = Math.round(titleSize * 1.2);
    const bodyLineHeight = Math.round(bodySize * 1.55);
    const gap = Math.max(18, Math.round((portrait ? height : width) * 0.025));
    let title: CardRect;
    let body: CardRect;
    let align: CanvasTextAlign = "left";
    if (layout === "quote") {
        const quoteWidth = bounds.width * (portrait ? 0.88 : 0.72);
        const x = bounds.x + (bounds.width - quoteWidth) / 2;
        const titleHeight = bounds.height * 0.44;
        title = { x, y: bounds.y + bounds.height * 0.2, width: quoteWidth, height: titleHeight };
        body = { x, y: title.y + titleHeight + gap, width: quoteWidth, height: bounds.y + bounds.height - title.y - titleHeight - gap };
        align = "center";
    } else if (layout === "split") {
        if (portrait) {
            const start = bounds.y + bounds.height * 0.52;
            title = { x: bounds.x, y: start, width: bounds.width, height: bounds.height * 0.2 };
            body = { x: bounds.x, y: title.y + title.height + gap, width: bounds.width, height: bounds.y + bounds.height - title.y - title.height - gap };
        } else {
            const x = bounds.x + bounds.width * 0.52;
            const textWidth = bounds.x + bounds.width - x;
            title = { x, y: bounds.y + bounds.height * 0.12, width: textWidth, height: bounds.height * 0.34 };
            body = { x, y: title.y + title.height + gap, width: textWidth, height: bounds.y + bounds.height - title.y - title.height - gap };
        }
    } else if (layout === "editorial") {
        title = { x: bounds.x, y: bounds.y + bounds.height * 0.06, width: bounds.width * (portrait ? 1 : 0.72), height: bounds.height * 0.28 };
        body = { x: bounds.x, y: title.y + title.height + gap, width: bounds.width * (portrait ? 0.9 : 0.62), height: bounds.y + bounds.height - title.y - title.height - gap };
    } else {
        const start = bounds.y + bounds.height * (portrait ? 0.48 : 0.36);
        title = { x: bounds.x, y: start, width: bounds.width * (portrait ? 1 : 0.7), height: bounds.height * (portrait ? 0.25 : 0.32) };
        body = { x: bounds.x, y: title.y + title.height + gap, width: bounds.width * (portrait ? 0.92 : 0.62), height: bounds.y + bounds.height - title.y - title.height - gap };
    }
    return {
        title,
        body,
        align,
        titleSize: Math.max(24, titleSize),
        bodySize: Math.max(16, bodySize),
        titleLineHeight: Math.max(30, titleLineHeight),
        bodyLineHeight: Math.max(24, bodyLineHeight),
        titleLines: Math.max(1, Math.floor(title.height / Math.max(30, titleLineHeight))),
        bodyLines: Math.max(1, Math.floor(body.height / Math.max(24, bodyLineHeight))),
    };
}

function overlayPrimitives(layout: CreationCardLayout, orientation: CardRenderPlan["orientation"], width: number, height: number): CardOverlayPrimitive[] {
    if (layout === "quote") return [{ kind: "overlay", rect: { x: 0, y: 0, width, height }, fill: "rgba(15, 23, 42, 0.48)" }];
    if (layout === "split" && orientation === "landscape") return [{ kind: "overlay", rect: { x: width * 0.48, y: 0, width: width * 0.52, height }, fill: "rgba(15, 23, 42, 0.58)" }];
    if (layout === "editorial") return [{ kind: "overlay", rect: { x: 0, y: 0, width: orientation === "portrait" ? width : width * 0.76, height }, fill: "rgba(15, 23, 42, 0.46)" }];
    return [{ kind: "overlay", rect: { x: 0, y: height * (orientation === "portrait" ? 0.38 : 0.25), width, height: height * (orientation === "portrait" ? 0.62 : 0.75) }, fill: "rgba(15, 23, 42, 0.52)" }];
}

function textPrimitive(role: CardTextPrimitive["role"], text: string, rect: CardRect, fontSize: number, lineHeight: number, maxLines: number, align: CanvasTextAlign): CardTextPrimitive {
    return {
        kind: "text",
        role,
        text: text.trim(),
        rect,
        fontFamily: FONT_FAMILY,
        fontSize,
        fontWeight: role === "title" ? 700 : 400,
        lineHeight,
        color: "#ffffff",
        align,
        maxLines,
    };
}

function drawText(context: CanvasRenderingContext2D, primitive: CardTextPrimitive) {
    context.save();
    context.fillStyle = primitive.color;
    context.font = `${primitive.fontWeight} ${primitive.fontSize}px ${primitive.fontFamily}`;
    context.textAlign = primitive.align;
    context.textBaseline = "top";
    const lines = wrapCardText(primitive.text, primitive.rect.width, primitive.maxLines, (value) => context.measureText(value).width);
    const x = primitive.align === "center" ? primitive.rect.x + primitive.rect.width / 2 : primitive.align === "right" || primitive.align === "end" ? primitive.rect.x + primitive.rect.width : primitive.rect.x;
    lines.forEach((line, index) => context.fillText(line, x, primitive.rect.y + index * primitive.lineHeight, primitive.rect.width));
    context.restore();
}

async function loadBackground(background: Blob | string): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
    if (background instanceof Blob && typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(background);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const objectUrl = background instanceof Blob ? URL.createObjectURL(background) : background;
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            if (/^https?:\/\//i.test(objectUrl)) element.crossOrigin = "anonymous";
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("卡片背景图读取失败"));
            element.src = objectUrl;
        });
        return { source: image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    } finally {
        if (background instanceof Blob) URL.revokeObjectURL(objectUrl);
    }
}

function canvasToPng(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("卡片 PNG 导出失败"))), "image/png");
    });
}

function ellipsize(value: string, maxWidth: number, measure: (value: string) => number) {
    let text = value.trimEnd();
    while (text && measure(`${text}…`) > maxWidth) text = text.slice(0, -1);
    return `${text}…`;
}

function normalizedContent(values: string[]) {
    return values.join("").replace(/\s+/g, "");
}

function clampInset(value: number, dimension: number) {
    return Math.max(0, Math.min(Number.isFinite(value) ? value : 0, dimension * 0.35));
}

function positiveDimension(value: number) {
    if (!Number.isFinite(value) || value <= 0) throw new Error("图片尺寸必须为正数");
    return value;
}
