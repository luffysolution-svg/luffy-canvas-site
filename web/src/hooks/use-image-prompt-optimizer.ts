import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";

import { IMAGE_PROMPT_OPTIMIZATION_MODES, optimizeImagePrompt, type ImagePromptOptimizationMode } from "@/services/api/prompt-optimizer";
import { modelMatchesCapability, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { usePromptOptimizerStore, type PromptOptimizationVersion } from "@/stores/use-prompt-optimizer-store";

export type PromptOptimizerStatus = "idle" | "running" | "success" | "error" | "cancelled";

export function useImagePromptOptimizer() {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const versions = usePromptOptimizerStore((state) => state.versions);
    const historyHydrated = usePromptOptimizerStore((state) => state.hydrated);
    const addVersion = usePromptOptimizerStore((state) => state.addVersion);
    const removeVersion = usePromptOptimizerStore((state) => state.removeVersion);
    const clearVersions = usePromptOptimizerStore((state) => state.clearHistory);

    const [originalPrompt, setOriginalPrompt] = useState("");
    const [optimizedPrompt, setOptimizedPrompt] = useState("");
    const [mode, setMode] = useState<ImagePromptOptimizationMode>("general");
    const [requirements, setRequirements] = useState("");
    const [feedback, setFeedback] = useState("");
    const [selectedVersionId, setSelectedVersionId] = useState<string>();
    const [status, setStatus] = useState<PromptOptimizerStatus>("idle");
    const [error, setError] = useState("");
    const abortControllerRef = useRef<AbortController | null>(null);

    const textModels = useMemo(() => selectableModelsByCapability(effectiveConfig, "text"), [effectiveConfig]);
    const configuredTextModel = effectiveConfig.textModel.trim();
    const textModel = textModels.includes(configuredTextModel) && modelMatchesCapability(effectiveConfig, configuredTextModel, "text") ? configuredTextModel : "";
    const running = status === "running";
    const selectedMode = IMAGE_PROMPT_OPTIMIZATION_MODES.find((item) => item.value === mode) || IMAGE_PROMPT_OPTIMIZATION_MODES[0];

    useEffect(() => () => abortControllerRef.current?.abort(), []);

    const cancelOptimization = useCallback(
        (notify = true) => {
            const controller = abortControllerRef.current;
            if (!controller) return;
            controller.abort();
            abortControllerRef.current = null;
            setStatus("cancelled");
            setError("");
            if (notify) message.info("已取消本次提示词优化");
        },
        [message],
    );

    const reset = useCallback((prompt = "") => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setOriginalPrompt(prompt);
        setOptimizedPrompt("");
        setMode("general");
        setRequirements("");
        setFeedback("");
        setSelectedVersionId(undefined);
        setStatus("idle");
        setError("");
    }, []);

    const runOptimization = useCallback(
        async (iterate: boolean) => {
            const sourcePrompt = originalPrompt.trim();
            const currentResult = optimizedPrompt.trim();
            const currentFeedback = feedback.trim();
            if (!sourcePrompt) {
                message.warning("请输入需要优化的提示词");
                return;
            }
            if (iterate && !currentResult) {
                message.warning("请先生成一个优化版本");
                return;
            }
            if (iterate && !currentFeedback) {
                message.warning("请填写本轮改进要求");
                return;
            }
            if (!historyHydrated) await Promise.resolve(usePromptOptimizerStore.persist.rehydrate()).catch(() => undefined);
            if (!textModel || !isAiConfigReady(effectiveConfig, textModel)) {
                message.warning("请先配置可用的文本模型");
                openConfigDialog(true, "channels");
                return;
            }

            abortControllerRef.current?.abort();
            const controller = new AbortController();
            abortControllerRef.current = controller;
            setStatus("running");
            setError("");
            if (!iterate) setOptimizedPrompt("");

            try {
                const result = await optimizeImagePrompt({
                    config: effectiveConfig,
                    prompt: sourcePrompt,
                    mode,
                    requirements,
                    previousPrompt: iterate ? currentResult : undefined,
                    feedback: iterate ? currentFeedback : undefined,
                    signal: controller.signal,
                    onDelta: (text) => {
                        if (!controller.signal.aborted && abortControllerRef.current === controller) setOptimizedPrompt(text);
                    },
                });
                if (controller.signal.aborted || abortControllerRef.current !== controller) return;

                const version: PromptOptimizationVersion = {
                    id: nanoid(),
                    sourcePrompt,
                    optimizedPrompt: result,
                    mode,
                    requirements: requirements.trim(),
                    createdAt: Date.now(),
                };
                setOptimizedPrompt(result);
                setFeedback("");
                addVersion(version);
                setSelectedVersionId(version.id);
                setStatus("success");
                message.success(iterate ? "已生成新的优化版本" : "提示词优化完成");
            } catch (requestError) {
                if (controller.signal.aborted || abortControllerRef.current !== controller) return;
                const requestMessage = requestError instanceof Error ? requestError.message : "提示词优化失败";
                setStatus("error");
                setError(requestMessage);
                message.error(requestMessage);
            } finally {
                if (abortControllerRef.current === controller) abortControllerRef.current = null;
            }
        },
        [addVersion, effectiveConfig, feedback, historyHydrated, isAiConfigReady, message, mode, openConfigDialog, optimizedPrompt, originalPrompt, requirements, textModel],
    );

    const selectVersion = useCallback((version: PromptOptimizationVersion) => {
        setSelectedVersionId(version.id);
        setOriginalPrompt(version.sourcePrompt);
        setOptimizedPrompt(version.optimizedPrompt);
        setMode(version.mode);
        setRequirements(version.requirements || "");
        setFeedback("");
        setStatus("success");
        setError("");
    }, []);

    const deleteVersion = useCallback(
        (id: string) => {
            removeVersion(id);
            setSelectedVersionId((current) => (current === id ? undefined : current));
        },
        [removeVersion],
    );

    const clearHistory = useCallback(() => {
        clearVersions();
        setSelectedVersionId(undefined);
        message.success("优化历史已清空");
    }, [clearVersions, message]);

    const selectTextModel = useCallback((value: string) => updateConfig("textModel", value), [updateConfig]);
    const openModelConfig = useCallback(() => openConfigDialog(false, "channels"), [openConfigDialog]);

    return {
        config: effectiveConfig,
        textModel,
        textModels,
        selectTextModel,
        openModelConfig,
        originalPrompt,
        setOriginalPrompt,
        optimizedPrompt,
        setOptimizedPrompt,
        mode,
        setMode,
        selectedMode,
        requirements,
        setRequirements,
        feedback,
        setFeedback,
        versions,
        historyHydrated,
        selectedVersionId,
        status,
        running,
        error,
        runOptimization,
        cancelOptimization,
        reset,
        selectVersion,
        deleteVersion,
        clearHistory,
    };
}
