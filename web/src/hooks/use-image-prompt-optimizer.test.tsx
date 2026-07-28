import { App } from "antd";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OptimizeImagePromptOptions } from "@/services/api/prompt-optimizer";
import { useImagePromptOptimizer } from "./use-image-prompt-optimizer";

const mocks = vi.hoisted(() => ({
    addVersion: vi.fn(),
    clearHistory: vi.fn(),
    openConfigDialog: vi.fn(),
    optimizeImagePrompt: vi.fn(),
    removeVersion: vi.fn(),
    updateConfig: vi.fn(),
}));

vi.mock("@/services/api/prompt-optimizer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/services/api/prompt-optimizer")>()),
    optimizeImagePrompt: mocks.optimizeImagePrompt,
}));

vi.mock("@/stores/use-config-store", () => {
    const config = { textModel: "channel::text-model" };
    const state = {
        config,
        updateConfig: mocks.updateConfig,
        isAiConfigReady: () => true,
        openConfigDialog: mocks.openConfigDialog,
    };
    return {
        modelMatchesCapability: () => true,
        selectableModelsByCapability: () => [config.textModel],
        useConfigStore: (selector: (value: typeof state) => unknown) => selector(state),
        useEffectiveConfig: () => config,
    };
});

vi.mock("@/stores/use-prompt-optimizer-store", () => {
    const state = {
        versions: [],
        hydrated: true,
        addVersion: mocks.addVersion,
        removeVersion: mocks.removeVersion,
        clearHistory: mocks.clearHistory,
    };
    return {
        usePromptOptimizerStore: (selector: (value: typeof state) => unknown) => selector(state),
    };
});

describe("useImagePromptOptimizer", () => {
    beforeEach(() => vi.clearAllMocks());

    it("aborts the active request and ignores late stream and completion updates", async () => {
        const response = deferred<string>();
        let requestOptions: OptimizeImagePromptOptions | undefined;
        mocks.optimizeImagePrompt.mockImplementation((options: OptimizeImagePromptOptions) => {
            requestOptions = options;
            return response.promise;
        });
        const { result } = renderHook(() => useImagePromptOptimizer(), { wrapper: TestApp });

        act(() => result.current.setOriginalPrompt("一只戴草帽的猫"));
        let request: Promise<void> | undefined;
        act(() => {
            request = result.current.runOptimization(false);
        });

        await waitFor(() => expect(result.current.status).toBe("running"));
        act(() => requestOptions?.onDelta?.("流式片段"));
        expect(result.current.optimizedPrompt).toBe("流式片段");

        act(() => result.current.cancelOptimization(false));
        expect(requestOptions?.signal?.aborted).toBe(true);
        expect(result.current.status).toBe("cancelled");

        act(() => requestOptions?.onDelta?.("迟到的流式内容"));
        await act(async () => {
            response.resolve("迟到的最终结果");
            await request;
        });

        expect(result.current.optimizedPrompt).toBe("流式片段");
        expect(result.current.status).toBe("cancelled");
        expect(mocks.addVersion).not.toHaveBeenCalled();
    });
});

function TestApp({ children }: PropsWithChildren) {
    return <App>{children}</App>;
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
