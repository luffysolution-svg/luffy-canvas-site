import { useState, type ReactElement } from "react";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createCustomPlatformPreset, exportPlatformPresets } from "../registry/platform-presets";
import type { PlatformPreset } from "../types";
import { CustomPresetDialog } from "./custom-preset-dialog";
import { ImageDesignPreferencesDrawer } from "./image-design-preferences-drawer";

let writeClipboard: ReturnType<typeof vi.fn>;

beforeAll(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
});

beforeEach(() => {
    writeClipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: writeClipboard },
    });
});

describe("CustomPresetDialog", () => {
    it("creates a custom preset from validated form values", async () => {
        const onSave = vi.fn();
        const onClose = vi.fn();
        renderWithAntd(<CustomPresetDialog open presets={[]} onClose={onClose} onSave={onSave} onDelete={vi.fn()} onImport={vi.fn()} />);

        expect(await screen.findByRole("dialog", { name: "自定义平台预设" })).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText("平台 id")).toHaveValue("custom"));

        fireEvent.change(screen.getByLabelText("预设 id"), { target: { value: "my-square-card" } });
        fireEvent.change(screen.getByLabelText("预设名称"), { target: { value: "我的方形卡" } });
        fireEvent.change(screen.getByLabelText("说明"), { target: { value: "用于测试的自定义方形卡" } });
        fireEvent.click(screen.getByRole("button", { name: "保存预设" }));

        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "my-square-card",
                    label: "我的方形卡",
                    aspectRatio: "1:1",
                    generationSize: { width: 1024, height: 1024 },
                    targetPlatformSize: { width: 1024, height: 1024 },
                    isCustom: true,
                }),
            ),
        );
        expect(onClose).toHaveBeenCalledOnce();
    }, 10_000);

    it("hydrates an editable preset, keeps its id locked, and saves changed fields", async () => {
        const preset = customPresetFixture();
        const onSave = vi.fn();
        renderWithAntd(<CustomPresetDialog open preset={preset} presets={[preset]} onClose={vi.fn()} onSave={onSave} onDelete={vi.fn()} onImport={vi.fn()} />);

        const id = await screen.findByLabelText("预设 id");
        expect(id).toHaveValue("brand-cover");
        expect(id).toBeDisabled();
        const name = screen.getByLabelText("预设名称");
        expect(name).toHaveValue("品牌封面");

        fireEvent.change(name, { target: { value: "品牌封面新版" } });
        fireEvent.click(screen.getByRole("button", { name: "保存预设" }));

        await waitFor(() =>
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: "brand-cover",
                    label: "品牌封面新版",
                    outputFormat: "png",
                    avoidZones: [expect.objectContaining({ label: "头像区", x: 0, y: 70, width: 20, height: 30 })],
                    safeArea: expect.objectContaining({ top: 0, right: 0, bottom: 0, left: 0 }),
                    maxTitleLines: 0,
                    edgeMargin: 0,
                }),
            ),
        );
    }, 10_000);

    it("confirms deletion of the edited custom preset", async () => {
        const user = userEvent.setup();
        const preset = customPresetFixture();
        const onDelete = vi.fn();
        renderWithAntd(<CustomPresetDialog open preset={preset} presets={[preset]} onClose={vi.fn()} onSave={vi.fn()} onDelete={onDelete} onImport={vi.fn()} />);

        await user.click(await screen.findByRole("button", { name: "删除" }));
        const confirmation = await screen.findByText("删除这个自定义预设？");
        const popover = confirmation.closest(".ant-popover");
        expect(popover).not.toBeNull();
        await user.click(
            within(popover as HTMLElement)
                .getByText(/确\s*定/)
                .closest("button") as HTMLButtonElement,
        );
        expect(onDelete).toHaveBeenCalledWith("brand-cover");
    }, 10_000);

    it("exports presets to the clipboard and imports valid JSON", async () => {
        const preset = customPresetFixture();
        const onImport = vi.fn();
        renderWithAntd(<CustomPresetDialog open presets={[preset]} onClose={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onImport={onImport} />);

        fireEvent.click(await screen.findByRole("tab", { name: "导入 / 导出" }));
        fireEvent.click(await screen.findByRole("button", { name: "复制导出 JSON" }));
        await waitFor(() => expect(writeClipboard).toHaveBeenCalledOnce());
        expect(JSON.parse(writeClipboard.mock.calls[0][0]).presets[0].id).toBe("brand-cover");

        fireEvent.change(screen.getByRole("textbox", { name: "预设 JSON" }), { target: { value: exportPlatformPresets([preset]) } });
        fireEvent.click(screen.getByRole("button", { name: "导入" }));
        expect(onImport).toHaveBeenCalledWith([expect.objectContaining({ id: "brand-cover", sourceLevel: "custom", isCustom: true })]);
    }, 10_000);
});

