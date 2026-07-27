import { App } from "antd";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import { resolveSocialPlatformPreset } from "@/constant/creation";
import { applyCreationCardGenerationOutcomes, creationCardStyleReference, generatedImageReference, type CreationCardGenerationOutcome } from "@/lib/creation/card-generation";
import { addCreationCardPage, createCreationCardDeck, createCreationCardPage, moveCreationCardPage, removeCreationCardPage, updateCreationCardPage, type CreationCardPagePatch } from "@/lib/creation/card-pages";
import { buildCardPagePrompt } from "@/lib/creation/card-prompts";
import { buildCardExportPlan, createCardDeckArchive } from "@/lib/creation/card-export";
import { buildCardRenderPlan, renderCardPageToBlob } from "@/lib/creation/card-render";
import { createImageGenerationGateway } from "@/services/api/image-generation-gateway";
import { ImageGenerationError } from "@/services/api/image-errors";
import { downloadImageBlob, getImageBlob, storeImageBlob } from "@/services/image-storage";
import { useCanvasTransferStore } from "@/stores/canvas/use-canvas-transfer-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useCreationStore } from "@/stores/use-creation-store";
import type { CreationCardDeck, CreationCardGeneration, CreationCardPage, CreationError, CreationGeneratedImage, CreationProject, PromptVersion } from "@/types/creation";

type DeckPatch = Partial<Pick<CreationCardDeck, "platformPresetIds" | "activePlatformPresetId" | "modelConfigId" | "quality" | "background">>;

