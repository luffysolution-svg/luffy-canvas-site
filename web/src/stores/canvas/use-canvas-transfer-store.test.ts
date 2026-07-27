import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
}));

vi.mock("@/lib/localforage-storage", () => ({ localForageStorage: storage }));

import { resetInterruptedCanvasTransfers, useCanvasTransferStore, type CanvasImageInsertCommand } from "./use-canvas-transfer-store";

describe("useCanvasTransferStore", () => {
    beforeEach(() => {
        useCanvasTransferStore.setState({ hydrated: true, commands: [] });
    });

    it("queues one project-scoped command and lets it be consumed only once", () => {
        const command = useCanvasTransferStore.getState().queueInsert({
            projectId: "canvas-1",
            creationProjectId: "creation-1",
            nodeId: "image-1",
            title: "候选图",
            storageKey: "image:stored",
            creationSource: { creationProjectId: "wrong-project", candidateId: "candidate-1", generatedImageId: "generated-1" },
        });

        expect(command).toMatchObject({
            projectId: "canvas-1",
            creationProjectId: "creation-1",
            nodeId: "image-1",
            status: "queued",
            creationSource: { creationProjectId: "creation-1", candidateId: "candidate-1", generatedImageId: "generated-1" },
        });
        expect(useCanvasTransferStore.getState().consume("canvas-2")).toBeNull();
        expect(useCanvasTransferStore.getState().consume("canvas-1")).toMatchObject({ id: command.id, status: "consuming", attempts: 1 });
        expect(useCanvasTransferStore.getState().consume("canvas-1")).toBeNull();
        useCanvasTransferStore.getState().release(command.id);
        expect(useCanvasTransferStore.getState().commands[0]).toMatchObject({ status: "queued" });
        expect(useCanvasTransferStore.getState().consume("canvas-1")).toMatchObject({ attempts: 2 });

        useCanvasTransferStore.getState().complete(command.id);
        expect(useCanvasTransferStore.getState().commands[0]).toMatchObject({ status: "completed", error: undefined });
    });

    it("consumes one batch by ascending batchIndex even though commands are prepended", () => {
        for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
            useCanvasTransferStore.getState().queueInsert({
                projectId: "canvas-1",
                creationProjectId: "creation-1",
                batchId: "deck-1",
                batchIndex,
                batchSize: 3,
                storageKey: `image:stored-${batchIndex}`,
                creationSource: { generatedImageId: `generated-${batchIndex}` },
            });
        }

        expect(useCanvasTransferStore.getState().commands.map((command) => command.batchIndex)).toEqual([2, 1, 0]);
        for (const batchIndex of [0, 1, 2]) {
            const command = useCanvasTransferStore.getState().consume("canvas-1");
            expect(command).toMatchObject({ batchId: "deck-1", batchIndex, batchSize: 3, status: "consuming" });
            useCanvasTransferStore.getState().complete(command!.id);
        }
        expect(useCanvasTransferStore.getState().consume("canvas-1")).toBeNull();
    });

    it("rejects incomplete batch metadata", () => {
        expect(() =>
            useCanvasTransferStore.getState().queueInsert({
                projectId: "canvas-1",
                creationProjectId: "creation-1",
                batchId: "deck-1",
                storageKey: "image:stored",
                creationSource: { generatedImageId: "generated-1" },
            }),
        ).toThrow("批量插入参数无效");
    });

    it("records insertion failures", () => {
        const command = useCanvasTransferStore.getState().queueInsert({ projectId: "canvas-1", creationProjectId: "creation-1", storageKey: "image:missing", creationSource: { generatedImageId: "generated-1" } });
        useCanvasTransferStore.getState().consume("canvas-1");
        useCanvasTransferStore.getState().fail(command.id, "图片不存在");

        expect(useCanvasTransferStore.getState().commands[0]).toMatchObject({ status: "failed", error: "图片不存在" });
    });

    it("rejects images that have not been persisted", () => {
        expect(() => useCanvasTransferStore.getState().queueInsert({ projectId: "canvas-1", creationProjectId: "creation-1", storageKey: "", creationSource: { generatedImageId: "generated-1" } })).toThrow("图片必须先保存到本地");
        expect(useCanvasTransferStore.getState().commands).toHaveLength(0);
    });

    it("rejects new commands until hydration finishes", () => {
        useCanvasTransferStore.setState({ hydrated: false });
        expect(() => useCanvasTransferStore.getState().queueInsert({ projectId: "canvas-1", creationProjectId: "creation-1", storageKey: "image:stored", creationSource: { generatedImageId: "generated-1" } })).toThrow("插入队列尚未加载完成");
        expect(useCanvasTransferStore.getState().commands).toHaveLength(0);
    });

    it("requeues a command interrupted by a refresh", () => {
        const command = {
            id: "command-1",
            kind: "insert_image",
            status: "consuming",
            projectId: "canvas-1",
            creationProjectId: "creation-1",
            nodeId: "image-1",
            title: "候选图",
            storageKey: "image:stored",
            creationSource: { creationProjectId: "creation-1", generatedImageId: "generated-1" },
            attempts: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        } satisfies CanvasImageInsertCommand;

        expect(resetInterruptedCanvasTransfers([command])[0]).toMatchObject({ status: "queued", attempts: 1 });
    });
});
