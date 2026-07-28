import { App } from "antd";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

import { buildGenerationLog, replaceGenerationLogResult } from "@/features/image-design/generation/build-generation-log";
import { persistGenerationOutput } from "@/features/image-design/generation/persist-generation-output";
import { executeImageDesignSeries } from "@/features/image-design/generation/series-executor";
import type { GenerationLog, GenerationResult, ImageDesignRequestSnapshot } from "@/features/image-design/generation/types";
import { deleteGenerationLogs, getGenerationLog, readGenerationLogs, saveGenerationLog } from "@/features/image-design/persistence/generation-logs";
import type { ImageModelContext } from "@/features/image-design/types";
import { requestImageBatch } from "@/services/api/image-batch";
import { IMAGE_REQUEST_UNKNOWN_MESSAGE, ImageGenerationError } from "@/services/api/image-errors";
import type { AiConfig } from "@/stores/use-config-store";
import type { ImageFailureStage, ImageGenerationOutput, ImageReferenceOptimization, ReferenceImage } from "@/types/image";

export type StartImageDesignGenerationInput = {
    snapshots: ImageDesignRequestSnapshot[];
    config: AiConfig;
    mode: "batch" | "series";
    batchSize: number;
    anchorChainEnabled: boolean;
    modelContext: ImageModelContext;
    agentTaskId?: string;
    updateAgentTask?: (id: string, patch: { status: "queued" | "running" | "succeeded" | "failed"; successCount?: number; failCount?: number; error?: string }) => void;
};

type ActiveGenerationRun = {
    runId: number;
    controller: AbortController;
    startedAt: number;
    model: string;
    resultIds: string[];
    kind: "start" | "retry";
    finalized: boolean;
};

