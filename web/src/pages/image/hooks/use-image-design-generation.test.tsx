import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationLog, ImageDesignRequestSnapshot } from "@/features/image-design/generation/types";
import type { ImageModelContext } from "@/features/image-design/types";
import type { ImageBatchResult } from "@/services/api/image-batch";
import type { AiConfig } from "@/stores/use-config-store";
import type { ImageGenerationOutput, ImageGenerationStatus } from "@/types/image";
import { useImageDesignGeneration } from "./use-image-design-generation";

const mocks = vi.hoisted(() => ({
    deleteGenerationLogs: vi.fn(),
    executeImageDesignSeries: vi.fn(),
    getGenerationLog: vi.fn(),
    message: {
        error: vi.fn(),
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
    },
    persistGenerationOutput: vi.fn(),
    readGenerationLogs: vi.fn(),
    requestImageBatch: vi.fn(),
    saveGenerationLog: vi.fn(),
}));

vi.mock("antd", () => ({
    App: {
        useApp: () => ({ message: mocks.message }),
    },
}));

vi.mock("@/features/image-design/generation/persist-generation-output", () => ({
    persistGenerationOutput: mocks.persistGenerationOutput,
}));

vi.mock("@/features/image-design/generation/series-executor", () => ({
    executeImageDesignSeries: mocks.executeImageDesignSeries,
}));

vi.mock("@/features/image-design/persistence/generation-logs", () => ({
    deleteGenerationLogs: mocks.deleteGenerationLogs,
    getGenerationLog: mocks.getGenerationLog,
    readGenerationLogs: mocks.readGenerationLogs,
    saveGenerationLog: mocks.saveGenerationLog,
}));

vi.mock("@/services/api/image-batch", () => ({
    requestImageBatch: mocks.requestImageBatch,
}));

