import { resolveSocialPlatformPreset, SOCIAL_PLATFORM_PRESET_IDS } from "@/constant/creation";
import { buildCardRenderPlan, renderCardPageToBlob, type CardRenderPlan, type RenderCardPageInput } from "@/lib/creation/card-render";
import { createZip } from "@/lib/zip";
import { imageToBlob } from "@/services/image-storage";
import type { CreationCardDeck, CreationCardPage, CreationGeneratedImage, CreationProject } from "@/types/creation";

export type CardExportEntry = {
    fileName: string;
    platformPresetId: string;
    platformLabel: string;
    pageId: string;
    sourceImageId: string;
    pageIndex: number;
    layout: CreationCardPage["layout"];
    backgroundImage: CreationGeneratedImage;
    renderPlan: CardRenderPlan;
};

export type CardExportPlan = {
    creationProjectId: string;
    creationProjectName: string;
    deckId: string;
    styleId: string;
    platformPresetIds: string[];
    fileName: string;
    entries: CardExportEntry[];
};

export type CardExportManifest = {
    app: "luffy-canvas";
    version: 1;
    type: "creation-card-deck";
    exportedAt: string;
    creationProjectId: string;
    creationProjectName: string;
    deckId: string;
    styleId: string;
    platformPresetIds: string[];
    files: Array<{
        path: string;
        platformPresetId: string;
        pageId: string;
        pageNumber: number;
        width: number;
        height: number;
        layout: CreationCardPage["layout"];
        backgroundImageId: string;
        promptVersionId: string;
        modelConfigId: string;
    }>;
};

export type CreateCardDeckArchiveOptions = {
    plan: CardExportPlan;
    resolveBackground?: (entry: CardExportEntry) => Promise<Blob | string>;
    render?: (input: RenderCardPageInput) => Promise<Blob>;
    exportedAt?: string;
};

export type CardDeckArchiveResult = { kind: "single"; blob: Blob; fileName: string; manifest: CardExportManifest } | { kind: "zip"; blob: Blob; fileName: string; manifest: CardExportManifest };

export function buildCardExportPlan(project: CreationProject, deck: CreationCardDeck, presetIds: readonly string[] = deck.platformPresetIds, pageIds?: readonly string[]): CardExportPlan {
    const presets = orderedPresets(presetIds);
    if (!presets.length) throw new Error("请至少选择一个平台规格");
    if (!deck.pages.length) throw new Error("卡片组没有可导出的页面");
    const selectedPageIds = pageIds ? new Set(pageIds) : undefined;
    const pages = deck.pages.map((page, pageIndex) => ({ page, pageIndex })).filter(({ page }) => !selectedPageIds || selectedPageIds.has(page.id));
    if (!pages.length) throw new Error("没有选中可导出的页面");
    const images = new Map(project.generatedImages.map((image) => [image.id, image]));
    const entries = presets.flatMap((preset) =>
        pages.map(({ page, pageIndex }): CardExportEntry => {
            const imageId = page.generation?.imageId || page.imageId;
            const backgroundImage = imageId ? images.get(imageId) : undefined;
            if (!backgroundImage) throw new Error(`第 ${pageIndex + 1} 页缺少可导出的背景图`);
            return {
                fileName: cardExportFileName(preset.id, pageIndex, page.title),
                platformPresetId: preset.id,
                platformLabel: preset.label,
                pageId: page.id,
                sourceImageId: backgroundImage.id,
                pageIndex,
                layout: page.layout,
                backgroundImage,
                renderPlan: buildCardRenderPlan({ page, preset, background: imageDimensions(backgroundImage) }),
            };
        }),
    );
    return {
        creationProjectId: project.id,
        creationProjectName: project.name,
        deckId: deck.id,
        styleId: deck.styleId,
        platformPresetIds: presets.map((preset) => preset.id),
        fileName: `${safeName(project.name || "卡片组")}.zip`,
        entries,
    };
}

export async function createCardDeckArchive({ plan, resolveBackground = defaultResolveBackground, render = renderCardPageToBlob, exportedAt = new Date().toISOString() }: CreateCardDeckArchiveOptions): Promise<CardDeckArchiveResult> {
    if (!plan.entries.length) throw new Error("导出计划中没有文件");
    const manifest = buildCardExportManifest(plan, exportedAt);
    const rendered: Array<{ entry: CardExportEntry; blob: Blob }> = [];
    for (const entry of plan.entries) {
        rendered.push({ entry, blob: await render({ plan: entry.renderPlan, background: await resolveBackground(entry) }) });
    }
    if (rendered.length === 1) {
        const only = rendered[0];
        return { kind: "single", blob: only.blob, fileName: fileBaseName(only.entry.fileName), manifest };
    }
    const blob = await createZip([{ name: "manifest.json", data: JSON.stringify(manifest, null, 2) }, ...rendered.map(({ entry, blob: image }) => ({ name: entry.fileName, data: image }))]);
    return { kind: "zip", blob, fileName: plan.fileName, manifest };
}

export function buildCardExportManifest(plan: CardExportPlan, exportedAt: string): CardExportManifest {
    return {
        app: "luffy-canvas",
        version: 1,
        type: "creation-card-deck",
        exportedAt,
        creationProjectId: plan.creationProjectId,
        creationProjectName: plan.creationProjectName,
        deckId: plan.deckId,
        styleId: plan.styleId,
        platformPresetIds: [...plan.platformPresetIds],
        files: plan.entries.map((entry) => ({
            path: entry.fileName,
            platformPresetId: entry.platformPresetId,
            pageId: entry.pageId,
            pageNumber: entry.pageIndex + 1,
            width: entry.renderPlan.width,
            height: entry.renderPlan.height,
            layout: entry.layout,
            backgroundImageId: entry.backgroundImage.id,
            promptVersionId: entry.backgroundImage.promptVersionId,
            modelConfigId: entry.backgroundImage.modelConfigId,
        })),
    };
}

export function cardExportFileName(platformPresetId: string, pageIndex: number, title: string) {
    const pageNumber = String(Math.max(0, Math.floor(pageIndex)) + 1).padStart(2, "0");
    return `${safeName(platformPresetId)}/${pageNumber}-${safeName(title || "未命名页面", 48)}.png`;
}

function orderedPresets(presetIds: readonly string[]) {
    const selected = new Set(
        presetIds.map((id) => {
            const preset = resolveSocialPlatformPreset(id);
            if (!preset) throw new Error(`未知平台规格：${id}`);
            return preset.id;
        }),
    );
    return SOCIAL_PLATFORM_PRESET_IDS.filter((id) => selected.has(id)).map((id) => resolveSocialPlatformPreset(id)!);
}

function imageDimensions(image: CreationGeneratedImage) {
    return image.width && image.height ? { width: image.width, height: image.height } : undefined;
}

function defaultResolveBackground(entry: CardExportEntry) {
    return imageToBlob(entry.backgroundImage);
}

function safeName(value: string, maxLength = 80) {
    const normalized = value
        .normalize("NFKC")
        .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.\-]+|[.\-]+$/g, "");
    return Array.from(normalized || "未命名")
        .slice(0, maxLength)
        .join("");
}

function fileBaseName(path: string) {
    return path.split("/").pop() || "card.png";
}
