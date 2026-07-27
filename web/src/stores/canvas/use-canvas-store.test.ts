import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
}));

vi.mock("@/lib/localforage-storage", () => ({ localForageStorage: storage }));

import { flushCanvasStorePersistence, useCanvasStore } from "./use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

describe("useCanvasStore persistence", () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await useCanvasStore.persist.rehydrate();
        useCanvasStore.setState({ hydrated: true, projects: [] });
    });

    it("flushes an inserted node before a transfer command is acknowledged", async () => {
        const projectId = useCanvasStore.getState().createProject("插入目标");
        const node: CanvasNodeData = {
            id: "image-from-creation",
            type: CanvasNodeType.Image,
            title: "候选图",
            position: { x: 0, y: 0 },
            width: 320,
            height: 240,
            metadata: { storageKey: "image:stored", content: "blob:stored", status: "success" },
        };
        useCanvasStore.getState().updateProject(projectId, { nodes: [node] });

        await flushCanvasStorePersistence();

        expect(storage.setItem).toHaveBeenCalledWith("infinite-canvas:canvas_store", expect.stringContaining('"id":"image-from-creation"'));
    });
});
