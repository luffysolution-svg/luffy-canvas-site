import { IMAGE_DESIGN_COMPILER_VERSION, IMAGE_DESIGN_PROMPT_VERSION } from "../constants";
import { findOption } from "../registry/option-utils";
import type { CompiledPrompt, PromptCompileInput, PromptReference, PromptSection, StructuredPlan, StructuredPlanItem } from "../types";
import { compilePlatformRules } from "./compile-platform";
import { compileSkillRules } from "./compile-skill";
import { resolveGenerationSize } from "./resolve-generation-size";

const ROLE_INSTRUCTIONS: Record<PromptReference["role"], string> = {
    direct: "把参考图作为本图内容、主体关系与视觉结构的直接依据，同时服从用户文字中的事实要求",
    subject: "沿用主要主体及其可识别外观",
    identity: "必须保持同一人物或产品身份，不改变关键识别特征",
    style: "只复用视觉风格、笔触和材质，不复制具体主体",
    palette: "提取并复用主色、辅色和强调色关系",
    composition: "参考空间和视线组织，不复制具体主体",
    layout: "参考网格、留白和信息层级",
    product: "必须保持产品造型、比例、材质和品牌细节",
    character: "必须保持角色脸部、发型、服装、体型和标志物",
    "series-anchor": "作为系列视觉锚点，保持角色、风格、配色和版式连续",
};

export function compileFinalPrompt(input: PromptCompileInput): CompiledPrompt {
    const userPrompt = input.userPrompt.trim();
    if (!userPrompt) throw new Error("用户提示词不能为空");
    const referenceImageRoles = input.referenceImageRoles ?? [];
    const providerMapping = resolveGenerationSize(input.platformPreset, input.model);
    const skill = compileSkillRules(input.designSkill, input.skillOptions, Boolean(input.platformPreset));
    const platform = compilePlatformRules(input.platformPreset);
    const structured = compileStructuredContent(input.structuredContent, input.designSkill);
    const references = compileReferences(referenceImageRoles);
    const preservesRawPrompt = input.designSkill.id === "none" && !input.platformPreset && !input.customInstructions?.trim() && !input.negativeInstructions?.trim() && !referenceImageRoles.length && !input.structuredContent;
    const languageRule = preservesRawPrompt
        ? ""
        : input.language === "en"
          ? "除非用户明确指定其他语言，画面内所有可见文字默认使用英文；用户要求逐字保留的文本不得翻译或改写。"
          : "除非用户明确指定其他语言，画面内所有可见文字默认使用简体中文；用户要求逐字保留的文本不得翻译或改写。";
    const negatives = uniqueFragments([...skill.negatives, ...platform.negatives, input.negativeInstructions || ""]);
    const sections = [
        { id: "user", label: "用户输入", content: userPrompt },
        {
            id: "goal",
            label: "内容目标",
            content: input.platformPreset
                ? `为${input.platformPreset.platformLabel}的「${input.platformPreset.label}」创作；${input.designSkill.id === "none" ? "忠实执行用户要求" : input.designSkill.description}`
                : input.designSkill.id === "none"
                  ? ""
                  : input.designSkill.description,
        },
        ...(structured ? [{ id: "structure" as const, label: "结构化内容", content: structured }] : []),
        ...(input.customInstructions?.trim() ? [{ id: "custom" as const, label: "用户自定义规则", content: input.customInstructions.trim() }] : []),
        ...skill.sections,
        ...(languageRule ? [{ id: "text" as const, label: "文字", content: languageRule }] : []),
        ...(platform.prompt ? [{ id: "platform" as const, label: "平台规则", content: platform.prompt }] : []),
        ...(references ? [{ id: "references" as const, label: "参考图", content: references }] : []),
        {
            id: "output",
            label: "输出",
            content: `画布方向为${orientationLabel(input.platformPreset?.orientation, providerMapping.resolvedAspectRatio)}；实际请求尺寸 ${promptDisplayValue(providerMapping.resolvedSize)}；实际请求比例 ${promptDisplayValue(providerMapping.resolvedAspectRatio)}`,
        },
        ...(negatives.length ? [{ id: "negative" as const, label: "禁止项", content: `避免：${negatives.join("；")}` }] : []),
    ] satisfies PromptSection[];
    const stableSections = mergeDuplicateSections(sections.filter((section) => Boolean(section.content.trim())));
    const systemFinalPrompt = preservesRawPrompt ? userPrompt : stableSections.map((section) => `${section.label}：\n${section.content}`).join("\n\n");
    const manualOverride = Boolean(input.manualOverride && input.manualFinalPrompt?.trim());
    const finalPrompt = manualOverride ? input.manualFinalPrompt!.trim() : systemFinalPrompt;
    const warnings = uniqueFragments([
        providerMapping.support === "closest-ratio" ? `当前模型不支持 ${providerMapping.requestedAspectRatio}，需要确认后改用 ${providerMapping.resolvedAspectRatio}；系统不会裁剪或拉伸。` : "",
        providerMapping.support === "scaled" ? `当前模型会把 ${providerMapping.requestedSize} 等比映射为 ${providerMapping.resolvedSize}；需要确认后生成。` : "",
        providerMapping.support === "unknown" ? "当前兼容渠道未声明精确尺寸能力，请在生成前核对实际请求参数。" : "",
        providerMapping.note,
        ...skill.warnings,
    ]);
    const resolvedQuality = input.model.quality && input.model.quality !== "auto" ? input.model.quality : input.platformPreset?.quality || "auto";
    const resolvedCount = Math.max(1, Math.min(15, Math.round(input.model.count) || 1));
    const reproducibilitySnapshot = {
        compilerVersion: IMAGE_DESIGN_COMPILER_VERSION,
        promptVersion: IMAGE_DESIGN_PROMPT_VERSION,
        designSkillId: input.designSkill.id,
        platformPresetId: input.platformPreset?.id,
        skillOptions: { ...input.skillOptions },
        structuredContent: input.structuredContent,
        customInstructions: input.customInstructions?.trim() || undefined,
        negativeInstructions: input.negativeInstructions?.trim() || undefined,
        referenceImageRoles: referenceImageRoles.map((reference) => ({ ...reference })),
        language: input.language ?? "zh-CN",
        promptSections: stableSections,
        systemFinalPrompt,
        finalPrompt,
        manualOverride,
        resolvedSize: providerMapping.resolvedSize,
        resolvedAspectRatio: providerMapping.resolvedAspectRatio,
        resolvedQuality,
        resolvedCount,
        providerMapping,
    };

    return {
        systemFinalPrompt,
        finalPrompt,
        negativePromptFragments: negatives,
        resolvedSize: providerMapping.resolvedSize,
        resolvedAspectRatio: providerMapping.resolvedAspectRatio,
        resolvedQuality,
        resolvedCount,
        promptSections: stableSections,
        warnings,
        providerMapping,
        reproducibilitySnapshot,
        manualOverride,
    };
}

