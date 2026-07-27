import { describe, expect, it } from "vitest";

import { resolveSocialPlatformPreset, SOCIAL_PLATFORM_PRESET_IDS } from "@/constant/creation";
import type { CreationCardPage } from "@/types/creation";
import { buildCardRenderPlan, computeCoverCrop, wrapCardText, type CardTextPrimitive } from "./card-render";

const page: CreationCardPage = {
    id: "page-1",
    title: "把复杂内容讲清楚",
    body: "用稳定的信息层级组织标题、正文与视觉线索，让读者在几秒内理解重点。",
    layout: "cover",
    revision: 1,
    status: "stored",
    reviewStatus: "approved",
    imageId: "image-1",
    imageHistoryIds: ["image-1"],
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
};

describe("card-render", () => {
    it("为五个平台生成精确规格且不把安全区加入渲染计划", () => {
        const expected = {
            "wechat-cover": [900, 383],
            "xiaohongshu-post": [1080, 1440],
            "x-landscape": [1200, 675],
            "bilibili-cover": [1146, 717],
            "douyin-cover": [1080, 1920],
        } as const;

        for (const id of SOCIAL_PLATFORM_PRESET_IDS) {
            const preset = resolveSocialPlatformPreset(id)!;
            const plan = buildCardRenderPlan({ page, preset, background: { width: 2048, height: 1024 } });
            expect([plan.width, plan.height]).toEqual(expected[id]);
            expect(plan.platformPresetId).toBe(id);
            expect(plan.primitives[0]).toMatchObject({ kind: "background", fit: "cover", destination: { x: 0, y: 0, width: preset.width, height: preset.height } });
            expect(plan.primitives.filter((primitive) => primitive.kind === "text")).toHaveLength(2);
            expect(plan.primitives.every((primitive) => !primitive.kind.toLowerCase().includes("safe"))).toBe(true);
            expect(JSON.stringify(plan)).not.toContain("safeArea");
        }
    });

    it("使用居中 cover crop，不拉伸不同宽高比的背景", () => {
        expect(computeCoverCrop(2000, 1000, 1080, 1440)).toEqual({ x: 625, y: 0, width: 750, height: 1000 });
        expect(computeCoverCrop(1000, 2000, 1200, 675)).toEqual({ x: 0, y: 718.75, width: 1000, height: 562.5 });
    });

    it("按横竖方向和独立布局生成边界内的标题正文几何", () => {
        const portrait = buildCardRenderPlan({ page: { ...page, layout: "split" }, preset: resolveSocialPlatformPreset("xiaohongshu-post")! });
        const landscape = buildCardRenderPlan({ page: { ...page, layout: "split" }, preset: resolveSocialPlatformPreset("x-landscape")! });
        expect(portrait.orientation).toBe("portrait");
        expect(landscape.orientation).toBe("landscape");

        for (const plan of [portrait, landscape]) {
            const texts = plan.primitives.filter((primitive) => primitive.kind === "text");
            for (const text of texts) {
                expect(text.rect.x).toBeGreaterThanOrEqual(0);
                expect(text.rect.y).toBeGreaterThanOrEqual(0);
                expect(text.rect.width).toBeGreaterThan(0);
                expect(text.rect.height).toBeGreaterThan(0);
                expect(text.rect.x + text.rect.width).toBeLessThanOrEqual(plan.width);
                expect(text.rect.y + text.rect.height).toBeLessThanOrEqual(plan.height);
            }
        }
        const portraitTitle = portrait.primitives.find((primitive): primitive is CardTextPrimitive => primitive.kind === "text" && primitive.role === "title")!;
        const landscapeTitle = landscape.primitives.find((primitive): primitive is CardTextPrimitive => primitive.kind === "text" && primitive.role === "title")!;
        expect(portraitTitle.rect.y / portrait.height).toBeGreaterThan(landscapeTitle.rect.y / landscape.height);
    });

    it("自动换行并在超出最大行数时添加省略号", () => {
        expect(wrapCardText("abcdef", 2, 2, (value) => value.length)).toEqual(["ab", "c…"]);
        expect(wrapCardText("第一段\n第二段", 10, 3, (value) => value.length)).toEqual(["第一段", "第二段"]);
    });
});
