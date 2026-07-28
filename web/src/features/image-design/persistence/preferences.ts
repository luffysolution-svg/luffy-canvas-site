import type { ChannelProvider } from "@/stores/use-config-store";

import { DEFAULT_IMAGE_DESIGN_PREFERENCES, DEFAULT_PLATFORM_PRESET_ID } from "../constants";
import { BUILTIN_PLATFORM_PRESETS, validatePlatformPreset } from "../registry/platform-presets";
import {
    DESIGN_SKILL_IDS,
    type DesignSkillId,
    type ImageDesignLanguage,
    type ImageDesignPreferences,
    type PlatformAvoidZone,
    type PlatformInsets,
    type PlatformPreset,
    type PlatformProviderMapping,
    type SkillOptionValue,
    type StructuredPlan,
    type StructuredPlanItem,
    type StructuredPlanItemKind,
    type StructuredPlanItemStatus,
    type StructuredPlanType,
} from "../types";

export const MIN_SERIES_COUNT = 1;
export const MAX_SERIES_COUNT = 10;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 10;
export const MAX_RECENT_PRESETS = 20;

const DESIGN_SKILLS = new Set<string>(DESIGN_SKILL_IDS);
const LANGUAGES = new Set<ImageDesignLanguage>(["zh-CN", "en"]);
const PLAN_TYPES = new Set<StructuredPlanType>(["series", "article", "infographic", "storyboard", "diagram"]);
const PLAN_ITEM_KINDS = new Set<StructuredPlanItemKind>(["cover", "content", "summary", "illustration", "panel", "page", "section"]);
const PLAN_ITEM_STATUSES = new Set<StructuredPlanItemStatus>(["idle", "queued", "generating", "succeeded", "failed", "cancelled"]);
const ORIENTATIONS = new Set(["landscape", "portrait", "square"]);
const TEXT_DENSITIES = new Set(["none", "low", "medium", "high"]);
const OUTPUT_FORMATS = new Set(["png"]);
const MAPPING_SUPPORT = new Set(["exact", "same-ratio", "closest-ratio", "scaled", "unknown"]);
const PROVIDERS = Object.keys(BUILTIN_PLATFORM_PRESETS[0]?.providerMappings || {}) as ChannelProvider[];
const BUILTIN_PRESET_IDS = new Set(BUILTIN_PLATFORM_PRESETS.map((preset) => preset.id));
const RESERVED_PRESET_IDS = new Set([DEFAULT_PLATFORM_PRESET_ID, ...BUILTIN_PRESET_IDS]);

export function createDefaultImageDesignPreferences(): ImageDesignPreferences {
    return {
        ...DEFAULT_IMAGE_DESIGN_PREFERENCES,
        skillOptions: {},
        customOptions: {},
        customPresets: [],
        favorites: [],
        recentPresetIds: [...DEFAULT_IMAGE_DESIGN_PREFERENCES.recentPresetIds],
        lastUsedBySkill: {},
        seriesPlan: null,
    };
}

export function isDesignSkillId(value: unknown): value is DesignSkillId {
    return typeof value === "string" && DESIGN_SKILLS.has(value);
}

