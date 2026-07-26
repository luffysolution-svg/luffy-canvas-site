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
    it("uses the direct response without calling the proxy", async () => {
        const image = new Blob(["image"], { type: "image/png" });
        const fetchMock = vi.fn().mockResolvedValue(new Response(image, { headers: { "content-type": image.type } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(downloadImageBlob("https://images.example/direct.png")).resolves.toEqual(image);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("falls back to the same-origin proxy after an explicit CORS failure", async () => {
        const image = new Blob(["image"], { type: "image/png" });
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new TypeError("Blocked by CORS: Access-Control-Allow-Origin is missing"))
            .mockResolvedValueOnce(new Response(image, { headers: { "content-type": image.type } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(downloadImageBlob("https://images.example/cors.png")).resolves.toEqual(image);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/images/proxy",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ url: "https://images.example/cors.png" }),
            }),
        );
    });

    it("falls back to the same-origin proxy after a direct HTTP error", async () => {
        const image = new Blob(["image"], { type: "image/png" });
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response("", { status: 403 }))
            .mockResolvedValueOnce(new Response(image, { headers: { "content-type": image.type } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(downloadImageBlob("https://images.example/forbidden.png")).resolves.toEqual(image);
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/images/proxy",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ url: "https://images.example/forbidden.png" }),
            }),
        );
    });

    it("returns the proxy error when the host is not configured", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockRejectedValueOnce(new TypeError("Blocked by CORS: Access-Control-Allow-Origin is missing"))
                .mockResolvedValueOnce(
                    Response.json({ error: { code: "proxy_not_configured", message: "图片代理尚未配置可访问的结果域名" } }, { status: 503 }),
                ),
        );

        const error = await captureImageError(downloadImageBlob("https://images.example/cors.png"));

        expect(error).toMatchObject({
            failureStage: "result_download",
            kind: "url_download",
            httpStatus: 503,
        });
        expect(error.message).toBe("图片代理尚未配置可访问的结果域名");
    });

    it("rejects an HTML SPA fallback from a missing proxy route", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockRejectedValueOnce(new TypeError("Failed to fetch"))
                .mockResolvedValueOnce(new Response("<html></html>", { headers: { "content-type": "text/html" } })),
        );

        const error = await captureImageError(downloadImageBlob("https://images.example/cors.png"));

        expect(error).toMatchObject({
            failureStage: "result_download",
            kind: "url_download",
            httpStatus: 200,
        });
        expect(error.message).toContain("不是受支持的图片");
    });

    it("classifies a direct and proxy network failure separately from CORS", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

        const error = await captureImageError(downloadImageBlob("https://images.example/network.png"));

        expect(error).toMatchObject({
            failureStage: "result_download",
            kind: "url_download",
        });
        expect(error.message).toContain("代理");
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
