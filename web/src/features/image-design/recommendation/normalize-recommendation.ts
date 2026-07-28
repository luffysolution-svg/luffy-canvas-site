import { DESIGN_SKILL_IDS, type DesignSkillId, type ImageDesignRecommendation, type SkillOptionValue } from "../types";
import { defaultSkillOptions, designSkillById } from "../registry/design-skills";
import { platformPresetById } from "../registry/platform-presets";
import type { RecommendationInput } from "./local-recommender";

export function normalizeAiRecommendation(value: string, fallback: ImageDesignRecommendation, input: RecommendationInput): ImageDesignRecommendation {
    const parsed = parseJsonObject(value);
    if (!parsed) return { ...fallback, source: "fallback", warnings: [...fallback.warnings, "文本模型没有返回有效 JSON，已使用本地推荐。"] };
    const requestedSkill = typeof parsed.skillId === "string" && DESIGN_SKILL_IDS.includes(parsed.skillId as DesignSkillId) ? (parsed.skillId as DesignSkillId) : fallback.skillId;
    const skillId = input.skillSelectionExplicit && input.skillId === "none" ? "none" : input.skillId && input.skillId !== "none" ? input.skillId : requestedSkill;
    const requestedPreset = typeof parsed.platformPresetId === "string" && (parsed.platformPresetId === "manual" || platformPresetById(parsed.platformPresetId)) ? parsed.platformPresetId : fallback.platformPresetId;
    const platformPresetId = input.platformSelectionExplicit && input.platformPresetId === "manual" ? "manual" : input.platformPresetId && input.platformPresetId !== "manual" ? input.platformPresetId : requestedPreset;
    const skill = designSkillById(skillId);
    const rawOptions = parsed.options && typeof parsed.options === "object" && !Array.isArray(parsed.options) ? (parsed.options as Record<string, unknown>) : {};
    const options: Record<string, SkillOptionValue> = defaultSkillOptions(skillId);
    const reasoning = normalizeReasoning(parsed.reasoning, fallback.reasoning);

    for (const group of skill.optionGroups) {
        const fallbackValue = fallback.options[group.key];
        if (skillId === fallback.skillId && isValidGroupValue(group, fallbackValue)) options[group.key] = fallbackValue;
        const explicitValue = input.explicitOptions?.[group.key];
        if (explicitValue !== undefined && isValidGroupValue(group, explicitValue) && !isSelectionStrategy(explicitValue)) {
            options[group.key] = explicitValue;
            reasoning[group.key] = "保留用户明确指定的参数。";
            continue;
        }
        const candidate = rawOptions[group.key];
        if (group.control === "number" && typeof candidate === "number" && Number.isFinite(candidate)) {
            options[group.key] = Math.max(group.min ?? candidate, Math.min(group.max ?? candidate, candidate));
        } else if (group.control === "switch" && typeof candidate === "boolean") {
            options[group.key] = candidate;
        } else if ((group.control === "text" || group.control === "textarea") && typeof candidate === "string") {
            options[group.key] = candidate.trim();
        } else if (typeof candidate === "string" && !isSelectionStrategy(candidate) && group.options?.some((option) => option.id === candidate)) {
            options[group.key] = candidate;
        }
    }

    return {
        skillId,
        platformPresetId,
        options,
        reasoning,
        source: "ai",
        confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.82,
        warnings: [],
    };
}

function isSelectionStrategy(value: unknown) {
    return value === "auto" || value === "style-default";
}

function isValidGroupValue(group: ReturnType<typeof designSkillById>["optionGroups"][number], value: unknown): value is SkillOptionValue {
    if (group.control === "number") return typeof value === "number" && Number.isFinite(value) && value >= (group.min ?? value) && value <= (group.max ?? value);
    if (group.control === "switch") return typeof value === "boolean";
    if (group.control === "text" || group.control === "textarea") return typeof value === "string";
    return typeof value === "string" && Boolean(group.options?.some((option) => option.id === value));
}

function parseJsonObject(value: string) {
    let text = value.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    if (fenced) text = fenced[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function normalizeReasoning(value: unknown, fallback: Record<string, string>) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ...fallback };
    return {
        ...fallback,
        ...Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[1] === "string")
                .map(([key, reason]) => [key, reason.trim().slice(0, 120)])
                .filter(([, reason]) => Boolean(reason)),
        ),
    };
}
