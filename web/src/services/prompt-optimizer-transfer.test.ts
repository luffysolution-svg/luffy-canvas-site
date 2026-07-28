import { beforeEach, describe, expect, it, vi } from "vitest";

import { consumeImagePrompt, stageImagePrompt } from "./prompt-optimizer-transfer";

describe("prompt optimizer transfer", () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.restoreAllMocks();
    });

    it("stages and consumes an image prompt exactly once", () => {
        expect(stageImagePrompt("  一只在窗边晒太阳的橘猫  ")).toBe(true);

        expect(consumeImagePrompt()).toBe("一只在窗边晒太阳的橘猫");
        expect(consumeImagePrompt()).toBe("");
    });

    it("rejects empty prompts and removes stale staged data", () => {
        expect(stageImagePrompt("旧提示词")).toBe(true);
        expect(stageImagePrompt("   ")).toBe(false);
        expect(consumeImagePrompt()).toBe("");
    });

    it("handles unavailable session storage without throwing", () => {
        vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
            throw new Error("storage unavailable");
        });
        expect(stageImagePrompt("提示词")).toBe(false);

        vi.restoreAllMocks();
        vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
            throw new Error("storage unavailable");
        });
        expect(consumeImagePrompt()).toBe("");
    });

    it("still consumes once when session storage cleanup fails", () => {
        expect(stageImagePrompt("只使用一次")).toBe(true);
        vi.spyOn(window.sessionStorage, "removeItem").mockImplementation(() => {
            throw new Error("storage unavailable");
        });

        expect(consumeImagePrompt()).toBe("只使用一次");
        expect(consumeImagePrompt()).toBe("");
    });
});
