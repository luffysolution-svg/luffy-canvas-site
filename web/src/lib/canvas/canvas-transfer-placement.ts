import type { Position } from "@/types/canvas";

const DEFAULT_BATCH_GAP = 80;

export function canvasTransferPlacementCenter(center: Position, nodeWidth: number, batchIndex?: number, batchSize?: number, gap = DEFAULT_BATCH_GAP): Position {
    if (batchIndex === undefined || batchSize === undefined || !Number.isInteger(batchIndex) || !Number.isInteger(batchSize) || batchIndex < 0 || batchSize <= 1 || batchIndex >= batchSize) return center;
    const stride = Math.max(0, nodeWidth) + Math.max(0, gap);
    return { x: center.x + (batchIndex - (batchSize - 1) / 2) * stride, y: center.y };
}
