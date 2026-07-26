import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImageGenerationError } from "@/services/api/image-errors";
import { downloadImageBlob, imageToDataUrl, setImageBlob, storeImageBlob } from "./image-storage";

const localforageMocks = vi.hoisted(() => {
    const imageStore = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        iterate: vi.fn(),
    };
    const imageLogStore = {
        setItem: vi.fn(),
        getItem: vi.fn(),
        removeItem: vi.fn(),
        iterate: vi.fn(),
    };
    return {
        imageStore,
        imageLogStore,
        createInstance: vi.fn((options: { storeName: string }) => (options.storeName === "image_files" ? imageStore : imageLogStore)),
    };
});

vi.mock("localforage", () => ({
    default: {
        createInstance: localforageMocks.createInstance,
    },
}));

async function captureImageError(operation: Promise<unknown>) {
    try {
        await operation;
        throw new Error("Expected operation to reject");
    } catch (error) {
        expect(error).toBeInstanceOf(ImageGenerationError);
        return error as ImageGenerationError;
    }
}

beforeEach(() => {
    localforageMocks.imageStore.setItem.mockReset();
    localforageMocks.imageStore.setItem.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("remote image downloads", () => {
    it("classifies an explicit CORS failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Blocked by CORS: Access-Control-Allow-Origin is missing")));

        const error = await captureImageError(downloadImageBlob("https://images.example/cors.png"));

        expect(error).toMatchObject({
            failureStage: "result_download",
            kind: "cors",
        });
    });

    it("classifies an opaque network download failure separately from CORS", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        const error = await captureImageError(downloadImageBlob("https://images.example/network.png"));

        expect(error).toMatchObject({
            failureStage: "result_download",
            kind: "url_download",
        });
        expect(error.message).toContain("网络");
    });
});

describe("IndexedDB writes", () => {
    it("keeps indexeddb_write classification for new and existing images", async () => {
        localforageMocks.imageStore.setItem.mockRejectedValue(new Error("IndexedDB unavailable"));
        const blob = new Blob(["image"], { type: "image/png" });

        for (const operation of [storeImageBlob(blob), setImageBlob("image:existing", blob)]) {
            const error = await captureImageError(operation);
            expect(error).toMatchObject({
                failureStage: "indexeddb_write",
                kind: "indexeddb_write",
            });
        }
    });
});

describe("reference conversion cache", () => {
    it("converts the same prepared Blob to a Data URL only once", async () => {
        const blob = new Blob(["reference"], { type: "image/png" });
        const readSpy = vi.spyOn(FileReader.prototype, "readAsDataURL");

        const [first, second] = await Promise.all([imageToDataUrl({ requestBlob: blob }), imageToDataUrl({ requestBlob: blob })]);

        expect(first).toBe(second);
        expect(readSpy).toHaveBeenCalledOnce();
    });
});
