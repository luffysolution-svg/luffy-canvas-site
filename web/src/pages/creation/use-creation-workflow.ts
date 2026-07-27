import { App } from "antd";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import { SOCIAL_PLATFORM_DEFAULTS, resolveSocialPlatformPreset } from "@/constant/creation";
import { reconcileCandidateSelection, stableStatusAfterTransition, transitionCreationStatus, type CreationTransitionEvent } from "@/lib/creation/creation-machine";
import { CreativeBriefSchema, CreationSchemaError, parseCreativeBriefResponse, parsePromptVersionsResponse, promptVersionSchema } from "@/lib/creation/creation-schema";
import { appendHardConstraints, buildOriginalPrompt, hardConstraintsFromBrief } from "@/lib/creation/prompt-templates";
import { analyzeCreationContent, generateCreationPromptVersions } from "@/services/api/creation-text";
import { createImageGenerationGateway } from "@/services/api/image-generation-gateway";
import { ImageGenerationError } from "@/services/api/image-errors";
import { uploadImage } from "@/services/image-storage";
import { useCanvasTransferStore } from "@/stores/canvas/use-canvas-transfer-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useCreationStore } from "@/stores/use-creation-store";
import type {
    BriefVersion,
    CreationError,
    CreationErrorStage,
    CreationGeneratedImage,
    CreationImageIssue,
    CreationProject,
    CreationPromptStyle,
    CreationRetryStatus,
    CreationStableStatus,
    CreativeBrief,
    ImageCandidate,
    PromptVersion,
    SocialPlatform,
} from "@/types/creation";
import type { ReferenceImage } from "@/types/image";

const DEFAULT_PROMPT_STYLES: CreationPromptStyle[] = ["social-media-cover", "xiaohongshu-knowledge-card", "minimalist"];
const REVIEWABLE_IMAGE_STATUSES = new Set<ImageCandidate["status"]>(["generated", "stored", "remote_only"]);

