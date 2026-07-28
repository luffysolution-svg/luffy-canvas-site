import type { DesignSkillId, SkillOptionValue, StructuredPlan } from "../types";
import { createDesignPlan } from "./create-design-plan";
import { sourceDigest } from "./text-planning";

const SHAPING_OPTION_KEYS: Partial<Record<DesignSkillId, string[]>> = {
    "xhs-images": ["count", "outlineStrategy"],
    "article-illustrator": ["count", "density", "illustrationType", "customIllustrationType"],
    comic: ["panelCount", "pageCount", "readingDirection", "layout", "customLayout", "textMode", "dialogueDensity", "narrationDensity", "characters", "setting"],
    infographic: ["highDensity", "dataFidelity"],
    diagram: ["diagramType", "customDiagramType"],
};

const VISUAL_OPTION_KEYS: Partial<Record<DesignSkillId, string[]>> = {
    "cover-image": ["preset", "type", "palette", "rendering", "textMode", "mood", "font"],
    "xhs-images": ["preset", "style", "customStyle", "layout", "customLayout", "palette", "customPalette", "outlineStrategy"],
    infographic: ["layout", "customLayout", "style", "customStyle", "aspectRatio", "customAspectRatio", "highDensity"],
    "article-illustrator": ["preset", "illustrationType", "customIllustrationType", "style", "customStyle", "palette", "customPalette"],
    comic: ["preset", "artStyle", "customArtStyle", "tone", "customTone", "layout", "customLayout", "characters", "setting"],
    diagram: ["diagramType", "customDiagramType"],
};

export function stampDesignPlan(plan: StructuredPlan | null, skillId: DesignSkillId, prompt: string, options: Record<string, SkillOptionValue>, explicitOptionKeys: readonly string[] = []) {
    if (!plan) return null;
    return {
        ...plan,
        sourceDigest: sourceDigest(prompt),
        planningSignature: optionSignature(skillId, prompt, options, SHAPING_OPTION_KEYS, explicitOptionKeys),
        visualSignature: optionSignature(skillId, prompt, options, VISUAL_OPTION_KEYS),
        autoVisualBible: plan.visualBible,
    };
}

export function normalizeDesignPlan(plan: StructuredPlan | null, skillId: DesignSkillId, prompt: string, options: Record<string, SkillOptionValue>, explicitOptionKeys: readonly string[] = []) {
    if (!plan || !prompt.trim() || plan.sourceDigest !== sourceDigest(prompt)) return null;
    const planningSignature = optionSignature(skillId, prompt, options, SHAPING_OPTION_KEYS, explicitOptionKeys);
    if (plan.planningSignature && plan.planningSignature !== planningSignature) return null;

    const visualSignature = optionSignature(skillId, prompt, options, VISUAL_OPTION_KEYS);
    const visualOptionsChanged = Boolean(plan.visualSignature && plan.visualSignature !== visualSignature);
    const freshVisualBible = createDesignPlan(skillId, prompt, options, explicitOptionKeys).plan?.visualBible || plan.autoVisualBible || plan.visualBible;
    const userEditedVisualBible = Boolean(plan.autoVisualBible && plan.visualBible !== plan.autoVisualBible);

    return {
        ...plan,
        visualBible: visualOptionsChanged && !userEditedVisualBible ? freshVisualBible : plan.visualBible,
        autoVisualBible: freshVisualBible,
        planningSignature,
        visualSignature,
    };
}

function optionSignature(skillId: DesignSkillId, prompt: string, options: Record<string, SkillOptionValue>, keysBySkill: Partial<Record<DesignSkillId, string[]>>, explicitOptionKeys: readonly string[] = []) {
    const keys = keysBySkill[skillId] || [];
    const selectedOptions = Object.fromEntries(keys.map((key) => [key, options[key]]));
    const explicitKeys = explicitOptionKeys.filter((key) => keys.includes(key)).sort();
    return sourceDigest(JSON.stringify({ skillId, prompt: prompt.trim(), options: selectedOptions, explicitKeys }));
}