describe("ImageDesignPreferencesDrawer", () => {
    it("updates controlled switches and exposes numeric lower and upper bounds", async () => {
        renderWithAntd(<ControlledPreferences />);

        fireEvent.click(await screen.findByRole("switch", { name: /默认快速模式/ }));
        fireEvent.click(screen.getByRole("switch", { name: /启用图片 1 锚点链/ }));
        expect(screen.getByTestId("preference-values")).toHaveTextContent('"quickMode":true');
        expect(screen.getByTestId("preference-values")).toHaveTextContent('"anchorChainEnabled":false');

        const seriesCount = screen.getByRole("spinbutton", { name: /默认系列张数/ });
        const batchSize = screen.getByRole("spinbutton", { name: /批量并发/ });
        expect(seriesCount).toHaveAttribute("aria-valuemin", "1");
        expect(seriesCount).toHaveAttribute("aria-valuemax", "10");
        expect(batchSize).toHaveAttribute("aria-valuemin", "1");
        expect(batchSize).toHaveAttribute("aria-valuemax", "10");

        fireEvent.change(seriesCount, { target: { value: "" } });
        await waitFor(() => expect(screen.getByTestId("preference-values")).toHaveTextContent('"defaultSeriesCount":1'));
        fireEvent.change(batchSize, { target: { value: "" } });
        await waitFor(() => expect(screen.getByTestId("preference-values")).toHaveTextContent('"batchSize":1'));
    });
});

function ControlledPreferences() {
    type Preferences = Parameters<typeof ImageDesignPreferencesDrawer>[0]["preferences"];
    const [preferences, setPreferences] = useState<Preferences>({
        quickMode: false,
        confirmBeforeGeneration: true,
        useAiRecommendation: true,
        finalPromptPreviewEnabled: true,
        defaultLanguage: "zh-CN",
        defaultSkillId: "none",
        defaultPlatformId: "manual",
        defaultPalette: "auto",
        defaultStyle: "auto",
        defaultSeriesCount: 5,
        anchorChainEnabled: true,
        batchSize: 2,
    });
    return (
        <>
            <div data-testid="preference-values">{JSON.stringify(preferences)}</div>
            <ImageDesignPreferencesDrawer open preferences={preferences} onChange={(patch) => setPreferences((current) => ({ ...current, ...patch }))} onClose={vi.fn()} />
        </>
    );
}

function renderWithAntd(ui: ReactElement) {
    return render(
        <ConfigProvider locale={zhCN}>
            <App>{ui}</App>
        </ConfigProvider>,
    );
}

function customPresetFixture(): PlatformPreset {
    return createCustomPlatformPreset({
        id: "brand-cover",
        platform: "brand",
        platformLabel: "品牌",
        contentType: "cover",
        label: "品牌封面",
        description: "品牌活动方形封面",
        aspectRatio: "1:1",
        generationSize: [1024, 1024],
        targetPlatformSize: [1200, 1200],
        orientation: "square",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 0, right: 0, bottom: 0, left: 0, description: "内容可延伸到边缘" },
        avoidZones: [{ id: "avatar-zone", label: "头像区", x: 0, y: 70, width: 20, height: 30 }],
        subjectPosition: "中央",
        titlePosition: "中上",
        textDensity: "low",
        maxTitleLines: 0,
        edgeMargin: 0,
        focalScale: 0.7,
        promptFragments: ["保持品牌蓝"],
        negativeFragments: ["边缘文字"],
    });
}