export function useImageDesignGeneration() {
    const { message } = App.useApp();
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [referenceOptimization, setReferenceOptimization] = useState<(ImageReferenceOptimization & { enabled: boolean }) | null>(null);
    const resultsRef = useRef<GenerationResult[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    const runIdRef = useRef(0);
    const activeRunRef = useRef<ActiveGenerationRun | null>(null);
    const logIdByResultIdRef = useRef(new Map<string, string>());
    const agentTaskRef = useRef<Pick<StartImageDesignGenerationInput, "agentTaskId" | "updateAgentTask"> | null>(null);

    const refreshLogs = useCallback(async () => {
        const next = await readGenerationLogs();
        logIdByResultIdRef.current.clear();
        next.forEach((log) => log.items.forEach((item) => logIdByResultIdRef.current.set(item.id, log.id)));
        setLogs(next);
        return next;
    }, []);

    useEffect(() => {
        void refreshLogs();
    }, [refreshLogs]);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    const active = (runId: number, controller: AbortController) => runIdRef.current === runId && abortRef.current === controller && !controller.signal.aborted;

    const commitResults = useCallback((next: GenerationResult[] | ((current: GenerationResult[]) => GenerationResult[])) => {
        const resolved = typeof next === "function" ? next(resultsRef.current) : next;
        resultsRef.current = resolved;
        setResults(resolved);
    }, []);

    const updateLiveResult = useCallback(
        (resultId: string, patch: Partial<GenerationResult>) => {
            commitResults((current) => current.map((result) => (result.id === resultId ? { ...result, ...patch } : result)));
        },
        [commitResults],
    );

    const persistLog = useCallback(
        async (nextResults: GenerationResult[], model: string, durationMs: number) => {
            const log = buildGenerationLog({ results: nextResults, model, durationMs });
            try {
                await saveGenerationLog(log);
                nextResults.forEach((result) => logIdByResultIdRef.current.set(result.id, log.id));
                await refreshLogs();
            } catch {
                message.warning("生成记录未能保存到浏览器，请及时下载结果");
            }
            return log;
        },
        [message, refreshLogs],
    );

    const start = useCallback(
        async (input: StartImageDesignGenerationInput) => {
            if (!input.snapshots.length || running || abortRef.current) return null;
            const controller = new AbortController();
            abortRef.current = controller;
            const runId = ++runIdRef.current;
            agentTaskRef.current = { agentTaskId: input.agentTaskId, updateAgentTask: input.updateAgentTask };
            const batchStartedAt = performance.now();
            const initial = input.snapshots.map(
                (snapshot): GenerationResult => ({
                    id: nanoid(),
                    status: "queued",
                    snapshot,
                    startedAt: Date.now(),
                }),
            );
            commitResults(initial);
            activeRunRef.current = {
                runId,
                controller,
                startedAt: batchStartedAt,
                model: input.modelContext.model,
                resultIds: initial.map((result) => result.id),
                kind: "start",
                finalized: false,
            };
            setElapsedMs(0);
            setStartedAt(batchStartedAt);
            setReferenceOptimization(null);
            setRunning(true);
            if (input.agentTaskId) input.updateAgentTask?.(input.agentTaskId, { status: "running", error: undefined });

            try {
                const completed = input.mode === "series" ? await executeSeries(input, initial, controller, runId, active, updateLiveResult) : await executeBatch(input, initial, controller, runId, active, updateLiveResult, setReferenceOptimization);
                if (!active(runId, controller)) return null;
                const activeRun = activeRunRef.current;
                if (activeRun?.runId === runId) activeRun.finalized = true;
                commitResults(completed);
                await persistLog(completed, input.modelContext.model, performance.now() - batchStartedAt);
                const successCount = completed.filter((result) => Boolean(result.image) && result.status !== "failed" && result.status !== "unknown").length;
                const unknownCount = completed.filter((result) => result.status === "unknown").length;
                const failCount = completed.length - successCount - unknownCount;
                if (input.agentTaskId) {
                    input.updateAgentTask?.(input.agentTaskId, {
                        status: successCount ? "succeeded" : "failed",
                        successCount,
                        failCount: failCount + unknownCount,
                        error: successCount ? undefined : completed.find((result) => result.error)?.error || "生成失败",
                    });
                }
                if (unknownCount) message.warning(IMAGE_REQUEST_UNKNOWN_MESSAGE);
                else if (successCount && (failCount || unknownCount)) message.warning(`已生成 ${successCount} 张，${failCount + unknownCount} 张未成功`);
                else if (successCount) message.success(`已生成 ${successCount} 张图片`);
                else message.error(completed.find((result) => result.error)?.error || "生成失败");
                return completed;
            } catch (error) {
                if (!controller.signal.aborted) {
                    const activeRun = activeRunRef.current;
                    if (activeRun?.runId === runId) activeRun.finalized = true;
                    const details = errorDetails(error, "provider_submit");
                    commitResults((current) => current.map((result) => (terminal(result) ? result : { ...result, status: "failed", error: details.message, failureStage: details.failureStage })));
                    if (input.agentTaskId) input.updateAgentTask?.(input.agentTaskId, { status: "failed", successCount: 0, failCount: input.snapshots.length, error: details.message });
                    message.error(details.message);
                }
                return null;
            } finally {
                if (runIdRef.current === runId) {
                    abortRef.current = null;
                    activeRunRef.current = null;
                    agentTaskRef.current = null;
                    setRunning(false);
                }
            }
        },
        [commitResults, message, persistLog, running, updateLiveResult],
    );

    const retry = useCallback(
        async (result: GenerationResult, currentConfig: AiConfig) => {
            if (running || abortRef.current) return null;
            const controller = new AbortController();
            abortRef.current = controller;
            const runId = ++runIdRef.current;
            const started = performance.now();
            setRunning(true);
            setStartedAt(started);
            setElapsedMs(0);
            commitResults((current) => {
                const queued: GenerationResult = {
                    ...result,
                    status: "queued",
                    image: undefined,
                    error: undefined,
                    failureStage: undefined,
                    startedAt: Date.now(),
                    completedAt: undefined,
                };
                return current.some((item) => item.id === result.id) ? current.map((item) => (item.id === result.id ? queued : item)) : [...current, queued];
            });
            activeRunRef.current = {
                runId,
                controller,
                startedAt: started,
                model: result.snapshot.config.imageModel || result.snapshot.config.model,
                resultIds: [result.id],
                kind: "retry",
                finalized: false,
            };
            try {
                const config = {
                    ...currentConfig,
                    ...result.snapshot.config,
                    model: result.snapshot.config.imageModel || result.snapshot.config.model,
                    imageModel: result.snapshot.config.imageModel || result.snapshot.config.model,
                    count: "1",
                };
                const batch = await requestImageBatch(config, result.snapshot.finalPrompt, result.snapshot.references, {
                    signal: controller.signal,
                    onStatus: (_index, status, detail) => {
                        if (!active(runId, controller)) return;
                        const error = detail instanceof ImageGenerationError ? detail : undefined;
                        const image = detail && !(detail instanceof Error) ? provisionalGeneratedImage(detail, performance.now() - started) : undefined;
                        updateLiveResult(result.id, {
                            status,
                            error: error?.message,
                            failureStage: error?.failureStage,
                            ...(image ? { image } : {}),
                        });
                    },
                });
                if (!active(runId, controller)) return null;
                setReferenceOptimization({ ...batch.referenceOptimization, enabled: config.optimizeImageReferences });
                const completed = await settledResult(result, batch.results[0], performance.now() - started);
                if (!active(runId, controller)) return null;
                const activeRun = activeRunRef.current;
                if (activeRun?.runId === runId) activeRun.finalized = true;
                commitResults((current) => (current.some((item) => item.id === result.id) ? current.map((item) => (item.id === result.id ? completed : item)) : [...current, completed]));
                try {
                    const logId = logIdByResultIdRef.current.get(result.id);
                    const log = logId ? await getGenerationLog(logId) : null;
                    if (log) await saveGenerationLog(replaceGenerationLogResult(log, completed));
                    else await persistLog([completed], config.imageModel || config.model, performance.now() - started);
                    await refreshLogs();
                } catch {
                    message.warning("重试结果已返回，但生成记录未能更新");
                }
                if (completed.image) message.success("重试成功");
                else if (completed.status === "unknown") message.warning(IMAGE_REQUEST_UNKNOWN_MESSAGE);
                else message.error(completed.error || "重试失败");
                return completed;
            } catch (error) {
                if (!controller.signal.aborted) {
                    const activeRun = activeRunRef.current;
                    if (activeRun?.runId === runId) activeRun.finalized = true;
                    const details = errorDetails(error, "provider_submit");
                    const failed: GenerationResult = {
                        ...result,
                        status: "failed",
                        image: undefined,
                        error: details.message,
                        failureStage: details.failureStage,
                        completedAt: Date.now(),
                    };
                    commitResults((current) => (current.some((item) => item.id === result.id) ? current.map((item) => (item.id === result.id ? failed : item)) : [...current, failed]));
                    try {
                        const logId = logIdByResultIdRef.current.get(result.id);
                        const log = logId ? await getGenerationLog(logId) : null;
                        if (log) await saveGenerationLog(replaceGenerationLogResult(log, failed));
                        else await persistLog([failed], result.snapshot.config.imageModel || result.snapshot.config.model, performance.now() - started);
                        await refreshLogs();
                    } catch {
                        message.warning("失败状态未能写入生成记录");
                    }
                    message.error(details.message);
                    return failed;
                }
                return null;
            } finally {
                if (runIdRef.current === runId) {
                    abortRef.current = null;
                    activeRunRef.current = null;
                    setRunning(false);
                }
            }
        },
        [commitResults, message, persistLog, refreshLogs, running, updateLiveResult],
    );

    const replaceResult = useCallback(
        async (result: GenerationResult) => {
            commitResults((current) => current.map((item) => (item.id === result.id ? result : item)));
            const logId = logIdByResultIdRef.current.get(result.id);
            if (!logId) return;
            try {
                const log = await getGenerationLog(logId);
                if (!log) return;
                await saveGenerationLog(replaceGenerationLogResult(log, result));
                await refreshLogs();
            } catch {
                message.warning("结果已更新，但生成记录未能同步");
            }
        },
        [commitResults, message, refreshLogs],
    );

    const persistCancelledRun = useCallback(
        async (run: ActiveGenerationRun, cancelledResults: GenerationResult[]) => {
            if (!cancelledResults.length) return;
            if (run.kind === "start") {
                await persistLog(cancelledResults, run.model, performance.now() - run.startedAt);
                return;
            }
            const result = cancelledResults[0];
            try {
                const logId = logIdByResultIdRef.current.get(result.id);
                const log = logId ? await getGenerationLog(logId) : null;
                if (log) {
                    await saveGenerationLog(replaceGenerationLogResult(log, result));
                    await refreshLogs();
                } else {
                    await persistLog([result], run.model, performance.now() - run.startedAt);
                }
            } catch {
                message.warning("取消状态未能写入生成记录");
            }
        },
        [message, persistLog, refreshLogs],
    );

    const cancel = useCallback(() => {
        const activeRun = activeRunRef.current;
        if (!activeRun || activeRun.finalized || abortRef.current !== activeRun.controller) return;
        activeRun.finalized = true;
        activeRunRef.current = null;
        runIdRef.current += 1;
        abortRef.current = null;
        const targetIds = new Set(activeRun.resultIds);
        const cancelledAt = Date.now();
        const nextResults = resultsRef.current.map((result): GenerationResult => (targetIds.has(result.id) && !terminal(result) ? { ...result, status: "cancelled", error: "已取消，未继续写入生成状态", completedAt: cancelledAt } : result));
        commitResults(nextResults);
        activeRun.controller.abort();
        const cancelledResults = nextResults.filter((result) => targetIds.has(result.id));
        const agentTask = agentTaskRef.current;
        if (agentTask?.agentTaskId) {
            const successCount = cancelledResults.filter((result) => Boolean(result.image) && !["failed", "unknown"].includes(result.status)).length;
            agentTask.updateAgentTask?.(agentTask.agentTaskId, {
                status: "failed",
                successCount,
                failCount: cancelledResults.length - successCount,
                error: "用户取消生成",
            });
        }
        agentTaskRef.current = null;
        setRunning(false);
        void persistCancelledRun(activeRun, cancelledResults);
        message.info("已取消生成");
    }, [commitResults, message, persistCancelledRun]);

    const removeLogs = useCallback(
        async (ids: string[], protectedData: unknown) => {
            await deleteGenerationLogs(ids, protectedData);
            await refreshLogs();
        },
        [refreshLogs],
    );

    return {
        results,
        setResults: commitResults,
        logs,
        running,
        elapsedMs,
        referenceOptimization,
        start,
        retry,
        replaceResult,
        cancel,
        refreshLogs,
        removeLogs,
    };
}

export type ImageDesignGenerationController = ReturnType<typeof useImageDesignGeneration>;

async function executeBatch(
    input: StartImageDesignGenerationInput,
    initial: GenerationResult[],
    controller: AbortController,
    runId: number,
    active: (runId: number, controller: AbortController) => boolean,
    updateLiveResult: (id: string, patch: Partial<GenerationResult>) => void,
    setReferenceOptimization: (value: (ImageReferenceOptimization & { enabled: boolean }) | null) => void,
) {
    const first = input.snapshots[0];
    const config = {
        ...input.config,
        ...first.config,
        model: input.modelContext.model,
        imageModel: input.modelContext.model,
        count: String(initial.length),
    };
    const batchStartedAt = performance.now();
    const batch = await requestImageBatch(config, first.finalPrompt, first.references, {
        signal: controller.signal,
        onStatus: (index, status, detail) => {
            if (!active(runId, controller) || !initial[index]) return;
            const error = detail instanceof ImageGenerationError ? detail : undefined;
            const image = detail && !(detail instanceof Error) ? provisionalGeneratedImage(detail, performance.now() - batchStartedAt) : undefined;
            updateLiveResult(initial[index].id, {
                status,
                error: error?.message,
                failureStage: error?.failureStage,
                ...(image ? { image } : {}),
            });
        },
    });
    if (!active(runId, controller)) return initial;
    setReferenceOptimization({ ...batch.referenceOptimization, enabled: config.optimizeImageReferences });
    return Promise.all(initial.map((result, index) => settledResult(result, batch.results[index], performance.now() - batchStartedAt)));
}

async function executeSeries(
    input: StartImageDesignGenerationInput,
    initial: GenerationResult[],
    controller: AbortController,
    runId: number,
    active: (runId: number, controller: AbortController) => boolean,
    updateLiveResult: (id: string, patch: Partial<GenerationResult>) => void,
) {
    const idBySnapshot = new Map(input.snapshots.map((snapshot, index) => [snapshot.id, initial[index].id]));
    const startedAt = performance.now();
    const outcomes = await executeImageDesignSeries({
        config: input.config,
        snapshots: input.snapshots,
        batchSize: input.batchSize,
        anchorChainEnabled: input.anchorChainEnabled,
        supportsReferenceImages: input.modelContext.supportsSeriesAnchor === true,
        maxReferenceImages: input.modelContext.maxReferenceImages,
        signal: controller.signal,
        onStatus: (snapshotId, status, detail) => {
            if (!active(runId, controller)) return;
            const resultId = idBySnapshot.get(snapshotId);
            if (!resultId) return;
            const error = detail instanceof Error ? detail : undefined;
            const image = detail && !(detail instanceof Error) ? provisionalGeneratedImage(detail, performance.now() - startedAt) : undefined;
            updateLiveResult(resultId, {
                status,
                error: error?.message,
                failureStage: error instanceof ImageGenerationError ? error.failureStage : undefined,
                ...(image ? { image } : {}),
            });
        },
    });
    if (!active(runId, controller)) return initial;
    const firstOutcome = outcomes[0];
    const firstImage = firstOutcome?.status === "succeeded" && firstOutcome.output ? await persistGenerationOutput(firstOutcome.output, performance.now() - startedAt) : undefined;
    const runtimeAnchor = outcomes.flatMap((outcome) => outcome.snapshot.references).find((reference) => reference.source === "series-anchor");
    const persistedAnchor = firstImage ? imageToSeriesAnchor(firstImage, runtimeAnchor?.id) : undefined;
    return Promise.all(
        initial.map(async (result, index) => {
            const outcome = outcomes[index];
            if (!outcome) return { ...result, status: "failed" as const, error: "系列任务没有返回结果", completedAt: Date.now() };
            const snapshot = persistedAnchor && index > 0 ? replaceSeriesAnchor(outcome.snapshot, persistedAnchor) : outcome.snapshot;
            if (outcome.status === "succeeded" && outcome.output) {
                const image = index === 0 && firstImage ? firstImage : await persistGenerationOutput(outcome.output, performance.now() - startedAt);
                return {
                    ...result,
                    snapshot,
                    status: image.storageKey ? ("stored" as const) : image.remoteUrl ? ("remote_only" as const) : ("generated" as const),
                    image,
                    error: undefined,
                    warnings: outcome.warnings,
                    completedAt: Date.now(),
                };
            }
            return {
                ...result,
                snapshot,
                status: outcome.status === "unknown" ? ("unknown" as const) : outcome.status === "cancelled" ? ("cancelled" as const) : ("failed" as const),
                error: outcome.error?.message || (outcome.status === "cancelled" ? "已取消" : "生成失败"),
                warnings: outcome.warnings,
                failureStage: outcome.error instanceof ImageGenerationError ? outcome.error.failureStage : undefined,
                completedAt: Date.now(),
            };
        }),
    );
}

function imageToSeriesAnchor(image: NonNullable<GenerationResult["image"]>, id?: string): ReferenceImage {
    return {
        id: id || nanoid(),
        name: "系列第 1 张生成结果",
        type: image.mimeType || "image/png",
        dataUrl: image.dataUrl || image.remoteUrl || "",
        url: image.remoteUrl,
        storageKey: image.storageKey,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
        role: "series-anchor",
        source: "series-anchor",
    };
}

function replaceSeriesAnchor(snapshot: ImageDesignRequestSnapshot, anchor: ReferenceImage): ImageDesignRequestSnapshot {
    const currentAnchor = snapshot.references.find((reference) => reference.source === "series-anchor");
    if (!currentAnchor) return snapshot;
    const reproducibility = snapshot.reproducibilitySnapshot;
    return {
        ...snapshot,
        references: snapshot.references.map((reference) => (reference.source === "series-anchor" ? anchor : reference)),
        reproducibilitySnapshot: reproducibility
            ? {
                  ...reproducibility,
                  referenceImageRoles: (reproducibility.referenceImageRoles || []).map((reference) => (reference.id === currentAnchor.id ? { ...reference, id: anchor.id, name: anchor.name } : reference)),
              }
            : undefined,
    };
}

async function settledResult(result: GenerationResult, settled: PromiseSettledResult<ImageGenerationOutput> | undefined, durationMs: number): Promise<GenerationResult> {
    if (!settled || settled.status === "rejected") {
        const details = errorDetails(settled?.reason || new Error("接口没有返回图片"), "provider_processing");
        const unknown = settled?.reason instanceof ImageGenerationError && settled.reason.resultUnknown;
        return {
            ...result,
            status: unknown ? "unknown" : "failed",
            error: details.message,
            failureStage: details.failureStage,
            image: undefined,
            completedAt: Date.now(),
        };
    }
    const image = await persistGenerationOutput(settled.value, durationMs);
    return {
        ...result,
        status: image.storageKey ? "stored" : image.remoteUrl ? "remote_only" : "generated",
        image,
        error: undefined,
        failureStage: image.failureStage,
        completedAt: Date.now(),
    };
}

function errorDetails(error: unknown, fallbackStage: ImageFailureStage) {
    return {
        message: error instanceof Error ? error.message : "图片处理失败",
        failureStage: error instanceof ImageGenerationError ? error.failureStage : fallbackStage,
    };
}

function terminal(result: GenerationResult) {
    return ["generated", "stored", "remote_only", "unknown", "failed", "cancelled"].includes(result.status);
}

function provisionalGeneratedImage(output: ImageGenerationOutput, durationMs: number): NonNullable<GenerationResult["image"]> {
    return {
        id: output.id,
        durationMs,
        dataUrl: output.source === "data_url" ? output.dataUrl : undefined,
        remoteUrl: output.source === "remote_url" ? output.remoteUrl : undefined,
        mimeType: output.mimeType,
        expiresAt: output.expiresAt,
        providerTaskId: output.providerTaskId,
        providerRequestId: output.providerRequestId,
    };
}