export function sanitizeImageDesignPreferences(value: unknown): ImageDesignPreferences {
    const defaults = createDefaultImageDesignPreferences();
    const record = isRecord(value) ? value : {};
    const customPresets = sanitizeCustomPlatformPresets(record.customPresets);
    const presets = [...customPresets, ...BUILTIN_PLATFORM_PRESETS];
    const presetIds = new Set([DEFAULT_PLATFORM_PRESET_ID, ...presets.map((preset) => preset.id)]);
    const platforms = new Set([defaults.selectedPlatformId, ...presets.map((preset) => preset.platform)]);
    const requestedPresetId = readId(record.selectedPresetId);
    const selectedPreset = presets.find((preset) => preset.id === requestedPresetId);
    const selectedPresetId = selectedPreset ? selectedPreset.id : requestedPresetId === DEFAULT_PLATFORM_PRESET_ID ? requestedPresetId : defaults.selectedPresetId;
    const manualSelection = requestedPresetId === DEFAULT_PLATFORM_PRESET_ID;
    const knownPresetIds = (input: unknown) => sanitizeStringList(input).filter((id) => presetIds.has(id));

    return {
        selectedSkillId: isDesignSkillId(record.selectedSkillId) ? record.selectedSkillId : defaults.selectedSkillId,
        selectedPlatformId: selectedPreset?.platform || (manualSelection ? readId(record.selectedPlatformId) || defaults.selectedPlatformId : defaults.selectedPlatformId),
        selectedPresetId,
        selectedContentType: selectedPreset?.contentType || (manualSelection ? readId(record.selectedContentType) || defaults.selectedContentType : defaults.selectedContentType),
        skillOptions: sanitizeSkillOptions(record.skillOptions),
        customOptions: sanitizeStringRecord(record.customOptions),
        quickMode: readBoolean(record.quickMode, defaults.quickMode),
        confirmBeforeGeneration: readBoolean(record.confirmBeforeGeneration, defaults.confirmBeforeGeneration),
        useAiRecommendation: readBoolean(record.useAiRecommendation, defaults.useAiRecommendation),
        finalPromptPreviewOpen: readBoolean(record.finalPromptPreviewOpen, defaults.finalPromptPreviewOpen),
        finalPromptPreviewEnabled: readBoolean(record.finalPromptPreviewEnabled, defaults.finalPromptPreviewEnabled),
        defaultLanguage: LANGUAGES.has(record.defaultLanguage as ImageDesignLanguage) ? (record.defaultLanguage as ImageDesignLanguage) : defaults.defaultLanguage,
        defaultSkillId: isDesignSkillId(record.defaultSkillId) ? record.defaultSkillId : defaults.defaultSkillId,
        defaultPlatformId: platforms.has(readId(record.defaultPlatformId)) ? readId(record.defaultPlatformId) : defaults.defaultPlatformId,
        defaultPalette: readString(record.defaultPalette, defaults.defaultPalette),
        defaultStyle: readString(record.defaultStyle, defaults.defaultStyle),
        defaultSeriesCount: readBoundedInteger(record.defaultSeriesCount, defaults.defaultSeriesCount, MIN_SERIES_COUNT, MAX_SERIES_COUNT),
        anchorChainEnabled: readBoolean(record.anchorChainEnabled, defaults.anchorChainEnabled),
        batchSize: readBoundedInteger(record.batchSize, defaults.batchSize, MIN_BATCH_SIZE, MAX_BATCH_SIZE),
        customPresets,
        favorites: unique(knownPresetIds(record.favorites)),
        recentPresetIds: unique(knownPresetIds(record.recentPresetIds)).slice(0, MAX_RECENT_PRESETS),
        lastUsedBySkill: sanitizeLastUsedBySkill(record.lastUsedBySkill),
        seriesPlan: sanitizeStructuredPlan(record.seriesPlan),
    };
}

export function pickImageDesignPreferences(value: ImageDesignPreferences): ImageDesignPreferences {
    return sanitizeImageDesignPreferences(value);
}

export function sanitizeOptionRecord(value: unknown): Record<string, SkillOptionValue> {
    if (!isRecord(value)) return {};
    const result: Record<string, SkillOptionValue> = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
        const key = rawKey.trim();
        if (!key || !isSkillOptionValue(rawValue)) continue;
        result[key] = rawValue;
    }
    return result;
}

export function sanitizeCustomPlatformPresets(value: unknown): PlatformPreset[] {
    if (!Array.isArray(value)) return [];
    const presets = new Map<string, PlatformPreset>();
    for (const candidate of value) {
        const preset = sanitizeCustomPlatformPreset(candidate);
        if (!preset || RESERVED_PRESET_IDS.has(preset.id)) continue;
        presets.set(preset.id, preset);
    }
    return Array.from(presets.values());
}

export function sanitizeCustomPlatformPreset(value: unknown): PlatformPreset | null {
    if (!validatePlatformPreset(value) || !isRecord(value)) return null;
    const preset = value as PlatformPreset;
    const id = readId(preset.id);
    const platform = readId(preset.platform);
    const platformLabel = readString(preset.platformLabel);
    const contentType = readId(preset.contentType);
    const label = readString(preset.label);
    const description = typeof preset.description === "string" ? preset.description : "";
    const safeArea = sanitizeInsets(preset.safeArea);
    const avoidZones = sanitizeAvoidZones(preset.avoidZones);
    const providerMappings = sanitizeProviderMappings(preset.providerMappings);
    const promptFragments = sanitizeStringArrayStrict(preset.promptFragments);
    const negativeFragments = sanitizeStringArrayStrict(preset.negativeFragments);

    if (!id || !platform || !platformLabel || !contentType || !label || !safeArea || !avoidZones || !providerMappings || !promptFragments || !negativeFragments) return null;
    if (!ORIENTATIONS.has(preset.orientation) || !TEXT_DENSITIES.has(preset.textDensity) || !OUTPUT_FORMATS.has(preset.outputFormat)) return null;
    if (!isFiniteNumber(preset.edgeMargin) || preset.edgeMargin < 0 || preset.edgeMargin > 100) return null;
    if (!isFiniteNumber(preset.focalScale) || preset.focalScale <= 0 || preset.focalScale > 1) return null;
    if (!Number.isInteger(preset.maxTitleLines) || preset.maxTitleLines < 0 || preset.maxTitleLines > 20) return null;
    if (!readString(preset.quality) || !readString(preset.subjectPosition) || !readString(preset.titlePosition) || !readString(preset.version) || !readString(preset.verifiedAt)) return null;
    if (!matchesPresetGeometry(preset)) return null;

    return {
        ...preset,
        id,
        platform,
        platformLabel,
        contentType,
        label,
        description,
        generationSize: { ...preset.generationSize },
        targetPlatformSize: { ...preset.targetPlatformSize },
        safeArea,
        avoidZones,
        promptFragments,
        negativeFragments,
        providerMappings,
        sourceLevel: "custom",
        isCustom: true,
    };
}

