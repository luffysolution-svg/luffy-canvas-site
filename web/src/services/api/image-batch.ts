import { resolveModelChannel, type AiConfig } from "@/stores/use-config-store";
import { prepareReferenceImages, type PreparedReferenceImage } from "@/services/image-storage";
import type { ImageGenerationOutput, ImageGenerationStatus, ImageReferenceOptimization, ReferenceImage } from "@/types/image";
import { classifyImageGenerationError, ImageGenerationError } from "./image-errors";
import { requestEdit, requestGeneration } from "./image";

type BatchOptions = {
    signal?: AbortSignal;
    mask?: ReferenceImage;
    onStatus?: (index: number, status: ImageGenerationStatus, detail?: ImageGenerationOutput | ImageGenerationError) => void;
};

export type ImageBatchResult = {
    results: PromiseSettledResult<ImageGenerationOutput>[];
    referenceOptimization: ImageReferenceOptimization;
};

type QueueItem<T> = {
    exclusive: boolean;
    task: () => Promise<T>;
    onStart?: () => void;
    signal?: AbortSignal;
    abortQueued?: () => void;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
};

class ImageRequestQueue {
    private active = 0;
    private exclusiveActive = false;
    private readonly items: QueueItem<unknown>[] = [];

    run<T>(task: () => Promise<T>, exclusive: boolean, onStart?: () => void, signal?: AbortSignal) {
        return new Promise<T>((resolve, reject) => {
            if (signal?.aborted) {
                reject(canceledRequestError());
                return;
            }
            const item: QueueItem<T> = { task, exclusive, onStart, signal, resolve, reject };
            item.abortQueued = () => {
                const index = this.items.indexOf(item as QueueItem<unknown>);
                if (index < 0) return;
                this.items.splice(index, 1);
                reject(canceledRequestError());
                this.pump();
            };
            signal?.addEventListener("abort", item.abortQueued, { once: true });
            this.items.push(item as QueueItem<unknown>);
            this.pump();
        });
    }

    private pump() {
        for (;;) {
            const item = this.items[0];
            if (!item) return;
            if (item.exclusive) {
                if (this.active > 0) return;
                this.items.shift();
                this.active = 1;
                this.exclusiveActive = true;
                this.start(item);
                return;
            }
            if (this.exclusiveActive || this.active >= 2) return;
            this.items.shift();
            this.active += 1;
            this.start(item);
        }
    }

    private start(item: QueueItem<unknown>) {
        if (item.abortQueued) item.signal?.removeEventListener("abort", item.abortQueued);
        if (item.signal?.aborted) {
            item.reject(canceledRequestError());
            this.finish(item);
            return;
        }
        item.onStart?.();
        void item
            .task()
            .then(item.resolve, item.reject)
            .finally(() => this.finish(item));
    }

    private finish(item: QueueItem<unknown>) {
        this.active -= 1;
        if (item.exclusive) this.exclusiveActive = false;
        this.pump();
    }
}

const imageRequestQueue = new ImageRequestQueue();

function canceledRequestError() {
    return new ImageGenerationError("请求已取消", { failureStage: "provider_submit", kind: "aborted" });
}

