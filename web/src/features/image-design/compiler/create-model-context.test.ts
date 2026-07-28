import { describe, expect, it } from "vitest";

import { defaultConfig, encodeChannelModel, type AiConfig, type ModelChannel } from "@/stores/use-config-store";

import { platformPresetById } from "../registry/platform-presets";
import { createImageModelContext } from "./create-model-context";

describe("createImageModelContext", () => {
    it("maps an oversized platform pixel target to a same-ratio Qwen request without crashing", () => {
        const preset = platformPresetById("youtube-thumbnail");
        const context = createImageModelContext(qwenConfig("qwen-image-2.0-pro"), preset);

        expect(context.requestedSize).toBe("3840x2160");
        expect(context.requestedAspectRatio).toBe("16:9");
        expect(context.resolvedSize).toMatch(/^\d+x\d+$/);
        expect(context.resolvedSize).not.toBe(context.requestedSize);
        expect(context.mappingSupport).toBe("same-ratio");
        expect(context.mappingNote).toContain("同比例兼容请求");
    });

    it("lets an explicit Skill ratio control the request when no platform preset is selected", () => {
        const context = createImageModelContext(qwenConfig("qwen-image-2.0-pro"), undefined, "3:4");

        expect(context.requestedSize).toBe("3:4");
        expect(context.requestedAspectRatio).toBe("3:4");
        expect(context.resolvedSize).toMatch(/^\d+x\d+$/);
        expect(context.resolvedAspectRatio).toBeDefined();
        expect(Number(context.resolvedAspectRatio!.split(":")[0]) / Number(context.resolvedAspectRatio!.split(":")[1])).toBeCloseTo(3 / 4, 2);
        expect(context.validationError).toBeUndefined();
    });

    it.each([
        ["portrait-3-4", "3:4"],
        ["square", "1:1"],
        ["portrait-2-3", "2:3"],
        ["landscape", "16:9"],
        ["portrait", "9:16"],
    ])("normalizes the semantic Skill aspect %s before provider resolution", (value, expected) => {
        const context = createImageModelContext(qwenConfig("qwen-image-2.0-pro"), undefined, value);

        expect(context.requestedSize).toBe(expected);
        expect(context.requestedAspectRatio).toBe(expected);
        expect(context.validationError).toBeUndefined();
    });

    it("keeps unknown reference capability tri-state while recognizing known models", () => {
        expect(createImageModelContext(openAiConfig("custom-compatible-image")).supportsReferenceImages).toBeUndefined();
        expect(createImageModelContext(openAiConfig("dall-e-3")).supportsReferenceImages).toBe(false);
        expect(createImageModelContext(openAiConfig("gpt-image-1")).supportsReferenceImages).toBe(true);
    });

    it("reports an invalid custom Skill size without crashing the workbench", () => {
        const context = createImageModelContext(qwenConfig("qwen-image-2.0-pro"), undefined, "not-a-size");

        expect(context.validationError).toContain("格式不支持");
        expect(context.mappingRequiresConfirmation).toBe(true);
        expect(context.mappingNote).toContain("not-a-size");
    });

    it("does not throw when both an extreme platform size and its ratio are invalid", () => {
        const source = platformPresetById("youtube-thumbnail");
        expect(source).toBeDefined();
        const invalidPreset = {
            ...source!,
            generationSize: { width: Number.MAX_VALUE, height: 1 },
            aspectRatio: `${"9".repeat(400)}:1`,
        };

        expect(() => createImageModelContext(qwenConfig("qwen-image-2.0-pro"), invalidPreset)).not.toThrow();
        const context = createImageModelContext(qwenConfig("qwen-image-2.0-pro"), invalidPreset);

        expect(context.validationError).toBeTruthy();
        expect(context.mappingRequiresConfirmation).toBe(true);
        expect(context.mappingSupport).toBe("unknown");
    });
});

function qwenConfig(model: string): AiConfig {
    const channelId = "qwen-image-test";
    const modelValue = encodeChannelModel(channelId, model);
    const channel: ModelChannel = {
        id: channelId,
        name: "Qwen",
        provider: "qwen",
        baseUrl: "https://dashscope.example.test",
        apiKey: "test-key",
        authType: "bearer",
        apiFormat: "qwen",
        imageResponseFormat: "auto",
        imageBatchMode: "auto",
        models: [{ name: model, capabilities: ["image"] }],
    };
    return {
        ...defaultConfig,
        channels: [channel],
        models: [modelValue],
        model: modelValue,
        imageModel: modelValue,
        quality: "high",
    };
}

function openAiConfig(model: string): AiConfig {
    const channelId = "openai-image-test";
    const modelValue = encodeChannelModel(channelId, model);
    const channel: ModelChannel = {
        id: channelId,
        name: "OpenAI compatible",
        provider: "openai",
        baseUrl: "https://api.example.test/v1",
        apiKey: "test-key",
        authType: "bearer",
        apiFormat: "openai",
        imageResponseFormat: "b64_json",
        imageBatchMode: "native",
        models: [{ name: model, capabilities: ["image"] }],
    };
    return {
        ...defaultConfig,
        channels: [channel],
        models: [modelValue],
        model: modelValue,
        imageModel: modelValue,
    };
}