export function useCreationWorkflow(project?: CreationProject) {
    const { message } = App.useApp();
    const config = useEffectiveConfig();
    const updateProject = useCreationStore((state) => state.updateProject);
    const saveDraft = useCreationStore((state) => state.saveDraft);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [activityText, setActivityText] = useState("");
    const controllerRef = useRef<AbortController | null>(null);
    const projectId = project?.id;

    useEffect(() => {
        return () => controllerRef.current?.abort();
    }, [projectId]);

    const readProject = useCallback(() => useCreationStore.getState().projects.find((item) => item.id === projectId), [projectId]);
    const changeProject = useCallback(
        (update: Partial<CreationProject> | ((current: CreationProject) => CreationProject)) => {
            if (projectId) updateProject(projectId, update);
        },
        [projectId, updateProject],
    );

    const startController = useCallback(() => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setActivityText("");
        return controller;
    }, []);

    const setFailure = useCallback(
        (error: unknown, fallbackStage: CreationErrorStage, retryStatus: CreationRetryStatus) => {
            const failure = toCreationError(error, fallbackStage, retryStatus);
            changeProject((current) => ({ ...transitionProject(current, "FAIL"), error: failure }));
            message.error(failure.message);
        },
        [changeProject, message],
    );

    const cancelCurrentRequest = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setActivityText("");
        changeProject((current) => {
            if (!isBusyStatus(current.status)) return current;
            const status = transitionCreationStatus(current.status, "BACK");
            return {
                ...current,
                status,
                lastStableStatus: stableStatusAfterTransition(status, current.lastStableStatus),
                error: undefined,
                candidates: current.candidates.map((candidate) => (candidate.status === "queued" || candidate.status === "generating" ? { ...candidate, status: "idle" as const } : candidate)),
            };
        });
        message.info("已取消当前请求，已生成版本仍然保留");
    }, [changeProject, message]);

    const analyze = useCallback(async () => {
        const current = readProject();
        if (!current) return;
        const sourceContent = current.sourceContent.trim();
        if (!sourceContent) return void message.warning("请先输入需要分析的内容");
        if (!canStartCreationStep(current, "analyzing")) return void message.warning("当前步骤不能直接重新分析，请先回退到可编辑状态");
        if (!isAiConfigReady(config, config.textModel)) {
            openConfigDialog(false, "channels");
            return void message.warning("请先配置可用的文本模型");
        }
        const preset = presetFor(current);
        const platform = preset.platform;
        const controller = startController();
        changeProject((value) => ({ ...startStep(value, "analyzing"), error: undefined }));
        try {
            const response = await analyzeCreationContent({
                config,
                sourceContent,
                platform,
                width: preset.width,
                height: preset.height,
                aspectRatio: preset.aspectRatio,
                scene: current.scene,
                additionalRequirements: current.additionalRequirements,
                signal: controller.signal,
                onDelta: setActivityText,
            });
            const brief = parseCreativeBriefResponse(response, {
                id: nanoid(),
                platform,
                width: preset.width,
                height: preset.height,
                aspectRatio: preset.aspectRatio,
                sourceContent,
            });
            const version: BriefVersion = { id: nanoid(), brief, source: "model", createdAt: new Date().toISOString() };
            changeProject((value) => {
                if (value.status !== "analyzing") return value;
                return {
                    ...transitionProject(value, "NEXT"),
                    name: value.name === "未命名创作" ? brief.title : value.name,
                    briefVersions: [...value.briefVersions, version],
                    selectedBriefVersionId: version.id,
                    error: undefined,
                };
            });
            message.success("创作方案已生成，请人工审核后再继续");
        } catch (error) {
            if (controller.signal.aborted) return;
            setFailure(error, error instanceof CreationSchemaError ? "parse" : "text_model", "analyzing");
        } finally {
            if (controllerRef.current === controller) controllerRef.current = null;
            setActivityText("");
        }
    }, [changeProject, config, isAiConfigReady, message, openConfigDialog, readProject, setFailure, startController]);

    const selectBrief = useCallback(
        (id: string) =>
            changeProject((current) => ({
                ...rewindTo(current, "brief_ready"),
                selectedBriefVersionId: id,
                error: undefined,
            })),
        [changeProject],
    );

    const approveBrief = useCallback(
        (draft: CreativeBrief) => {
            const current = readProject();
            if (!current) return;
            let brief: CreativeBrief;
            try {
                brief = CreativeBriefSchema.parse(draft);
            } catch (error) {
                return void message.error(error instanceof Error ? error.message : "创作方案校验失败");
            }
            if (brief.sourceContent !== current.sourceContent.trim()) return void message.warning("原始内容已变化，请先重新分析");
            changeProject((value) => {
                const selected = value.briefVersions.find((version) => version.id === value.selectedBriefVersionId);
                if (!selected) return value;
                const now = new Date().toISOString();
                const changed = JSON.stringify(selected.brief) !== JSON.stringify(brief);
                const approvedVersion: BriefVersion = changed ? { id: nanoid(), brief: { ...brief, id: nanoid() }, source: "manual", parentId: selected.id, createdAt: now, approvedAt: now } : { ...selected, approvedAt: now };
                const versions = changed ? [...value.briefVersions, approvedVersion] : value.briefVersions.map((version) => (version.id === selected.id ? approvedVersion : version));
                const ready = rewindTo(value, "brief_ready");
                return {
                    ...transitionProject(ready, "NEXT"),
                    briefVersions: versions,
                    selectedBriefVersionId: approvedVersion.id,
                    reviews: [...value.reviews, { id: nanoid(), gate: "brief", action: "approved", targetId: approvedVersion.id, createdAt: now }],
                    error: undefined,
                };
            });
            message.success("创作方案已批准，下一步生成提示词版本");
        },
        [changeProject, message, readProject],
    );

    const generatePrompts = useCallback(
        async (requestedStyles: CreationPromptStyle[] = DEFAULT_PROMPT_STYLES) => {
            const current = readProject();
            if (!current) return;
            const briefVersion = current.briefVersions.find((version) => version.id === current.selectedBriefVersionId);
            if (!briefVersion?.approvedAt) return void message.warning("请先批准创作方案");
            if (!canGeneratePromptVersions(current, briefVersion)) return void message.warning("当前方案需要重新审核后才能生成提示词");
            if (!isAiConfigReady(config, config.textModel)) {
                openConfigDialog(false, "channels");
                return void message.warning("请先配置可用的文本模型");
            }
            const styles = uniqueStyles(requestedStyles).slice(0, 3);
            if (styles.length !== 3) return void message.warning("请选择 3 种提示词优化风格");
            const controller = startController();
            const constraints = hardConstraintsFromBrief(briefVersion.brief);
            const originalContent = buildOriginalPrompt(briefVersion.brief);
            const feedback = feedbackText(current);
            changeProject((value) => ({ ...startStep(value, "generating_prompts"), error: undefined }));
            try {
                const response = await generateCreationPromptVersions({
                    config,
                    brief: briefVersion.brief,
                    originalPrompt: originalContent,
                    versionCount: 3,
                    styles,
                    hardConstraints: constraints,
                    feedback,
                    signal: controller.signal,
                    onDelta: setActivityText,
                });
                const optimized = parsePromptVersionsResponse(response, { sourceBriefVersionId: briefVersion.id, hardConstraints: constraints });
                if (optimized.length !== 3 || new Set(optimized.map((version) => version.style)).size !== 3 || optimized.some((version) => !styles.includes(version.style))) {
                    throw new CreationSchemaError("文本模型没有按要求返回 3 个不同风格的提示词版本");
                }
                changeProject((value) => {
                    if (value.status !== "generating_prompts") return value;
                    const originalExists = value.promptVersions.some((version) => version.kind === "original" && version.sourceBriefVersionId === briefVersion.id);
                    const original: PromptVersion = {
                        id: nanoid(),
                        label: "原始提示词",
                        content: originalContent,
                        rawContent: originalContent,
                        reasoning: "根据已批准方案直接组合，未经过风格优化。",
                        style: "general-natural-language",
                        kind: "original",
                        sourceBriefVersionId: briefVersion.id,
                        hardConstraints: constraints,
                        createdAt: new Date().toISOString(),
                    };
                    const promptVersions = [...value.promptVersions, ...(originalExists ? [] : [original]), ...optimized];
                    return {
                        ...transitionProject(value, "NEXT"),
                        promptVersions,
                        selectedPromptVersionId: optimized[0].id,
                        candidates: configureCandidates(value.candidates, optimized, config.imageModel, presetFor(value).aspectRatio, config.quality, config.background),
                        error: undefined,
                    };
                });
                message.success("已生成 3 个提示词版本，请确认后再启动生图");
            } catch (error) {
                if (controller.signal.aborted) return;
                setFailure(error, error instanceof CreationSchemaError ? "parse" : "text_model", "generating_prompts");
            } finally {
                if (controllerRef.current === controller) controllerRef.current = null;
                setActivityText("");
            }
        },
        [changeProject, config, isAiConfigReady, message, openConfigDialog, readProject, setFailure, startController],
    );

    const selectPrompt = useCallback((id: string) => changeProject({ selectedPromptVersionId: id }), [changeProject]);

    const savePrompt = useCallback(
        (content: string) => {
            const current = readProject();
            const selected = current?.promptVersions.find((version) => version.id === current.selectedPromptVersionId);
            if (!current || !selected || !content.trim()) return;
            const version = manualPromptVersion(selected, content, "manual");
            changeProject((value) => ({
                ...rewindTo(value, "prompts_ready"),
                promptVersions: [...value.promptVersions, version],
                selectedPromptVersionId: version.id,
                error: undefined,
            }));
            message.success("已保存为新的提示词版本");
        },
        [changeProject, message, readProject],
    );

    const restorePrompt = useCallback(
        (id: string) => {
            const current = readProject();
            const source = current?.promptVersions.find((version) => version.id === id);
            if (!current || !source) return;
            const version = manualPromptVersion(source, source.content, "restored");
            changeProject((value) => ({
                ...rewindTo(value, "prompts_ready"),
                promptVersions: [...value.promptVersions, version],
                selectedPromptVersionId: version.id,
                error: undefined,
            }));
            message.success("旧版本已恢复为一个新版本，原历史未被覆盖");
        },
        [changeProject, message, readProject],
    );

    const approvePrompt = useCallback(
        (content: string) => {
            const current = readProject();
            const selected = current?.promptVersions.find((version) => version.id === current.selectedPromptVersionId);
            if (!current || !selected) return;
            const changed = content.trim() && content.trim() !== selected.content.trim();
            const approved = changed ? manualPromptVersion(selected, content, "manual") : selected;
            changeProject((value) => {
                const ready = rewindTo(value, "prompts_ready");
                const promptVersions = changed ? [...value.promptVersions, approved] : value.promptVersions;
                return {
                    ...transitionProject(ready, "NEXT"),
                    promptVersions,
                    selectedPromptVersionId: approved.id,
                    candidates: configureCandidates(
                        value.candidates,
                        [approved, ...value.promptVersions.filter((version) => version.kind === "optimized" && version.id !== approved.id)],
                        config.imageModel,
                        presetFor(value).aspectRatio,
                        config.quality,
                        config.background,
                    ),
                    reviews: [...value.reviews, { id: nanoid(), gate: "prompt", action: "approved", targetId: approved.id, createdAt: new Date().toISOString() }],
                    error: undefined,
                };
            });
            message.success("提示词已批准。生图仍需你在候选区再次点击确认");
        },
        [changeProject, config.background, config.imageModel, config.quality, message, readProject],
    );

    const setCandidateCount = useCallback(
        (count: number) => {
            changeProject((current) => (current.promptVersions.length ? reconcileCandidateSelection(current, resizeCandidates(current, Math.max(2, Math.min(4, count)), config.imageModel, config.quality, config.background)) : current));
        },
        [changeProject, config.background, config.imageModel, config.quality],
    );

    const updateCandidateConfig = useCallback(
        (id: string, patch: Partial<Pick<ImageCandidate, "promptVersionId" | "modelConfigId" | "size" | "quality" | "background">>) =>
            changeProject((current) =>
                reconcileCandidateSelection(
                    current,
                    current.candidates.map((candidate) => (candidate.id === id ? { ...candidate, ...patch, status: "idle", imageId: undefined, image: undefined, error: undefined } : candidate)),
                ),
            ),
        [changeProject],
    );

    const removeCandidate = useCallback(
        (id: string) =>
            changeProject((current) =>
                current.candidates.length <= 2
                    ? current
                    : reconcileCandidateSelection(
                          current,
                          current.candidates.filter((candidate) => candidate.id !== id).map((candidate, index) => ({ ...candidate, index })),
                      ),
            ),
        [changeProject],
    );

    const generateCandidates = useCallback(
        async (candidateIds?: string[]) => {
            const current = readProject();
            if (!current) return;
            if (current.status !== "prompt_approved" && current.status !== "awaiting_image_review" && current.status !== "image_approved") return void message.warning("请先批准提示词，再确认启动生图");
            const targets = current.candidates.filter((candidate) => !candidateIds || candidateIds.includes(candidate.id));
            if (!targets.length) return;
            for (const candidate of targets) {
                if (!isAiConfigReady(config, candidate.modelConfigId)) {
                    openConfigDialog(false, "channels");
                    return void message.warning("候选中存在未配置的生图模型");
                }
                if (!current.promptVersions.some((version) => version.id === candidate.promptVersionId)) return void message.error("候选引用的提示词版本不存在");
            }
            const controller = startController();
            changeProject((value) => ({
                ...startStep(value, "generating_images"),
                selectedImageId: undefined,
                error: undefined,
                candidates: value.candidates.map((candidate) => (targets.some((target) => target.id === candidate.id) ? { ...candidate, status: "generating" as const, error: undefined } : candidate)),
            }));
            try {
                const gateway = createImageGenerationGateway(config);
                const requests = targets.map((candidate) => {
                    const prompt = current.promptVersions.find((version) => version.id === candidate.promptVersionId)!;
                    const referenceImage = referenceForCandidate(current, candidate);
                    return {
                        candidateId: candidate.id,
                        prompt: prompt.content,
                        promptVersionId: prompt.id,
                        modelConfigId: candidate.modelConfigId,
                        size: candidate.size,
                        aspectRatio: presetFor(current).aspectRatio,
                        width: presetFor(current).width,
                        height: presetFor(current).height,
                        quality: candidate.quality,
                        background: candidate.background,
                        referenceImage,
                    };
                });
                const results = await gateway.generateImageCandidates(requests, { signal: controller.signal });
                if (controller.signal.aborted) return;
                changeProject((value) => {
                    if (value.status !== "generating_images") return value;
                    const generatedImages = [...value.generatedImages];
                    const candidates = value.candidates.map((candidate) => {
                        const result = results.find((item) => item.candidateId === candidate.id);
                        if (!result) return candidate;
                        if (result.status === "rejected") {
                            const error = toCreationError(result.reason, "image_model", "generating_images", candidate.id);
                            return { ...candidate, status: result.reason.resultUnknown ? ("unknown" as const) : ("failed" as const), error };
                        }
                        const image = result.value.image;
                        if (!generatedImages.some((item) => item.id === image.id)) generatedImages.push(image);
                        return { ...candidate, imageId: image.id, image, status: image.storageKey ? ("stored" as const) : image.remoteUrl ? ("remote_only" as const) : ("generated" as const), error: undefined };
                    });
                    return { ...transitionProject(value, "NEXT"), candidates, generatedImages, error: undefined };
                });
                message.success("候选生成完成，请逐张审核后采用一张");
            } catch (error) {
                if (controller.signal.aborted) return;
                setFailure(error, "image_model", "generating_images");
            } finally {
                if (controllerRef.current === controller) controllerRef.current = null;
                setActivityText("");
            }
        },
        [changeProject, config, isAiConfigReady, message, openConfigDialog, readProject, setFailure, startController],
    );

    const approveCandidate = useCallback(
        (id: string) => {
            const current = readProject();
            const candidate = current?.candidates.find((item) => item.id === id);
            if (!current || !candidate || !canApproveCreationCandidate(current, candidate)) return void message.warning("请在候选审核步骤采用有效图片");
            changeProject((value) => {
                const latest = value.candidates.find((item) => item.id === id);
                if (!latest || !canApproveCreationCandidate(value, latest)) return value;
                const statusProject = value.status === "awaiting_image_review" ? transitionProject(value, "NEXT") : value;
                return {
                    ...statusProject,
                    selectedImageId: latest.image!.id,
                    reviews: [...value.reviews, { id: nanoid(), gate: "image", action: "approved", targetId: latest.image!.id, createdAt: new Date().toISOString() }],
                    error: undefined,
                };
            });
            message.success("候选图已采用，插入画布前仍需你主动确认");
        },
        [changeProject, message, readProject],
    );

    const useAsReference = useCallback(
        (id: string) => {
            const candidate = readProject()?.candidates.find((item) => item.id === id);
            if (!candidate?.image) return;
            changeProject({ referenceImageId: candidate.image.id });
            message.success("后续候选将以此图作为参考图继续生成");
        },
        [changeProject, message, readProject],
    );

    const markIssue = useCallback(
        (id: string, issue: CreationImageIssue, note: string) => {
            changeProject((current) => ({
                ...current,
                candidates: current.candidates.map((candidate) => (candidate.id === id ? { ...candidate, feedback: [...candidate.feedback, { id: nanoid(), issue, note: note.trim() || undefined, createdAt: new Date().toISOString() }] } : candidate)),
                reviews: [
                    ...current.reviews,
                    { id: nanoid(), gate: "image", action: "issue_reported", targetId: current.candidates.find((candidate) => candidate.id === id)?.imageId || id, comment: note.trim() || issue, createdAt: new Date().toISOString() },
                ],
            }));
            message.success("问题已记录，将回填到下一轮提示词优化");
        },
        [changeProject, message],
    );

    const editCandidatePrompt = useCallback(
        (id: string) => {
            const candidate = readProject()?.candidates.find((item) => item.id === id);
            if (!candidate) return;
            changeProject((current) => ({ ...rewindTo(current, "prompts_ready"), selectedPromptVersionId: candidate.promptVersionId }));
        },
        [changeProject, readProject],
    );

    const saveCandidateAsset = useCallback(
        async (id: string, asTemplate: boolean) => {
            const current = readProject();
            const candidate = current?.candidates.find((item) => item.id === id);
            if (!current || !candidate?.image) return;
            const image = await ensureStoredImage(candidate.image);
            if (!image.storageKey || !image.url) return void message.error(image.persistenceError || "图片尚未保存到本地，无法加入资产");
            if (image !== candidate.image) archiveCandidateImage(changeProject, candidate.id, image);
            const prompt = current.promptVersions.find((version) => version.id === candidate.promptVersionId);
            addAsset({
                kind: "image",
                title: `${current.name}${asTemplate ? " · 模板" : ""}`,
                coverUrl: image.url,
                tags: ["AI 创作审核台", platformFromPreset(current.platformPresetId), ...(asTemplate ? ["模板"] : [])],
                source: asTemplate ? "creation-template" : "creation",
                note: prompt?.content || "",
                metadata: { creationProjectId: current.id, candidateId: candidate.id, imageId: image.id, promptVersionId: candidate.promptVersionId, modelConfigId: candidate.modelConfigId, template: asTemplate },
                data: { dataUrl: image.url, storageKey: image.storageKey, width: image.width || 1, height: image.height || 1, bytes: image.bytes || 0, mimeType: image.mimeType },
            });
            message.success(asTemplate ? "已保存为模板资产" : "已保存到我的资产");
        },
        [addAsset, changeProject, message, readProject],
    );

    const queueCanvasInsert = useCallback(
        (candidateId: string, canvasProjectId: string) => {
            const current = readProject();
            const candidate = current?.candidates.find((item) => item.id === candidateId);
            const image = candidate?.image;
            if (!current || !candidate || !image || !canQueueCreationCanvasInsert(current, candidate)) {
                message.warning("请先采用这张候选图");
                return null;
            }
            if (!image.storageKey) {
                message.error("图片尚未保存到本地，暂时不能插入画布");
                return null;
            }
            const prompt = current.promptVersions.find((version) => version.id === candidate.promptVersionId);
            const preset = presetFor(current);
            return useCanvasTransferStore.getState().queueInsert({
                projectId: canvasProjectId,
                creationProjectId: current.id,
                title: current.name,
                storageKey: image.storageKey,
                width: image.width,
                height: image.height,
                bytes: image.bytes,
                mimeType: image.mimeType,
                prompt: prompt?.content,
                remoteUrl: image.remoteUrl,
                creationSource: {
                    creationProjectId: current.id,
                    generatedImageId: image.id,
                    candidateId: candidate.id,
                    promptVersionId: prompt?.id,
                    providerId: image.providerId,
                    modelId: image.modelId,
                    modelConfigId: image.modelConfigId,
                    createdAt: image.createdAt,
                    reviewStatus: "approved",
                    mode: current.mode,
                    platformPresetId: current.platformPresetId,
                    targetWidth: preset.width,
                    targetHeight: preset.height,
                    aspectRatio: preset.aspectRatio,
                    size: candidate.size,
                    quality: candidate.quality,
                    background: candidate.background,
                    conceptDraft: false,
                },
            });
        },
        [message, readProject],
    );

    const prepareCanvasInsert = useCallback(
        async (candidateId: string) => {
            const current = readProject();
            const candidate = current?.candidates.find((item) => item.id === candidateId);
            if (!current || !candidate || !canQueueCreationCanvasInsert(current, candidate) || !candidate.image) {
                message.warning("请先在候选审核步骤采用这张图片");
                return false;
            }
            const image = await ensureStoredImage(candidate.image);
            if (!image.storageKey) {
                message.error(image.persistenceError || "图片尚未保存到本地，暂时不能插入画布");
                return false;
            }
            if (image !== candidate.image) archiveCandidateImage(changeProject, candidate.id, image);
            return true;
        },
        [changeProject, message, readProject],
    );

    const back = useCallback(() => {
        const current = readProject();
        if (!current) return;
        if (isBusyStatus(current.status)) return cancelCurrentRequest();
        if (current.status === "draft") return void message.info("当前已是内容输入步骤");
        changeProject((value) => {
            if (value.status === "failed") return { ...value, status: value.lastStableStatus, error: undefined };
            const next = transitionProject(value, "BACK");
            return next.status === "image_approved" || next.status === "inserted_to_canvas" ? next : { ...next, selectedImageId: undefined };
        });
    }, [cancelCurrentRequest, changeProject, message, readProject]);

    const cancelTask = useCallback(() => {
        const current = readProject();
        if (!current || current.status === "inserted_to_canvas") return;
        controllerRef.current?.abort();
        changeProject((value) => ({ ...transitionProject(value, "CANCEL"), selectedImageId: undefined, error: undefined }));
    }, [changeProject, readProject]);

    return {
        activityText,
        busy: Boolean(project && isBusyStatus(project.status)),
        analyze,
        selectBrief,
        approveBrief,
        generatePrompts,
        iteratePrompts: generatePrompts,
        selectPrompt,
        savePrompt,
        restorePrompt,
        approvePrompt,
        setCandidateCount,
        updateCandidateConfig,
        removeCandidate,
        generateCandidates,
        approveCandidate,
        useAsReference,
        markIssue,
        editCandidatePrompt,
        saveCandidateAsset,
        prepareCanvasInsert,
        queueCanvasInsert,
        cancelCurrentRequest,
        cancelTask,
        back,
        saveDraft: () => projectId && saveDraft(projectId),
    };
}