export function useCardDeckWorkflow(project: CreationProject) {
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const updateProject = useCreationStore((state) => state.updateProject);
    const addAsset = useAssetStore((state) => state.addAsset);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [busy, setBusy] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [activityText, setActivityText] = useState("");
    const controllerRef = useRef<AbortController | null>(null);
    const exportingRef = useRef(false);
    const projectId = project.id;

    useEffect(() => () => controllerRef.current?.abort(), [projectId]);

    const readProject = useCallback(() => useCreationStore.getState().projects.find((item) => item.id === projectId), [projectId]);
    const changeProject = useCallback((update: Partial<CreationProject> | ((current: CreationProject) => CreationProject)) => updateProject(projectId, update), [projectId, updateProject]);

    const splitIntoPages = useCallback(
        (targetPageCount = 6) => {
            const current = readProject();
            if (!current?.sourceContent.trim()) return void message.warning("请先输入文章或 Markdown 内容");
            const prompt = selectedPrompt(current);
            const brief = current.briefVersions.find((version) => version.id === current.selectedBriefVersionId)?.brief;
            const primaryPresetId = resolveSocialPlatformPreset(current.platformPresetId)?.id || "xiaohongshu-post";
            const stylePrompt = [prompt?.rawContent || prompt?.content || "", brief?.visualStyle || "", brief?.colorPalette.join("、") || ""].filter(Boolean).join("\n");
            try {
                const cardDeck = createCreationCardDeck({
                    sourceContent: current.sourceContent,
                    targetPageCount,
                    primaryPlatformPresetId: primaryPresetId,
                    modelConfigId: config.imageModel,
                    quality: config.quality,
                    background: config.background,
                    stylePrompt,
                });
                changeProject({ cardDeck, platformPresetId: primaryPresetId });
                message.success(`已拆分为 ${cardDeck.pages.length} 页，可逐页编辑后批量生成`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "文章拆页失败");
            }
        },
        [changeProject, config.background, config.imageModel, config.quality, message, readProject],
    );

    const updateDeck = useCallback((patch: DeckPatch) => changeProject((current) => (current.cardDeck ? { ...current, cardDeck: { ...current.cardDeck, ...patch, updatedAt: new Date().toISOString() } } : current)), [changeProject]);

    const updatePage = useCallback(
        (pageId: string, patch: CreationCardPagePatch) =>
            changeProject((current) => (current.cardDeck ? { ...current, cardDeck: { ...current.cardDeck, pages: updateCreationCardPage(current.cardDeck.pages, pageId, patch), updatedAt: new Date().toISOString() } } : current)),
        [changeProject],
    );

    const addPage = useCallback(
        (afterPageId?: string) => {
            try {
                changeProject((current) => {
                    if (!current.cardDeck) return current;
                    const index = afterPageId ? current.cardDeck.pages.findIndex((page) => page.id === afterPageId) + 1 : current.cardDeck.pages.length;
                    const page = createCreationCardPage({ title: `第 ${current.cardDeck.pages.length + 1} 页`, body: "", layout: "editorial" });
                    return { ...current, cardDeck: { ...current.cardDeck, pages: addCreationCardPage(current.cardDeck.pages, page, index), updatedAt: new Date().toISOString() } };
                });
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "无法添加页面");
            }
        },
        [changeProject, message],
    );

    const removePage = useCallback(
        (pageId: string) => {
            try {
                changeProject((current) => {
                    if (!current.cardDeck) return current;
                    return {
                        ...current,
                        cardDeck: {
                            ...current.cardDeck,
                            pages: removeCreationCardPage(current.cardDeck.pages, pageId),
                            styleAnchorPageId: current.cardDeck.styleAnchorPageId === pageId ? undefined : current.cardDeck.styleAnchorPageId,
                            updatedAt: new Date().toISOString(),
                        },
                    };
                });
            } catch (error) {
                message.warning(error instanceof Error ? error.message : "无法删除页面");
            }
        },
        [changeProject, message],
    );

    const movePage = useCallback(
        (pageId: string, direction: -1 | 1) =>
            changeProject((current) => {
                if (!current.cardDeck) return current;
                const index = current.cardDeck.pages.findIndex((page) => page.id === pageId);
                return index < 0 ? current : { ...current, cardDeck: { ...current.cardDeck, pages: moveCreationCardPage(current.cardDeck.pages, pageId, index + direction), updatedAt: new Date().toISOString() } };
            }),
        [changeProject],
    );

    const setPlatformPresetIds = useCallback(
        (values: string[]) => {
            const platformPresetIds = Array.from(
                new Set(
                    values.flatMap((value) => {
                        const id = resolveSocialPlatformPreset(value)?.id;
                        return id ? [id] : [];
                    }),
                ),
            );
            if (!platformPresetIds.length) return void message.warning("至少保留一个输出平台");
            const currentActive = readProject()?.cardDeck?.activePlatformPresetId;
            updateDeck({ platformPresetIds, activePlatformPresetId: currentActive && platformPresetIds.some((id) => id === currentActive) ? currentActive : platformPresetIds[0] });
        },
        [message, readProject, updateDeck],
    );

    const generatePages = useCallback(
        async (pageIds?: string[]) => {
            const current = readProject();
            const deck = current?.cardDeck;
            const promptVersion = current ? selectedPrompt(current) : undefined;
            if (!current || !deck) return;
            if (!promptVersion || !isPromptApproved(current, promptVersion.id)) return void message.warning("请先返回单图审核流程，批准一个提示词版本");
            const modelConfigId = deck.modelConfigId || config.imageModel;
            if (!isAiConfigReady(config, modelConfigId)) {
                openConfigDialog(false, "channels");
                return void message.warning("请先配置可用的生图模型");
            }
            const preset = resolveSocialPlatformPreset(deck.activePlatformPresetId);
            if (!preset) return void message.error("当前平台规格不存在");
            const targets = deck.pages.filter((page) => !pageIds || pageIds.includes(page.id));
            if (!targets.length) return;
            const controller = new AbortController();
            controllerRef.current?.abort();
            controllerRef.current = controller;
            const batchId = nanoid();
            setBusy(true);
            setActivityText(`正在生成 ${targets.length} 页视觉底图…`);
            changeProject((value) =>
                value.cardDeck
                    ? {
                          ...value,
                          cardDeck: {
                              ...value.cardDeck,
                              pages: value.cardDeck.pages.map((page) => (targets.some((target) => target.id === page.id) ? { ...page, status: "generating" as const, error: undefined } : page)),
                              updatedAt: new Date().toISOString(),
                          },
                      }
                    : value,
            );
            try {
                const gateway = createImageGenerationGateway(config);
                const outcomes: CreationCardGenerationOutcome[] = [];
                const pending = [...targets];
                let reference = creationCardStyleReference(current);

                while (!reference && pending.length) {
                    const page = pending.shift()!;
                    const generation = createGeneration(page, deck, promptVersion, preset.id, modelConfigId, batchId);
                    const prompt = buildCardPagePrompt({ project: current, deck, page, promptVersion, preset, pageIndex: deck.pages.findIndex((item) => item.id === page.id) });
                    try {
                        const result = await gateway.generateTextToImage(
                            { prompt: prompt.content, modelConfigId, promptVersionId: promptVersion.id, width: preset.width, height: preset.height, aspectRatio: preset.aspectRatio, quality: deck.quality, background: deck.background },
                            { signal: controller.signal },
                        );
                        const status = imageStatus(result.image);
                        const completed = { ...generation, status, imageId: result.image.id, providerId: result.image.providerId, modelId: result.image.modelId, updatedAt: new Date().toISOString() };
                        outcomes.push({ pageId: page.id, image: result.image, generation: completed });
                        reference = { page, image: result.image, reference: generatedImageReference(result.image) };
                    } catch (error) {
                        if (controller.signal.aborted) throw error;
                        const failure = cardError(error, page.id);
                        const status = error instanceof ImageGenerationError && error.resultUnknown ? ("unknown" as const) : ("failed" as const);
                        outcomes.push({ pageId: page.id, error: failure, generation: { ...generation, status, error: failure, updatedAt: new Date().toISOString() } });
                    }
                }

                if (reference && pending.length) {
                    const requests = pending.map((page) => {
                        const prompt = buildCardPagePrompt({ project: current, deck, page, promptVersion, preset, pageIndex: deck.pages.findIndex((item) => item.id === page.id) });
                        return {
                            candidateId: page.id,
                            prompt: prompt.content,
                            modelConfigId,
                            promptVersionId: promptVersion.id,
                            width: preset.width,
                            height: preset.height,
                            aspectRatio: preset.aspectRatio,
                            quality: deck.quality,
                            background: deck.background,
                            referenceImage: reference.reference,
                        };
                    });
                    const results = await gateway.generateImageCandidates(requests, { signal: controller.signal });
                    for (const page of pending) {
                        const generation = createGeneration(page, deck, promptVersion, preset.id, modelConfigId, batchId, reference.page?.id, reference.image.id);
                        const result = results.find((item) => item.candidateId === page.id);
                        if (result?.status === "fulfilled") {
                            const image = result.value.image;
                            const status = imageStatus(image);
                            outcomes.push({ pageId: page.id, image, generation: { ...generation, status, imageId: image.id, providerId: image.providerId, modelId: image.modelId, updatedAt: new Date().toISOString() } });
                        } else {
                            const reason = result?.reason || new Error("生图模型未返回页面结果");
                            const failure = cardError(reason, page.id);
                            const status = reason instanceof ImageGenerationError && reason.resultUnknown ? ("unknown" as const) : ("failed" as const);
                            outcomes.push({ pageId: page.id, error: failure, generation: { ...generation, status, error: failure, updatedAt: new Date().toISOString() } });
                        }
                    }
                }
                if (controller.signal.aborted) return;
                changeProject((value) => applyCreationCardGenerationOutcomes(value, outcomes));
                const successCount = outcomes.filter((outcome) => outcome.image).length;
                if (successCount === outcomes.length) message.success(`${successCount} 页已生成，风格锚点与溯源已保存`);
                else message.warning(`已生成 ${successCount} 页，${outcomes.length - successCount} 页失败，可单独重绘`);
            } catch (error) {
                if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : "批量生成失败");
            } finally {
                if (controllerRef.current === controller) {
                    controllerRef.current = null;
                    setBusy(false);
                    setActivityText("");
                }
            }
        },
        [changeProject, config, isAiConfigReady, message, openConfigDialog, readProject],
    );

    const cancelGeneration = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setBusy(false);
        setActivityText("");
        changeProject((current) =>
            current.cardDeck
                ? {
                      ...current,
                      cardDeck: {
                          ...current.cardDeck,
                          pages: current.cardDeck.pages.map((page) => (page.status === "generating" || page.status === "queued" ? { ...page, status: page.imageId ? ("stored" as const) : ("idle" as const) } : page)),
                      },
                  }
                : current,
        );
    }, [changeProject]);

    const setPageReview = useCallback(
        (pageId: string, approved: boolean) =>
            changeProject((current) =>
                current.cardDeck
                    ? {
                          ...current,
                          cardDeck: {
                              ...current.cardDeck,
                              pages: current.cardDeck.pages.map((page) => (page.id === pageId && page.imageId ? { ...page, reviewStatus: approved ? ("approved" as const) : ("changes_requested" as const), updatedAt: new Date().toISOString() } : page)),
                          },
                      }
                    : current,
            ),
        [changeProject],
    );

    const exportDeck = useCallback(
        async (pageIds?: string[], presetIds?: string[]) => {
            if (exportingRef.current) return;
            const current = readProject();
            const deck = current?.cardDeck;
            if (!current || !deck) return;
            exportingRef.current = true;
            setExporting(true);
            try {
                setActivityText("正在合成平台图片与 ZIP…");
                const plan = buildCardExportPlan(current, deck, presetIds || deck.platformPresetIds, pageIds);
                const result = await createCardDeckArchive({ plan, resolveBackground: (entry) => resolveExportBackground(current, entry.sourceImageId) });
                saveAs(result.blob, result.fileName);
                message.success(result.kind === "zip" ? `已导出 ${result.manifest.files.length} 张平台图片` : "当前页面已导出");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "卡片导出失败");
            } finally {
                exportingRef.current = false;
                setExporting(false);
                setActivityText("");
            }
        },
        [message, readProject],
    );

    const savePageAsset = useCallback(
        async (pageId: string, presetId: string) => {
            const current = readProject();
            if (!current?.cardDeck) return;
            try {
                const output = await prepareRenderedCard(current, pageId, presetId, changeProject);
                addAsset({
                    kind: "image",
                    title: output.title,
                    coverUrl: output.image.url || "",
                    tags: ["AI 创作审核台", "多页卡片", output.preset.platform],
                    source: "creation-card",
                    note: `${output.page.title}\n${output.page.body}`.trim(),
                    metadata: output.image.metadata,
                    data: {
                        dataUrl: output.image.url || "",
                        storageKey: output.image.storageKey,
                        width: output.image.width || output.preset.width,
                        height: output.image.height || output.preset.height,
                        bytes: output.image.bytes || 0,
                        mimeType: output.image.mimeType,
                    },
                });
                message.success("当前平台卡片已保存到我的资产");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "保存资产失败");
            }
        },
        [addAsset, changeProject, message, readProject],
    );

    const insertPagesToCanvas = useCallback(
        async (pageIds: string[], presetId: string, canvasProjectId: string) => {
            const current = readProject();
            if (!current?.cardDeck || !pageIds.length) return false;
            try {
                const outputs = [];
                for (const pageId of pageIds) outputs.push(await prepareRenderedCard(readProject() || current, pageId, presetId, changeProject));
                const batchId = outputs.length > 1 ? nanoid() : undefined;
                outputs.forEach((output, index) => {
                    useCanvasTransferStore.getState().queueInsert({
                        projectId: canvasProjectId,
                        creationProjectId: current.id,
                        title: output.title,
                        storageKey: output.image.storageKey!,
                        width: output.image.width,
                        height: output.image.height,
                        bytes: output.image.bytes,
                        mimeType: output.image.mimeType,
                        prompt: `${output.page.title}\n${output.page.body}`.trim(),
                        batchId,
                        batchIndex: index,
                        batchSize: outputs.length,
                        creationSource: {
                            creationProjectId: current.id,
                            generatedImageId: output.image.id,
                            sourceImageId: output.sourceImage.id,
                            promptVersionId: output.page.generation?.promptVersionId,
                            providerId: output.sourceImage.providerId,
                            modelId: output.sourceImage.modelId,
                            modelConfigId: output.sourceImage.modelConfigId,
                            createdAt: output.image.createdAt,
                            reviewStatus: output.page.reviewStatus,
                            mode: current.mode,
                            cardDeckId: current.cardDeck!.id,
                            cardPageId: output.page.id,
                            pageIndex: current.cardDeck!.pages.findIndex((page) => page.id === output.page.id),
                            styleId: current.cardDeck!.styleId,
                            platformPresetId: output.preset.id,
                            targetWidth: output.preset.width,
                            targetHeight: output.preset.height,
                            aspectRatio: output.preset.aspectRatio,
                            size: output.preset.aspectRatio,
                            quality: current.cardDeck!.quality,
                            background: current.cardDeck!.background,
                            conceptDraft: false,
                        },
                    });
                });
                message.success(outputs.length > 1 ? `已排队插入 ${outputs.length} 页卡片` : "卡片已排队插入画布");
                return true;
            } catch (error) {
                message.error(error instanceof Error ? error.message : "插入画布失败");
                return false;
            }
        },
        [changeProject, message, readProject],
    );

    return {
        deck: project.cardDeck,
        busy,
        exporting,
        activityText,
        splitIntoPages,
        updateDeck,
        updatePage,
        addPage,
        removePage,
        movePage,
        setPlatformPresetIds,
        generatePages,
        cancelGeneration,
        setPageReview,
        exportDeck,
        savePageAsset,
        insertPagesToCanvas,
    };
}