export function importCustomPlatformPresets(value: string): PlatformPreset[] {
    const parsed: unknown = JSON.parse(value);
    const candidates = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.presets) ? parsed.presets : [];
    if (!candidates.length) throw new Error("预设 JSON 中没有有效的平台预设");

    const presets = candidates.map(sanitizeCustomPlatformPreset);
    if (presets.some((preset) => !preset)) throw new Error("预设 JSON 中包含无效的平台预设");

    const valid = presets.filter((preset): preset is PlatformPreset => Boolean(preset));
    if (valid.some((preset) => RESERVED_PRESET_IDS.has(preset.id))) throw new Error("自定义预设 id 不能与内置预设重复");
    if (new Set(valid.map((preset) => preset.id)).size !== valid.length) throw new Error("导入的平台预设 id 不能重复");
    return valid;
}

export function sanitizeStructuredPlan(value: unknown): StructuredPlan | null {
    if (value == null) return null;
    if (!isRecord(value) || !readId(value.id) || !PLAN_TYPES.has(value.type as StructuredPlanType) || !Array.isArray(value.items)) return null;

    const seenIds = new Set<string>();
    const items = value.items
        .map(sanitizeStructuredPlanItem)
        .filter((item): item is StructuredPlanItem => Boolean(item))
        .filter((item) => {
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);
            return true;
        })
        .map((item, index) => ({ ...item, order: index }));

    return {
        id: readId(value.id),
        type: value.type as StructuredPlanType,
        title: readString(value.title),
        summary: readString(value.summary),
        visualBible: readString(value.visualBible),
        items,
        sourceDigest: readString(value.sourceDigest),
        ...optionalString("planningSignature", value.planningSignature),
        ...optionalString("visualSignature", value.visualSignature),
        ...optionalString("autoVisualBible", value.autoVisualBible),
        ...(value.learningGoals === undefined ? {} : { learningGoals: sanitizeStringArrayStrict(value.learningGoals) || [] }),
    };
}

export function sanitizeStructuredPlanItem(value: unknown): StructuredPlanItem | null {
    if (!isRecord(value) || !readId(value.id) || !PLAN_ITEM_KINDS.has(value.kind as StructuredPlanItemKind)) return null;
    const requiredText = value.requiredText === undefined ? undefined : sanitizeStringArrayStrict(value.requiredText);
    if (value.requiredText !== undefined && !requiredText) return null;
    const status = PLAN_ITEM_STATUSES.has(value.status as StructuredPlanItemStatus) ? (value.status as StructuredPlanItemStatus) : undefined;

    return {
        id: readId(value.id),
        order: Number.isInteger(value.order) ? (value.order as number) : 0,
        kind: value.kind as StructuredPlanItemKind,
        title: readString(value.title),
        body: readString(value.body),
        ...optionalString("chapter", value.chapter),
        ...optionalString("purpose", value.purpose),
        ...optionalString("illustrationType", value.illustrationType),
        ...optionalString("visualDescription", value.visualDescription),
        ...(requiredText ? { requiredText } : {}),
        ...optionalString("finalPrompt", value.finalPrompt),
        ...(status ? { status } : {}),
        ...optionalString("error", value.error),
    };
}

function sanitizeSkillOptions(value: unknown) {
    if (!isRecord(value)) return {};
    const result: ImageDesignPreferences["skillOptions"] = {};
    for (const [skillId, options] of Object.entries(value)) {
        if (!isDesignSkillId(skillId)) continue;
        result[skillId] = sanitizeOptionRecord(options);
    }
    return result;
}

