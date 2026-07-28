import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { localForageStorage } from "@/lib/localforage-storage";

import { DEFAULT_PLATFORM_PRESET_ID, IMAGE_DESIGN_STORE_KEY } from "../constants";
import {
    MAX_RECENT_PRESETS,
    createDefaultImageDesignPreferences,
    importCustomPlatformPresets,
    isDesignSkillId,
    pickImageDesignPreferences,
    sanitizeCustomPlatformPreset,
    sanitizeImageDesignPreferences,
    sanitizeOptionRecord,
    sanitizeStructuredPlan,
    sanitizeStructuredPlanItem,
} from "../persistence/preferences";
import { BUILTIN_PLATFORM_PRESETS, exportPlatformPresets, platformPresetById, platformPresetsForPlatform } from "../registry/platform-presets";
import type { DesignSkillId, ImageDesignPreferences, PlatformPreset, SkillOptionValue, StructuredPlan, StructuredPlanItem } from "../types";

export type ImageDesignPreferenceSettings = Pick<
    ImageDesignPreferences,
    | "quickMode"
    | "confirmBeforeGeneration"
    | "useAiRecommendation"
    | "finalPromptPreviewOpen"
    | "finalPromptPreviewEnabled"
    | "defaultLanguage"
    | "defaultSkillId"
    | "defaultPlatformId"
    | "defaultPalette"
    | "defaultStyle"
    | "defaultSeriesCount"
    | "anchorChainEnabled"
    | "batchSize"
>;

type ImageDesignStoreActions = {
    selectSkill: (skillId: DesignSkillId) => void;
    selectPlatform: (platformId: string) => void;
    selectPlatformPreset: (presetId: string) => void;
    selectContentType: (contentType: string) => void;
    updateSkillOption: (skillId: DesignSkillId, key: string, value: SkillOptionValue) => void;
    replaceSkillOptions: (skillId: DesignSkillId, options: Record<string, SkillOptionValue>) => void;
    updateCustomOption: (key: string, value: string) => void;
    removeCustomOption: (key: string) => void;
    replaceCustomOptions: (options: Record<string, string>) => void;
    updatePreferences: (patch: Partial<ImageDesignPreferenceSettings>) => void;
    setSeriesPlan: (plan: StructuredPlan | null) => void;
    replaceSeriesPlanItems: (items: StructuredPlanItem[]) => void;
    addSeriesPlanItem: (item: StructuredPlanItem) => void;
    updateSeriesPlanItem: (id: string, patch: Partial<Omit<StructuredPlanItem, "id">>) => void;
    removeSeriesPlanItem: (id: string) => void;
    moveSeriesPlanItem: (id: string, targetIndex: number) => void;
    toggleFavorite: (presetId: string) => void;
    recordRecentPreset: (presetId: string) => void;
    upsertCustomPreset: (preset: PlatformPreset) => void;
    removeCustomPreset: (presetId: string) => void;
    importCustomPresets: (value: string) => number;
    exportCustomPresets: () => string;
    resetPreferences: () => void;
};

export type ImageDesignStore = ImageDesignPreferences &
    ImageDesignStoreActions & {
        hydrated: boolean;
        skillSelectionExplicit: boolean;
        platformSelectionExplicit: boolean;
        explicitSkillOptionKeys: Partial<Record<DesignSkillId, string[]>>;
    };