describe("useImageDesignGeneration cancellation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readGenerationLogs.mockResolvedValue([]);
        mocks.getGenerationLog.mockResolvedValue(null);
        mocks.saveGenerationLog.mockResolvedValue(undefined);
    });

    it("persists one partial-success log, keeps returned images, and ignores late completion", async () => {
        const pending = deferred<ImageBatchResult>();
        let onStatus: ((index: number, status: ImageGenerationStatus, detail?: ImageGenerationOutput) => void) | undefined;
        let signal: AbortSignal | undefined;
        mocks.requestImageBatch.mockImplementation((_config: unknown, _prompt: unknown, _references: unknown, options?: { signal?: AbortSignal; onStatus?: typeof onStatus }) => {
            signal = options?.signal;
            onStatus = options?.onStatus;
            return pending.promise;
        });
        const updateAgentTask = vi.fn();
        const { result } = renderHook(() => useImageDesignGeneration());
        let startPromise!: Promise<unknown>;

        act(() => {
            startPromise = result.current.start(startInput(2, updateAgentTask));
        });
        await waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledOnce());

        const returnedImage: ImageGenerationOutput = {
            id: "returned-image",
            status: "remote_only",
            source: "remote_url",
            remoteUrl: "https://cdn.example.test/returned.png",
            mimeType: "image/png",
        };
        act(() => {
            onStatus?.(0, "remote_only", returnedImage);
            onStatus?.(1, "generating");
        });
        expect(result.current.results[0]).toMatchObject({
            status: "remote_only",
            image: { id: "returned-image", remoteUrl: returnedImage.remoteUrl },
        });

        act(() => result.current.cancel());

        expect(signal?.aborted).toBe(true);
        expect(result.current.running).toBe(false);
        expect(result.current.results[0]).toMatchObject({
            status: "remote_only",
            image: { id: "returned-image", remoteUrl: returnedImage.remoteUrl },
        });
        expect(result.current.results[1]).toMatchObject({ status: "cancelled", error: "已取消，未继续写入生成状态" });
        await waitFor(() => expect(mocks.saveGenerationLog).toHaveBeenCalledOnce());

        const saved = mocks.saveGenerationLog.mock.calls[0][0] as GenerationLog;
        expect(saved).toMatchObject({
            status: "部分成功",
            successCount: 1,
            imageCount: 2,
        });
        expect(saved.items.map((item) => item.status)).toEqual(["remote_only", "cancelled"]);
        expect(saved.images).toEqual([expect.objectContaining({ id: "returned-image", remoteUrl: returnedImage.remoteUrl })]);
        expect(updateAgentTask).toHaveBeenLastCalledWith("agent-task", {
            status: "failed",
            successCount: 1,
            failCount: 1,
            error: "用户取消生成",
        });
        expect(mocks.message.info).toHaveBeenCalledWith("已取消生成");
        expect(mocks.message.error).not.toHaveBeenCalled();

        await act(async () => {
            pending.resolve({
                results: [
                    { status: "fulfilled", value: returnedImage },
                    {
                        status: "fulfilled",
                        value: {
                            id: "late-image",
                            status: "remote_only",
                            source: "remote_url",
                            remoteUrl: "https://cdn.example.test/late.png",
                        },
                    },
                ],
                referenceOptimization: { total: 0, optimized: 0 },
            });
            await startPromise;
        });

        expect(mocks.saveGenerationLog).toHaveBeenCalledOnce();
        expect(result.current.results.map((item) => item.status)).toEqual(["remote_only", "cancelled"]);
        expect(result.current.results[1].image).toBeUndefined();
        expect(updateAgentTask).toHaveBeenCalledTimes(2);
    });

    it("persists one cancelled log when no image has returned and repeated cancel is ignored", async () => {
        const pending = deferred<ImageBatchResult>();
        mocks.requestImageBatch.mockReturnValue(pending.promise);
        const { result } = renderHook(() => useImageDesignGeneration());
        let startPromise!: Promise<unknown>;

        act(() => {
            startPromise = result.current.start(startInput(2));
        });
        await waitFor(() => expect(mocks.requestImageBatch).toHaveBeenCalledOnce());

        act(() => {
            result.current.cancel();
            result.current.cancel();
        });

        expect(result.current.results.map((item) => item.status)).toEqual(["cancelled", "cancelled"]);
        await waitFor(() => expect(mocks.saveGenerationLog).toHaveBeenCalledOnce());
        const saved = mocks.saveGenerationLog.mock.calls[0][0] as GenerationLog;
        expect(saved.status).toBe("已取消");
        expect(saved.successCount).toBe(0);
        expect(saved.items.every((item) => item.status === "cancelled")).toBe(true);
        expect(mocks.message.error).not.toHaveBeenCalled();

        await act(async () => {
            pending.resolve({
                results: [],
                referenceOptimization: { total: 0, optimized: 0 },
            });
            await startPromise;
        });
        expect(mocks.saveGenerationLog).toHaveBeenCalledOnce();
    });
});

function startInput(count: number, updateAgentTask?: StartAgentTaskUpdater) {
    return {
        snapshots: Array.from({ length: count }, (_, index) => snapshot(`snapshot-${index + 1}`)),
        config: {
            model: "test-image-model",
            imageModel: "test-image-model",
            quality: "auto",
            size: "1024x1024",
            count: String(count),
            background: "",
            optimizeImageReferences: false,
        } as AiConfig,
        mode: "batch" as const,
        batchSize: count,
        anchorChainEnabled: false,
        modelContext: {
            provider: "openai",
            apiFormat: "openai",
            model: "test-image-model",
            quality: "auto",
            count,
        } satisfies ImageModelContext,
        agentTaskId: updateAgentTask ? "agent-task" : undefined,
        updateAgentTask,
    };
}

type StartAgentTaskUpdater = (id: string, patch: { status: "queued" | "running" | "succeeded" | "failed"; successCount?: number; failCount?: number; error?: string }) => void;

function snapshot(id: string): ImageDesignRequestSnapshot {
    return {
        id,
        createdAt: Date.now(),
        originalPrompt: "测试取消生成",
        finalPrompt: "测试取消生成",
        config: {
            model: "test-image-model",
            imageModel: "test-image-model",
            quality: "auto",
            size: "1024x1024",
            imageAspectRatio: "1:1",
            count: "1",
            background: "",
            optimizeImageReferences: false,
        },
        references: [],
        designSkillId: "none",
        designSkillLabel: "不使用 Skill",
        skillOptions: {},
        requestedSize: "1024x1024",
        requestedAspectRatio: "1:1",
        promptVersion: "test",
        compilerVersion: "test",
    };
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((next) => {
        resolve = next;
    });
    return { promise, resolve };
}