function sanitizeLastUsedBySkill(value: unknown) {
    if (!isRecord(value)) return {};
    const result: ImageDesignPreferences["lastUsedBySkill"] = {};
    for (const [skillId, options] of Object.entries(value)) {
        if (!isDesignSkillId(skillId)) continue;
        result[skillId] = sanitizeOptionRecord(options);
    }
    return result;
}

function sanitizeStringRecord(value: unknown) {
    if (!isRecord(value)) return {};
    const result: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(value)) {
        const key = rawKey.trim();
        if (!key || typeof rawValue !== "string") continue;
        result[key] = rawValue;
    }
    return result;
}

function sanitizeInsets(value: unknown): PlatformInsets | null {
    if (!isRecord(value)) return null;
    const entries = [value.top, value.right, value.bottom, value.left];
    if (entries.some((entry) => !isFiniteNumber(entry) || entry < 0 || entry > 100)) return null;
    if ((value.top as number) + (value.bottom as number) >= 100 || (value.left as number) + (value.right as number) >= 100) return null;
    return {
        top: value.top as number,
        right: value.right as number,
        bottom: value.bottom as number,
        left: value.left as number,
        unit: "percent",
        description: readString(value.description),
    };
}

function sanitizeAvoidZones(value: unknown): PlatformAvoidZone[] | null {
    if (!Array.isArray(value)) return null;
    const zones = value.map((zone) => {
        if (!isRecord(zone) || !readId(zone.id) || !readString(zone.label)) return null;
        const dimensions = [zone.x, zone.y, zone.width, zone.height];
        if (dimensions.some((entry) => !isFiniteNumber(entry) || entry < 0 || entry > 100) || (zone.width as number) <= 0 || (zone.height as number) <= 0) return null;
        if ((zone.x as number) + (zone.width as number) > 100 || (zone.y as number) + (zone.height as number) > 100) return null;
        return {
            id: readId(zone.id),
            label: readString(zone.label),
            x: zone.x as number,
            y: zone.y as number,
            width: zone.width as number,
            height: zone.height as number,
            unit: "percent" as const,
        };
    });
    return zones.some((zone) => !zone) ? null : (zones as PlatformAvoidZone[]);
}

function sanitizeProviderMappings(value: unknown): Record<ChannelProvider, PlatformProviderMapping> | null {
    if (!isRecord(value) || !PROVIDERS.length) return null;
    const result = {} as Record<ChannelProvider, PlatformProviderMapping>;
    for (const provider of PROVIDERS) {
        const mapping = value[provider];
        if (!isRecord(mapping) || !readString(mapping.requestSize) || !readString(mapping.requestAspectRatio) || !MAPPING_SUPPORT.has(mapping.support as string) || typeof mapping.note !== "string") return null;
        result[provider] = {
            requestSize: readString(mapping.requestSize),
            requestAspectRatio: readString(mapping.requestAspectRatio),
            support: mapping.support as PlatformProviderMapping["support"],
            note: mapping.note,
        };
    }
    return result;
}

function sanitizeStringArrayStrict(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
    return value.map((item) => item.trim()).filter(Boolean);
}

function sanitizeStringList(value: unknown) {
    return Array.isArray(value) ? value.map(readId).filter(Boolean) : [];
}

function optionalString<Key extends string>(key: Key, value: unknown): Partial<Record<Key, string>> {
    return typeof value === "string" ? ({ [key]: value } as Record<Key, string>) : {};
}

function isSkillOptionValue(value: unknown): value is SkillOptionValue {
    return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function readBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function readBoolean(value: unknown, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
}

function readId(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function readString(value: unknown, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function matchesPresetGeometry(preset: PlatformPreset) {
    const width = preset.generationSize.width;
    const height = preset.generationSize.height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return false;
    const [ratioWidth, ratioHeight, extra] = preset.aspectRatio.split(":").map(Number);
    if (extra !== undefined || !Number.isFinite(ratioWidth) || !Number.isFinite(ratioHeight) || ratioWidth <= 0 || ratioHeight <= 0) return false;
    const actualRatio = width / height;
    const declaredRatio = ratioWidth / ratioHeight;
    if (Math.abs(actualRatio - declaredRatio) / declaredRatio > 0.015) return false;
    const expectedOrientation = width === height ? "square" : width > height ? "landscape" : "portrait";
    return preset.orientation === expectedOrientation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function unique(values: string[]) {
    return Array.from(new Set(values));
}
