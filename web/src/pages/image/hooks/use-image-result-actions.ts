import { App } from "antd";
import { saveAs } from "file-saver";
import { nanoid } from "nanoid";
import type { Dispatch, SetStateAction } from "react";

import { compileFinalPrompt } from "@/features/image-design/compiler/compile-final-prompt";
import { buildImageDesignRequestSnapshot } from "@/features/image-design/generation/build-request-snapshot";
import { removeSeriesAnchorFromSnapshot } from "@/features/image-design/generation/series-executor";
import type { GenerationResult } from "@/features/image-design/generation/types";
import { planItemPromptSource, withPlanVisualBible } from "@/features/image-design/planning/text-planning";
import { useImageDesignStore } from "@/features/image-design/store/use-image-design-store";
import type { CompiledPrompt, DesignSkillDefinition, ImageDesignLanguage, ImageDesignRecommendation, ImageModelContext, PlatformPreset, PromptReference, SkillOptionValue, StructuredPlan, StructuredPlanItem } from "@/features/image-design/types";
import { downloadImageBlob, storeImageBlob } from "@/services/image-storage";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import type { ImageDesignGenerationController } from "./use-image-design-generation";

export type UseImageResultActionsInput = {
    generation: ImageDesignGenerationController;
    effectiveConfig: AiConfig;
    prompt: string;
    references: ReferenceImage[];
    setReferences: Dispatch<SetStateAction<ReferenceImage[]>>;
    referenceMaxCount?: number;
    referenceMaxBytes?: number;
    referenceMimeTypes?: string[];
    compiled: CompiledPrompt | null;
    finalPrompt: string;
    manualOverride: boolean;
    customInstructions: string;
    negativeInstructions: string;
    preset?: PlatformPreset;
    skill: DesignSkillDefinition;
    skillOptions: Record<string, SkillOptionValue>;
    seriesPlan: StructuredPlan | null;
    recommendation: ImageDesignRecommendation | null;
    promptReferences: PromptReference[];
    language: ImageDesignLanguage;
    modelContext: ImageModelContext;
    model: string;
};

