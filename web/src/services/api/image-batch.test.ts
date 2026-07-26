import { beforeEach, describe, expect, it, vi } from "vitest";

import { prepareReferenceImages, type PreparedReferenceImage } from "@/services/image-storage";
import { ImageGenerationError } from "@/services/api/image-errors";
import { defaultConfig, type AiConfig } from "@/stores/use-config-store";
import type { ImageGenerationOutput, ReferenceImage } from "@/types/image";
import { requestEdit, requestGeneration } from "./image";
import { requestImageBatch } from "./image-batch";

vi.mock("@/services/image-storage", () => ({
    prepareReferenceImages: vi.fn(),
}));

vi.mock("./image", () => ({
    requestEdit: vi.fn(),
    requestGeneration: vi.fn(),
}));

const mockPrepareReferenceImages = vi.mocked(prepareReferenceImages);
const mockRequestEdit = vi.mocked(requestEdit);
const mockRequestGeneration = vi.mocked(requestGeneration);

const reference: ReferenceImage = {
    id: "reference-1",
    name: "reference.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,AA==",
    width: 1024,
    height: 1024,
};

let outputIndex = 0;

function generatedOutput(): ImageGenerationOutput {
    outputIndex += 1;
    return {
        id: `generated-${outputIndex}`,
        status: "generated",
        source: "data_url",
        dataUrl: "data:image/png;base64,AA==",
    };
}

function splitConfig(overrides: Partial<AiConfig> = {}): AiConfig {
    return {
        ...defaultConfig,
        channels: defaultConfig.channels.map((channel) => ({ ...channel, imageBatchMode: "split" as const })),
        count: "3",
        optimizeImageReferences: false,
        ...overrides,
    };
}

function trackedRequest(tracker: { active: number; max: number }) {
    return async () => {
        tracker.active += 1;
        tracker.max = Math.max(tracker.max, tracker.active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        tracker.active -= 1;
        return [generatedOutput()];
    };
}

beforeEach(() => {
    outputIndex = 0;
    mockPrepareReferenceImages.mockReset();
    mockRequestEdit.mockReset();
    mockRequestGeneration.mockReset();
    mockPrepareReferenceImages.mockImplementation(async (references) => ({
        images: references.map((image) => ({ ...image, requestBlob: new Blob(["reference"], { type: image.type }), optimizedForRequest: false })),
        optimization: { total: references.length, optimized: 0 },
    }));
});

describe("requestImageBatch", () => {
    it("limits normal split requests to two globally", async () => {
        const tracker = { active: 0, max: 0 };
        mockRequestGeneration.mockImplementation(trackedRequest(tracker));
        const config = splitConfig();

        const [first, second] = await Promise.all([requestImageBatch(config, "first"), requestImageBatch(config, "second")]);

        expect(first.results).toHaveLength(3);
        expect(second.results).toHaveLength(3);
        expect(mockRequestGeneration).toHaveBeenCalledTimes(6);
        expect(tracker.max).toBe(2);
    });

    it("limits reference-image split requests to one globally", async () => {
        const tracker = { active: 0, max: 0 };
        mockRequestEdit.mockImplementation(trackedRequest(tracker));
        const config = splitConfig({ count: "2" });

        await Promise.all([requestImageBatch(config, "first", [reference]), requestImageBatch(config, "second", [reference])]);

        expect(mockRequestEdit).toHaveBeenCalledTimes(4);
        expect(tracker.max).toBe(1);
    });

    it("limits 4K split requests to one globally", async () => {
        const tracker = { active: 0, max: 0 };
        mockRequestGeneration.mockImplementation(trackedRequest(tracker));
        const config = splitConfig({ count: "2", quality: "high" });

        await Promise.all([requestImageBatch(config, "first"), requestImageBatch(config, "second")]);

        expect(mockRequestGeneration).toHaveBeenCalledTimes(4);
        expect(tracker.max).toBe(1);
    });

    it("prepares references only once and reuses them across a split batch", async () => {
        const preparedReferences: PreparedReferenceImage[] = [{ ...reference, requestBlob: new Blob(["prepared"], { type: "image/png" }), optimizedForRequest: false }];
        mockPrepareReferenceImages.mockResolvedValue({
            images: preparedReferences,
            optimization: { total: 1, optimized: 0 },
        });
        mockRequestEdit.mockImplementation(async () => [generatedOutput()]);
        const config = splitConfig({ count: "4", optimizeImageReferences: true });

        await requestImageBatch(config, "reuse references", [reference]);

        expect(mockPrepareReferenceImages).toHaveBeenCalledOnce();
        expect(mockPrepareReferenceImages).toHaveBeenCalledWith([reference], true);
        expect(mockRequestEdit).toHaveBeenCalledTimes(4);
        for (const call of mockRequestEdit.mock.calls) expect(call[2]).toBe(preparedReferences);
    });

    it("falls back to split requests when an auto batch returns too few images", async () => {
        const config = {
            ...splitConfig({ count: "3" }),
            channels: defaultConfig.channels.map((channel) => ({ ...channel, imageBatchMode: "auto" as const })),
        };
        mockRequestGeneration.mockImplementation(async (requestConfig) => (requestConfig.count === "3" ? [generatedOutput()] : [generatedOutput()]));

        const batch = await requestImageBatch(config, "auto fallback");

        expect(mockRequestGeneration).toHaveBeenCalledTimes(3);
        expect(mockRequestGeneration.mock.calls.map(([requestConfig]) => requestConfig.count)).toEqual(["3", "1", "1"]);
        expect(batch.results).toHaveLength(3);
        expect(batch.results.every((item) => item.status === "fulfilled")).toBe(true);
    });

    it("removes an aborted request while it is still queued", async () => {
        let releaseFirst!: () => void;
        mockRequestEdit.mockImplementation(
            () =>
                new Promise<ImageGenerationOutput[]>((resolve) => {
                    releaseFirst = () => resolve([generatedOutput()]);
                }),
        );
        const config = splitConfig({ count: "1" });
        const first = requestImageBatch(config, "first", [reference]);
        await vi.waitFor(() => expect(mockRequestEdit).toHaveBeenCalledOnce());
        const controller = new AbortController();
        const onStatus = vi.fn();
        const second = requestImageBatch(config, "second", [reference], { signal: controller.signal, onStatus });

        controller.abort();
        const secondResult = await second;
        releaseFirst();
        await first;

        expect(mockRequestEdit).toHaveBeenCalledOnce();
        expect(secondResult.results[0]).toMatchObject({
            status: "rejected",
            reason: expect.objectContaining({ kind: "aborted" }),
        });
        expect(onStatus).not.toHaveBeenCalled();
    });

    it("reports reference download failures as request preparation failures", async () => {
        mockPrepareReferenceImages.mockRejectedValue(new ImageGenerationError("参考图下载失败", { failureStage: "result_download", kind: "url_download" }));

        const batch = await requestImageBatch(splitConfig({ count: "1" }), "prepare failure", [reference]);

        expect(batch.results[0]).toMatchObject({
            status: "rejected",
            reason: expect.objectContaining({ failureStage: "request_prepare", kind: "url_download", resultUnknown: false }),
        });
    });
});