function transitionProject(project: CreationProject, event: CreationTransitionEvent): CreationProject {
    const status = transitionCreationStatus(project.status, event);
    return { ...project, status, lastStableStatus: stableStatusAfterTransition(status, project.lastStableStatus) };
}

function startStep(project: CreationProject, target: CreationRetryStatus) {
    const direct: Partial<Record<CreationRetryStatus, string>> = { analyzing: "draft", generating_prompts: "brief_approved", generating_images: "prompt_approved" };
    return transitionProject(project, project.status === direct[target] ? "NEXT" : { type: "RETRY", target });
}

function rewindTo(project: CreationProject, target: CreationStableStatus) {
    let current = project.status === "failed" ? { ...project, status: project.lastStableStatus } : project;
    if (current.status === "draft" && target === "brief_ready" && current.briefVersions.length) return { ...current, status: target, lastStableStatus: target };
    if ((current.status === "draft" || current.status === "brief_ready" || current.status === "brief_approved") && target === "prompts_ready" && current.promptVersions.length) return { ...current, status: target, lastStableStatus: target };
    for (let index = 0; current.status !== target && index < 12; index += 1) current = transitionProject(current, "BACK");
    return current;
}

function isBusyStatus(status: CreationProject["status"]) {
    return status === "analyzing" || status === "generating_prompts" || status === "generating_images";
}