export function useImageResultActions(input: UseImageResultActionsInput) {
    const { message, modal } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const setSeriesPlan = useImageDesignStore((state) => state.setSeriesPlan);

    const ensureStored = async (result: GenerationResult) => {
        const image = result.image;
        if (!image) throw new Error("没有可保存的图片");
        if (image.storageKey && image.dataUrl) return { result, image };
        const source = image.dataUrl || image.remoteUrl;
        if (!source) throw new Error("没有可保存的图片");
        await input.generation.replaceResult({ ...result, status: "downloading", error: undefined });
        try {
            const stored = await storeImageBlob(await downloadImageBlob(source));
            const nextImage = {
                ...image,
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
                persistenceError: undefined,
                failureStage: undefined,
            };
            const nextResult: GenerationResult = { ...result, status: "stored", image: nextImage, error: undefined, failureStage: undefined };
            await input.generation.replaceResult(nextResult);
            return { result: nextResult, image: nextImage };
        } catch (error) {
            const nextResult: GenerationResult = {
                ...result,
                status: image.remoteUrl ? "remote_only" : "generated",
                image: { ...image, persistenceError: error instanceof Error ? error.message : "保存失败", failureStage: image.remoteUrl ? "result_download" : "indexeddb_write" },
            };
            await input.generation.replaceResult(nextResult);
            throw error;
        }
    };

    const download = async (result: GenerationResult, index: number) => {
        const source = result.image?.dataUrl || result.image?.remoteUrl;
        if (!source) return;
        try {
            if (result.image?.remoteUrl && !result.image.storageKey) saveAs(await downloadImageBlob(result.image.remoteUrl), `image-${index + 1}.png`);
            else saveAs(source, `image-${index + 1}.png`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片下载失败");
        }
    };

    const saveLocal = async (result: GenerationResult) => {
        try {
            await ensureStored(result);
            message.success("图片已保存到浏览器本地");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片保存失败");
        }
    };

    const saveAsset = async (result: GenerationResult, index: number, silent = false) => {
        try {
            const stored = await ensureStored(result);
            const image = stored.image;
            if (!image.dataUrl || !image.storageKey) throw new Error("图片未能保存到本地");
            addAsset({
                kind: "image",
                title: result.snapshot.structuredItem?.title || `生成结果 ${index + 1}`,
                coverUrl: image.dataUrl,
                tags: [result.snapshot.designSkillLabel, result.snapshot.platformPresetLabel].filter((value): value is string => Boolean(value)),
                source: "生图工作台",
                data: {
                    dataUrl: image.dataUrl,
                    storageKey: image.storageKey,
                    width: image.width || 0,
                    height: image.height || 0,
                    bytes: image.bytes || 0,
                    mimeType: image.mimeType || "image/png",
                },
                metadata: { source: "image-page", prompt: result.snapshot.finalPrompt },
            });
            if (!silent) message.success("已加入我的资产");
        } catch (error) {
            if (!silent) message.error(error instanceof Error ? error.message : "加入资产失败");
            throw error;
        }
    };

    const addReference = async (result: GenerationResult, index: number) => {
        if (input.referenceMaxCount && input.references.length >= input.referenceMaxCount) {
            message.warning(`当前模型最多支持 ${input.referenceMaxCount} 张参考图`);
            return;
        }
        try {
            const stored = await ensureStored(result);
            if ((input.referenceMaxBytes && (stored.image.bytes || 0) > input.referenceMaxBytes) || (input.referenceMimeTypes && stored.image.mimeType && !input.referenceMimeTypes.includes(stored.image.mimeType.toLowerCase()))) {
                message.warning("图片不符合当前模型的参考图格式或大小限制");
                return;
            }
            input.setReferences((current) => [
                ...current,
                {
                    id: nanoid(),
                    name: result.snapshot.structuredItem?.title || `result-${index + 1}.png`,
                    type: stored.image.mimeType || "image/png",
                    dataUrl: stored.image.dataUrl || "",
                    storageKey: stored.image.storageKey,
                    bytes: stored.image.bytes,
                    width: stored.image.width,
                    height: stored.image.height,
                    role: "subject",
                    source: "result",
                },
            ]);
            message.success("已加入参考图");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加入参考图失败");
        }
    };

    const retry = async (result: GenerationResult) => {
        const retryModel = result.snapshot.config.imageModel || result.snapshot.config.model;
        if (!isAiConfigReady(input.effectiveConfig, retryModel)) {
            message.warning("保存快照使用的模型渠道当前不可用，请先完成配置");
            openConfigDialog(true);
            return null;
        }
        let completed = await input.generation.retry(result, input.effectiveConfig);
        if (completed?.status === "failed" && completed.failureStage === "request_prepare" && completed.snapshot.references.some((reference) => reference.source === "series-anchor")) {
            message.warning("系列锚点无法读取，已自动移除锚点并改用视觉圣经重试");
            completed = await input.generation.retry(
                {
                    ...completed,
                    snapshot: removeSeriesAnchorFromSnapshot(completed.snapshot),
                    warnings: [...(completed.warnings || []), "系列锚点无法读取，已自动移除锚点并改用视觉圣经重试。"],
                },
                input.effectiveConfig,
            );
        }
        const currentPlan = useImageDesignStore.getState().seriesPlan;
        if (completed?.snapshot.structuredItem && currentPlan) {
            setSeriesPlan({
                ...currentPlan,
                items: currentPlan.items.map((item) =>
                    planItemMatchesResult(currentPlan, item, completed) ? { ...item, status: completed.image ? "succeeded" : "failed", error: completed.error, finalPrompt: item.finalPrompt || completed.snapshot.finalPrompt } : item,
                ),
            });
        }
        return completed;
    };

    const recompile = async (result: GenerationResult | undefined, itemOverride?: StructuredPlanItem) => {
        if (!input.prompt.trim()) {
            message.warning("请先输入内容");
            return;
        }
        const structuredItem = itemOverride || result?.snapshot.structuredItem;
        const planItemIndex = structuredItem && input.seriesPlan ? input.seriesPlan.items.findIndex((item) => item.id === structuredItem.id) : -1;
        const itemIndex = planItemIndex >= 0 ? planItemIndex : (result?.snapshot.seriesIndex ?? -1);
        const nextReferences = referencesForPlanItem(result, itemIndex);
        const itemFinalPrompt = itemOverride?.finalPrompt?.trim();
        const anchorRoles: PromptReference[] = nextReferences
            .filter((reference) => reference.source === "series-anchor" && !input.promptReferences.some((role) => role.id === reference.id))
            .map((reference) => ({ id: reference.id, label: imageReferenceLabel(nextReferences.indexOf(reference)), name: reference.name, role: "series-anchor" }));
        const nextCompiled = compileFinalPrompt({
            userPrompt: structuredItem && input.seriesPlan ? planItemPromptSource(input.seriesPlan) : input.prompt,
            platformPreset: input.preset,
            designSkill: input.skill,
            skillOptions: input.skillOptions,
            structuredContent: structuredItem || input.seriesPlan || undefined,
            customInstructions: withPlanVisualBible(input.customInstructions, structuredItem ? input.seriesPlan : null),
            negativeInstructions: input.negativeInstructions,
            referenceImageRoles: [...input.promptReferences, ...anchorRoles],
            language: input.language,
            model: { ...input.modelContext, count: 1 },
            manualFinalPrompt:
                itemFinalPrompt ||
                (input.manualOverride
                    ? structuredItem
                        ? `${input.finalPrompt}\n\n当前系列项（只生成这一项）：${structuredItem.title}；${structuredItem.body}${structuredItem.requiredText?.length ? `；必须逐字保留：${structuredItem.requiredText.join("、")}` : ""}`
                        : input.finalPrompt
                    : undefined),
            manualOverride: Boolean(itemFinalPrompt || input.manualOverride),
        });
        const nextSnapshot = buildImageDesignRequestSnapshot({
            originalPrompt: input.prompt,
            compiled: nextCompiled,
            config: { ...input.effectiveConfig, model: input.model, imageModel: input.model, count: "1" },
            references: nextReferences,
            skill: input.skill,
            skillOptions: input.skillOptions,
            platformPreset: input.preset,
            recommendation: input.recommendation || undefined,
            structuredPlan: input.seriesPlan || undefined,
            structuredItem,
            seriesGroupId: input.seriesPlan?.id || result?.snapshot.seriesGroupId,
            seriesIndex: itemIndex >= 0 ? itemIndex : result?.snapshot.seriesIndex,
        }).persistent;
        if (input.modelContext.validationError) {
            message.warning(input.modelContext.validationError);
            return;
        }
        if (input.modelContext.supportsReferenceImages === false && nextReferences.length) {
            message.warning("当前模型不支持参考图，请移除参考图或切换模型");
            return;
        }
        const invalidReference = validateReferences(nextReferences, input.referenceMaxCount, input.referenceMaxBytes, input.referenceMimeTypes);
        if (invalidReference) {
            message.warning(invalidReference);
            return;
        }
        const retryModel = nextSnapshot.config.imageModel || nextSnapshot.config.model;
        if (!isAiConfigReady(input.effectiveConfig, retryModel)) {
            message.warning("当前图片模型渠道不可用，请先完成配置");
            openConfigDialog(true);
            return;
        }
        if (nextCompiled.providerMapping.requiresConfirmation) {
            const confirmed = await confirmMapping(modal, nextCompiled.providerMapping.note);
            if (!confirmed) return;
        }
        if (structuredItem) {
            const currentPlan = useImageDesignStore.getState().seriesPlan;
            if (currentPlan) {
                setSeriesPlan({
                    ...currentPlan,
                    items: currentPlan.items.map((item) => (item.id === structuredItem.id ? { ...item, status: "queued", error: undefined, finalPrompt: nextSnapshot.finalPrompt } : item)),
                });
            }
        }
        return retry({
            ...(result || { id: nanoid(), status: "queued" as const }),
            snapshot: nextSnapshot,
        });
    };

    const generatePlanItem = async (item: StructuredPlanItem) => {
        const existing = input.generation.results.find((result) => result.snapshot.structuredItem?.id === item.id);
        return recompile(existing, item);
    };

    const retryFailed = async () => {
        const failed = input.generation.results.filter((result) => result.status === "failed");
        for (const result of failed) {
            const completed = await retry(result);
            if (!completed) break;
        }
    };

    return { download, saveLocal, saveAsset, addReference, retry, recompile, generatePlanItem, retryFailed };

    function referencesForPlanItem(result: GenerationResult | undefined, itemIndex: number) {
        const references = [...input.references];
        if (itemIndex <= 0 || input.modelContext.supportsSeriesAnchor !== true || useImageDesignStore.getState().anchorChainEnabled === false || input.skillOptions.anchorChain === false) return references;
        const savedAnchor = result?.snapshot.references.find((reference) => reference.source === "series-anchor");
        const first = input.generation.results.find((candidate) => candidate.snapshot.seriesIndex === 0 && candidate.image);
        const firstImage = first?.image;
        const generatedAnchor: ReferenceImage | undefined =
            !savedAnchor && firstImage && (firstImage.dataUrl || firstImage.remoteUrl)
                ? {
                      id: `series-anchor-${firstImage.id}`,
                      name: "系列视觉锚点（图片 1）",
                      type: firstImage.mimeType || "image/png",
                      dataUrl: firstImage.dataUrl || firstImage.remoteUrl || "",
                      url: firstImage.remoteUrl,
                      storageKey: firstImage.storageKey,
                      bytes: firstImage.bytes,
                      width: firstImage.width,
                      height: firstImage.height,
                      role: "series-anchor",
                      source: "series-anchor",
                  }
                : undefined;
        const anchor = savedAnchor || generatedAnchor;
        if (!anchor || references.some((reference) => reference.id === anchor.id)) return references;
        if (input.referenceMaxCount && references.length >= input.referenceMaxCount) return references;
        return [...references, anchor];
    }
}

function planItemMatchesResult(plan: StructuredPlan, item: StructuredPlanItem, result: GenerationResult) {
    const generatedItem = result.snapshot.structuredItem;
    if (!generatedItem) return false;
    if (item.id === generatedItem.id) return true;
    return plan.type === "storyboard" && generatedItem.kind === "page" && Boolean(generatedItem.chapter) && item.chapter === generatedItem.chapter;
}

function validateReferences(references: ReferenceImage[], maxCount?: number, maxBytes?: number, mimeTypes?: string[]) {
    if (maxCount && references.length > maxCount) return `当前模型最多支持 ${maxCount} 张参考图，请删除超出部分`;
    const invalid = references.find((reference) => (maxBytes && reference.bytes && reference.bytes > maxBytes) || (mimeTypes && !mimeTypes.includes(reference.type.toLowerCase())));
    return invalid ? `参考图“${invalid.name}”不符合当前模型的格式或大小限制` : "";
}

function confirmMapping(modal: ReturnType<typeof App.useApp>["modal"], note: string) {
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        modal.confirm({
            title: "确认模型尺寸映射",
            content: `${note} 系统不会静默裁剪或拉伸。`,
            okText: "确认并生成",
            cancelText: "返回修改",
            onOk: () => finish(true),
            onCancel: () => finish(false),
            afterClose: () => finish(false),
        });
    });
}
