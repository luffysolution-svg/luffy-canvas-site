import { getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { uploadImage } from "@/services/image-storage";
import type { ImageGenerationOutput } from "@/types/image";

import type { GeneratedImage } from "./types";

export async function persistGenerationOutput(output: ImageGenerationOutput, durationMs: number): Promise<GeneratedImage> {
    const base: GeneratedImage = {
        id: output.id,
        durationMs,
        mimeType: output.mimeType,
        expiresAt: output.expiresAt,
        providerTaskId: output.providerTaskId,
        providerRequestId: output.providerRequestId,
    };
    if (output.source === "remote_url") {
        const meta = await readImageMeta(output.remoteUrl).catch(() => null);
        return {
            ...base,
            remoteUrl: output.remoteUrl,
            width: meta?.width,
            height: meta?.height,
            mimeType: output.mimeType || meta?.mimeType,
        };
    }

    try {
        const stored = await uploadImage(output.dataUrl);
        return {
            ...base,
            dataUrl: stored.url,
            storageKey: stored.storageKey,
            width: stored.width,
            height: stored.height,
            bytes: stored.bytes,
            mimeType: stored.mimeType,
        };
    } catch (error) {
        const meta = await readImageMeta(output.dataUrl).catch(() => ({ width: undefined, height: undefined, mimeType: output.mimeType }));
        return {
            ...base,
            dataUrl: output.dataUrl,
            width: meta.width,
            height: meta.height,
            bytes: getDataUrlByteSize(output.dataUrl),
            mimeType: output.mimeType || meta.mimeType,
            failureStage: "indexeddb_write",
            persistenceError: error instanceof Error ? error.message : "图片未能写入浏览器本地存储",
        };
    }
}