function canStartCreationStep(project: CreationProject, target: CreationRetryStatus) {
    if (project.status === "failed") return project.error?.retryStatus === target;
    if (target === "analyzing") return project.status === "draft" || project.status === "brief_ready";
    if (target === "generating_prompts") return project.status === "brief_approved" || project.status === "prompts_ready" || project.status === "prompt_approved" || project.status === "awaiting_image_review" || project.status === "image_approved";
    return project.status === "prompt_approved" || project.status === "awaiting_image_review" || project.status === "image_approved";
}

function canGeneratePromptVersions(project: CreationProject, briefVersion: BriefVersion) {
    return Boolean(briefVersion.approvedAt && project.selectedBriefVersionId === briefVersion.id && briefVersion.brief.sourceContent === project.sourceContent.trim() && canStartCreationStep(project, "generating_prompts"));
}

export function canApproveCreationCandidate(project: CreationProject, candidate: ImageCandidate) {
    return (project.status === "awaiting_image_review" || project.status === "image_approved") && REVIEWABLE_IMAGE_STATUSES.has(candidate.status) && Boolean(candidate.image && candidate.imageId === candidate.image.id);
}

export function canQueueCreationCanvasInsert(project: CreationProject, candidate: ImageCandidate) {
    return project.status === "image_approved" && canApproveCreationCandidate(project, candidate) && project.selectedImageId === candidate.image?.id;
}

