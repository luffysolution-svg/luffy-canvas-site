import { findOption } from "../registry/option-utils";
import type { DesignSkillDefinition, PromptSection, SkillOptionValue } from "../types";

type CompiledSkill = {
    sections: PromptSection[];
    negatives: string[];
    warnings: string[];
};

const SECTION_KEYS: Array<{ id: PromptSection["id"]; label: string; keys: RegExp }> = [
    { id: "structure", label: "内容结构", keys: /^(type|preset|contentType|illustrationType|diagramType|art|pageFormat|panelCount|pageCount)$/i },
    { id: "layout", label: "布局", keys: /(layout|density|direction|strategy|reading)/i },
    { id: "style", label: "风格", keys: /(style|rendering|art|tone|mood)/i },
    { id: "palette", label: "配色", keys: /(palette|color)/i },
    { id: "text", label: "文字", keys: /(text|font|language|dialogue|narration|caption)/i },
];

export function compileSkillRules(skill: DesignSkillDefinition, values: Record<string, SkillOptionValue>, platformConstrained = false): CompiledSkill {
    if (skill.id === "none") return { sections: [], negatives: [], warnings: [] };
    const effectiveValues = expandPresetOptions(skill, values);
    const fragments = new Map<PromptSection["id"], string[]>();
    const negatives: string[] = [];
    const warnings: string[] = [];

    append(fragments, "structure", skill.contentStructureFragment);
    append(fragments, "composition", skill.compositionFragment);
    append(fragments, "lighting", skill.lightingMaterialFragment);

    for (const group of skill.optionGroups) {
        if (platformConstrained && (group.key === "aspectRatio" || group.key === "customAspectRatio")) continue;
        if (group.visibleWhen) {
            const controllingGroup = skill.optionGroups.find((candidate) => candidate.key === group.visibleWhen?.key);
            const controllingValue = effectiveValues[group.visibleWhen.key] ?? controllingGroup?.defaultValue;
            if (!group.visibleWhen.values.includes(controllingValue)) continue;
        }
        const value = effectiveValues[group.key] ?? group.defaultValue;
        const option = findOption(group.options, value);
        const target = SECTION_KEYS.find((entry) => entry.keys.test(group.key)) || { id: "composition" as const, label: "构图" };
        if (option) {
            const isConcreteOption = !isSelectionStrategy(option.id) && !(group.key === "preset" && option.id === "none");
            if (isConcreteOption) {
                append(fragments, target.id, group.key === "preset" ? compilePresetFragment(option) : option.promptFragment);
                if (option.negativeFragment) negatives.push(option.negativeFragment);
            }
            warnings.push(...compatibilityWarnings(skill, effectiveValues, group.key, option));
        } else if (typeof value === "string" && value.trim() && value !== "auto" && value !== "style-default" && value !== "platform") {
            append(fragments, target.id, `${group.label}：${value.trim()}`);
        } else if (typeof value === "number") {
            append(fragments, target.id, `${group.label}：${value}`);
        } else if (typeof value === "boolean") {
            append(fragments, target.id, `${group.label}：${value ? "启用" : "关闭"}`);
        }
    }

    const labels = new Map<PromptSection["id"], string>([
        ["structure", "内容结构"],
        ["layout", "布局"],
        ["composition", "构图"],
        ["style", "风格"],
        ["palette", "配色"],
        ["lighting", "光线与材质"],
        ["text", "文字"],
    ]);
    const order: PromptSection["id"][] = ["structure", "layout", "composition", "style", "palette", "lighting", "text"];
    return {
        sections: order.flatMap((id) => {
            const content = unique(fragments.get(id) || []).join("；");
            return content ? [{ id, label: labels.get(id) || id, content }] : [];
        }),
        negatives: unique(negatives),
        warnings: unique(warnings),
    };
}

export function expandPresetOptions(skill: DesignSkillDefinition, values: Record<string, SkillOptionValue>) {
    const effective = { ...values };
    const presetGroup = skill.optionGroups.find((group) => group.key === "preset");
    const preset = findOption(presetGroup?.options, effective.preset ?? presetGroup?.defaultValue);
    for (const [targetKey, preferredValues] of Object.entries(preset?.compatibility.preferredWith || {})) {
        const targetGroup = skill.optionGroups.find((group) => group.key === targetKey);
        const current = effective[targetKey] ?? targetGroup?.defaultValue;
        if (!targetGroup || !isPresetFillable(current) || !preferredValues.length) continue;
        if (targetGroup.options?.some((option) => option.id === preferredValues[0])) effective[targetKey] = preferredValues[0];
    }
    return effective;
}

function compatibilityWarnings(skill: DesignSkillDefinition, values: Record<string, SkillOptionValue>, groupKey: string, option: NonNullable<ReturnType<typeof findOption>>) {
    return Object.entries(option.compatibility.incompatibleWith || {}).flatMap(([targetKey, incompatible]) => {
        const targetGroup = skill.optionGroups.find((group) => group.key === targetKey);
        const targetValue = values[targetKey] ?? targetGroup?.defaultValue;
        if (typeof targetValue !== "string" || !incompatible.includes(targetValue)) return [];
        const target = findOption(targetGroup?.options, targetValue);
        return [`“${option.nameZh}”与“${target?.nameZh || targetValue}”属于上游不推荐组合；已尊重显式选择，请生成后重点检查视觉一致性。`];
    });
}

function compilePresetFragment(option: NonNullable<ReturnType<typeof findOption>>) {
    if (option.id === "none") return "";
    const specialRules = option.promptFragment
        .split("。")
        .slice(1)
        .map((fragment) => fragment.trim())
        .filter((fragment) => fragment && !/显式维度|用户显式|平台硬约束/.test(fragment));
    return [`采用“${option.nameZh}”整体预设：${option.description}`, ...specialRules].join("；");
}

function isSelectionStrategy(value: unknown) {
    return value === "auto" || value === "style-default" || value === "platform" || value === "custom";
}

function isPresetFillable(value: unknown) {
    return value === "auto" || value === "style-default" || value === "platform";
}

function append(target: Map<PromptSection["id"], string[]>, key: PromptSection["id"], value: string) {
    if (!value.trim()) return;
    target.set(key, [...(target.get(key) || []), value.trim()]);
}

function unique(values: string[]) {
    const seen = new Set<string>();
    return values.filter((value) => {
        const normalized = value
            .trim()
            .replace(/[，。；,.;:\s]+/g, "")
            .toLowerCase();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}
