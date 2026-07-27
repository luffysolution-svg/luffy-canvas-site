import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { createCanvasNode, imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { CanvasNodeType, type CanvasCreationSource, type CanvasNodeData, type Position } from "@/types/canvas";

export type PersistedCanvasImage = {
    nodeId: string;
    title: string;
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes?: number;
    mimeType?: string;
    prompt?: string;
    remoteUrl?: string;
    creationSource?: CanvasCreationSource;
};

export function createPersistedImageNode(image: PersistedCanvasImage, center: Position): CanvasNodeData {
    const size = fitNodeSize(image.width, image.height);
    return {
        ...createCanvasNode(CanvasNodeType.Image, center, {
            ...imageMetadata({
                url: image.url,
                storageKey: image.storageKey,
                width: image.width,
                height: image.height,
                bytes: image.bytes || 0,
                mimeType: image.mimeType || "image/png",
            }),
            prompt: image.prompt,
            model: image.creationSource?.modelId,
            size: image.creationSource?.size,
            quality: image.creationSource?.quality,
            background: image.creationSource?.background,
            remoteUrl: image.remoteUrl,
            generationStatus: "stored",
            creationSource: image.creationSource,
        }),
        id: image.nodeId,
        title: image.title || "创作候选图",
        position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        width: size.width,
        height: size.height,
    };
}
