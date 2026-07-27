import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SOCIAL_PLATFORM_DEFAULTS } from "@/constant/creation";
import type { CreationCardPage } from "@/types/creation";
import { PlatformArtboard } from "./platform-artboard";

const page: CreationCardPage = {
    id: "page-1",
    title: "六步搭建知识体系",
    body: "从问题出发，整理结构，再逐步形成可复用的方法。",
    layout: "editorial",
    revision: 1,
    status: "stored",
    reviewStatus: "pending",
    imageId: "image-1",
    imageHistoryIds: ["image-1"],
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
};

describe("PlatformArtboard", () => {
    it("uses the exact platform ratio and renders the card copy over a cover image", () => {
        render(<PlatformArtboard page={page} preset={SOCIAL_PLATFORM_DEFAULTS.xiaohongshu} imageUrl="blob:card-image" showSafeArea={false} />);

        const artboard = screen.getByLabelText("小红书图文：六步搭建知识体系");
        expect(artboard).toHaveStyle({ aspectRatio: "1080 / 1440" });
        expect(artboard.querySelector("img")).toHaveClass("object-cover");
        expect(screen.getByText(page.title)).toBeInTheDocument();
        expect(screen.getByText(page.body)).toBeInTheDocument();
        expect(screen.queryByTestId("platform-safe-area")).not.toBeInTheDocument();
    });

    it("keeps pixel insets and platform notes in an aria-hidden preview-only overlay", () => {
        render(<PlatformArtboard page={{ ...page, layout: "quote" }} preset={SOCIAL_PLATFORM_DEFAULTS.douyin} imageUrl="blob:card-image" showSafeArea />);

        const overlay = screen.getByTestId("platform-safe-area");
        expect(overlay).toHaveAttribute("aria-hidden", "true");
        expect(overlay).toHaveClass("pointer-events-none");
        expect(screen.getByText("安全区 · 上 160px / 右 120px / 下 300px / 左 80px")).toBeInTheDocument();
        expect(screen.getByText(/右侧避让互动按钮/)).toBeInTheDocument();
    });
});