function compileStructuredContent(value: PromptCompileInput["structuredContent"], skill: PromptCompileInput["designSkill"]) {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if ("kind" in value) return compilePlanItem(value, skill);
    const plan = value as StructuredPlan;
    return [
        `计划摘要：${plan.summary}`,
        plan.learningGoals?.length ? `学习 / 传播目标：${plan.learningGoals.join("；")}` : "",
        `视觉圣经：${plan.visualBible}`,
        `结构化条目：${plan.items
            .map((item) => {
                const required = item.requiredText?.length ? `；必须逐字保留 ${item.requiredText.map((text) => `“${text}”`).join("、")}` : "";
                return `${item.order + 1}. ${item.title}：${item.body}${required}`;
            })
            .join("\n")}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function compilePlanItem(item: StructuredPlanItem, skill: PromptCompileInput["designSkill"]) {
    const typeGroup = skill.optionGroups.find((group) => group.key === "illustrationType");
    const illustrationType = findOption(typeGroup?.options, item.illustrationType)?.nameZh || item.illustrationType;
    return [
        item.chapter ? `对应章节：${item.chapter}` : "",
        `本图标题：${item.title}`,
        `本图内容：${item.body}`,
        item.purpose ? `本图目的：${item.purpose}` : "",
        illustrationType ? `插图类型：${illustrationType}` : "",
        item.visualDescription ? `视觉内容：${item.visualDescription}` : "",
        item.requiredText?.length ? `必须逐字准确保留：${item.requiredText.map((text) => `“${text}”`).join("、")}` : "",
    ]
        .filter(Boolean)
        .join("；");
}

function compileReferences(references: PromptReference[]) {
    return references.map((reference) => `${reference.label}（${reference.name || "参考图"}）：${ROLE_INSTRUCTIONS[reference.role]}`).join("；");
}

function orientationLabel(orientation: string | undefined, aspect: string) {
    if (orientation === "portrait") return "竖向";
    if (orientation === "landscape") return "横向";
    if (orientation === "square") return "方形";
    const [width, height] = aspect.split(":").map(Number);
    if (Number.isFinite(width) && Number.isFinite(height)) return width === height ? "方形" : width > height ? "横向" : "竖向";
    return "按请求比例";
}

function promptDisplayValue(value: string) {
    return value === "auto" ? "由模型自动决定" : value;
}

function mergeDuplicateSections(sections: PromptSection[]) {
    const merged = new Map<PromptSection["id"], PromptSection>();
    for (const section of sections) {
        const current = merged.get(section.id);
        merged.set(section.id, current ? { ...current, content: uniqueFragments([current.content, section.content]).join("；") } : section);
    }
    const order: PromptSection["id"][] = ["user", "goal", "structure", "custom", "layout", "composition", "style", "palette", "lighting", "text", "platform", "references", "output", "negative"];
    return order.flatMap((id) => {
        const section = merged.get(id);
        return section ? [section] : [];
    });
}

function uniqueFragments(values: string[]) {
    const seen = new Set<string>();
    return values
        .flatMap((value) => value.split(/\n+/))
        .map((value) => value.trim())
        .filter((value) => {
            const normalized = value.replace(/[，。；,.;:\s]+/g, "").toLowerCase();
            if (!normalized || seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
}