function platformFromPreset(value: string): SocialPlatform {
    return (resolveSocialPlatformPreset(value) || SOCIAL_PLATFORM_DEFAULTS.xiaohongshu).platform;
}

function presetFor(project: CreationProject) {
    return resolveSocialPlatformPreset(project.platformPresetId) || SOCIAL_PLATFORM_DEFAULTS.xiaohongshu;
}

function uniqueStyles(styles: CreationPromptStyle[]) {
    return Array.from(new Set(styles));
}

function manualPromptVersion(source: PromptVersion, content: string, kind: "manual" | "restored") {
    return promptVersionSchema.parse({
        ...source,
        id: nanoid(),
        label: `${source.label} · ${kind === "restored" ? "恢复" : "手动"}`,
        rawContent: content.trim(),
        content: appendHardConstraints(content, source.hardConstraints),
        reasoning: kind === "restored" ? "从历史版本恢复，原版本继续保留。" : "用户人工编辑并保存。",
        kind,
        parentId: source.id,
        createdAt: new Date().toISOString(),
    });
}

function configureCandidates(existing: ImageCandidate[], prompts: PromptVersion[], modelConfigId: string, size: string, quality: string, background: string) {
    const count = Math.max(2, Math.min(4, existing.length || 3));
    return Array.from({ length: count }, (_, index): ImageCandidate => {
        const current = existing[index];
        const promptVersionId = prompts[index % prompts.length]?.id || prompts[0]?.id || current?.promptVersionId || "";
        return {
            id: current?.id || nanoid(),
            index,
            promptVersionId,
            modelConfigId: current?.modelConfigId || modelConfigId,
            size: current?.size || size,
            quality: current?.quality || quality,
            background: current?.background ?? background,
            status: "idle",
            feedback: current?.feedback || [],
            referenceImageId: current?.referenceImageId,
        };
    });
}

