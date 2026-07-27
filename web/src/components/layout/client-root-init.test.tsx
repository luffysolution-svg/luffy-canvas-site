import { describe, expect, it } from "vitest";

import { normalizeImportedProvider } from "./client-root-init";

describe("normalizeImportedProvider", () => {
    it("keeps explicitly imported OpenRouter and Seedream providers", () => {
        expect(normalizeImportedProvider("openrouter", "")).toBe("openrouter");
        expect(normalizeImportedProvider("seedream", "")).toBe("seedream");
    });

    it("infers the new providers from their service hosts", () => {
        expect(normalizeImportedProvider("", "https://openrouter.ai/api/v1")).toBe("openrouter");
        expect(normalizeImportedProvider("", "https://ark.cn-beijing.volces.com/api/v3")).toBe("seedream");
        expect(normalizeImportedProvider("", "https://ark.cn-beijing.volcengineapi.com/api/v3")).toBe("seedream");
    });

    it("does not change existing provider inference", () => {
        expect(normalizeImportedProvider("", "https://generativelanguage.googleapis.com")).toBe("gemini");
        expect(normalizeImportedProvider("", "https://dashscope.aliyuncs.com")).toBe("qwen");
        expect(normalizeImportedProvider("", "https://api.openai.com")).toBe("openai");
    });
});
