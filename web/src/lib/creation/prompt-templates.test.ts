import { describe, expect, it } from "vitest";

import { HARD_CONSTRAINTS_BEGIN, appendHardConstraints, buildOriginalPrompt, hardConstraintsFromBrief } from "./prompt-templates";
import type { CreativeBrief, PromptHardConstraints } from "@/types/creation";

const brief: CreativeBrief = {
    id: "brief-1",
    mode: "social",
    platform: "xiaohongshu",
    scene: "知识卡封面",
    purpose: "解释一个复杂概念",
    audience: "大学生",
    coreMessage: "三步理解催化循环",
    title: "三步看懂催化循环",
    subtitle: "从吸附到脱附",
    visualSubject: "居中的催化循环示意",
    composition: "主体居中，上方留出标题安全区",
    visualStyle: "克制的科学信息图",
    colorPalette: ["深蓝", "青色", "深蓝"],
    aspectRatio: "3:4",
    width: 1080,
    height: 1440,
    onImageText: ["步骤 1", "步骤 2", "步骤 3"],
    requiredElements: ["循环箭头", "循环箭头", "三个阶段"],
    forbiddenElements: ["期刊 Logo", "虚构数据"],
    sourceContent: "催化循环包含吸附、反应与脱附。",
};

describe("prompt-templates", () => {
    it("原始提示词始终带应用生成的完整硬约束", () => {
        const prompt = buildOriginalPrompt(brief);
        expect(prompt).toContain("创作目的：解释一个复杂概念");
        expect(prompt).toContain(HARD_CONSTRAINTS_BEGIN);
        expect(prompt).toContain("画布尺寸：1080 × 1440");
        expect(prompt).toContain('"三步看懂催化循环"');
        expect(prompt).toContain('"循环箭头"');
        expect(prompt).toContain('"期刊 Logo"');
    });

    it("从方案提取硬约束时去重且保留准确文字", () => {
        const constraints = hardConstraintsFromBrief(brief);
        expect(constraints.requiredElements).toEqual(["循环箭头", "三个阶段"]);
        expect(constraints.colorPalette).toEqual(["深蓝", "青色"]);
        expect(constraints.requiredTexts).toEqual(["三步看懂催化循环", "从吸附到脱附", "步骤 1", "步骤 2", "步骤 3"]);
    });

    it("反复附加时替换旧约束块而不覆盖提示词正文", () => {
        const first: PromptHardConstraints = { ...hardConstraintsFromBrief(brief), width: 720, height: 960 };
        const second: PromptHardConstraints = { ...hardConstraintsFromBrief(brief), width: 1080, height: 1440, safeAreaRequirements: ["标题距离顶部至少 120px"] };
        const once = appendHardConstraints("保留这段优化提示词", first);
        const twice = appendHardConstraints(once, second);
        expect(twice).toContain("保留这段优化提示词");
        expect(twice).not.toContain("画布尺寸：720 × 960");
        expect(twice).toContain("画布尺寸：1080 × 1440");
        expect(twice).toContain('"标题距离顶部至少 120px"');
        expect(twice.split(HARD_CONSTRAINTS_BEGIN)).toHaveLength(2);
    });
});
