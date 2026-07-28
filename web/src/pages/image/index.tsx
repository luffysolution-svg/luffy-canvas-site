import { App, Button, Drawer, Modal, Tag, Typography } from "antd";
import { ImagePlus, Sparkles, Square } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { ImagePromptOptimizerDialog } from "@/components/prompts/image-prompt-optimizer";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { compileFinalPrompt } from "@/features/image-design/compiler/compile-final-prompt";
import { createImageModelContext } from "@/features/image-design/compiler/create-model-context";
import { buildImageDesignRequestSnapshot } from "@/features/image-design/generation/build-request-snapshot";
import type { GenerationLog, GenerationResult, ImageDesignRequestSnapshot } from "@/features/image-design/generation/types";
import { createDesignPlan } from "@/features/image-design/planning/create-design-plan";
import { normalizeDesignPlan, stampDesignPlan } from "@/features/image-design/planning/plan-state";
import { planItemPromptSource, sourceDigest, withPlanVisualBible } from "@/features/image-design/planning/text-planning";
import { defaultSkillOptions, designSkillById } from "@/features/image-design/registry/design-skills";
import { platformPresetById, platformPresetsForPlatform } from "@/features/image-design/registry/platform-presets";
import { recommendImageDesignWithAi } from "@/features/image-design/recommendation/ai-recommender";
import { recommendImageDesign } from "@/features/image-design/recommendation/local-recommender";
import { useImageDesignStore } from "@/features/image-design/store/use-image-design-store";
import type { CompiledPrompt, ImageDesignRecommendation, ImageModelContext, PlatformPreset, PromptReference, SkillOptionValue, StructuredPlan, StructuredPlanItem } from "@/features/image-design/types";
import { useCopyText } from "@/hooks/use-copy-text";
import { formatDuration } from "@/lib/image-utils";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { IMAGE_REQUEST_UNKNOWN_MESSAGE } from "@/services/api/image-errors";
import { consumeImagePrompt } from "@/services/prompt-optimizer-transfer";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { resolveModelChannel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@/types/image";

import { ImageGenerationSettings, type ImageGenerationSettingsValue } from "./components/image-generation-settings";
import { ImageHistoryPanel, type ImageHistoryFilters } from "./components/image-history-panel";
import { ImageResultsPanel, type ImageResultsLayout } from "./components/image-results-panel";
import { ImageWorkbenchPanel } from "./components/image-workbench-panel";
import { useImageDesignGeneration } from "./hooks/use-image-design-generation";
import { useImageResultActions } from "./hooks/use-image-result-actions";
import { ImageDesignPreferencesDrawer } from "@/features/image-design/components/image-design-preferences-drawer";

const QWEN_REFERENCE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/x-ms-bmp", "image/tiff", "image/webp", "image/gif"];

type PreparedGeneration = {
    snapshots: ImageDesignRequestSnapshot[];
    config: AiConfig;
    mode: "batch" | "series";
    batchSize: number;
    anchorChainEnabled: boolean;
    modelContext: ImageModelContext;
    plan: StructuredPlan | null;
    agentTaskId?: string;
};

export default function ImagePage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const assets = useAssetStore((state) => state.assets);
    const selectedSkillId = useImageDesignStore((state) => state.selectedSkillId);
    const imageDesignHydrated = useImageDesignStore((state) => state.hydrated);
    const selectedPresetId = useImageDesignStore((state) => state.selectedPresetId);
    const skillSelectionExplicit = useImageDesignStore((state) => state.skillSelectionExplicit);
    const platformSelectionExplicit = useImageDesignStore((state) => state.platformSelectionExplicit);
    const explicitSkillOptionKeys = useImageDesignStore((state) => state.explicitSkillOptionKeys);
    const allSkillOptions = useImageDesignStore((state) => state.skillOptions);
    const customPresets = useImageDesignStore((state) => state.customPresets);
    const seriesPlan = useImageDesignStore((state) => state.seriesPlan);
    const lastUsedBySkill = useImageDesignStore((state) => state.lastUsedBySkill);
    const preferences = useImageDesignStore(
        useShallow((state) => ({
            quickMode: state.quickMode,
            confirmBeforeGeneration: state.confirmBeforeGeneration,
            useAiRecommendation: state.useAiRecommendation,
            finalPromptPreviewOpen: state.finalPromptPreviewOpen,
            finalPromptPreviewEnabled: state.finalPromptPreviewEnabled,
            defaultLanguage: state.defaultLanguage,
            defaultSkillId: state.defaultSkillId,
            defaultPlatformId: state.defaultPlatformId,
            defaultPalette: state.defaultPalette,
            defaultStyle: state.defaultStyle,
            defaultSeriesCount: state.defaultSeriesCount,
            anchorChainEnabled: state.anchorChainEnabled,
            batchSize: state.batchSize,
        })),
    );
    const selectSkill = useImageDesignStore((state) => state.selectSkill);
    const selectPlatformPreset = useImageDesignStore((state) => state.selectPlatformPreset);
    const replaceSkillOptions = useImageDesignStore((state) => state.replaceSkillOptions);
    const updatePreferences = useImageDesignStore((state) => state.updatePreferences);
    const setSeriesPlan = useImageDesignStore((state) => state.setSeriesPlan);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const generation = useImageDesignGeneration();

    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [manualFinalPrompt, setManualFinalPrompt] = useState("");
    const [manualOverride, setManualOverride] = useState(false);
    const [customInstructions, setCustomInstructions] = useState("");
    const [negativeInstructions, setNegativeInstructions] = useState("");
    const [recommendation, setRecommendation] = useState<ImageDesignRecommendation | null>(null);
    const [appliedRecommendation, setAppliedRecommendation] = useState<ImageDesignRecommendation | null>(null);
    const [recommending, setRecommending] = useState(false);
    const [quickGenerationQueued, setQuickGenerationQueued] = useState(false);
    const [planWarnings, setPlanWarnings] = useState<string[]>([]);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [activeLogId, setActiveLogId] = useState<string>();
    const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
    const [resultsLayout, setResultsLayout] = useState<ImageResultsLayout>("grid");
    const [historyFilters, setHistoryFilters] = useState<ImageHistoryFilters>({ keyword: "" });
    const [historyOpen, setHistoryOpen] = useState(false);
    const [generationSettingsOpen, setGenerationSettingsOpen] = useState(false);
    const [preferencesOpen, setPreferencesOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [promptOptimizerOpen, setPromptOptimizerOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [pendingGeneration, setPendingGeneration] = useState<PreparedGeneration | null>(null);
    const [agentRun, setAgentRun] = useState<{ nonce: number; prompt: string; taskId?: string } | null>(null);
    const processedCommandRef = useRef(0);
    const previousSkillRef = useRef(selectedSkillId);
    const hydrationObservedRef = useRef(imageDesignHydrated);

    const skill = useMemo(() => designSkillById(selectedSkillId), [selectedSkillId]);
    const preset = useMemo(() => platformPresetById(selectedPresetId, customPresets), [customPresets, selectedPresetId]);
    const skillOptions = useMemo(() => ({ ...defaultSkillOptions(selectedSkillId), ...(allSkillOptions[selectedSkillId] || {}) }), [allSkillOptions, selectedSkillId]);
    const activeSeriesPlan = useMemo(() => normalizeDesignPlan(seriesPlan, selectedSkillId, prompt, skillOptions, explicitSkillOptionKeys[selectedSkillId] || []), [explicitSkillOptionKeys, prompt, selectedSkillId, seriesPlan, skillOptions]);
    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const channel = useMemo(() => resolveModelChannel(effectiveConfig, model), [effectiveConfig, model]);
    const skillRequestedSize = useMemo(() => requestedSizeFromSkillOptions(skillOptions), [skillOptions]);
    const modelContext = useMemo(() => createImageModelContext({ ...effectiveConfig, model, imageModel: model }, preset, skillRequestedSize), [effectiveConfig, model, preset, skillRequestedSize]);
    const referenceMaxCount = channel.apiFormat === "qwen" ? 3 : undefined;
    const referenceMaxBytes = channel.apiFormat === "qwen" ? 10 * 1024 * 1024 : undefined;
    const referenceMimeTypes = channel.apiFormat === "qwen" ? QWEN_REFERENCE_MIME_TYPES : undefined;
    const promptReferences = useMemo(() => compileReferenceRoles(references), [references]);
    const recommendationContentSignature = useMemo(
        () =>
            JSON.stringify({
                prompt,
                references: references.map(({ id, name, role, type, bytes, width, height }) => ({ id, name, role, type, bytes, width, height })),
                model: {
                    provider: modelContext.provider,
                    apiFormat: modelContext.apiFormat,
                    model: modelContext.model,
                    supportsReferenceImages: modelContext.supportsReferenceImages,
                    maxReferenceImages: modelContext.maxReferenceImages,
                },
            }),
        [modelContext, prompt, references],
    );
    const recommendationInputSignature = useMemo(
        () =>
            JSON.stringify({
                content: recommendationContentSignature,
                selectedSkillId,
                selectedPresetId,
                options: allSkillOptions[selectedSkillId] || {},
                skillSelectionExplicit,
                platformSelectionExplicit,
            }),
        [allSkillOptions, platformSelectionExplicit, recommendationContentSignature, selectedPresetId, selectedSkillId, skillSelectionExplicit],
    );
    const visibleRecommendation = recommendation?.inputSignature === recommendationInputSignature ? recommendation : null;
    const activeAppliedRecommendation =
        appliedRecommendation && appliedRecommendation.applied === true && (!appliedRecommendation.contentSignature || appliedRecommendation.contentSignature === recommendationContentSignature) ? appliedRecommendation : null;

    const compiled = useMemo(() => {
        if (!prompt.trim()) return null;
        try {
            return compileFinalPrompt({
                userPrompt: prompt,
                platformPreset: preset,
                designSkill: skill,
                skillOptions,
                structuredContent: activeSeriesPlan || undefined,
                customInstructions,
                negativeInstructions,
                referenceImageRoles: promptReferences,
                language: preferences.defaultLanguage,
                model: modelContext,
                manualFinalPrompt,
                manualOverride,
            });
        } catch {
            return null;
        }
    }, [activeSeriesPlan, customInstructions, manualFinalPrompt, manualOverride, modelContext, negativeInstructions, preferences.defaultLanguage, preset, prompt, promptReferences, skill, skillOptions]);
    const finalPrompt = compiled?.finalPrompt || manualFinalPrompt;
    const resultActions = useImageResultActions({
        generation,
        effectiveConfig,
        prompt,
        references,
        setReferences,
        referenceMaxCount,
        referenceMaxBytes,
        referenceMimeTypes,
        compiled,
        finalPrompt,
        manualOverride,
        customInstructions,
        negativeInstructions,
        preset,
        skill,
        skillOptions,
        seriesPlan: activeSeriesPlan,
        recommendation: activeAppliedRecommendation,
        promptReferences,
        language: preferences.defaultLanguage,
        modelContext,
        model,
    });

    useEffect(() => {
        const transferred = consumeImagePrompt();
        if (!transferred) return;
        setPrompt(transferred);
        setManualOverride(false);
        message.success("已将优化后的提示词带入生图工作台");
    }, [message]);

    useEffect(() => {
        if (!imageDesignHydrated) return;
        if (!hydrationObservedRef.current) {
            hydrationObservedRef.current = true;
            previousSkillRef.current = selectedSkillId;
            return;
        }
        if (previousSkillRef.current === selectedSkillId) return;
        previousSkillRef.current = selectedSkillId;
        setSeriesPlan(null);
        setPlanWarnings([]);
        setRecommendation(null);
        setManualOverride(false);
    }, [imageDesignHydrated, selectedSkillId, setSeriesPlan]);

    useEffect(() => {
        setSelectedResultIds((ids) => ids.filter((id) => generation.results.some((result) => result.id === id)));
    }, [generation.results]);

    useEffect(() => {
        const updates = new Map(
            generation.results.flatMap((result) => {
                const item = result.snapshot.structuredItem;
                if (!item) return [];
                const status =
                    result.image && !["failed", "unknown", "cancelled"].includes(result.status)
                        ? "succeeded"
                        : result.status === "failed" || result.status === "unknown"
                          ? "failed"
                          : result.status === "cancelled"
                            ? "cancelled"
                            : result.status === "queued"
                              ? "queued"
                              : "generating";
                return [[item.id, { status, error: result.status === "unknown" ? IMAGE_REQUEST_UNKNOWN_MESSAGE : result.error, finalPrompt: result.snapshot.finalPrompt }] as const];
            }),
        );
        if (!updates.size) return;
        const current = useImageDesignStore.getState().seriesPlan;
        if (!current) return;
        const items = current.items.map((item) => {
            const result = resultForPlanItem(generation.results, current, item);
            const patch =
                updates.get(item.id) ||
                (result
                    ? {
                          status:
                              result.image && !["failed", "unknown", "cancelled"].includes(result.status)
                                  ? ("succeeded" as const)
                                  : result.status === "failed" || result.status === "unknown"
                                    ? ("failed" as const)
                                    : result.status === "cancelled"
                                      ? ("cancelled" as const)
                                      : result.status === "queued"
                                        ? ("queued" as const)
                                        : ("generating" as const),
                          error: result.status === "unknown" ? IMAGE_REQUEST_UNKNOWN_MESSAGE : result.error,
                          finalPrompt: item.finalPrompt || result.snapshot.finalPrompt,
                      }
                    : undefined);
            return patch ? { ...item, ...patch } : item;
        });
        if (items.some((item, index) => item !== current.items[index])) setSeriesPlan({ ...current, items });
    }, [generation.results, setSeriesPlan]);

    const compilePlanPrompts = useCallback(
        (plan: StructuredPlan | null, useManualOverride = manualOverride) => {
            if (!plan || !prompt.trim() || !usesSeriesSnapshots(skill, skillOptions)) return plan;
            return {
                ...plan,
                items: plan.items.map((item) => {
                    const itemManualPrompt =
                        useManualOverride && manualFinalPrompt.trim()
                            ? `${manualFinalPrompt.trim()}\n\n当前系列项（只生成这一项）：${item.title}；${item.body}${item.requiredText?.length ? `；必须逐字保留：${item.requiredText.join("、")}` : ""}`
                            : undefined;
                    const itemCompiled = compileFinalPrompt({
                        userPrompt: planItemPromptSource(plan),
                        platformPreset: preset,
                        designSkill: skill,
                        skillOptions,
                        structuredContent: item,
                        customInstructions: withPlanVisualBible(customInstructions, plan),
                        negativeInstructions,
                        referenceImageRoles: promptReferences,
                        language: preferences.defaultLanguage,
                        model: { ...modelContext, count: 1 },
                        manualFinalPrompt: itemManualPrompt,
                        manualOverride: Boolean(itemManualPrompt),
                    });
                    return { ...item, finalPrompt: itemCompiled.finalPrompt };
                }),
            };
        },
        [customInstructions, manualFinalPrompt, manualOverride, modelContext, negativeInstructions, preferences.defaultLanguage, preset, prompt, promptReferences, skill, skillOptions],
    );

    const createPlan = useCallback(
        (includePrompts = true) => {
            if (!prompt.trim()) {
                message.warning("请先输入内容");
                return null;
            }
            const explicitOptionKeys = explicitSkillOptionKeys[selectedSkillId] || [];
            const planned = createDesignPlan(selectedSkillId, prompt, skillOptions, explicitOptionKeys);
            const stamped = stampDesignPlan(planned.plan, selectedSkillId, prompt, skillOptions, explicitOptionKeys);
            const plan = includePrompts ? compilePlanPrompts(stamped) : stamped;
            setSeriesPlan(plan);
            setPlanWarnings(planned.warnings);
            if (plan) message.success(`已生成 ${plan.items.length} 项可编辑计划`);
            else message.info("当前 Skill 不需要系列计划");
            return plan;
        },
        [compilePlanPrompts, explicitSkillOptionKeys, message, prompt, selectedSkillId, setSeriesPlan, skillOptions],
    );

    const runRecommendation = useCallback(async () => {
        if (!prompt.trim() || recommending) return null;
        setRecommending(true);
        const currentOptions = allSkillOptions[selectedSkillId] || {};
        const explicitOptions = Object.fromEntries((explicitSkillOptionKeys[selectedSkillId] || []).flatMap((key) => (currentOptions[key] === undefined ? [] : [[key, currentOptions[key]]])));
        const input = {
            content: prompt,
            skillId: selectedSkillId,
            skillSelectionExplicit,
            platformPresetId: selectedPresetId,
            platformSelectionExplicit,
            platformId: preset?.platform,
            contentType: preset?.contentType,
            explicitOptions,
            savedOptions: lastUsedBySkill[selectedSkillId],
            referenceSummary: references.map((reference, index) => `${imageReferenceLabel(index)} ${reference.name} ${reference.role || "未指定用途"}`).join("；"),
            modelCapabilities: {
                provider: modelContext.provider,
                apiFormat: modelContext.apiFormat,
                model: modelContext.model,
                requestedAspectRatio: modelContext.requestedAspectRatio,
                resolvedAspectRatio: modelContext.resolvedAspectRatio,
                supportsReferenceImages: modelContext.supportsReferenceImages,
                maxReferenceImages: modelContext.maxReferenceImages,
                maxCount: 15,
            },
        };
        try {
            const next = preferences.useAiRecommendation ? await recommendImageDesignWithAi({ config: effectiveConfig, input }) : recommendImageDesign(input);
            const signed = {
                ...next,
                inputSignature: recommendationInputSignature,
                contentSignature: recommendationContentSignature,
                applied: false,
            };
            setRecommendation(signed);
            return signed;
        } finally {
            setRecommending(false);
        }
    }, [
        allSkillOptions,
        effectiveConfig,
        explicitSkillOptionKeys,
        lastUsedBySkill,
        modelContext,
        platformSelectionExplicit,
        preferences.useAiRecommendation,
        preset,
        prompt,
        recommendationContentSignature,
        recommendationInputSignature,
        recommending,
        references,
        selectedPresetId,
        selectedSkillId,
        skillSelectionExplicit,
    ]);

    const applyRecommendationValue = useCallback(
        (next: ImageDesignRecommendation) => {
            const applied = { ...next, applied: true };
            selectSkill(applied.skillId);
            replaceSkillOptions(applied.skillId, applied.options);
            selectPlatformPreset(applied.platformPresetId || "manual");
            setAppliedRecommendation(applied);
            setSeriesPlan(null);
            setPlanWarnings([]);
            setManualOverride(false);
            setRecommendation(null);
            message.success("已应用推荐，可继续修改任意参数");
        },
        [message, replaceSkillOptions, selectPlatformPreset, selectSkill, setSeriesPlan],
    );

    const applyRecommendation = useCallback(() => {
        if (!visibleRecommendation) return;
        applyRecommendationValue(visibleRecommendation);
    }, [applyRecommendationValue, visibleRecommendation]);

    const prepareGeneration = useCallback(
        (agentPrompt?: string, agentTaskId?: string): PreparedGeneration | null => {
            const originalPrompt = (agentPrompt ?? prompt).trim();
            if (!originalPrompt) {
                message.error("请输入生图提示词");
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "请输入生图提示词" });
                return null;
            }
            const legacyAgentRun = agentPrompt !== undefined;
            const activeSkill = legacyAgentRun ? designSkillById("none") : skill;
            const activePreset = legacyAgentRun ? undefined : preset;
            const activeOptions = legacyAgentRun ? {} : skillOptions;
            const activeReferences = [...references];
            const activeModelContext = createImageModelContext({ ...effectiveConfig, model, imageModel: model }, activePreset, legacyAgentRun ? undefined : requestedSizeFromSkillOptions(activeOptions));
            if (activeModelContext.validationError) {
                message.warning(activeModelContext.validationError);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: activeModelContext.validationError });
                return null;
            }
            if (activeModelContext.supportsReferenceImages === false && activeReferences.length) {
                const error = "当前模型不支持参考图，请移除参考图或切换模型";
                message.warning(error);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error });
                return null;
            }
            if (referenceMaxCount && activeReferences.length > referenceMaxCount) {
                const error = `当前模型最多支持 ${referenceMaxCount} 张参考图，请删除超出部分`;
                message.warning(error);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error });
                return null;
            }
            const incompatibleReference = activeReferences.find((reference) => (referenceMaxBytes && reference.bytes && reference.bytes > referenceMaxBytes) || (referenceMimeTypes && !referenceMimeTypes.includes(reference.type.toLowerCase())));
            if (incompatibleReference) {
                const error = `参考图“${incompatibleReference.name}”不符合当前模型的格式或大小限制`;
                message.warning(error);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error });
                return null;
            }
            if (!isAiConfigReady(effectiveConfig, model)) {
                message.warning("请先完成图片模型配置");
                openConfigDialog(true);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "生图配置不完整" });
                return null;
            }

            let activePlan: StructuredPlan | null = legacyAgentRun ? null : activeSeriesPlan;
            const needsPlan = ["series", "article", "storyboard", "structured"].includes(activeSkill.workflow);
            if (needsPlan && !activePlan) {
                const explicitOptionKeys = legacyAgentRun ? [] : explicitSkillOptionKeys[activeSkill.id] || [];
                const planned = createDesignPlan(activeSkill.id, originalPrompt, activeOptions, explicitOptionKeys);
                activePlan = stampDesignPlan(planned.plan, activeSkill.id, originalPrompt, activeOptions, explicitOptionKeys);
                setSeriesPlan(activePlan);
                setPlanWarnings(planned.warnings);
            }
            if (!legacyAgentRun && activePlan && usesSeriesSnapshots(activeSkill, activeOptions)) {
                const preservesComicPromptSnapshots = activeSkill.id === "comic" && activeOptions.partialMode === "images-only" && activePlan.items.length > 0 && activePlan.items.every((item) => Boolean(item.finalPrompt?.trim()));
                if (!preservesComicPromptSnapshots) activePlan = compilePlanPrompts(activePlan);
                setSeriesPlan(activePlan);
            }
            const seriesMode = Boolean(activePlan?.items.length && usesSeriesSnapshots(activeSkill, activeOptions));
            const referenceRoles = legacyAgentRun ? [] : compileReferenceRoles(activeReferences);
            const count = seriesMode ? 1 : Math.max(1, Math.min(15, Math.round(Number(config.count)) || 1));
            const compileOne = (structuredContent: StructuredPlan | StructuredPlanItem | undefined, item?: StructuredPlanItem) => {
                const itemManualPrompt =
                    !legacyAgentRun && manualOverride && manualFinalPrompt.trim()
                        ? item
                            ? `${manualFinalPrompt.trim()}\n\n当前系列项（只生成这一项）：${item.title}；${item.body}${item.requiredText?.length ? `；必须逐字保留：${item.requiredText.join("、")}` : ""}`
                            : manualFinalPrompt
                        : undefined;
                return compileFinalPrompt({
                    userPrompt: item && activePlan ? planItemPromptSource(activePlan) : originalPrompt,
                    platformPreset: activePreset,
                    designSkill: activeSkill,
                    skillOptions: activeOptions,
                    structuredContent,
                    customInstructions: legacyAgentRun ? undefined : withPlanVisualBible(customInstructions, item ? activePlan : null),
                    negativeInstructions: legacyAgentRun ? undefined : negativeInstructions,
                    referenceImageRoles: referenceRoles,
                    language: preferences.defaultLanguage,
                    model: { ...activeModelContext, count: item ? 1 : count },
                    manualFinalPrompt: itemManualPrompt,
                    manualOverride: Boolean(itemManualPrompt),
                });
            };
            const baseConfig = { ...effectiveConfig, model, imageModel: model, count: String(count) };

            if (seriesMode && activePlan) {
                const generationItems = activeSkill.id === "comic" ? comicPageGenerationItems(activePlan) : activePlan.items;
                const snapshots = generationItems.map((item, index) => {
                    const itemCompiled = compileOne(item, item);
                    return buildImageDesignRequestSnapshot({
                        originalPrompt,
                        compiled: itemCompiled,
                        config: { ...baseConfig, count: "1" },
                        references: activeReferences,
                        skill: activeSkill,
                        skillOptions: activeOptions,
                        platformPreset: activePreset,
                        recommendation: activeAppliedRecommendation || undefined,
                        structuredPlan: activePlan || undefined,
                        structuredItem: item,
                        seriesGroupId: activePlan.id,
                        seriesIndex: index,
                    }).persistent;
                });
                return {
                    snapshots,
                    config: { ...baseConfig, size: snapshots[0].config.size, quality: snapshots[0].config.quality, count: "1" },
                    mode: "series",
                    batchSize: preferences.batchSize,
                    anchorChainEnabled: preferences.anchorChainEnabled && activeOptions.anchorChain !== false,
                    modelContext: activeModelContext,
                    plan: activePlan,
                    agentTaskId,
                };
            }

            const singleCompiled = compileOne(activePlan || undefined);
            const built = buildImageDesignRequestSnapshot({
                originalPrompt,
                compiled: singleCompiled,
                config: baseConfig,
                references: activeReferences,
                skill: activeSkill,
                skillOptions: activeOptions,
                platformPreset: activePreset,
                recommendation: activeAppliedRecommendation || undefined,
                structuredPlan: activePlan || undefined,
            });
            const snapshots = Array.from({ length: count }, () => ({ ...built.persistent, id: nanoid() }));
            return {
                snapshots,
                config: built.executionConfig,
                mode: "batch",
                batchSize: preferences.batchSize,
                anchorChainEnabled: false,
                modelContext: activeModelContext,
                plan: activePlan,
                agentTaskId,
            };
        },
        [
            config.count,
            compilePlanPrompts,
            customInstructions,
            effectiveConfig,
            explicitSkillOptionKeys,
            isAiConfigReady,
            manualFinalPrompt,
            manualOverride,
            message,
            model,
            negativeInstructions,
            openConfigDialog,
            preferences.anchorChainEnabled,
            preferences.batchSize,
            preferences.defaultLanguage,
            preset,
            prompt,
            activeAppliedRecommendation,
            referenceMaxBytes,
            referenceMaxCount,
            referenceMimeTypes,
            references,
            activeSeriesPlan,
            setSeriesPlan,
            skill,
            skillOptions,
            updateAgentTask,
        ],
    );

    const executePrepared = useCallback(
        async (prepared: PreparedGeneration) => {
            setPendingGeneration(null);
            if (prepared.plan && prepared.mode === "series") {
                setSeriesPlan({ ...prepared.plan, items: prepared.plan.items.map((item) => ({ ...item, status: "queued", error: undefined })) });
            }
            const completed = await generation.start({
                ...prepared,
                updateAgentTask,
            });
            if (!completed || !prepared.plan || prepared.mode !== "series") return;
            setSeriesPlan({
                ...prepared.plan,
                items: prepared.plan.items.map((item) => {
                    const result = resultForPlanItem(completed, prepared.plan!, item);
                    return result
                        ? {
                              ...item,
                              status: result.image ? "succeeded" : result.status === "failed" ? "failed" : result.status === "unknown" ? "failed" : "cancelled",
                              error: result.error,
                              finalPrompt: item.finalPrompt || result.snapshot.finalPrompt,
                          }
                        : item;
                }),
            });
        },
        [generation, setSeriesPlan, updateAgentTask],
    );

    const launchPreparedGeneration = useCallback(() => {
        if (skill.id === "comic") {
            const partialMode = skillOptions.partialMode;
            if (partialMode === "storyboard-only") {
                createPlan(false);
                message.success("分镜与角色视觉圣经已生成，未发起图片请求");
                return;
            }
            if (partialMode === "prompts-only") {
                const plan = activeSeriesPlan || createPlan(false);
                if (plan) {
                    setSeriesPlan(compilePlanPrompts(plan));
                    message.success("逐分镜最终 Prompt 已生成，未发起图片请求");
                }
                return;
            }
            if (partialMode === "regenerate") {
                const selected = generation.results.filter((result) => selectedResultIds.includes(result.id));
                const targets = selected.length ? selected : generation.results.filter((result) => result.status === "failed");
                if (!targets.length) {
                    message.info("请先选择要重生成的页面，或等待失败页面出现");
                    return;
                }
                void (async () => {
                    for (const result of targets) await resultActions.retry(result);
                })();
                return;
            }
        }
        const prepared = prepareGeneration();
        if (!prepared) return;
        const mappingNeedsConfirmation = prepared.snapshots.some((snapshot) => snapshot.reproducibilitySnapshot?.providerMapping.requiresConfirmation);
        if (!preferences.quickMode || preferences.confirmBeforeGeneration || mappingNeedsConfirmation) {
            setPendingGeneration(prepared);
            return;
        }
        void executePrepared(prepared);
    }, [
        activeSeriesPlan,
        compilePlanPrompts,
        createPlan,
        executePrepared,
        generation.results,
        message,
        preferences.confirmBeforeGeneration,
        preferences.quickMode,
        prepareGeneration,
        resultActions,
        selectedResultIds,
        setSeriesPlan,
        skill.id,
        skillOptions.partialMode,
    ]);

    const requestGeneration = useCallback(async () => {
        if (activeAppliedRecommendation) {
            launchPreparedGeneration();
            return;
        }
        const next = visibleRecommendation || (await runRecommendation());
        if (!next) return;
        if (!preferences.quickMode) {
            message.info("请先检查并应用推荐，再确认生成");
            return;
        }
        applyRecommendationValue(next);
        setQuickGenerationQueued(true);
    }, [activeAppliedRecommendation, applyRecommendationValue, launchPreparedGeneration, message, preferences.quickMode, runRecommendation, visibleRecommendation]);

    useEffect(() => {
        if (!quickGenerationQueued || !activeAppliedRecommendation) return;
        setQuickGenerationQueued(false);
        launchPreparedGeneration();
    }, [activeAppliedRecommendation, launchPreparedGeneration, quickGenerationQueued]);

    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (!imageCommand.run) return;
        if (generation.running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: "生图工作台已有任务正在运行" });
            return;
        }
        selectSkill("none");
        selectPlatformPreset("manual");
        setSeriesPlan(null);
        setManualOverride(false);
        setCustomInstructions("");
        setNegativeInstructions("");
        setAgentRun({ nonce: imageCommand.nonce, prompt: imageCommand.prompt || "", taskId: imageCommand.taskId });
    }, [clearImageCommand, generation.running, imageCommand, selectPlatformPreset, selectSkill, setSeriesPlan, updateAgentTask]);

    useEffect(() => {
        if (!agentRun) return;
        setAgentRun(null);
        const prepared = prepareGeneration(agentRun.prompt, agentRun.taskId);
        if (prepared) void executePrepared(prepared);
    }, [agentRun, executePrepared, prepareGeneration]);

    const createSession = () => {
        if (generation.running) {
            message.warning("请先取消当前生成任务");
            return;
        }
        const defaultSkill = designSkillById(preferences.defaultSkillId);
        const defaultOptions = defaultSkillOptions(defaultSkill.id);
        const applyPreferredOption = (keys: string[], preferred: string) => {
            if (!preferred || preferred === "auto") return;
            const group = defaultSkill.optionGroups.find((candidate) => keys.includes(candidate.key) && candidate.options?.some((option) => option.id === preferred));
            if (group) defaultOptions[group.key] = preferred;
        };
        applyPreferredOption(["palette"], preferences.defaultPalette);
        applyPreferredOption(["style", "rendering", "artStyle"], preferences.defaultStyle);
        const appliesDefaultSeriesCount = defaultSkill.optionGroups.some((group) => group.key === "count");
        if (appliesDefaultSeriesCount) defaultOptions.count = preferences.defaultSeriesCount;
        selectSkill(defaultSkill.id);
        replaceSkillOptions(defaultSkill.id, defaultOptions);
        updateConfig("imageAspectRatio", undefined);
        const defaultPreset = preferences.defaultPlatformId === "manual" ? undefined : platformPresetsForPlatform(preferences.defaultPlatformId, customPresets)[0];
        selectPlatformPreset(defaultPreset?.id || "manual");
        useImageDesignStore.setState({
            skillSelectionExplicit: false,
            platformSelectionExplicit: false,
            explicitSkillOptionKeys: appliesDefaultSeriesCount ? { [defaultSkill.id]: ["count"] } : {},
        });
        setPrompt("");
        setReferences([]);
        generation.setResults([]);
        setSelectedResultIds([]);
        setSelectedLogIds([]);
        setActiveLogId(undefined);
        setSeriesPlan(null);
        setPlanWarnings([]);
        setRecommendation(null);
        setAppliedRecommendation(null);
        setManualFinalPrompt("");
        setManualOverride(false);
        setCustomInstructions("");
        setNegativeInstructions("");
    };

    const restoreLog = (log: GenerationLog) => {
        if (generation.running) {
            message.warning("生成进行中，暂不能切换记录");
            return;
        }
        const hasStructuredItems = log.items.some((item) => Boolean(item.snapshot.structuredItem));
        setActiveLogId(log.id);
        setHistoryOpen(false);
        setPrompt(log.originalPrompt);
        setReferences(log.references || []);
        previousSkillRef.current = log.designSkillId;
        useImageDesignStore.setState({ explicitSkillOptionKeys: {} });
        selectSkill(log.designSkillId);
        const restoredPreset = log.platformPresetId ? platformPresetById(log.platformPresetId, customPresets) : undefined;
        selectPlatformPreset(restoredPreset?.id || "manual");
        if (log.platformPresetId && !restoredPreset) message.warning("原记录的平台预设已不存在，已恢复为手动参数");
        replaceSkillOptions(log.designSkillId, log.skillOptions || {});
        setSeriesPlan(stampDesignPlan(log.structuredPlan ? { ...log.structuredPlan, sourceDigest: sourceDigest(log.originalPrompt) } : null, log.designSkillId, log.originalPrompt, log.skillOptions));
        const reproducibility = log.items[0]?.snapshot.reproducibilitySnapshot;
        const restoredManualOverride = !hasStructuredItems && reproducibility?.manualOverride === true;
        setManualFinalPrompt(restoredManualOverride ? reproducibility.finalPrompt || log.finalPrompt : "");
        setManualOverride(restoredManualOverride);
        setCustomInstructions(reproducibility?.customInstructions || "");
        setNegativeInstructions(reproducibility?.negativeInstructions || "");
        setRecommendation(null);
        setAppliedRecommendation(log.recommendationSnapshot ? { ...log.recommendationSnapshot, applied: true } : null);
        if (reproducibility?.language) updatePreferences({ defaultLanguage: reproducibility.language });
        generation.setResults(log.items || []);
        setSelectedResultIds([]);
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        updateConfig("imageAspectRatio", log.config.imageAspectRatio);
        if (log.config.count) updateConfig("count", String(Math.min(15, Math.max(1, Number(log.config.count) || 1))));
        updateConfig("background", log.config.background || "");
        updateConfig("systemPrompt", log.config.systemPrompt || "");
        updateConfig("optimizeImageReferences", log.config.optimizeImageReferences);
    };

    const deleteSelectedLogs = async () => {
        if (generation.running) {
            message.warning("生成进行中，暂不能删除记录");
            return;
        }
        try {
            await generation.removeLogs(selectedLogIds, {
                references,
                results: generation.results,
                assets,
                projects: useCanvasStore.getState().projects,
            });
            if (activeLogId && selectedLogIds.includes(activeLogId)) {
                setActiveLogId(undefined);
                generation.setResults([]);
            }
            setSelectedLogIds([]);
            setDeleteConfirmOpen(false);
            message.success("生成记录已删除");
        } catch {
            message.error("生成记录删除失败");
        }
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") setPrompt(payload.content);
        else if (payload.kind === "image") {
            if (referenceMaxCount && references.length >= referenceMaxCount) {
                message.warning(`当前模型最多支持 ${referenceMaxCount} 张参考图`);
            } else {
                const stored = payload.storageKey ? payload : await uploadImage(payload.dataUrl);
                const mimeType = "mimeType" in stored ? stored.mimeType || "image/png" : "image/png";
                if ((referenceMaxBytes && (stored.bytes || 0) > referenceMaxBytes) || (referenceMimeTypes && !referenceMimeTypes.includes(mimeType.toLowerCase()))) {
                    message.warning("该素材不符合当前模型的参考图格式或大小限制");
                    setAssetPickerOpen(false);
                    return;
                }
                setReferences((current) => [
                    ...current,
                    {
                        id: nanoid(),
                        name: payload.title,
                        type: mimeType,
                        dataUrl: "url" in stored ? stored.url : payload.dataUrl,
                        storageKey: stored.storageKey,
                        bytes: stored.bytes,
                        width: stored.width,
                        height: stored.height,
                        source: "asset",
                    },
                ]);
            }
        } else message.warning("生图工作台只能使用文本或图片资产");
        setAssetPickerOpen(false);
    };

    const updateGenerationSettings = (patch: Partial<ImageGenerationSettingsValue>) => {
        if (patch.batchSize !== undefined) updatePreferences({ batchSize: patch.batchSize });
        if (patch.size !== undefined || patch.imageModel !== undefined) updateConfig("imageAspectRatio", undefined);
        (Object.entries(patch) as Array<[keyof ImageGenerationSettingsValue, ImageGenerationSettingsValue[keyof ImageGenerationSettingsValue]]>).forEach(([key, value]) => {
            if (key !== "batchSize") updateConfig(key, value as never);
        });
    };

    const cancelGeneration = () => {
        generation.cancel();
        if (seriesPlan) {
            setSeriesPlan({
                ...seriesPlan,
                items: seriesPlan.items.map((item) => (item.status === "queued" || item.status === "generating" ? { ...item, status: "cancelled", error: "用户取消" } : item)),
            });
        }
    };

    return (
        <div className="@container/image-page relative flex h-full min-w-0 flex-col overflow-hidden bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
            <main className="grid min-w-0 flex-1 auto-rows-max grid-cols-1 items-start gap-3 overflow-y-auto p-3 pb-24 @min-[760px]/image-page:min-h-0 @min-[760px]/image-page:auto-rows-auto @min-[760px]/image-page:grid-cols-[minmax(390px,1fr)_minmax(340px,0.9fr)] @min-[760px]/image-page:items-stretch @min-[760px]/image-page:overflow-hidden @min-[1200px]/image-page:grid-cols-[280px_minmax(500px,1.35fr)_minmax(360px,1fr)] @min-[760px]/image-page:pb-3">
                <aside className="thin-scrollbar hidden min-h-0 min-w-0 overflow-y-auto rounded-xl border border-stone-200 bg-card p-4 dark:border-stone-800 @min-[1200px]/image-page:block">
                    <ImageHistoryPanel
                        logs={generation.logs}
                        filters={historyFilters}
                        selectedLogIds={selectedLogIds}
                        activeLogId={activeLogId}
                        disabled={generation.running}
                        onFiltersChange={setHistoryFilters}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={(ids) => {
                            setSelectedLogIds(ids);
                            setDeleteConfirmOpen(true);
                        }}
                        onPreviewLog={restoreLog}
                    />
                </aside>

                <section className="thin-scrollbar min-w-0 rounded-xl border border-stone-200 bg-card p-4 dark:border-stone-800 @min-[760px]/image-page:min-h-0 @min-[760px]/image-page:overflow-y-auto">
                    <ImageWorkbenchPanel
                        prompt={prompt}
                        references={references}
                        config={effectiveConfig}
                        skill={skill}
                        preset={preset}
                        skillOptions={skillOptions}
                        compiled={compiled}
                        finalPrompt={finalPrompt}
                        manualOverride={manualOverride}
                        customInstructions={customInstructions}
                        negativeInstructions={negativeInstructions}
                        recommendation={visibleRecommendation}
                        recommending={recommending}
                        plan={activeSeriesPlan}
                        planWarnings={planWarnings}
                        results={generation.results}
                        running={generation.running}
                        elapsedMs={generation.elapsedMs}
                        referenceMaxCount={referenceMaxCount}
                        referenceMaxBytes={referenceMaxBytes}
                        referenceMimeTypes={referenceMimeTypes}
                        onPromptChange={setPrompt}
                        onReferencesChange={setReferences}
                        onConfigChange={updateGenerationSettings}
                        onFinalPromptChange={(value) => {
                            setManualFinalPrompt(value);
                            setManualOverride(true);
                        }}
                        onRestoreFinalPrompt={() => {
                            setManualOverride(false);
                            setManualFinalPrompt(compiled?.systemFinalPrompt || "");
                        }}
                        onRecompile={() => {
                            setManualOverride(false);
                            setManualFinalPrompt("");
                            if (activeSeriesPlan) setSeriesPlan(compilePlanPrompts(activeSeriesPlan, false));
                        }}
                        onReplaceOriginal={(value) => {
                            setPrompt(value);
                            setManualFinalPrompt(value);
                            setManualOverride(true);
                        }}
                        onCustomInstructionsChange={setCustomInstructions}
                        onNegativeInstructionsChange={setNegativeInstructions}
                        onRecommend={() => void runRecommendation()}
                        onApplyRecommendation={applyRecommendation}
                        onDismissRecommendation={() => setRecommendation(null)}
                        onCreatePlan={createPlan}
                        onPlanChange={setSeriesPlan}
                        onGeneratePlanItem={(item) => void resultActions.generatePlanItem(item)}
                        onRetryFailed={() => void resultActions.retryFailed()}
                        onGenerate={requestGeneration}
                        onCancel={cancelGeneration}
                        onOpenHistory={() => setHistoryOpen(true)}
                        onOpenPreferences={() => setPreferencesOpen(true)}
                        onOpenGenerationSettings={() => setGenerationSettingsOpen(true)}
                        onMissingConfig={() => openConfigDialog(false)}
                        onOpenPromptLibrary={() => setPromptDialogOpen(true)}
                        onOpenPromptOptimizer={() => setPromptOptimizerOpen(true)}
                        onOpenAssets={() => setAssetPickerOpen(true)}
                    />
                </section>

                <section className="thin-scrollbar min-w-0 rounded-xl border border-stone-200 bg-card p-4 dark:border-stone-800 @min-[760px]/image-page:min-h-0 @min-[760px]/image-page:overflow-y-auto">
                    <div className="mb-3 flex min-w-0 flex-wrap justify-end gap-2">
                        {generation.referenceOptimization?.total ? (
                            <Tag className="m-0" color={generation.referenceOptimization.optimized ? "green" : undefined}>
                                参考图优化 {generation.referenceOptimization.optimized}/{generation.referenceOptimization.total}
                                {!generation.referenceOptimization.enabled ? "（已关闭）" : ""}
                            </Tag>
                        ) : null}
                        {generation.running ? <Tag className="m-0">生成中 · {formatDuration(generation.elapsedMs)}</Tag> : null}
                    </div>
                    {generation.results.length ? (
                        <ImageResultsPanel
                            results={generation.results}
                            selectedResultIds={selectedResultIds}
                            layout={resultsLayout}
                            actionsDisabled={generation.running}
                            onSelectedResultIdsChange={setSelectedResultIds}
                            onLayoutChange={setResultsLayout}
                            onBatchDownload={async (items) => {
                                for (const [index, result] of items.entries()) await resultActions.download(result, index);
                            }}
                            onBatchSaveAsset={async (items) => {
                                let saved = 0;
                                for (const [index, result] of items.entries()) {
                                    try {
                                        await resultActions.saveAsset(result, index, true);
                                        saved += 1;
                                    } catch {
                                        // Continue saving the remaining selected results.
                                    }
                                }
                                if (saved) message.success(`已将 ${saved} 张图片加入资产`);
                            }}
                            onDownload={resultActions.download}
                            onCopyLink={(result) => {
                                if (result.image?.remoteUrl) copyText(result.image.remoteUrl, "图片链接已复制");
                            }}
                            onSaveAsset={resultActions.saveAsset}
                            onAddReference={resultActions.addReference}
                            onRetry={async (result) => {
                                await resultActions.retry(result);
                            }}
                            onSaveLocal={(result) => resultActions.saveLocal(result)}
                            onRecompile={async (result) => {
                                await resultActions.recompile(result);
                            }}
                        />
                    ) : (
                        <div className="flex min-h-80 flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 text-center dark:border-stone-700">
                            <ImagePlus className="mb-3 size-9 text-stone-400" />
                            <div className="text-sm font-medium">还没有生成图片</div>
                            <div className="mt-1 max-w-64 text-xs leading-5 text-stone-500 dark:text-stone-400">选择平台与设计 Skill，生成结果会在这里显示实际尺寸、快照和重试操作。</div>
                        </div>
                    )}
                </section>
            </main>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-card/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur @min-[760px]/image-page:hidden dark:border-stone-800">
                {generation.running ? (
                    <Button danger size="large" block icon={<Square className="size-4 fill-current" />} onClick={cancelGeneration}>
                        取消生成 · {Math.round(generation.elapsedMs / 1000)} 秒
                    </Button>
                ) : (
                    <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!compiled} onClick={requestGeneration}>
                        开始生成
                    </Button>
                )}
            </div>

            <Drawer title="生成记录" placement="bottom" size="88vh" open={historyOpen} onClose={() => setHistoryOpen(false)}>
                <ImageHistoryPanel
                    logs={generation.logs}
                    filters={historyFilters}
                    selectedLogIds={selectedLogIds}
                    activeLogId={activeLogId}
                    disabled={generation.running}
                    onFiltersChange={setHistoryFilters}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={(ids) => {
                        setSelectedLogIds(ids);
                        setDeleteConfirmOpen(true);
                    }}
                    onPreviewLog={restoreLog}
                />
            </Drawer>
            <Drawer title="模型与生成参数" placement="bottom" size="86vh" open={generationSettingsOpen} onClose={() => setGenerationSettingsOpen(false)}>
                <ImageGenerationSettings config={effectiveConfig} batchSize={preferences.batchSize} onChange={updateGenerationSettings} onMissingConfig={() => openConfigDialog(false)} />
            </Drawer>
            <ImageDesignPreferencesDrawer open={preferencesOpen} preferences={preferences} onChange={updatePreferences} onClose={() => setPreferencesOpen(false)} />
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <ImagePromptOptimizerDialog
                open={promptOptimizerOpen}
                initialPrompt={prompt}
                onClose={() => setPromptOptimizerOpen(false)}
                onApply={(value) => {
                    setPrompt(value);
                    setManualOverride(false);
                    setPromptOptimizerOpen(false);
                    message.success("已应用优化后的提示词");
                }}
            />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />

            <Modal title="确认本次生成" open={Boolean(pendingGeneration)} okText="确认并生成" cancelText="返回修改" width={720} onCancel={() => setPendingGeneration(null)} onOk={() => pendingGeneration && void executePrepared(pendingGeneration)}>
                {pendingGeneration ? (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <Tag className="m-0">Skill {pendingGeneration.snapshots[0].designSkillLabel}</Tag>
                            <Tag className="m-0">平台 {pendingGeneration.snapshots[0].platformPresetLabel || "手动参数"}</Tag>
                            <Tag className="m-0">请求 {pendingGeneration.snapshots[0].config.size}</Tag>
                            <Tag className="m-0">{pendingGeneration.snapshots.length} 张</Tag>
                        </div>
                        <Typography.Paragraph className="!mb-0 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-xs dark:bg-stone-900" ellipsis={{ rows: 12, expandable: "collapsible" }}>
                            {pendingGeneration.snapshots[0].finalPrompt}
                        </Typography.Paragraph>
                        {pendingGeneration.snapshots[0].reproducibilitySnapshot?.providerMapping.requiresConfirmation ? (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                                {pendingGeneration.snapshots[0].reproducibilitySnapshot.providerMapping.note} 系统不会静默裁剪、拉伸或改变比例。
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Modal>
            <Modal title="删除生成记录" open={deleteConfirmOpen} okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => setDeleteConfirmOpen(false)} onOk={() => void deleteSelectedLogs()}>
                确定删除选中的 {selectedLogIds.length} 条生成记录吗？被资产或当前工作台继续引用的图片会保留。
            </Modal>
        </div>
    );
}

function compileReferenceRoles(references: ReferenceImage[]): PromptReference[] {
    return references.flatMap((reference, index) =>
        reference.role
            ? [
                  {
                      id: reference.id,
                      label: imageReferenceLabel(index),
                      role: reference.role,
                      name: reference.name,
                  },
              ]
            : [],
    );
}

function requestedSizeFromSkillOptions(options: Record<string, SkillOptionValue>) {
    const selected = options.aspectRatio;
    if (selected === "custom") {
        const custom = options.customAspectRatio;
        return typeof custom === "string" ? custom.trim() || undefined : undefined;
    }
    return typeof selected === "string" && !["", "auto", "platform"].includes(selected) ? selected : undefined;
}

function usesSeriesSnapshots(skill: { id: string; workflow: string }, options: Record<string, SkillOptionValue>) {
    return ["series", "article", "storyboard"].includes(skill.workflow) || (skill.id === "infographic" && options.splitModules === true);
}

function comicPageGenerationItems(plan: StructuredPlan): StructuredPlanItem[] {
    const pages = new Map<string, StructuredPlanItem[]>();
    for (const panel of plan.items) {
        const page = panel.chapter?.trim() || "第 1 页";
        pages.set(page, [...(pages.get(page) || []), panel]);
    }
    return Array.from(pages.entries()).map(([page, panels], order) => ({
        id: `${plan.id}-page-${order + 1}`,
        order,
        kind: "page",
        title: page,
        chapter: page,
        body: panels
            .map((panel, index) =>
                [`分格 ${index + 1}｜${panel.title}`, panel.body, panel.purpose ? `叙事目的：${panel.purpose}` : "", panel.visualDescription ? `镜头指令：${panel.visualDescription}` : "", panel.finalPrompt ? `该格独立 Prompt：${panel.finalPrompt}` : ""]
                    .filter(Boolean)
                    .join("；"),
            )
            .join("\n"),
        purpose: `生成完整的${page}多格漫画页面；每个分格严格按各自独立 Prompt 绘制，并保持阅读顺序清楚`,
        visualDescription: `把 ${panels.length} 个分格组合成一张完整页面，不得把分格拆成多张输出；沿用计划视觉圣经与角色设定。`,
        requiredText: Array.from(new Set(panels.flatMap((panel) => panel.requiredText || []))),
    }));
}

function resultForPlanItem(results: GenerationResult[], plan: StructuredPlan, item: StructuredPlanItem) {
    const direct = results.find((result) => result.snapshot.structuredItem?.id === item.id);
    if (direct || plan.type !== "storyboard") return direct;
    const pages = results.filter((result) => result.snapshot.structuredItem?.kind === "page").sort((left, right) => (left.snapshot.seriesIndex || 0) - (right.snapshot.seriesIndex || 0));
    if (!pages.length) return undefined;
    const chapterMatch = item.chapter ? pages.find((result) => result.snapshot.structuredItem?.chapter === item.chapter) : undefined;
    if (chapterMatch) return chapterMatch;
    const panelIndex = plan.items.findIndex((candidate) => candidate.id === item.id);
    if (panelIndex < 0) return undefined;
    return pages[Math.min(pages.length - 1, Math.floor((panelIndex * pages.length) / Math.max(1, plan.items.length)))];
}
