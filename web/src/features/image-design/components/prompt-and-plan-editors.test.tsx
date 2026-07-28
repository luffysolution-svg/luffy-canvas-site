import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { CompiledPrompt, ResolvedProviderMapping, StructuredPlan } from "../types";
import { FinalPromptPreview } from "./final-prompt-preview";
import { SeriesPlanEditor } from "./series-plan-editor";
import { StoryboardEditor } from "./storyboard-editor";

const mocks = vi.hoisted(() => ({
    copyText: vi.fn(),
}));

vi.mock("@/hooks/use-copy-text", () => ({
    useCopyText: () => mocks.copyText,
}));

beforeAll(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});

beforeEach(() => {
    mocks.copyText.mockReset();
});

describe("FinalPromptPreview", () => {
    it("supports manual edits, replacement, copying, recompilation and restoring", async () => {
        render(<ControlledFinalPrompt />);

        const editor = screen.getByRole("textbox", { name: "最终组合提示词" });
        expect(editor).toHaveValue("系统编译提示词");
        expect(screen.getByText("系统编译")).toBeInTheDocument();

        fireEvent.change(editor, { target: { value: "手动修改后的提示词" } });
        expect(screen.getByText("已锁定")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "替换原始提示词" }));
        expect(screen.getByTestId("replaced-original")).toHaveTextContent("手动修改后的提示词");

        fireEvent.click(screen.getByRole("button", { name: "复制" }));
        expect(mocks.copyText).toHaveBeenCalledWith("手动修改后的提示词", "最终提示词已复制");

        fireEvent.click(screen.getByRole("button", { name: "重新编译" }));
        expect(screen.getByTestId("recompile-count")).toHaveTextContent("1");

        fireEvent.click(screen.getByRole("button", { name: "恢复系统版" }));
        expect(editor).toHaveValue("系统编译提示词");
        expect(screen.getByText("系统编译")).toBeInTheDocument();
    });

    it("reveals structured compiler sections without snapshot assertions", async () => {
        render(<ControlledFinalPrompt />);

        fireEvent.click(screen.getByText("查看编译分段"));
        expect(screen.getByText("用户主题")).toBeInTheDocument();
        expect(screen.getByText("一只戴草帽的猫")).toBeInTheDocument();
    });
});

describe("SeriesPlanEditor and StoryboardEditor", () => {
    it("adds, reorders, edits and deletes series items", async () => {
        render(<ControlledSeriesPlan />);

        expect(screen.getByTestId("plan-order")).toHaveTextContent("first,second");
        fireEvent.click(screen.getAllByRole("button", { name: "下移" })[0]);
        expect(screen.getByTestId("plan-order")).toHaveTextContent("second,first");

        fireEvent.click(screen.getByText("卡片一"));
        const title = screen.getByDisplayValue("卡片一");
        fireEvent.change(title, { target: { value: "卡片一已编辑" } });
        expect(screen.getByTestId("plan-titles")).toHaveTextContent("卡片一已编辑");

        fireEvent.click(screen.getByRole("button", { name: "新增" }));
        expect(screen.getByTestId("plan-count")).toHaveTextContent("3");
        expect(screen.getByText("新增项目 3")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "删除" }));
        expect(screen.getByTestId("plan-count")).toHaveTextContent("2");
        expect(screen.queryByText("卡片一已编辑")).not.toBeInTheDocument();
    });

    it("exposes storyboard-specific add, failed retry and panel regeneration actions", async () => {
        const onRetryFailed = vi.fn();
        const onRegeneratePanel = vi.fn();
        render(<ControlledStoryboard onRetryFailed={onRetryFailed} onRegeneratePanel={onRegeneratePanel} />);

        expect(screen.getByText("分镜计划")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /仅重试失败 1/ }));
        expect(onRetryFailed).toHaveBeenCalledOnce();

        fireEvent.click(screen.getByText("镜头一"));
        fireEvent.click(screen.getByRole("button", { name: "单独生成" }));
        expect(onRegeneratePanel).toHaveBeenCalledWith(expect.objectContaining({ id: "panel-1", status: "failed" }));

        fireEvent.click(screen.getByRole("button", { name: "新增" }));
        expect(screen.getByTestId("storyboard-count")).toHaveTextContent("3");
        expect(screen.getByText("新增分镜 3")).toBeInTheDocument();
    });

    it("edits an article illustration type and infographic learning goals", async () => {
        const articleView = render(<ControlledArticlePlan />);
        fireEvent.click(screen.getByText("文章插图一"));
        const itemPrompt = screen.getByText("该项最终 Prompt（可编辑）").closest("label")?.querySelector("textarea");
        expect(itemPrompt).not.toBeNull();
        fireEvent.change(itemPrompt!, { target: { value: "用户编辑后的逐项 Prompt" } });
        expect(screen.getByTestId("article-final-prompt")).toHaveTextContent("用户编辑后的逐项 Prompt");
        const articleSelects = screen.getAllByRole("combobox");
        fireEvent.mouseDown(articleSelects[1]);
        fireEvent.click(await screen.findByText("对比"));
        expect(screen.getByTestId("article-illustration-type")).toHaveTextContent("comparison");
        articleView.unmount();

        render(<ControlledInfographicPlan />);
        fireEvent.click(screen.getByText("计划摘要与系列视觉圣经"));
        const goals = screen.getByText("学习 / 传播目标（每行一项）").closest("label")?.querySelector("textarea");
        expect(goals).not.toBeNull();
        fireEvent.change(goals!, { target: { value: "新目标一\n新目标二\n新目标三\n被截断目标" } });
        expect(screen.getByTestId("infographic-learning-goals")).toHaveTextContent("新目标一,新目标二,新目标三");
        expect(screen.getByTestId("infographic-learning-goals")).not.toHaveTextContent("被截断目标");
    });
});