function resizeCandidates(project: CreationProject, count: number, modelConfigId: string, quality: string, background: string) {
    const promptVersions = project.promptVersions.filter((version) => version.kind !== "original");
    const configured = configureCandidates(project.candidates, promptVersions, modelConfigId, presetFor(project).aspectRatio, quality, background);
    if (count <= configured.length) return configured.slice(0, count).map((candidate, index) => ({ ...candidate, index }));
    const next = [...configured];
    while (next.length < count) {
        const index = next.length;
        next.push({
            id: nanoid(),
            index,
            promptVersionId: promptVersions[index % Math.max(1, promptVersions.length)]?.id || project.selectedPromptVersionId || "",
            modelConfigId,
            size: presetFor(project).aspectRatio,
            quality,
            background,
            status: "idle",
            feedback: [],
        });
    }
    return next;
}

function feedbackText(project: CreationProject) {
    return project.candidates.flatMap((candidate) => candidate.feedback.map((feedback) => `${feedback.issue}${feedback.note ? `：${feedback.note}` : ""}`));
}

function referenceForCandidate(project: CreationProject, candidate: ImageCandidate): ReferenceImage | undefined {
    const id = candidate.referenceImageId || project.referenceImageId;
    const image = project.generatedImages.find((item) => item.id === id);
    if (!image) return undefined;
    return {
        id: image.id,
        name: `${image.id}.png`,
        type: image.mimeType,
        dataUrl: image.dataUrl || image.url || image.remoteUrl || "",
        url: image.remoteUrl || image.url,
        storageKey: image.storageKey,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
    };
}

