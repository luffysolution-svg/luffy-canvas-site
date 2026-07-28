import type { DesignSkillId, SkillOptionValue, StructuredPlan } from "../types";
import { expandPresetOptions } from "../compiler/compile-skill";
import { designSkillById, skillOptionById } from "../registry/design-skills";
import { COMIC_LAYOUT_PANEL_RULES } from "../registry/comic";
import { resolveInfographicShortcut } from "../registry/infographic";
import { planArticleIllustrations } from "./article-illustration-planner";
import { planCardSeries } from "./card-series-planner";
import { planComicStoryboard } from "./comic-storyboard-planner";
import { planDiagram } from "./diagram-planner";
import { structureInfographic } from "./infographic-structure";

export type DesignPlanResult = {
    plan: StructuredPlan | null;
    warnings: string[];
};

export function createDesignPlan(skillId: DesignSkillId, source: string, options: Record<string, SkillOptionValue>, explicitOptionKeys: readonly string[] = []): DesignPlanResult {
    if (!source.trim() || skillId === "none" || skillId === "cover-image") return { plan: null, warnings: [] };
    const values = expandPresetOptions(designSkillById(skillId), options);
    const explicitKeys = new Set(explicitOptionKeys);
    if (skillId === "xhs-images") {
        return {
            plan: planCardSeries(source, {
                count: numberOption(values.count, 4),
                style: resolvedOption("xhs-images", "style", values).label,
                palette: resolvedOption("xhs-images", "palette", values).label,
                layout: resolvedOption("xhs-images", "layout", values).label,
                presetRule: resolvedPresetRule("xhs-images", values),
                outlineStrategy: oneOf<"story-driven" | "information-dense" | "visual-first">(values.outlineStrategy, ["story-driven", "information-dense", "visual-first"], "information-dense"),
            }),
            warnings: [],
        };
    }
    if (skillId === "article-illustrator") {
        const preferredType = resolvedOption("article-illustrator", "illustrationType", values).value;
        return {
            plan: planArticleIllustrations(source, {
                count: explicitKeys.has("count") ? numberOption(values.count, 4) : undefined,
                density: oneOf<"minimal" | "balanced" | "per-section" | "rich">(values.density, ["minimal", "balanced", "per-section", "rich"], "per-section"),
                preferredType,
                style: resolvedOption("article-illustrator", "style", values).label,
                palette: resolvedOption("article-illustrator", "palette", values).label,
                presetRule: resolvedPresetRule("article-illustrator", values),
            }),
            warnings: [],
        };
    }
    if (skillId === "comic") {
        const layout = resolvedOption("comic", "layout", values);
        const layoutRule = layout.value ? COMIC_LAYOUT_PANEL_RULES[layout.value] : undefined;
        const readingDirection = explicitKeys.has("readingDirection") ? values.readingDirection : layoutRule?.reading || values.readingDirection;
        return {
            plan: planComicStoryboard(source, {
                panelCount: numberOption(values.panelCount, 4),
                pageCount: numberOption(values.pageCount, 1),
                readingDirection: oneOf<"left-to-right" | "right-to-left" | "top-to-bottom">(readingDirection, ["left-to-right", "right-to-left", "top-to-bottom"], "left-to-right"),
                layout: layout.label,
                artStyle: resolvedOption("comic", "artStyle", values).label,
                tone: resolvedOption("comic", "tone", values).label,
                textMode: oneOf<"with-text" | "no-text">(values.textMode, ["with-text", "no-text"], "with-text"),
                dialogueDensity: resolvedOption("comic", "dialogueDensity", values).label,
                narrationDensity: resolvedOption("comic", "narrationDensity", values).label,
                characters: rawTextOption(values.characters),
                setting: rawTextOption(values.setting),
                presetRule: resolvedPresetRule("comic", values),
            }),
            warnings: [],
        };
    }
    if (skillId === "infographic") {
        const shortcut = resolveInfographicShortcut(source);
        const structured = structureInfographic(source, {
            highDensity: explicitKeys.has("highDensity") ? Boolean(values.highDensity) : (shortcut?.highDensity ?? Boolean(values.highDensity)),
            dataFidelity: values.dataFidelity !== false,
            layout: resolvedOption("infographic", "layout", values).label || optionLabel("infographic", "layout", shortcut?.layout),
            style: resolvedOption("infographic", "style", values).label || optionLabel("infographic", "style", shortcut?.style),
            aspectRatio: resolvedOption("infographic", "aspectRatio", values).label || optionLabel("infographic", "aspectRatio", shortcut?.aspectRatio),
        });
        return { plan: structured.plan, warnings: structured.warnings };
    }
    const diagramType = resolvedOption("diagram", "diagramType", values);
    return {
        plan: planDiagram(source, diagramType.value || "flowchart", diagramType.label || "流程图"),
        warnings: [],
    };
}

function numberOption(value: SkillOptionValue | undefined, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function textOption(value: SkillOptionValue | undefined) {
    return typeof value === "string" && !["auto", "style-default", "platform", "custom"].includes(value) ? value : undefined;
}

function rawTextOption(value: SkillOptionValue | undefined) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionLabel(skillId: DesignSkillId, key: string, value: SkillOptionValue | undefined) {
    const id = textOption(value);
    return id ? skillOptionById(skillId, key, id)?.nameZh || id : undefined;
}

function resolvedOption(skillId: DesignSkillId, key: string, options: Record<string, SkillOptionValue>) {
    if (options[key] === "custom") {
        const customValue = rawTextOption(options[`custom${key[0].toUpperCase()}${key.slice(1)}`]);
        return { value: customValue, label: customValue };
    }
    const value = textOption(options[key]);
    return { value, label: value ? skillOptionById(skillId, key, value)?.nameZh || value : undefined };
}

function resolvedPresetRule(skillId: DesignSkillId, options: Record<string, SkillOptionValue>) {
    if (options.preset === "custom") {
        const custom = rawTextOption(options.customPreset);
        return custom ? `自定义整体预设：${custom}` : undefined;
    }
    const id = textOption(options.preset);
    if (!id || id === "none") return undefined;
    const preset = skillOptionById(skillId, "preset", id);
    if (!preset) return undefined;
    const specialRules = preset.promptFragment
        .split("。")
        .slice(1)
        .map((fragment) => fragment.trim())
        .filter(Boolean);
    return [`整体预设：${preset.nameZh}（${preset.description}）`, ...specialRules].join("；");
}

function oneOf<Value extends string>(value: SkillOptionValue | undefined, allowed: readonly Value[], fallback: Value): Value {
    return typeof value === "string" && allowed.includes(value as Value) ? (value as Value) : fallback;
}