function selectedPrompt(project: CreationProject) {
    return project.promptVersions.find((version) => version.id === project.selectedPromptVersionId);
}

function isPromptApproved(project: CreationProject, promptVersionId: string) {
    return project.reviews.some((review) => review.gate === "prompt" && review.action === "approved" && review.targetId === promptVersionId);
}

function createGeneration(page: CreationCardPage, deck: CreationCardDeck, prompt: PromptVersion, platformPresetId: string, modelConfigId: string, batchId: string, referencePageId?: string, referenceImageId?: string): CreationCardGeneration {
    const now = new Date().toISOString();
    return {
        id: nanoid(),
        batchId,
        styleId: deck.styleId,
        pageRevision: page.revision,
        promptVersionId: prompt.id,
        platformPresetId,
        modelConfigId,
        referencePageId,
        referenceImageId,
        quality: deck.quality,
        background: deck.background,
        status: "generating",
        createdAt: now,
        updatedAt: now,
    };
}

function imageStatus(image: CreationGeneratedImage) {
    return image.storageKey ? ("stored" as const) : image.remoteUrl ? ("remote_only" as const) : ("generated" as const);
}

function cardError(error: unknown, pageId: string): CreationError {
    const message = error instanceof Error ? error.message : String(error || "未知错误");
    const stage = /indexeddb|本地存储|保存到本地/i.test(message) ? "storage" : /network|cors|跨域|连接|fetch/i.test(message) ? "network" : "image_model";
    return {
        id: nanoid(),
        stage,
        message,
        retryStatus: "generating_images",
        candidateId: pageId,
        details: error instanceof ImageGenerationError ? `${error.kind} / ${error.failureStage}` : undefined,
        createdAt: new Date().toISOString(),
    };
}

