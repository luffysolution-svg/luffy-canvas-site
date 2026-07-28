import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { COVER_IMAGE_SKILL, defaultSkillOptions } from "../registry/design-skills";
import { BUILTIN_PLATFORM_PRESETS } from "../registry/platform-presets";
import type { DesignSkillDefinition, DesignSkillId, ImageDesignRecommendation, PlatformPreset, SkillOptionValue } from "../types";
import { DesignSkillSelect } from "./design-skill-select";
import { PlatformPresetSelect } from "./platform-preset-select";
import { PlatformQuickTabs } from "./platform-quick-tabs";
import { RecommendationReview } from "./recommendation-review";
import { SkillOptionsPanel } from "./skill-options-panel";

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

describe("image design selection controls", () => {
    it("switches DesignSkillSelect through its controlled value", async () => {
        const user = userEvent.setup();
        render(<ControlledSkillSelect />);

        expect(screen.getByTestId("selected-skill")).toHaveTextContent("none");
        await user.click(screen.getByRole("combobox", { name: "设计 Skill" }));
        await user.click(await screen.findByText("文章插图"));

        expect(screen.getByTestId("selected-skill")).toHaveTextContent("article-illustrator");
        expect(screen.getByRole("combobox", { name: "设计 Skill" }).closest(".ant-select")).toHaveTextContent("文章插图");
    });

    it("shows and hides real dynamic custom fields in SkillOptionsPanel", async () => {
        const user = userEvent.setup();
        render(<ControlledSkillOptions />);

        expect(screen.queryByRole("textbox", { name: "自定义封面类型" })).not.toBeInTheDocument();
        await chooseSelectOption(user, "封面类型", "自定义");

        const customType = screen.getByRole("textbox", { name: "自定义封面类型" });
        await user.type(customType, "电影人物群像");
        expect(screen.getByTestId("skill-values")).toHaveTextContent('"customType":"电影人物群像"');

        await chooseSelectOption(user, "封面类型", "主视觉");
        expect(screen.queryByRole("textbox", { name: "自定义封面类型" })).not.toBeInTheDocument();
    });

    it("routes inline custom text through onCustomChange when no dedicated field exists", async () => {
        const user = userEvent.setup();
        render(<ControlledInlineCustom />);

        const customStyle = screen.getByRole("textbox", { name: "自定义临时风格" });
        await user.type(customStyle, "纸雕与蓝色墨线");

        expect(screen.getByTestId("custom-values")).toHaveTextContent('"style":"纸雕与蓝色墨线"');
    });

    it("changes PlatformQuickTabs without assuming button semantics", async () => {
        const user = userEvent.setup();
        render(<ControlledPlatformTabs />);

        expect(screen.getByRole("group", { name: "平台快捷筛选" })).toBeInTheDocument();
        await user.click(screen.getByText("微信公众号"));
        expect(screen.getByTestId("selected-platform")).toHaveTextContent("wechat");

        await user.click(screen.getByText("全部"));
        expect(screen.getByTestId("selected-platform")).toHaveTextContent("all");
    });

    it("filters PlatformPresetSelect by platform, changes a preset and toggles its favorite", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const onToggleFavorite = vi.fn();
        const onEditCustom = vi.fn();
        const props = {
            value: "manual",
            customPresets: [] as PlatformPreset[],
            favorites: [] as string[],
            onChange,
            onToggleFavorite,
            onEditCustom,
        };
        const firstRender = render(<PlatformPresetSelect {...props} platform="wechat" />);

        await user.click(screen.getByRole("combobox", { name: "平台预设" }));
        expect(await screen.findByText("微信公众号 · 头条封面")).toBeInTheDocument();
        expect(screen.queryByText("小红书 · 图文笔记封面")).not.toBeInTheDocument();

        firstRender.unmount();
        render(<PlatformPresetSelect {...props} platform="xiaohongshu" />);
        await user.click(screen.getByRole("combobox", { name: "平台预设" }));
        const xhsCover = await screen.findByText("小红书 · 图文笔记封面");
        expect(screen.queryByText("微信公众号 · 头条封面")).not.toBeInTheDocument();

        const option = xhsCover.closest(".ant-select-item-option");
        expect(option).not.toBeNull();
        const favoriteButton = within(option as HTMLElement).getByRole("button", { name: "收藏预设" });
        expect(getComputedStyle(favoriteButton).pointerEvents).not.toBe("none");
        fireEvent.click(favoriteButton);
        expect(onToggleFavorite).toHaveBeenCalledWith("xiaohongshu-note-cover");

        fireEvent.click(xhsCover);
        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "xiaohongshu-note-cover" }));

        fireEvent.click(screen.getByRole("button", { name: "新建或编辑自定义平台预设" }));
        expect(onEditCustom).toHaveBeenCalledOnce();
    }, 10_000);

    it("searches within the active platform preset list", async () => {
        const user = userEvent.setup();
        render(<PlatformPresetSelect value="manual" platform="wechat" customPresets={[]} favorites={[]} onChange={vi.fn()} onToggleFavorite={vi.fn()} onEditCustom={vi.fn()} />);

        await user.click(screen.getByRole("combobox", { name: "平台预设" }));
        await user.type(screen.getByPlaceholderText("搜索平台或内容类型"), "不存在的预设");
        expect(await screen.findByText("没有匹配预设")).toBeInTheDocument();
    });

    it("lets the parent apply, externally revise, and dismiss a recommendation", async () => {
        const user = userEvent.setup();
        render(<ControlledRecommendation />);

        await user.click(screen.getByRole("button", { name: "应用推荐" }));
        expect(screen.getByTestId("recommendation-status")).toHaveTextContent("applied");
        expect(screen.getByText("外部已把类型改为主视觉")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "忽略" }));
        expect(screen.getByTestId("recommendation-status")).toHaveTextContent("dismissed");
        expect(screen.queryByText("推荐确认")).not.toBeInTheDocument();
    });
});

