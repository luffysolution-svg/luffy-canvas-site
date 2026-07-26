import axios from "axios";

import type { ImageErrorKind, ImageFailureStage } from "@/types/image";

export const IMAGE_REQUEST_UNKNOWN_MESSAGE = "请求没有返回可读取的响应，无法确认是否已经生成。服务端可能已执行并产生费用，请先到渠道日志核对，暂勿直接重试。";

const UNKNOWN_HTTP_STATUSES = new Set([408, 425, 499, 502, 503, 504, 524]);
const RETRY_HTTP_STATUSES = new Set([429, 502, 503]);
const NETWORK_RESET_CODES = new Set(["ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "ERR_NETWORK"]);

export class ImageGenerationError extends Error {
    readonly failureStage: ImageFailureStage;
    readonly kind: ImageErrorKind;
    readonly httpStatus?: number;
    readonly retryable: boolean;
    readonly resultUnknown: boolean;

    constructor(
        message: string,
        details: {
            failureStage: ImageFailureStage;
            kind: ImageErrorKind;
            httpStatus?: number;
            retryable?: boolean;
            resultUnknown?: boolean;
            cause?: unknown;
        },
    ) {
        super(message, details.cause === undefined ? undefined : { cause: details.cause });
        this.name = "ImageGenerationError";
        this.failureStage = details.failureStage;
        this.kind = details.kind;
        this.httpStatus = details.httpStatus;
        this.retryable = Boolean(details.retryable);
        this.resultUnknown = Boolean(details.resultUnknown);
    }
}

export class ImageRequestUnknownError extends ImageGenerationError {
    constructor(details?: { failureStage?: ImageFailureStage; kind?: ImageErrorKind; httpStatus?: number; retryable?: boolean; cause?: unknown; message?: string }) {
        super(details?.message || IMAGE_REQUEST_UNKNOWN_MESSAGE, {
            failureStage: details?.failureStage || "provider_processing",
            kind: details?.kind || "unknown",
            httpStatus: details?.httpStatus,
            retryable: details?.retryable,
            resultUnknown: true,
            cause: details?.cause,
        });
        this.name = "ImageRequestUnknownError";
    }
}

export function classifyImageGenerationError(error: unknown, fallback = "请求失败", failureStage: ImageFailureStage = "provider_submit"): ImageGenerationError {
    if (error instanceof ImageGenerationError) return error;
    if (axios.isCancel(error) || (error instanceof DOMException && error.name === "AbortError")) {
        return new ImageGenerationError("请求已取消", { failureStage, kind: "aborted", cause: error });
    }

    const axiosError = axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string }>(error) ? error : null;
    const status = axiosError?.response?.status;
    const code = readErrorCode(error);
    const rawMessage = readErrorMessage(error);
    const responseMessage = axiosError?.response?.data?.msg || axiosError?.response?.data?.message || axiosError?.response?.data?.error?.message;
    const message = responseMessage || rawMessage || fallback;

    if (status === 401 || status === 403) return new ImageGenerationError("鉴权失败，请检查 API Key、套餐权限或模型权限", { failureStage, kind: "auth", httpStatus: status, cause: error });
    if (status === 429) return new ImageGenerationError("请求被限流或额度不足，请稍后重试", { failureStage, kind: "rate_limit", httpStatus: status, retryable: true, cause: error });
    if (status && UNKNOWN_HTTP_STATUSES.has(status)) {
        return new ImageRequestUnknownError({
            failureStage: "provider_processing",
            kind: "gateway",
            httpStatus: status,
            retryable: RETRY_HTTP_STATUSES.has(status),
            cause: error,
            message: `服务暂时没有返回可确认的结果（${status}），请先核对渠道任务状态，避免重复扣费。`,
        });
    }
    if (status) return new ImageGenerationError(responseMessage || `${fallback}：${status}`, { failureStage, kind: "unknown", httpStatus: status, cause: error });

    const lowerMessage = message.toLowerCase();
    if (/\bcors\b|cross-origin|access-control-allow-origin/.test(lowerMessage)) {
        return new ImageRequestUnknownError({ failureStage, kind: "cors", cause: error, message: "浏览器明确报告跨域（CORS）拦截，无法确认服务端是否已完成生成。" });
    }
    if (/enotfound|eai_again|dns/.test(`${code} ${lowerMessage}`)) {
        return new ImageRequestUnknownError({ failureStage, kind: "dns", cause: error, message: "域名解析失败（DNS），无法确认服务端是否收到请求。" });
    }
    if (/certificate|cert_|tls|ssl|eproto/.test(`${code} ${lowerMessage}`)) {
        return new ImageRequestUnknownError({ failureStage, kind: "tls", cause: error, message: "TLS/证书连接失败，无法确认服务端是否收到请求。" });
    }
    if (NETWORK_RESET_CODES.has(code) || /connection reset|socket hang up|network error|failed to fetch|load failed/.test(lowerMessage)) {
        return new ImageRequestUnknownError({
            failureStage: "provider_processing",
            kind: "network",
            retryable: true,
            cause: error,
            message: "网络连接在请求过程中中断，无法确认服务端是否已经生成，请先核对渠道任务状态。",
        });
    }
    if (error instanceof SyntaxError) return new ImageGenerationError("响应体解析失败", { failureStage: "response_parse", kind: "response_parse", cause: error });
    return new ImageGenerationError(message, { failureStage, kind: "unknown", cause: error });
}

export async function retryImageRequest<T>(operation: () => Promise<T>, options?: { signal?: AbortSignal; maxRetries?: number; baseDelayMs?: number }): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const baseDelayMs = options?.baseDelayMs ?? 300;
    let retry = 0;

    for (;;) {
        try {
            return await operation();
        } catch (error) {
            const classified = classifyImageGenerationError(error);
            if (!classified.retryable || retry >= maxRetries || options?.signal?.aborted) throw classified;
            const retryAfterMs = readRetryAfterMs(error);
            const delayMs = retryAfterMs ?? baseDelayMs * 2 ** retry;
            retry += 1;
            await abortableDelay(delayMs, options?.signal);
        }
    }
}

function readErrorCode(error: unknown) {
    if (!error || typeof error !== "object") return "";
    const record = error as { code?: unknown; cause?: { code?: unknown } };
    return String(record.code || record.cause?.code || "").toUpperCase();
}

function readErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "";
}

function readRetryAfterMs(error: unknown) {
    if (!axios.isAxiosError(error)) return undefined;
    const value = error.response?.headers?.["retry-after"];
    if (value === undefined) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function abortableDelay(ms: number, signal?: AbortSignal) {
    if (ms <= 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            globalThis.clearTimeout(timer);
            reject(new DOMException("请求已取消", "AbortError"));
        };
        const timer = globalThis.setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
