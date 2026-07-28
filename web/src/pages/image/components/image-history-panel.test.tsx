import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { GenerationLog } from "@/features/image-design/generation/types";
import { filterGenerationLogs, ImageHistoryPanel, type ImageHistoryFilters } from "./image-history-panel";

const logs = [
    generationLog({
        id: "xhs",
        title: "夏日海报",
        originalPrompt: "清爽的夏日饮品",
        platformPresetId: "xhs-cover",
        platformPresetLabel: "小红书封面",
        designSkillId: "cover-image",
        designSkillLabel: "封面图",
        status: "成功",
        thumbnails: ["data:image/png;base64,eA=="],
    }),
    generationLog({
        id: "wechat",
        title: "文章配图",
        originalPrompt: "远程办公趋势",
        platformPresetId: "wechat-article",
        platformPresetLabel: "微信公众号",
        designSkillId: "article-illustrator",
        designSkillLabel: "文章插图",
        status: "失败",
        successCount: 0,
        failCount: 1,
        thumbnails: [],
    }),
];

describe("ImageHistoryPanel", () => {
    it("filters logs by keyword, platform, Skill and status", () => {
        expect(filterGenerationLogs(logs, filters({ keyword: "远程办公" })).map((log) => log.id)).toEqual(["wechat"]);
        expect(filterGenerationLogs(logs, filters({ platformPresetId: "xhs-cover" })).map((log) => log.id)).toEqual(["xhs"]);
        expect(filterGenerationLogs(logs, filters({ designSkillId: "article-illustrator" })).map((log) => log.id)).toEqual(["wechat"]);
        expect(filterGenerationLogs(logs, filters({ status: "失败" })).map((log) => log.id)).toEqual(["wechat"]);
    });

    it("updates the controlled search and keeps cards vertically bounded", async () => {
        const user = userEvent.setup();
        render(<ControlledHistory />);

        await user.type(screen.getByRole("textbox", { name: "搜索生成记录" }), "小红书");

        expect(screen.getByText("夏日海报")).toBeInTheDocument();
        expect(screen.queryByText("文章配图")).not.toBeInTheDocument();
        expect(screen.getByText("平台 小红书封面")).toBeInTheDocument();
        expect(screen.getByText("Skill 封面图")).toBeInTheDocument();
        expect(screen.getByText("比例 4:5")).toBeInTheDocument();
    });

    it("controls record selection and passes selected ids to deletion", async () => {
        const onCreateSession = vi.fn();
        const onDeleteSelected = vi.fn();
        const onPreviewLog = vi.fn();
        const user = userEvent.setup();
        render(<ControlledHistory onCreateSession={onCreateSession} onDeleteSelected={onDeleteSelected} onPreviewLog={onPreviewLog} />);

        await user.click(screen.getByRole("checkbox", { name: "选择记录 夏日海报" }));
        expect(screen.getByRole("checkbox", { name: "选择记录 夏日海报" })).toBeChecked();

        await user.click(screen.getByRole("button", { name: /全选/ }));
        expect(screen.getByRole("checkbox", { name: "选择记录 文章配图" })).toBeChecked();
        await user.click(screen.getByRole("button", { name: "删除" }));
        expect(onDeleteSelected).toHaveBeenCalledWith(["xhs", "wechat"]);

        await user.click(screen.getByRole("button", { name: /新建/ }));
        expect(onCreateSession).toHaveBeenCalledOnce();
        await user.click(screen.getByText("夏日海报"));
        expect(onPreviewLog).toHaveBeenCalledWith(logs[0]);
    });
});

function ControlledHistory({ onCreateSession = vi.fn(), onDeleteSelected = vi.fn(), onPreviewLog = vi.fn() }: { onCreateSession?: () => void; onDeleteSelected?: (ids: string[]) => void; onPreviewLog?: (log: GenerationLog) => void }) {
    const [value, setValue] = useState<ImageHistoryFilters>(filters());
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    return (
        <div className="w-64">
            <ImageHistoryPanel logs={logs} filters={value} selectedLogIds={selectedIds} onFiltersChange={setValue} onSelectedLogIdsChange={setSelectedIds} onCreateSession={onCreateSession} onDeleteSelected={onDeleteSelected} onPreviewLog={onPreviewLog} />
        </div>
    );
}

function filters(overrides: Partial<ImageHistoryFilters> = {}): ImageHistoryFilters {
    return { keyword: "", ...overrides };
}

function generationLog(overrides: Partial<GenerationLog>): GenerationLog {
    return {
        id: "log",
        createdAt: 1,
        title: "生成记录",
        prompt: "提示词",
        originalPrompt: "提示词",
        finalPrompt: "最终提示词",
        time: "2026/7/28 10:00:00",
        model: "image-model",
        config: {
            model: "image-model",
            imageModel: "image-model",
            quality: "standard",
            size: "1080x1350",
            count: "1",
            background: "auto",
            optimizeImageReferences: true,
        },
        references: [],
        durationMs: 1200,
        successCount: 1,
        failCount: 0,
        unknownCount: 0,
        imageCount: 1,
        size: "1080x1350",
        quality: "standard",
        status: "成功",
        images: [],
        thumbnails: [],
        items: [],
        designSkillId: "none",
        designSkillLabel: "无设计 Skill",
        skillOptions: {},
        requestedSize: "1080x1350",
        requestedAspectRatio: "4:5",
        promptVersion: "1",
        compilerVersion: "1",
        ...overrides,
    };
}
