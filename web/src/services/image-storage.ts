import localforage from "localforage";

import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";
import { ImageGenerationError } from "@/services/api/image-errors";
import type { ImageReferenceOptimization, ReferenceImage } from "@/types/image";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const objectUrls = new Map<string, string>();
const dataUrlCache = new Map<string, Promise<string>>();
const blobDataUrlCache = new WeakMap<Blob, Promise<string>>();
const REFERENCE_MAX_EDGE = 2048;
const REFERENCE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_PROXY_PATH = "/api/images/proxy";
const PROXY_IMAGE_TYPES = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);

export type PreparedReferenceImage = ReferenceImage & {
    requestBlob: Blob;
    optimizedForRequest: boolean;
};

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    return storeImageBlob(await downloadImageBlob(input));
}

export async function downloadImageBlob(input: string | Blob) {
    if (input instanceof Blob) return input;
    let directError: unknown;
    try {
        return await fetchImageBlob(input);
    } catch (error) {
        if (error instanceof ImageGenerationError) throw error;
        directError = error;
    }

    if (isProxyableImageUrl(input)) {
        try {
            return await fetchImageBlob(IMAGE_PROXY_PATH, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ url: input }),
            });
        } catch (error) {
            if (error instanceof ImageGenerationError) throw error;
            throw new ImageGenerationError("图片 URL 直连失败，且同源图片代理不可用", {
                failureStage: "result_download",
                kind: explicitCorsError(directError) ? "cors" : "url_download",
                cause: error,
            });
        }
    }

    throw new ImageGenerationError("图片 URL 下载失败，可能受到跨域（CORS）或网络策略限制", {
        failureStage: "result_download",
        kind: explicitCorsError(directError) ? "cors" : "url_download",
        cause: directError,
    });
}

export async function storeImageBlob(blob: Blob): Promise<UploadedImage> {
    if (blob.type && !blob.type.startsWith("image/") && blob.type !== "application/octet-stream") throw new Error("读取图片失败：返回内容不是图片");
    const storageKey = `image:${nanoid()}`;
    try {
        await store.setItem(storageKey, blob);
    } catch (error) {
        const quota = error instanceof DOMException && error.name === "QuotaExceededError";
        throw new ImageGenerationError(quota ? "浏览器图片存储空间已满，请先清理部分本地图片" : "图片未能写入浏览器本地存储", { failureStage: "indexeddb_write", kind: "indexeddb_write", cause: error });
    }
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = await readImageMeta(url);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    try {
        await store.setItem(storageKey, blob);
    } catch (error) {
        throw new ImageGenerationError("图片未能写入浏览器本地存储", { failureStage: "indexeddb_write", kind: "indexeddb_write", cause: error });
    }
    const previousUrl = objectUrls.get(storageKey);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    dataUrlCache.delete(storageKey);
    return url;
}

export async function imageToBlob(image: { url?: string; dataUrl?: string; storageKey?: string; requestBlob?: Blob }) {
    if (image.requestBlob) return image.requestBlob;
    if (image.storageKey) {
        const blob = await getImageBlob(image.storageKey);
        if (blob) return blob;
    }
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url) throw new Error("参考图内容为空");
    return downloadImageBlob(url);
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string; requestBlob?: Blob }) {
    if (image.dataUrl?.startsWith("data:") && !image.requestBlob) return image.dataUrl;
    const cacheKey = image.requestBlob ? undefined : image.storageKey || image.dataUrl || image.url;
    if (cacheKey) {
        const cached = dataUrlCache.get(cacheKey);
        if (cached) return cached;
    }
    const blob = await imageToBlob(image);
    let promise = blobDataUrlCache.get(blob);
    if (!promise) {
        promise = blobToDataUrl(blob);
        blobDataUrlCache.set(blob, promise);
    }
    if (cacheKey) dataUrlCache.set(cacheKey, promise);
    return promise;
}

export async function imageToFile(image: ReferenceImage | PreparedReferenceImage) {
    const blob = await imageToBlob(image);
    return new File([blob], image.name || "reference.png", { type: blob.type || image.type || "image/png" });
}

export async function prepareReferenceImages(references: ReferenceImage[], enabled: boolean): Promise<{ images: PreparedReferenceImage[]; optimization: ImageReferenceOptimization }> {
    const images = await Promise.all(
        references.map(async (image) => {
            const original = await imageToBlob(image);
            if (!enabled) return { ...image, requestBlob: original, optimizedForRequest: false };
            const optimized = await optimizeReferenceBlob(original, image.width, image.height);
            return { ...image, requestBlob: optimized, optimizedForRequest: optimized !== original };
        }),
    );
    return {
        images,
        optimization: { total: images.length, optimized: images.filter((image) => image.optimizedForRequest).length },
    };
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            dataUrlCache.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    await imageLogStore.iterate((log) => {
        collectImageStorageKeys(log, usedKeys);
    });
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

export function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

async function optimizeReferenceBlob(blob: Blob, knownWidth?: number, knownHeight?: number) {
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(blob.type.toLowerCase())) return blob;
    const bitmap = await loadReferenceBitmap(blob);
    const width = knownWidth || bitmap.width;
    const height = knownHeight || bitmap.height;
    if (blob.size <= REFERENCE_MAX_BYTES && Math.max(width, height) <= REFERENCE_MAX_EDGE) {
        bitmap.close?.();
        return blob;
    }

    const scale = Math.min(1, REFERENCE_MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
        bitmap.close?.();
        return blob;
    }
    context.drawImage(bitmap.source, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const outputType = blob.type.toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
    const optimized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, outputType === "image/jpeg" ? 0.9 : undefined));
    return optimized && optimized.size < blob.size ? optimized : blob;
}

async function loadReferenceBitmap(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
    if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob);
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(blob);
    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error("参考图读取失败"));
            element.src = url;
        });
        return { source: image, width: image.naturalWidth, height: image.naturalHeight };
    } finally {
        URL.revokeObjectURL(url);
    }
}

function explicitCorsError(error: unknown) {
    return error instanceof Error && /\bcors\b|cross-origin|access-control-allow-origin/i.test(error.message);
}

async function fetchImageBlob(input: string, init?: RequestInit) {
    const response = await fetch(input, init);
    if (!response.ok) {
        const proxyMessage = input === IMAGE_PROXY_PATH ? await readProxyError(response) : "";
        throw new ImageGenerationError(proxyMessage || `图片 URL 下载失败（${response.status}）`, {
            failureStage: "result_download",
            kind: "url_download",
            httpStatus: response.status,
        });
    }
    if (input === IMAGE_PROXY_PATH) {
        const mimeType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
        if (!PROXY_IMAGE_TYPES.has(mimeType)) {
            throw new ImageGenerationError("图片代理返回的不是受支持的图片", {
                failureStage: "result_download",
                kind: "url_download",
                httpStatus: response.status,
            });
        }
    }
    return response.blob();
}

async function readProxyError(response: Response) {
    try {
        const body = (await response.json()) as { error?: { message?: unknown } };
        return typeof body.error?.message === "string" ? body.error.message : "";
    } catch {
        return "";
    }
}

function isProxyableImageUrl(value: string) {
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}