function ControlledFinalPrompt() {
    const compiled = compiledPromptFixture();
    const [value, setValue] = useState(compiled.finalPrompt);
    const [manualOverride, setManualOverride] = useState(false);
    const [recompileCount, setRecompileCount] = useState(0);
    const [replacedOriginal, setReplacedOriginal] = useState("");
    return (
        <>
            <div data-testid="recompile-count">{recompileCount}</div>
            <div data-testid="replaced-original">{replacedOriginal}</div>
            <FinalPromptPreview
                compiled={compiled}
                value={value}
                manualOverride={manualOverride}
                onChange={(next) => {
                    setValue(next);
                    setManualOverride(true);
                }}
                onRestore={() => {
                    setValue(compiled.systemFinalPrompt);
                    setManualOverride(false);
                }}
                onRecompile={() => setRecompileCount((count) => count + 1)}
                onReplaceOriginal={setReplacedOriginal}
            />
        </>
    );
}

function ControlledSeriesPlan() {
    const [plan, setPlan] = useState(() => seriesPlanFixture());
    return (
        <>
            <div data-testid="plan-order">{plan.items.map((item) => item.id).join(",")}</div>
            <div data-testid="plan-titles">{plan.items.map((item) => item.title).join(",")}</div>
            <div data-testid="plan-count">{plan.items.length}</div>
            <SeriesPlanEditor plan={plan} onChange={setPlan} />
        </>
    );
}

function ControlledStoryboard({ onRetryFailed, onRegeneratePanel }: { onRetryFailed: () => void; onRegeneratePanel: (panel: StructuredPlan["items"][number]) => void }) {
    const [plan, setPlan] = useState(() => storyboardFixture());
    return (
        <>
            <div data-testid="storyboard-count">{plan.items.length}</div>
            <StoryboardEditor plan={plan} onChange={setPlan} onRetryFailed={onRetryFailed} onRegeneratePanel={onRegeneratePanel} />
        </>
    );
}

function ControlledArticlePlan() {
    const [plan, setPlan] = useState<StructuredPlan>({
        ...seriesPlanFixture(),
        id: "article",
        type: "article",
        items: [{ id: "article-1", order: 0, kind: "illustration", title: "文章插图一", body: "正文", illustrationType: "conceptual", finalPrompt: "原始逐项 Prompt" }],
    });
    return (
        <>
            <div data-testid="article-illustration-type">{plan.items[0].illustrationType}</div>
            <div data-testid="article-final-prompt">{plan.items[0].finalPrompt}</div>
            <SeriesPlanEditor plan={plan} onChange={setPlan} />
        </>
    );
}

function ControlledInfographicPlan() {
    const [plan, setPlan] = useState<StructuredPlan>({
        ...seriesPlanFixture(),
        id: "infographic",
        type: "infographic",
        learningGoals: ["理解目标一", "理解目标二"],
        items: [{ id: "section-1", order: 0, kind: "section", title: "模块一", body: "事实" }],
    });
    return (
        <>
            <div data-testid="infographic-learning-goals">{(plan.learningGoals || []).join(",")}</div>
            <SeriesPlanEditor plan={plan} onChange={setPlan} />
        </>
    );
}

function seriesPlanFixture(): StructuredPlan {
    return {
        id: "series",
        type: "series",
        title: "系列",
        summary: "两张卡片",
        visualBible: "统一蓝色和纸张纹理",
        sourceDigest: "digest",
        items: [
            { id: "first", order: 0, kind: "cover", title: "卡片一", body: "第一张内容" },
            { id: "second", order: 1, kind: "content", title: "卡片二", body: "第二张内容" },
        ],
    };
}

function storyboardFixture(): StructuredPlan {
    return {
        id: "storyboard",
        type: "storyboard",
        title: "故事",
        summary: "两格故事",
        visualBible: "角色服装和场景保持一致",
        sourceDigest: "digest",
        items: [
            { id: "panel-1", order: 0, kind: "panel", title: "镜头一", body: "角色进入场景", status: "failed" },
            { id: "panel-2", order: 1, kind: "panel", title: "镜头二", body: "角色发现线索", status: "succeeded" },
        ],
    };
}

function compiledPromptFixture(): CompiledPrompt {
    const providerMapping: ResolvedProviderMapping = {
        provider: "openai",
        model: "test-image-model",
        requestedSize: "1024x1024",
        requestedAspectRatio: "1:1",
        resolvedSize: "1024x1024",
        resolvedAspectRatio: "1:1",
        support: "exact",
        requiresConfirmation: false,
        note: "测试映射",
    };
    const promptSections = [{ id: "user" as const, label: "用户主题", content: "一只戴草帽的猫" }];
    return {
        systemFinalPrompt: "系统编译提示词",
        finalPrompt: "系统编译提示词",
        negativePromptFragments: ["错误文字"],
        resolvedSize: "1024x1024",
        resolvedAspectRatio: "1:1",
        resolvedQuality: "high",
        resolvedCount: 1,
        promptSections,
        warnings: [],
        providerMapping,
        manualOverride: false,
        reproducibilitySnapshot: {
            compilerVersion: "1",
            promptVersion: "1",
            designSkillId: "none",
            skillOptions: {},
            promptSections,
            systemFinalPrompt: "系统编译提示词",
            finalPrompt: "系统编译提示词",
            manualOverride: false,
            resolvedSize: "1024x1024",
            resolvedAspectRatio: "1:1",
            resolvedQuality: "high",
            resolvedCount: 1,
            providerMapping,
        },
    };
}