function toCreationError(error: unknown, fallbackStage: CreationErrorStage, retryStatus: CreationRetryStatus, candidateId?: string): CreationError {
    let stage = fallbackStage;
    if (error instanceof CreationSchemaError || error instanceof SyntaxError) stage = "parse";
    if (error instanceof ImageGenerationError && ["cors", "dns", "tls", "network", "gateway"].includes(error.kind)) stage = "network";
    const message = error instanceof Error ? error.message : String(error || "未知错误");
    if (stage !== "parse" && /network|cors|跨域|dns|tls|连接|fetch/i.test(message)) stage = "network";
    if (/indexeddb|本地存储|存储空间|保存到本地/i.test(message)) stage = "storage";
    return { id: nanoid(), stage, message, retryStatus, candidateId, details: error instanceof ImageGenerationError ? `${error.kind} / ${error.failureStage}` : undefined, createdAt: new Date().toISOString() };
}

async function ensureStoredImage(image: CreationGeneratedImage) {
    if (image.storageKey && image.url) return image;
    const source = image.dataUrl || image.remoteUrl || image.url;
    if (!source) return { ...image, persistenceError: "没有可保存的图片内容" };
    try {
        const stored = await uploadImage(source);
        return { ...image, url: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType, persistenceError: undefined };
    } catch (error) {
        return { ...image, persistenceError: error instanceof Error ? error.message : "图片未能保存到本地" };
    }
}

function archiveCandidateImage(update: (value: Partial<CreationProject> | ((current: CreationProject) => CreationProject)) => void, candidateId: string, image: CreationGeneratedImage) {
    update((current) => ({
        ...current,
        generatedImages: current.generatedImages.map((item) => (item.id === image.id ? image : item)),
        candidates: current.candidates.map((candidate) => (candidate.id === candidateId ? { ...candidate, image, imageId: image.id, status: "stored" } : candidate)),
    }));
}
