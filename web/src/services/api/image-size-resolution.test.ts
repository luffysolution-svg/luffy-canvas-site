import { describe, expect, it } from "vitest";

import { defaultConfig, encodeChannelModel, type AiConfig, type ApiCallFormat, type ChannelProvider, type ModelChannel } from "@/stores/use-config-store";
import { resolveImageRequestParameters } from "./image";

describe("resolveImageRequestParameters", () => {
    it.each([
        ["1920x1080", "16:9"],
        ["1440x1800", "4:5"],
    ])("accepts common platform pixel size %s without 16-pixel alignment", (size, aspectRatio) => {
        expect(resolveImageRequestParameters(defaultConfig, size)).toEqual({
            requestedSize: size,
            requestedAspectRatio: aspectRatio,
            resolvedSize: size,
            resolvedAspectRatio: aspectRatio,
            mappingKind: "exact",
            warnings: [],
            requiresConfirmation: false,
        });
    });

    it("reports pixel-alignment approximation when a generic ratio becomes dimensions", () => {
        const result = resolveImageRequestParameters(defaultConfig, "16:9");

        expect(result).toMatchObject({
            requestedAspectRatio: "16:9",
            resolvedSize: "1824x1024",
            resolvedAspectRatio: "57:32",
            mappingKind: "same-ratio",
            requiresConfirmation: false,
        });
        expect(result.warnings).not.toHaveLength(0);
    });

    it("marks OpenAI-compatible endpoint support as unverified while retaining the resolved size", () => {
        const result = resolveImageRequestParameters(providerConfig("openai-compatible", "openai", "compatible-image"), "1920x1080");

        expect(result).toMatchObject({
            resolvedSize: "1920x1080",
            resolvedAspectRatio: "16:9",
            mappingKind: "unverified",
            requiresConfirmation: true,
        });
        expect(result.warnings.join("\n")).toContain("无法预先验证");
    });

    it("maps exact Gemini pixels to its aspect-ratio and image-size parameters", () => {
        const result = resolveImageRequestParameters(providerConfig("gemini", "gemini", "gemini-3.1-flash-image"), "1920x1080");

        expect(result).toMatchObject({
            requestedAspectRatio: "16:9",
            resolvedSize: "2K",
            resolvedAspectRatio: "16:9",
            mappingKind: "scaled",
            requiresConfirmation: true,
        });
        expect(result.warnings.join("\n")).toContain("不接收精确像素尺寸");
    });

    it("reports a closest-ratio Gemini mapping", () => {
        const result = resolveImageRequestParameters(providerConfig("gemini", "gemini", "gemini-3-pro-image"), "2.35:1");

        expect(result).toMatchObject({
            requestedAspectRatio: "2.35:1",
            resolvedAspectRatio: "21:9",
            mappingKind: "closest-ratio",
            requiresConfirmation: true,
        });
        expect(result.warnings.join("\n")).toContain("最接近");
    });

    it("preserves a compiled Gemini native size and aspect ratio when the snapshot is resolved again", () => {
        const result = resolveImageRequestParameters({
            ...providerConfig("gemini", "gemini", "gemini-3.1-flash-image"),
            quality: "high",
            size: "2K",
            imageAspectRatio: "16:9",
        });

        expect(result).toMatchObject({
            requestedSize: "2K",
            requestedAspectRatio: "16:9",
            resolvedSize: "2K",
            resolvedAspectRatio: "16:9",
            mappingKind: "exact",
            requiresConfirmation: false,
        });
    });

    it("reports fixed-size Qwen scaling and keeps the existing fixed request size", () => {
        const result = resolveImageRequestParameters(providerConfig("qwen", "qwen", "qwen-image"), "1920x1080");

        expect(result).toMatchObject({
            requestedAspectRatio: "16:9",
            resolvedSize: "1664x928",
            resolvedAspectRatio: "52:29",
            mappingKind: "scaled",
            requiresConfirmation: true,
        });
        expect(result.warnings.join("\n")).toContain("仅支持固定尺寸");
    });

    it("reports a closest-ratio Qwen fixed-size mapping", () => {
        const result = resolveImageRequestParameters(providerConfig("qwen", "qwen", "qwen-image"), "2.35:1");

        expect(result).toMatchObject({
            resolvedSize: "1664x928",
            mappingKind: "closest-ratio",
            requiresConfirmation: true,
        });
    });

    it("keeps Qwen-Image 2.0 exact pixel sizes within its existing pixel range", () => {
        expect(resolveImageRequestParameters(providerConfig("qwen", "qwen", "qwen-image-2.0-pro"), "1440x1800")).toMatchObject({
            resolvedSize: "1440x1800",
            resolvedAspectRatio: "4:5",
            mappingKind: "exact",
            requiresConfirmation: false,
        });
    });

    it("keeps Qwen-Image 2.0 pixel-range validation", () => {
        expect(() => resolveImageRequestParameters(providerConfig("qwen", "qwen", "qwen-image-2.0-pro"), "3840x2160")).toThrow("Qwen-Image 2.0 图像总像素");
    });

    it("makes the legacy Qwen edit size omission explicit", () => {
        const result = resolveImageRequestParameters(providerConfig("qwen", "qwen", "qwen-image-edit"), "1024x1024");

        expect(result).toMatchObject({
            resolvedSize: undefined,
            resolvedAspectRatio: undefined,
            mappingKind: "unverified",
            requiresConfirmation: true,
        });
        expect(result.warnings.join("\n")).toContain("不接收尺寸参数");
    });

    it("maps fixed-size OpenAI image models to their nearest supported request", () => {
        expect(resolveImageRequestParameters(providerConfig("openai", "openai", "gpt-image-1.5"), "1920x1080")).toMatchObject({
            requestedSize: "1920x1080",
            resolvedSize: "1536x1024",
            resolvedAspectRatio: "3:2",
            mappingKind: "closest-ratio",
            requiresConfirmation: true,
        });
    });

    it("keeps GPT Image 2 flexible sizes exact and marks unknown official models unverified", () => {
        expect(resolveImageRequestParameters(providerConfig("openai", "openai", "gpt-image-2"), "1920x1080")).toMatchObject({
            resolvedSize: "1920x1080",
            mappingKind: "exact",
            requiresConfirmation: false,
        });
        expect(resolveImageRequestParameters(providerConfig("openai", "openai", "future-image-model"), "1920x1080")).toMatchObject({
            resolvedSize: "1920x1080",
            mappingKind: "unverified",
            requiresConfirmation: true,
        });
    });
});

function providerConfig(provider: ChannelProvider, apiFormat: ApiCallFormat, model: string): AiConfig {
    const channelId = `${provider}-channel`;
    const modelValue = encodeChannelModel(channelId, model);
    const channel: ModelChannel = {
        id: channelId,
        name: provider,
        provider,
        baseUrl: `https://${provider}.example.test`,
        apiKey: "test-key",
        authType: "bearer",
        apiFormat,
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
        quality: "auto",
    };
}
