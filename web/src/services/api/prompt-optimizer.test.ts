import { describe, expect, it } from "vitest";

import { defaultConfig } from "@/stores/use-config-store";
import { buildImagePromptOptimizationMessages, normalizeOptimizedPrompt, optimizeImagePrompt, type ImagePromptOptimizationMode } from "./prompt-optimizer";

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

    it.each<[ImagePromptOptimizationMode, string]>([
        ["general", "通用生图优化策略"],
        ["chinese", "中文模型优化策略"],
        ["photography", "摄影写实优化策略"],
        ["poster", "海报与封面优化策略"],
    ])("uses the %s mode strategy", (mode, instruction) => {
        const messages = buildImagePromptOptimizationMessages({ prompt: "一只猫", mode });
        expect(String(messages[0].content)).toContain(instruction);
    });

    it("normalizes plain text and title prefixes", () => {
        expect(normalizeOptimizedPrompt("一只橘猫")).toBe("一只橘猫");
        expect(normalizeOptimizedPrompt("优化结果：电影感城市夜景")).toBe("电影感城市夜景");
    });

    it("unwraps a complete code block", () => {
        expect(normalizeOptimizedPrompt("```text\n优化后的提示词：一只橘猫\n```")).toBe("一只橘猫");
        expect(normalizeOptimizedPrompt('```json\n{"prompt":"电影感城市夜景"}\n```')).toBe("电影感城市夜景");
    });

    it.each([
        ['"电影感城市夜景"', "电影感城市夜景"],
        ['{"optimizedPrompt":"电影感城市夜景"}', "电影感城市夜景"],
        ['{"optimized_prompt":"电影感城市夜景"}', "电影感城市夜景"],
        ['{"prompt":"电影感城市夜景"}', "电影感城市夜景"],
        ['{"content":"电影感城市夜景"}', "电影感城市夜景"],
        ['{"result":"电影感城市夜景"}', "电影感城市夜景"],
        ['{"text":"电影感城市夜景"}', "电影感城市夜景"],
        ['{"output_text":"电影感城市夜景"}', "电影感城市夜景"],
    ])("normalizes JSON response %s", (response, expected) => {
        expect(normalizeOptimizedPrompt(response)).toBe(expected);
    });

    it.each(["", "   ", "null", "{}", "[]", '""', '{"content":null}', "没有返回内容", "优化结果：没有返回内容"])("rejects an empty response %j", (response) => {
        expect(() => normalizeOptimizedPrompt(response)).toThrow("文本模型没有返回有效的优化结果");
    });

    it("validates an empty prompt before model configuration", async () => {
        await expect(optimizeImagePrompt({ config: { ...defaultConfig, textModel: "" }, prompt: "   ", mode: "general" })).rejects.toThrow("请输入需要优化的提示词");
    });

    it("requires a configured text model", async () => {
        await expect(optimizeImagePrompt({ config: { ...defaultConfig, textModel: "" }, prompt: "一只猫", mode: "general" })).rejects.toThrow("请先配置文本模型");
    });

    it("rejects a model without text capability", async () => {
        await expect(optimizeImagePrompt({ config: { ...defaultConfig, textModel: defaultConfig.imageModel }, prompt: "一只猫", mode: "general" })).rejects.toThrow("请选择具备文本能力的模型");
    });
});
