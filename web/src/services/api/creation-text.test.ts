import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultConfig, encodeChannelModel, type AiConfig } from "@/stores/use-config-store";
import type { CreativeBrief, PromptHardConstraints } from "@/types/creation";
import { requestImageQuestion } from "./image";
import { analyzeCreationContent, generateCreationPromptVersions, requestCreationText } from "./creation-text";

vi.mock("./image", () => ({ requestImageQuestion: vi.fn() }));

const mockRequestImageQuestion = vi.mocked(requestImageQuestion);

function textConfig(): AiConfig {
    const imageModel = encodeChannelModel("default", "gpt-image-2");
    const textModel = encodeChannelModel("default", "gpt-5.5");
    return { ...defaultConfig, model: imageModel, imageModel, textModel };
}

beforeEach(() => {
    mockRequestImageQuestion.mockReset();
    mockRequestImageQuestion.mockResolvedValue('{"ok":true}');
});

describe("creation text service", () => {
    it("always calls the explicitly configured text model", async () => {
        const config = textConfig();
        const signal = new AbortController().signal;
        const onDelta = vi.fn();
        const messages = [{ role: "user" as const, content: "分析这段内容" }];

        await requestCreationText({ config, messages, signal, onDelta });

        expect(mockRequestImageQuestion).toHaveBeenCalledWith({ ...config, model: config.textModel }, messages, onDelta, { signal });
    });

    it("rejects a missing text model instead of falling back to the image model", async () => {
        await expect(requestCreationText({ config: { ...textConfig(), textModel: "" }, messages: [{ role: "user", content: "test" }] })).rejects.toThrow("请先配置文本模型");
        expect(mockRequestImageQuestion).not.toHaveBeenCalled();
    });

    it("returns raw analysis output for the schema layer", async () => {
        mockRequestImageQuestion.mockResolvedValueOnce("raw-analysis-json");

        const result = await analyzeCreationContent({ config: textConfig(), sourceContent: "一篇文章", platform: "xiaohongshu", width: 1080, height: 1440, aspectRatio: "3:4", scene: "知识卡" });

        expect(result).toBe("raw-analysis-json");
        const messages = mockRequestImageQuestion.mock.calls[0][1];
        expect(messages[0]).toMatchObject({ role: "system" });
        expect(messages[1]).toMatchObject({ role: "user" });
        expect(String(messages[1].content)).toContain("xiaohongshu");
        expect(String(messages[1].content)).toContain("一篇文章");
    });

    it("builds prompt-version input without parsing the response", async () => {
        await generateCreationPromptVersions({
            config: textConfig(),
            brief: { title: "主题" } as CreativeBrief,
            originalPrompt: "原始提示词",
            versionCount: 20,
            styles: ["minimalist"],
            hardConstraints: { aspectRatio: "3:4" } as PromptHardConstraints,
        });

        const userMessage = mockRequestImageQuestion.mock.calls[0][1][1];
        expect(String(userMessage.content)).toContain("minimalist");
        expect(String(userMessage.content)).toContain("原始提示词");
        expect(String(userMessage.content)).toContain('"aspectRatio":"3:4"');
    });
});