function ControlledSkillSelect() {
    const [value, setValue] = useState<DesignSkillId>("none");
    return (
        <>
            <div data-testid="selected-skill">{value}</div>
            <DesignSkillSelect value={value} onChange={setValue} />
        </>
    );
}

function ControlledSkillOptions() {
    const [values, setValues] = useState<Record<string, SkillOptionValue>>(() => defaultSkillOptions("cover-image"));
    const [customValues, setCustomValues] = useState<Record<string, string>>({});
    return (
        <>
            <div data-testid="skill-values">{JSON.stringify(values)}</div>
            <SkillOptionsPanel
                skill={COVER_IMAGE_SKILL}
                values={values}
                customValues={customValues}
                onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
                onCustomChange={(key, value) => setCustomValues((current) => ({ ...current, [key]: value }))}
            />
        </>
    );
}

function ControlledInlineCustom() {
    const inlineSkill: DesignSkillDefinition = {
        ...COVER_IMAGE_SKILL,
        optionGroups: [
            {
                key: "style",
                label: "临时风格",
                description: "测试无独立 custom 字段时的内联输入。",
                control: "select",
                defaultValue: "custom",
                options: COVER_IMAGE_SKILL.optionGroups.find((group) => group.key === "type")?.options,
            },
        ],
    };
    const [values, setValues] = useState<Record<string, SkillOptionValue>>({ style: "custom" });
    const [customValues, setCustomValues] = useState<Record<string, string>>({});
    return (
        <>
            <div data-testid="custom-values">{JSON.stringify(customValues)}</div>
            <SkillOptionsPanel
                skill={inlineSkill}
                values={values}
                customValues={customValues}
                onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
                onCustomChange={(key, value) => setCustomValues((current) => ({ ...current, [key]: value }))}
            />
        </>
    );
}

function ControlledPlatformTabs() {
    const [value, setValue] = useState("all");
    return (
        <>
            <div data-testid="selected-platform">{value}</div>
            <PlatformQuickTabs value={value} onChange={setValue} />
        </>
    );
}

function ControlledRecommendation() {
    const [status, setStatus] = useState("pending");
    const [visible, setVisible] = useState(true);
    const [recommendation, setRecommendation] = useState<ImageDesignRecommendation>(() => recommendationFixture());
    return (
        <>
            <div data-testid="recommendation-status">{status}</div>
            {visible ? (
                <RecommendationReview
                    recommendation={recommendation}
                    onApply={() => {
                        setStatus("applied");
                        setRecommendation((current) => ({ ...current, reasoning: { ...current.reasoning, type: "外部已把类型改为主视觉" } }));
                    }}
                    onDismiss={() => {
                        setStatus("dismissed");
                        setVisible(false);
                    }}
                />
            ) : null}
        </>
    );
}

function recommendationFixture(): ImageDesignRecommendation {
    return {
        skillId: "cover-image",
        platformPresetId: BUILTIN_PLATFORM_PRESETS[0].id,
        options: { type: "hero" },
        reasoning: { skillId: "适合封面设计", type: "先推荐概念型" },
        source: "local",
        confidence: 0.9,
        warnings: [],
    };
}

async function chooseSelectOption(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
    await user.click(screen.getByRole("combobox", { name: label }));
    const optionNodes = await screen.findAllByText(option, { selector: ".ant-select-item-option-content *,.ant-select-item-option-content" });
    fireEvent.click(optionNodes.at(-1) as HTMLElement);
}
