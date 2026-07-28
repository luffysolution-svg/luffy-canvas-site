import { describe, expect, it } from "vitest";

import { PLATFORM_PRESET_VERSION } from "../constants";
import type { PlatformOrientation } from "../types";
import { BUILTIN_PLATFORM_PRESETS } from "./platform-presets";

const PROVIDERS = ["openai", "new-api", "openai-compatible", "gemini", "qwen", "custom"].sort();
const PRESET_IDS = [
    "wechat-headline-cover",
    "wechat-secondary-cover",
    "wechat-article-landscape",
    "wechat-knowledge-long",
    "xiaohongshu-note-cover",
    "xiaohongshu-square-card",
    "xiaohongshu-video-cover",
    "douyin-video-cover",
    "douyin-image-post-cover",
    "youtube-thumbnail",
    "youtube-channel-banner",
    "youtube-shorts-keyframe",
    "x-portrait-post",
    "x-square-post",
    "x-landscape-link",
    "x-profile-banner",
    "bilibili-video-cover",
].sort();

function numericRatio(value: string) {
    const [width, height] = value.split(":").map(Number);
    return width / height;
}

function orientationFor(width: number, height: number): PlatformOrientation {
    if (width === height) return "square";
    return width > height ? "landscape" : "portrait";
}

describe("BUILTIN_PLATFORM_PRESETS", () => {
    it("contains the 17 unique built-in preset ids", () => {
        const ids = BUILTIN_PLATFORM_PRESETS.map((preset) => preset.id);

        expect(ids).toHaveLength(17);
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids].sort()).toEqual(PRESET_IDS);
    });

    it("provides every required registry field", () => {
        for (const preset of BUILTIN_PLATFORM_PRESETS) {
            for (const value of [preset.id, preset.platform, preset.platformLabel, preset.contentType, preset.label, preset.description, preset.aspectRatio, preset.quality, preset.outputFormat, preset.subjectPosition, preset.titlePosition]) {
                expect(value.trim(), `${preset.id} has an empty required field`).not.toBe("");
            }

            expect(preset.generationSize.width).toBeGreaterThan(0);
            expect(preset.generationSize.height).toBeGreaterThan(0);
            expect(preset.targetPlatformSize.width).toBeGreaterThan(0);
            expect(preset.targetPlatformSize.height).toBeGreaterThan(0);
            expect(preset.maxTitleLines).toBeGreaterThan(0);
            expect(preset.edgeMargin).toBeGreaterThanOrEqual(0);
            expect(preset.focalScale).toBeGreaterThan(0);
            expect(preset.focalScale).toBeLessThanOrEqual(1);
            expect(preset.promptFragments.length).toBeGreaterThan(0);
            expect(preset.negativeFragments.length).toBeGreaterThan(0);
        }
    });

    it("defines all six provider mappings without claiming static exact support", () => {
        for (const preset of BUILTIN_PLATFORM_PRESETS) {
            expect(Object.keys(preset.providerMappings).sort()).toEqual(PROVIDERS);

            for (const [provider, mapping] of Object.entries(preset.providerMappings)) {
                expect(mapping.requestSize, `${preset.id}/${provider} requestSize`).not.toBe("");
                expect(mapping.requestAspectRatio, `${preset.id}/${provider} requestAspectRatio`).not.toBe("");
                expect(mapping.note, `${preset.id}/${provider} note`).not.toBe("");
            }

            expect(preset.providerMappings.openai.support).toBe("unknown");
            expect(preset.providerMappings.qwen.support).toBe("unknown");
            expect(preset.providerMappings["new-api"].support).toBe("unknown");
            expect(preset.providerMappings["openai-compatible"].support).toBe("unknown");
            expect(preset.providerMappings.custom.support).toBe("unknown");
        }
    });

    it("keeps declared ratios and orientations aligned with both sizes", () => {
        for (const preset of BUILTIN_PLATFORM_PRESETS) {
            const declaredRatio = numericRatio(preset.aspectRatio);
            const generationRatio = preset.generationSize.width / preset.generationSize.height;
            const targetRatio = preset.targetPlatformSize.width / preset.targetPlatformSize.height;

            expect(generationRatio, `${preset.id} generation ratio`).toBeCloseTo(declaredRatio, 2);
            expect(targetRatio, `${preset.id} target ratio`).toBeCloseTo(declaredRatio, 2);
            expect(preset.orientation).toBe(orientationFor(preset.generationSize.width, preset.generationSize.height));
            expect(preset.orientation).toBe(orientationFor(preset.targetPlatformSize.width, preset.targetPlatformSize.height));
        }
    });

    it("keeps safe areas and avoid zones inside percentage bounds", () => {
        for (const preset of BUILTIN_PLATFORM_PRESETS) {
            const { safeArea } = preset;

            expect(safeArea.unit).toBe("percent");
            expect(safeArea.description.trim()).not.toBe("");
            for (const inset of [safeArea.top, safeArea.right, safeArea.bottom, safeArea.left]) {
                expect(inset, `${preset.id} safe-area inset`).toBeGreaterThanOrEqual(0);
                expect(inset, `${preset.id} safe-area inset`).toBeLessThan(100);
            }
            expect(safeArea.top + safeArea.bottom, `${preset.id} vertical safe area`).toBeLessThan(100);
            expect(safeArea.left + safeArea.right, `${preset.id} horizontal safe area`).toBeLessThan(100);

            const zoneIds = new Set<string>();
            for (const zone of preset.avoidZones) {
                expect(zone.id.trim()).not.toBe("");
                expect(zone.label.trim()).not.toBe("");
                expect(zone.unit).toBe("percent");
                expect(zone.x).toBeGreaterThanOrEqual(0);
                expect(zone.y).toBeGreaterThanOrEqual(0);
                expect(zone.width).toBeGreaterThan(0);
                expect(zone.height).toBeGreaterThan(0);
                expect(zone.x + zone.width, `${preset.id}/${zone.id} horizontal bounds`).toBeLessThanOrEqual(100);
                expect(zone.y + zone.height, `${preset.id}/${zone.id} vertical bounds`).toBeLessThanOrEqual(100);
                expect(zoneIds.has(zone.id), `${preset.id} duplicate avoid-zone id ${zone.id}`).toBe(false);
                zoneIds.add(zone.id);
            }
        }
    });

    it("records a recognized source level and the current registry version", () => {
        const sourceLevels = new Set(["official", "industry-recommended", "product-default"]);

        for (const preset of BUILTIN_PLATFORM_PRESETS) {
            expect(sourceLevels.has(preset.sourceLevel), `${preset.id} sourceLevel`).toBe(true);
            expect(preset.version).toBe(PLATFORM_PRESET_VERSION);
            expect(preset.verifiedAt).toMatch(/^\d{4}-\d{2}$/);
        }
    });

    it("uses the explicit 1500×500 generation size for the X profile banner", () => {
        const preset = BUILTIN_PLATFORM_PRESETS.find((item) => item.id === "x-profile-banner");

        expect(preset?.generationSize).toEqual({ width: 1500, height: 500 });
        expect(preset?.targetPlatformSize).toEqual({ width: 1500, height: 500 });
    });
});
