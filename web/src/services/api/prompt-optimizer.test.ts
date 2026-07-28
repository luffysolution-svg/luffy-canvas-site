import { describe, expect, it } from "vitest";

import { buildImagePromptOptimizationMessages, normalizeOptimizedPrompt } from "./prompt-optimizer";

describe("prompt optimizer", () => {
    it("builds an image-specific optimization request and preserves user constraints", () => {
        const messages = buildImagePromptOptimizationMessages({
            prompt: "制作 16:9 封面，标题必须是“AI 工具箱”，不要人物，保留 {{topic}}",
            mode: "poster",
            requirements: "主色调为深色",
        });

        expect(messages).toHaveLength(2);
        expect(String(messages[0].content)).toContain("逐字保留");
        expect(String(messages[0].content)).toContain("标题安全区");
        expect(String(messages[1].content)).toContain("16:9");
        expect(String(messages[1].content)).toContain("{{topic}}");
        expect(String(messages[1].content)).toContain("主色调为深色");
    });

    it("builds an iterative request from the current version and feedback", () => {
        const messages = buildImagePromptOptimizationMessages({
            prompt: "一只猫",
            mode: "general",
            previousPrompt: "一只坐在窗边的橘猫",
            feedback: "减少背景细节",
        });

        expect(String(messages[1].content)).toContain("当前优化版本");
        expect(String(messages[1].content)).toContain("减少背景细节");
    });

    it("normalizes fenced, prefixed and JSON responses", () => {
        expect(normalizeOptimizedPrompt("```text\n优化后的提示词：一只橘猫\n```")).toBe("一只橘猫");
        expect(normalizeOptimizedPrompt('{"optimizedPrompt":"电影感城市夜景"}')).toBe("电影感城市夜景");
    });
});
