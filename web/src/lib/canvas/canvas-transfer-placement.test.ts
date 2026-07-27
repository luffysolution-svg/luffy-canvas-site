import { describe, expect, it } from "vitest";

import { canvasTransferPlacementCenter } from "./canvas-transfer-placement";

describe("canvasTransferPlacementCenter", () => {
    it("keeps a single transfer at the current canvas center", () => {
        const center = { x: 500, y: 300 };

        expect(canvasTransferPlacementCenter(center, 640)).toBe(center);
        expect(canvasTransferPlacementCenter(center, 640, 0, 1)).toBe(center);
    });

    it("centers an odd batch and leaves a fixed gap between nodes", () => {
        const center = { x: 500, y: 300 };

        expect([0, 1, 2].map((batchIndex) => canvasTransferPlacementCenter(center, 640, batchIndex, 3))).toEqual([
            { x: -220, y: 300 },
            { x: 500, y: 300 },
            { x: 1220, y: 300 },
        ]);
    });

    it("centers an even batch symmetrically", () => {
        const center = { x: 500, y: 300 };

        expect([0, 1].map((batchIndex) => canvasTransferPlacementCenter(center, 320, batchIndex, 2))).toEqual([
            { x: 300, y: 300 },
            { x: 700, y: 300 },
        ]);
    });
});
