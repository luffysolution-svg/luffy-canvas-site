import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GenerationResult, ImageDesignRequestSnapshot } from "@/features/image-design/generation/types";
import { ImageResultsPanel, type ImageResultsLayout } from "./image-results-panel";

const localResult = generationResult({
    id: "local",
    status: "generated",
    image: {
        id: "local-image",
        dataUrl: "data:image/png;base64,bG9jYWw=",
        durationMs: 1800,
        width: 1080,
        height: 1440,
        bytes: 2048,
    },
    snapshot: snapshot({
        structuredItem: { id: "item-2", order: 2, kind: "content", title: "系列第二张", body: "正文" },
        seriesIndex: 1,
    }),
});

const remoteResult = generationResult({
    id: "remote",
    status: "remote_only",
    image: {
        id: "remote-image",
        remoteUrl: "https://cdn.example.test/remote.png",
        durationMs: 2300,
    },
    snapshot: snapshot({
        id: "remote-snapshot",
        platformPresetId: "wechat-cover",
        platformPresetLabel: "微信公众号",
        structuredItem: { id: "panel-1", order: 0, kind: "panel", title: "第一格", body: "分镜" },
        structuredPlan: {
            id: "storyboard",
            type: "storyboard",
            title: "故事板",
            summary: "",
            visualBible: "",
            items: [],
            sourceDigest: "",
        },
    }),
});

const failedResult = generationResult({
    id: "failed",
    status: "failed",
    error: "供应商拒绝请求",
    snapshot: snapshot({ id: "failed-snapshot", designSkillId: "comic", designSkillLabel: "漫画" }),
});

const results = [localResult, remoteResult, failedResult];

describe("ImageResultsPanel", () => {
    beforeEach(() => {
        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                unobserve() {}
                disconnect() {}
            },
        );
    });

    it("renders Base64 and remote results with platform, Skill, sequence and actual-size metadata", () => {
        render(<ControlledResults />);

        expect(screen.getByRole("img", { name: "系列第二张" })).toHaveAttribute("src", localResult.image?.dataUrl);
        expect(screen.getByRole("link", { name: /打开原图/ })).toHaveAttribute("href", remoteResult.image?.remoteUrl);
        expect(screen.getByText("实际尺寸 1080×1440")).toBeInTheDocument();
        expect(screen.getAllByText("实际尺寸待获取")).toHaveLength(2);
        expect(screen.getAllByText("平台 小红书封面").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Skill 封面图").length).toBeGreaterThan(0);
        expect(screen.getByText("系列 2")).toBeInTheDocument();
        expect(screen.getByText("分镜 1")).toBeInTheDocument();
        expect(screen.getByText("供应商拒绝请求")).toBeInTheDocument();
    });

    it("routes remote-link, failed retry and optional recompile actions through callbacks", async () => {
        const onCopyLink = vi.fn();
        const onRetry = vi.fn();
        const onRecompile = vi.fn();
        const user = userEvent.setup();
        render(<ControlledResults onCopyLink={onCopyLink} onRetry={onRetry} onRecompile={onRecompile} />);

        await user.click(within(screen.getByTestId("image-result-remote")).getByRole("button", { name: /复制链接/ }));
        expect(onCopyLink).toHaveBeenCalledWith(remoteResult, 1);

        await user.click(within(screen.getByTestId("image-result-failed")).getByRole("button", { name: /重试/ }));
        expect(onRetry).toHaveBeenCalledWith(failedResult, 2);

        await user.click(within(screen.getByTestId("image-result-local")).getByRole("button", { name: /重新编译/ }));
        expect(onRecompile).toHaveBeenCalledWith(localResult, 0);
    });

    it("does not offer an exact retry when the provider result is still unknown", () => {
        render(<ControlledResults items={[{ ...failedResult, id: "unknown-result", status: "unknown" }]} onRecompile={vi.fn()} />);

        expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "重新编译" })).toBeEnabled();
    });

    it("controls selection, bulk actions and layout changes", async () => {
        const onBatchDownload = vi.fn();
        const onBatchSaveAsset = vi.fn();
        const user = userEvent.setup();
        render(<ControlledResults onBatchDownload={onBatchDownload} onBatchSaveAsset={onBatchSaveAsset} />);

        await user.click(screen.getByRole("button", { name: /全选/ }));
        expect(screen.getByRole("checkbox", { name: "选择结果 系列第二张" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "选择结果 第一格" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "选择结果 生成结果 3" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: /批量下载/ }));
        expect(onBatchDownload).toHaveBeenCalledWith([localResult, remoteResult]);
        await user.click(screen.getByRole("button", { name: /批量加入资产/ }));
        expect(onBatchSaveAsset).toHaveBeenCalledWith([localResult, remoteResult]);

        await user.click(screen.getByRole("button", { name: "列表布局" }));
        expect(screen.getByRole("button", { name: "列表布局" })).toHaveAttribute("aria-pressed", "true");
    });
});

function ControlledResults({
    items = results,
    onCopyLink = vi.fn(),
    onRetry = vi.fn(),
    onRecompile,
    onBatchDownload = vi.fn(),
    onBatchSaveAsset = vi.fn(),
}: {
    items?: GenerationResult[];
    onCopyLink?: (result: GenerationResult, index: number) => void;
    onRetry?: (result: GenerationResult, index: number) => void;
    onRecompile?: (result: GenerationResult, index: number) => void;
    onBatchDownload?: (items: GenerationResult[]) => void;
    onBatchSaveAsset?: (items: GenerationResult[]) => void;
}) {
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [layout, setLayout] = useState<ImageResultsLayout>("grid");
    return (
        <ImageResultsPanel
            results={items}
            selectedResultIds={selectedIds}
            layout={layout}
            onSelectedResultIdsChange={setSelectedIds}
            onLayoutChange={setLayout}
            onBatchDownload={onBatchDownload}
            onBatchSaveAsset={onBatchSaveAsset}
            onDownload={vi.fn()}
            onCopyLink={onCopyLink}
            onSaveAsset={vi.fn()}
            onAddReference={vi.fn()}
            onRetry={onRetry}
            onRecompile={onRecompile}
        />
    );
}

function generationResult(overrides: Partial<GenerationResult>): GenerationResult {
    return {
        id: "result",
        status: "queued",
        snapshot: snapshot(),
        ...overrides,
    };
}

function snapshot(overrides: Partial<ImageDesignRequestSnapshot> = {}): ImageDesignRequestSnapshot {
    return {
        id: "snapshot",
        createdAt: 1,
        originalPrompt: "夏日封面",
        finalPrompt: "最终提示词",
        config: {
            model: "image-model",
            imageModel: "image-model",
            quality: "standard",
            size: "1080x1440",
            count: "1",
            background: "auto",
            optimizeImageReferences: true,
        },
        references: [],
        designSkillId: "cover-image",
        designSkillLabel: "封面图",
        skillOptions: {},
        platformPresetId: "xhs-cover",
        platformPresetLabel: "小红书封面",
        requestedSize: "1080x1440",
        requestedAspectRatio: "3:4",
        promptVersion: "1",
        compilerVersion: "1",
        ...overrides,
    };
}
