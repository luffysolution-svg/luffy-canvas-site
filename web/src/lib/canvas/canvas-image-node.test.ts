import { describe, expect, it } from "vitest";

import { createPersistedImageNode } from "./canvas-image-node";

describe("createPersistedImageNode", () => {
    it("keeps the source ratio, centers the node and preserves creation provenance", () => {
        const node = createPersistedImageNode(
            {
                nodeId: "image-from-creation",
                title: "候选图",
                url: "blob:stored-image",
                storageKey: "image:stored",
                width: 1200,
                height: 600,
                bytes: 42,
                mimeType: "image/webp",
                prompt: "测试提示词",
                creationSource: {
                    creationProjectId: "creation-1",
                    generatedImageId: "candidate-1",
                    cardDeckId: "deck-1",
                    cardPageId: "page-2",
                    pageIndex: 1,
                    styleId: "style-1",
                    sourceImageId: "source-1",
                    promptVersionId: "prompt-1",
                    modelId: "image-model",
                    size: "2:1",
                    quality: "high",
                    background: "transparent",
                },
            },
            { x: 100, y: 200 },
        );

        expect(node).toMatchObject({
            id: "image-from-creation",
            title: "候选图",
            width: 640,
            height: 320,
            position: { x: -220, y: 40 },
            metadata: {
                content: "blob:stored-image",
                storageKey: "image:stored",
                naturalWidth: 1200,
                naturalHeight: 600,
                bytes: 42,
                mimeType: "image/webp",
                prompt: "测试提示词",
                model: "image-model",
                size: "2:1",
                quality: "high",
                background: "transparent",
                generationStatus: "stored",
                creationSource: {
                    creationProjectId: "creation-1",
                    generatedImageId: "candidate-1",
                    cardDeckId: "deck-1",
                    cardPageId: "page-2",
                    pageIndex: 1,
                    styleId: "style-1",
                    sourceImageId: "source-1",
                    promptVersionId: "prompt-1",
                    modelId: "image-model",
                },
            },
        });
    });
});