export const useImageDesignStore = create<ImageDesignStore>()(
    persist<ImageDesignStore, [], [], ImageDesignPreferences>(
        (set, get) => ({
            ...createDefaultImageDesignPreferences(),
            hydrated: false,
            skillSelectionExplicit: false,
            platformSelectionExplicit: false,
            explicitSkillOptionKeys: {},
            selectSkill: (skillId) => {
                if (!isDesignSkillId(skillId)) return;
                set((state) => {
                    const restored = state.skillOptions[skillId] || state.lastUsedBySkill[skillId];
                    return {
                        selectedSkillId: skillId,
                        skillSelectionExplicit: true,
                        ...(restored
                            ? {
                                  skillOptions: { ...state.skillOptions, [skillId]: { ...restored } },
                              }
                            : {}),
                    };
                });
            },
            selectPlatform: (platformId) => {
                const id = platformId.trim();
                if (!id) return;
                if (id === DEFAULT_PLATFORM_PRESET_ID) {
                    set((state) => ({ ...manualSelection(state), platformSelectionExplicit: true }));
                    return;
                }
                set((state) => {
                    const presets = platformPresetsForPlatform(id, state.customPresets);
                    const preset = presets.find((item) => item.id === state.selectedPresetId) || presets[0];
                    if (!preset) return {};
                    return { ...selectionForPreset(state, preset), platformSelectionExplicit: true };
                });
            },
            selectPlatformPreset: (presetId) => {
                const id = presetId.trim();
                if (!id) return;
                if (id === DEFAULT_PLATFORM_PRESET_ID) {
                    set((state) => ({ ...manualSelection(state), platformSelectionExplicit: true }));
                    return;
                }
                set((state) => {
                    const preset = platformPresetById(id, state.customPresets);
                    return preset ? { ...selectionForPreset(state, preset), platformSelectionExplicit: true } : {};
                });
            },
            selectContentType: (contentType) => {
                const value = contentType.trim();
                if (!value) return;
                set((state) => {
                    const preset = platformPresetsForPlatform(state.selectedPlatformId, state.customPresets).find((item) => item.contentType === value);
                    if (preset) return { ...selectionForPreset(state, preset), platformSelectionExplicit: true };
                    return state.selectedPresetId === DEFAULT_PLATFORM_PRESET_ID ? { selectedContentType: value, platformSelectionExplicit: true } : {};
                });
            },
            updateSkillOption: (skillId, key, value) => {
                const optionKey = key.trim();
                if (!isDesignSkillId(skillId) || !optionKey) return;
                set((state) => {
                    const options = sanitizeOptionRecord({ ...(state.skillOptions[skillId] || {}), [optionKey]: value });
                    return {
                        skillOptions: { ...state.skillOptions, [skillId]: options },
                        lastUsedBySkill: { ...state.lastUsedBySkill, [skillId]: options },
                        explicitSkillOptionKeys: {
                            ...state.explicitSkillOptionKeys,
                            [skillId]: Array.from(new Set([...(state.explicitSkillOptionKeys[skillId] || []), optionKey])),
                        },
                    };
                });
            },
            replaceSkillOptions: (skillId, options) => {
                if (!isDesignSkillId(skillId)) return;
                const sanitized = sanitizeOptionRecord(options);
                set((state) => ({
                    skillOptions: { ...state.skillOptions, [skillId]: sanitized },
                    lastUsedBySkill: { ...state.lastUsedBySkill, [skillId]: sanitized },
                }));
            },
            updateCustomOption: (key, value) => {
                const optionKey = key.trim();
                if (!optionKey || typeof value !== "string") return;
                set((state) => ({ customOptions: { ...state.customOptions, [optionKey]: value } }));
            },
            removeCustomOption: (key) => {
                const optionKey = key.trim();
                if (!optionKey) return;
                set((state) => {
                    const customOptions = { ...state.customOptions };
                    delete customOptions[optionKey];
                    return { customOptions };
                });
            },
            replaceCustomOptions: (options) => {
                set((state) => ({
                    customOptions: sanitizeImageDesignPreferences({ ...state, customOptions: options }).customOptions,
                }));
            },
            updatePreferences: (patch) => {
                set((state) => sanitizeImageDesignPreferences({ ...state, ...patch }));
            },
            setSeriesPlan: (plan) => {
                if (plan === null) {
                    set({ seriesPlan: null });
                    return;
                }
                const sanitized = sanitizeStructuredPlan(plan);
                if (sanitized) set({ seriesPlan: sanitized });
            },
            replaceSeriesPlanItems: (items) => {
                set((state) => {
                    if (!state.seriesPlan) return {};
                    const plan = sanitizeStructuredPlan({ ...state.seriesPlan, items });
                    return plan ? { seriesPlan: plan } : {};
                });
            },
            addSeriesPlanItem: (item) => {
                const sanitized = sanitizeStructuredPlanItem(item);
                if (!sanitized) return;
                set((state) => {
                    if (!state.seriesPlan || state.seriesPlan.items.some((current) => current.id === sanitized.id)) return {};
                    const plan = sanitizeStructuredPlan({ ...state.seriesPlan, items: [...state.seriesPlan.items, sanitized] });
                    return plan ? { seriesPlan: plan } : {};
                });
            },
            updateSeriesPlanItem: (id, patch) => {
                const itemId = id.trim();
                if (!itemId) return;
                set((state) => {
                    if (!state.seriesPlan) return {};
                    const items = state.seriesPlan.items.map((item) => {
                        if (item.id !== itemId) return item;
                        return sanitizeStructuredPlanItem({ ...item, ...patch, id: item.id }) || item;
                    });
                    const plan = sanitizeStructuredPlan({ ...state.seriesPlan, items });
                    return plan ? { seriesPlan: plan } : {};
                });
            },
            removeSeriesPlanItem: (id) => {
                const itemId = id.trim();
                if (!itemId) return;
                set((state) => {
                    if (!state.seriesPlan) return {};
                    const plan = sanitizeStructuredPlan({ ...state.seriesPlan, items: state.seriesPlan.items.filter((item) => item.id !== itemId) });
                    return plan ? { seriesPlan: plan } : {};
                });
            },
            moveSeriesPlanItem: (id, targetIndex) => {
                const itemId = id.trim();
                if (!itemId || !Number.isFinite(targetIndex)) return;
                set((state) => {
                    if (!state.seriesPlan) return {};
                    const currentIndex = state.seriesPlan.items.findIndex((item) => item.id === itemId);
                    if (currentIndex < 0) return {};
                    const items = [...state.seriesPlan.items];
                    const [item] = items.splice(currentIndex, 1);
                    items.splice(Math.max(0, Math.min(items.length, Math.trunc(targetIndex))), 0, item);
                    const plan = sanitizeStructuredPlan({ ...state.seriesPlan, items });
                    return plan ? { seriesPlan: plan } : {};
                });
            },
            toggleFavorite: (presetId) => {
                const id = presetId.trim();
                if (!id) return;
                set((state) => {
                    if (!isKnownPresetId(id, state.customPresets)) return {};
                    return { favorites: state.favorites.includes(id) ? state.favorites.filter((item) => item !== id) : [...state.favorites, id] };
                });
            },
            recordRecentPreset: (presetId) => {
                const id = presetId.trim();
                if (!id) return;
                set((state) => (isKnownPresetId(id, state.customPresets) ? { recentPresetIds: prependRecent(state.recentPresetIds, id) } : {}));
            },
            upsertCustomPreset: (preset) => {
                const sanitized = sanitizeCustomPlatformPreset(preset);
                if (!sanitized) throw new Error("自定义平台预设无效");
                if (sanitized.id === DEFAULT_PLATFORM_PRESET_ID || BUILTIN_PLATFORM_PRESETS.some((item) => item.id === sanitized.id)) throw new Error("自定义预设 id 不能与内置预设重复");
                set((state) => {
                    const customPresets = state.customPresets.some((item) => item.id === sanitized.id) ? state.customPresets.map((item) => (item.id === sanitized.id ? sanitized : item)) : [...state.customPresets, sanitized];
                    if (state.selectedPresetId !== sanitized.id) return { customPresets };
                    return { customPresets, selectedPlatformId: sanitized.platform, selectedContentType: sanitized.contentType };
                });
            },
            removeCustomPreset: (presetId) => {
                const id = presetId.trim();
                if (!id) return;
                set((state) => {
                    if (!state.customPresets.some((preset) => preset.id === id)) return {};
                    const defaults = createDefaultImageDesignPreferences();
                    const removedSelectedPreset = state.selectedPresetId === id;
                    return sanitizeImageDesignPreferences({
                        ...state,
                        customPresets: state.customPresets.filter((preset) => preset.id !== id),
                        favorites: state.favorites.filter((item) => item !== id),
                        recentPresetIds: state.recentPresetIds.filter((item) => item !== id),
                        selectedPlatformId: removedSelectedPreset ? defaults.selectedPlatformId : state.selectedPlatformId,
                        selectedPresetId: removedSelectedPreset ? DEFAULT_PLATFORM_PRESET_ID : state.selectedPresetId,
                        selectedContentType: removedSelectedPreset ? defaults.selectedContentType : state.selectedContentType,
                    });
                });
            },
            importCustomPresets: (value) => {
                const imported = importCustomPlatformPresets(value);
                set((state) => {
                    const byId = new Map(state.customPresets.map((preset) => [preset.id, preset]));
                    imported.forEach((preset) => byId.set(preset.id, preset));
                    const customPresets = Array.from(byId.values());
                    const selected = imported.find((preset) => preset.id === state.selectedPresetId);
                    return selected ? { customPresets, selectedPlatformId: selected.platform, selectedContentType: selected.contentType } : { customPresets };
                });
                return imported.length;
            },
            exportCustomPresets: () => exportPlatformPresets(get().customPresets),
            resetPreferences: () =>
                set({
                    ...createDefaultImageDesignPreferences(),
                    skillSelectionExplicit: false,
                    platformSelectionExplicit: false,
                    explicitSkillOptionKeys: {},
                }),
        }),
        {
            name: IMAGE_DESIGN_STORE_KEY,
            storage: createJSONStorage(() => localForageStorage),
            partialize: (state) => pickImageDesignPreferences(state),
            merge: (persistedState, currentState) => ({
                ...currentState,
                ...sanitizeImageDesignPreferences(persistedState),
                hydrated: false,
            }),
            onRehydrateStorage: () => () => useImageDesignStore.setState({ hydrated: true }),
        },
    ),
);

function selectionForPreset(state: ImageDesignPreferences, preset: PlatformPreset) {
    return {
        selectedPlatformId: preset.platform,
        selectedPresetId: preset.id,
        selectedContentType: preset.contentType,
        recentPresetIds: prependRecent(state.recentPresetIds, preset.id),
    };
}

function manualSelection(state: ImageDesignPreferences) {
    const defaults = createDefaultImageDesignPreferences();
    return {
        selectedPlatformId: defaults.selectedPlatformId,
        selectedPresetId: DEFAULT_PLATFORM_PRESET_ID,
        selectedContentType: defaults.selectedContentType,
        recentPresetIds: prependRecent(state.recentPresetIds, DEFAULT_PLATFORM_PRESET_ID),
    };
}

function isKnownPresetId(id: string, customPresets: PlatformPreset[]) {
    return id === DEFAULT_PLATFORM_PRESET_ID || Boolean(platformPresetById(id, customPresets));
}

function prependRecent(values: string[], id: string) {
    return [id, ...values.filter((value) => value !== id)].slice(0, MAX_RECENT_PRESETS);
}
