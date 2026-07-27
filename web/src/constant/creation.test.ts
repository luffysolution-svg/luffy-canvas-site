import { describe, expect, it } from "vitest";

import {
    SOCIAL_PLATFORM_DEFAULTS,
    SOCIAL_PLATFORM_OPTIONS,
    SOCIAL_PLATFORM_PRESET_IDS,
    SOCIAL_PLATFORM_PRESET_OPTIONS,
    SOCIAL_PLATFORM_PRESETS,
    resolveSocialPlatformPreset,
    socialPlatformPreset,
} from "./creation";

describe("social platform presets", () => {
    it("集中保存五个平台的 canonical 规格并保留平台选项", () => {
        expect(SOCIAL_PLATFORM_PRESETS).toHaveLength(5);
        expect(SOCIAL_PLATFORM_PRESETS.map((preset) => preset.id)).toEqual([...SOCIAL_PLATFORM_PRESET_IDS]);
        expect(SOCIAL_PLATFORM_OPTIONS.map((option) => option.value)).toEqual(["wechat", "xiaohongshu", "x", "bilibili", "douyin"]);
        expect(SOCIAL_PLATFORM_PRESET_OPTIONS.map((option) => option.value)).toEqual([...SOCIAL_PLATFORM_PRESET_IDS]);
    });

    it("同时接受 canonical preset ID 和旧平台 key", () => {
        expect(resolveSocialPlatformPreset("xiaohongshu-post")).toBe(SOCIAL_PLATFORM_DEFAULTS.xiaohongshu);
        expect(resolveSocialPlatformPreset("xiaohongshu")).toBe(SOCIAL_PLATFORM_DEFAULTS.xiaohongshu);
        expect(socialPlatformPreset("wechat")).toBe(SOCIAL_PLATFORM_DEFAULTS.wechat);
        expect(resolveSocialPlatformPreset("missing")).toBeUndefined();
    });

    it("每个安全区都落在对应画板内部", () => {
        SOCIAL_PLATFORM_PRESETS.forEach((preset) => {
            expect(preset.safeArea.top + preset.safeArea.bottom).toBeLessThan(preset.height);
            expect(preset.safeArea.left + preset.safeArea.right).toBeLessThan(preset.width);
            expect(Object.values(preset.safeArea).every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
            expect(preset.notes.length).toBeGreaterThan(0);
        });
    });
});