async function resolveExportBackground(project: CreationProject, imageId: string) {
    const image = project.generatedImages.find((item) => item.id === imageId);
    if (!image) throw new Error("页面视觉底图不存在");
    return resolveImageBlob(image);
}

async function resolveImageBlob(image: CreationGeneratedImage) {
    if (image.storageKey) {
        const stored = await getImageBlob(image.storageKey);
        if (stored) return stored;
    }
    const source = image.dataUrl || image.remoteUrl || image.url;
    if (!source) throw new Error("页面视觉底图无法读取，请重新生成该页");
    return downloadImageBlob(source);
}

async function prepareRenderedCard(project: CreationProject, pageId: string, presetId: string, changeProject: (update: Partial<CreationProject> | ((current: CreationProject) => CreationProject)) => void) {
    const deck = project.cardDeck;
    const page = deck?.pages.find((item) => item.id === pageId);
    const preset = resolveSocialPlatformPreset(presetId);
    const sourceImage = project.generatedImages.find((image) => image.id === page?.imageId);
    if (!deck || !page || !preset || !sourceImage) throw new Error("请先生成当前页面，再执行输出操作");
    const existing = project.generatedImages.find((image) => {
        const output = image.metadata?.cardOutput as Record<string, unknown> | undefined;
        return output?.cardDeckId === deck.id && output.pageId === page.id && output.pageRevision === page.revision && output.platformPresetId === preset.id && output.sourceImageId === sourceImage.id && image.storageKey;
    });
    if (existing) return { image: existing, sourceImage, page, preset, title: `${project.name} · ${String(deck.pages.findIndex((item) => item.id === page.id) + 1).padStart(2, "0")} · ${page.title}` };

    const plan = buildCardRenderPlan({ page, preset });
    const blob = await renderCardPageToBlob({ plan, background: await resolveImageBlob(sourceImage) });
    const stored = await storeImageBlob(blob);
    const image: CreationGeneratedImage = {
        id: nanoid(),
        ...stored,
        providerId: sourceImage.providerId,
        modelId: sourceImage.modelId,
        modelConfigId: sourceImage.modelConfigId,
        promptVersionId: page.generation?.promptVersionId || project.selectedPromptVersionId || sourceImage.promptVersionId,
        createdAt: new Date().toISOString(),
        metadata: {
            cardOutput: {
                kind: "composited-card",
                creationProjectId: project.id,
                cardDeckId: deck.id,
                pageId: page.id,
                pageRevision: page.revision,
                platformPresetId: preset.id,
                styleId: deck.styleId,
                sourceImageId: sourceImage.id,
            },
        },
    };
    changeProject((current) => (current.generatedImages.some((item) => item.id === image.id) ? current : { ...current, generatedImages: [...current.generatedImages, image] }));
    return { image, sourceImage, page, preset, title: `${project.name} · ${String(deck.pages.findIndex((item) => item.id === page.id) + 1).padStart(2, "0")} · ${page.title}` };
}