export async function requestImageBatch(config: AiConfig, prompt: string, references: ReferenceImage[] = [], options?: BatchOptions): Promise<ImageBatchResult> {
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    let preparedReferences: PreparedReferenceImage[];
    let referenceOptimization: ImageReferenceOptimization = { total: references.length, optimized: 0 };
    try {
        const prepared = await prepareReferenceImages(references, config.optimizeImageReferences);
        preparedReferences = prepared.images;
        referenceOptimization = prepared.optimization;
    } catch (error) {
        const original = classifyImageGenerationError(error, "参考图准备失败", "request_prepare");
        const classified =
            original.failureStage === "request_prepare"
                ? original
                : new ImageGenerationError(original.message, {
                      failureStage: "request_prepare",
                      kind: original.kind,
                      httpStatus: original.httpStatus,
                      cause: original,
                  });
        const results = Array.from({ length: count }, (_, index): PromiseRejectedResult => {
            options?.onStatus?.(index, classified.resultUnknown ? "unknown" : "failed", classified);
            return { status: "rejected", reason: classified };
        });
        return { results, referenceOptimization };
    }

    const channel = resolveModelChannel(config, config.model || config.imageModel);
    const nativeBatch = channel.imageBatchMode === "native" || (channel.imageBatchMode === "auto" && channel.apiFormat !== "gemini");
    const exclusive = references.length > 0 || isHighResolutionImage(config);
    const request = (requestCount: number) => {
        const requestConfig = { ...config, count: String(requestCount) };
        return preparedReferences.length ? requestEdit(requestConfig, prompt, preparedReferences, options?.mask, { signal: options?.signal }) : requestGeneration(requestConfig, prompt, { signal: options?.signal });
    };

    if (nativeBatch) {
        try {
            const outputs = await imageRequestQueue.run(
                () => request(count),
                exclusive,
                () => {
                    for (let index = 0; index < count; index += 1) options?.onStatus?.(index, "generating");
                },
                options?.signal,
            );
            const results: PromiseSettledResult<ImageGenerationOutput>[] = outputs.slice(0, count).map((output, index) => {
                options?.onStatus?.(index, output.status, output);
                return { status: "fulfilled", value: output };
            });
            if (results.length < count && channel.imageBatchMode === "auto") {
                const fallbackResults = await Promise.all(
                    Array.from({ length: count - results.length }, async (_, offset): Promise<PromiseSettledResult<ImageGenerationOutput>> => {
                        const index = results.length + offset;
                        try {
                            const fallbackOutputs = await imageRequestQueue.run(
                                () => request(1),
                                exclusive,
                                () => options?.onStatus?.(index, "generating"),
                                options?.signal,
                            );
                            const output = fallbackOutputs[0];
                            if (!output) throw new ImageGenerationError("接口没有返回图片", { failureStage: "response_parse", kind: "response_parse" });
                            options?.onStatus?.(index, output.status, output);
                            return { status: "fulfilled", value: output };
                        } catch (error) {
                            const classified = classifyImageGenerationError(error);
                            if (classified.kind !== "aborted") options?.onStatus?.(index, classified.resultUnknown ? "unknown" : "failed", classified);
                            return { status: "rejected", reason: classified };
                        }
                    }),
                );
                results.push(...fallbackResults);
            }
            while (results.length < count) {
                const index = results.length;
                const error = new ImageGenerationError("接口返回的图片数量少于请求数量", { failureStage: "response_parse", kind: "response_parse" });
                options?.onStatus?.(index, "failed", error);
                results.push({ status: "rejected", reason: error });
            }
            return { results, referenceOptimization };
        } catch (error) {
            const classified = classifyImageGenerationError(error);
            const results = Array.from({ length: count }, (_, index): PromiseRejectedResult => {
                if (classified.kind !== "aborted") options?.onStatus?.(index, classified.resultUnknown ? "unknown" : "failed", classified);
                return { status: "rejected", reason: classified };
            });
            return { results, referenceOptimization };
        }
    }

    const results = await Promise.all(
        Array.from({ length: count }, async (_, index): Promise<PromiseSettledResult<ImageGenerationOutput>> => {
            try {
                const outputs = await imageRequestQueue.run(
                    () => request(1),
                    exclusive,
                    () => options?.onStatus?.(index, "generating"),
                    options?.signal,
                );
                const output = outputs[0];
                if (!output) throw new ImageGenerationError("接口没有返回图片", { failureStage: "response_parse", kind: "response_parse" });
                options?.onStatus?.(index, output.status, output);
                return { status: "fulfilled", value: output };
            } catch (error) {
                const classified = classifyImageGenerationError(error);
                if (classified.kind !== "aborted") options?.onStatus?.(index, classified.resultUnknown ? "unknown" : "failed", classified);
                return { status: "rejected", reason: classified };
            }
        }),
    );
    return { results, referenceOptimization };
}

export function isHighResolutionImage(config: Pick<AiConfig, "quality" | "size">) {
    if (config.quality.trim().toLowerCase() === "high" || /4k/i.test(config.size)) return true;
    const dimensions = config.size.match(/^(\d+)x(\d+)$/i);
    return Boolean(dimensions && Math.max(Number(dimensions[1]), Number(dimensions[2])) >= 3000);
}
