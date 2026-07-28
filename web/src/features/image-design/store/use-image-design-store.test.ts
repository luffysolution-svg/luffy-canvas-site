import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => {
    const values = new Map<string, string>();
    return {
        values,
        getItem: vi.fn(async (name: string) => values.get(name) ?? null),
        setItem: vi.fn(async (name: string, value: string) => void values.set(name, value)),
        removeItem: vi.fn(async (name: string) => void values.delete(name)),
    };
});

vi.mock("@/lib/localforage-storage", () => ({
    localForageStorage: {
        getItem: storageMock.getItem,
        setItem: storageMock.setItem,
        removeItem: storageMock.removeItem,
    },
}));

import { DEFAULT_PLATFORM_PRESET_ID, IMAGE_DESIGN_STORE_KEY } from "../constants";
import { createDefaultImageDesignPreferences, MAX_BATCH_SIZE, MAX_SERIES_COUNT, MIN_BATCH_SIZE, MIN_SERIES_COUNT } from "../persistence/preferences";
import { BUILTIN_PLATFORM_PRESETS } from "../registry/platform-presets";
import type { PlatformPreset, StructuredPlan } from "../types";
import { useImageDesignStore } from "./use-image-design-store";

describe("image design preference store", () => {
    beforeEach(() => {
        useImageDesignStore.setState({ ...createDefaultImageDesignPreferences(), hydrated: false, explicitSkillOptionKeys: {} });
        storageMock.values.clear();
        storageMock.getItem.mockClear();
        storageMock.setItem.mockClear();
        storageMock.removeItem.mockClear();
    });

    it("persists every preference group and restores it through async hydration", async () => {
        const customPreset = createCustomPreset("custom-refresh", "刷新预设");
        const plan = createPlan();
        const store = useImageDesignStore.getState();

        store.upsertCustomPreset(customPreset);
        store.selectSkill("cover-image");
        store.updateSkillOption("cover-image", "palette", "cool");
        store.updateSkillOption("cover-image", "textLevel", "title-only");
        store.updateCustomOption("palette", "#112233");
        store.updatePreferences({
            quickMode: true,
            confirmBeforeGeneration: false,
            useAiRecommendation: false,
            finalPromptPreviewOpen: false,
            finalPromptPreviewEnabled: false,
            defaultLanguage: "en",
            defaultSkillId: "cover-image",
            defaultPlatformId: customPreset.platform,
            defaultPalette: "cool",
            defaultStyle: "digital",
            defaultSeriesCount: 8,
            anchorChainEnabled: false,
            batchSize: 4,
        });
        store.setSeriesPlan(plan);
        store.selectPlatformPreset(customPreset.id);
        store.toggleFavorite(customPreset.id);

        await vi.waitFor(() => expect(storageMock.values.get(IMAGE_DESIGN_STORE_KEY)).toBeTruthy());
        const persisted = storageMock.values.get(IMAGE_DESIGN_STORE_KEY)!;
        expect(persisted).not.toContain("hydrated");
        expect(persisted).not.toContain("explicitSkillOptionKeys");
        expect(persisted).not.toContain("selectSkill");
        expect(persisted).not.toContain("apiKey");

        useImageDesignStore.setState({ ...createDefaultImageDesignPreferences(), hydrated: false });
        storageMock.values.set(IMAGE_DESIGN_STORE_KEY, persisted);
        await useImageDesignStore.persist.rehydrate();

        expect(useImageDesignStore.getState()).toMatchObject({
            hydrated: true,
            selectedSkillId: "cover-image",
            selectedPlatformId: customPreset.platform,
            selectedPresetId: customPreset.id,
            selectedContentType: customPreset.contentType,
            skillOptions: { "cover-image": { palette: "cool", textLevel: "title-only" } },
            customOptions: { palette: "#112233" },
            quickMode: true,
            confirmBeforeGeneration: false,
            useAiRecommendation: false,
            finalPromptPreviewOpen: false,
            finalPromptPreviewEnabled: false,
            defaultLanguage: "en",
            defaultSkillId: "cover-image",
            defaultPlatformId: customPreset.platform,
            defaultPalette: "cool",
            defaultStyle: "digital",
            defaultSeriesCount: 8,
            anchorChainEnabled: false,
            batchSize: 4,
            favorites: [customPreset.id],
            recentPresetIds: [customPreset.id],
            lastUsedBySkill: { "cover-image": { palette: "cool", textLevel: "title-only" } },
            seriesPlan: plan,
        });
        expect(useImageDesignStore.getState().customPresets).toHaveLength(1);
        expect(useImageDesignStore.getState().selectSkill).toBeTypeOf("function");
    });

    it("sanitizes malformed persisted fields and falls back without throwing", async () => {
        const persisted = {
            state: {
                selectedSkillId: "not-a-skill",
                selectedPlatformId: "rogue-platform",
                selectedPresetId: "missing-preset",
                selectedContentType: "rogue-content",
                skillOptions: {
                    "cover-image": { palette: "warm", enabled: true, strength: 2, invalid: { nested: true }, nonFinite: null },
                    "unknown-skill": { palette: "dark" },
                },
                customOptions: { color: "#fff", invalid: 7 },
                quickMode: "yes",
                confirmBeforeGeneration: null,
                useAiRecommendation: false,
                finalPromptPreviewOpen: 1,
                finalPromptPreviewEnabled: false,
                defaultLanguage: "fr",
                defaultSkillId: "comic",
                defaultPlatformId: "missing",
                defaultPalette: 42,
                defaultStyle: "retro",
                defaultSeriesCount: -50,
                anchorChainEnabled: "false",
                batchSize: 999,
                customPresets: [{ id: "broken" }],
                favorites: [DEFAULT_PLATFORM_PRESET_ID, DEFAULT_PLATFORM_PRESET_ID, "missing"],
                recentPresetIds: ["missing", DEFAULT_PLATFORM_PRESET_ID, DEFAULT_PLATFORM_PRESET_ID],
                lastUsedBySkill: { comic: { style: "manga", invalid: [] }, invalid: { style: "bad" } },
                seriesPlan: { id: "", type: "series", items: [] },
            },
            version: 0,
        };
        storageMock.values.set(IMAGE_DESIGN_STORE_KEY, JSON.stringify(persisted));

        await useImageDesignStore.persist.rehydrate();

        expect(useImageDesignStore.getState()).toMatchObject({
            hydrated: true,
            selectedSkillId: "none",
            selectedPlatformId: "manual",
            selectedPresetId: DEFAULT_PLATFORM_PRESET_ID,
            selectedContentType: "custom",
            skillOptions: { "cover-image": { palette: "warm", enabled: true, strength: 2 } },
            customOptions: { color: "#fff" },
            quickMode: false,
            confirmBeforeGeneration: true,
            useAiRecommendation: false,
            finalPromptPreviewOpen: true,
            finalPromptPreviewEnabled: false,
            defaultLanguage: "zh-CN",
            defaultSkillId: "comic",
            defaultPlatformId: "wechat",
            defaultPalette: "auto",
            defaultStyle: "retro",
            defaultSeriesCount: MIN_SERIES_COUNT,
            anchorChainEnabled: true,
            batchSize: MAX_BATCH_SIZE,
            customPresets: [],
            favorites: [DEFAULT_PLATFORM_PRESET_ID],
            recentPresetIds: [DEFAULT_PLATFORM_PRESET_ID],
            lastUsedBySkill: { comic: { style: "manga" } },
            seriesPlan: null,
        });
    });

    it("recovers from malformed persisted JSON and still completes hydration", async () => {
        storageMock.values.set(IMAGE_DESIGN_STORE_KEY, "not-json");

        await expect(useImageDesignStore.persist.rehydrate()).resolves.toBeUndefined();

        expect(useImageDesignStore.getState()).toMatchObject({
            ...createDefaultImageDesignPreferences(),
            hydrated: true,
        });
    });

    it("keeps the manual pseudo-preset as a valid selection", () => {
        const builtin = BUILTIN_PLATFORM_PRESETS[0];

        useImageDesignStore.getState().selectPlatformPreset(builtin.id);
        useImageDesignStore.getState().selectPlatformPreset(DEFAULT_PLATFORM_PRESET_ID);
        useImageDesignStore.getState().selectContentType("free-form");

        expect(useImageDesignStore.getState()).toMatchObject({
            selectedPlatformId: "manual",
            selectedPresetId: DEFAULT_PLATFORM_PRESET_ID,
            selectedContentType: "free-form",
            recentPresetIds: [DEFAULT_PLATFORM_PRESET_ID, builtin.id],
        });
    });

    it("tracks only options the user actually edits and clears the volatile keys on reset", () => {
        useImageDesignStore.getState().updateSkillOption("comic", "layout", "webtoon");
        useImageDesignStore.getState().updateSkillOption("comic", "panelCount", 5);

        expect(useImageDesignStore.getState().explicitSkillOptionKeys).toEqual({ comic: ["layout", "panelCount"] });

        useImageDesignStore.getState().resetPreferences();
        expect(useImageDesignStore.getState().explicitSkillOptionKeys).toEqual({});
    });

    it("supports custom preset create, edit, selection, favorite and delete", () => {
        const initial = createCustomPreset("custom-crud", "初始名称");
        const edited = { ...initial, label: "编辑后名称", description: "更新后的说明" };

        useImageDesignStore.getState().upsertCustomPreset(initial);
        useImageDesignStore.getState().selectPlatformPreset(initial.id);
        useImageDesignStore.getState().toggleFavorite(initial.id);
        useImageDesignStore.getState().upsertCustomPreset(edited);

        expect(useImageDesignStore.getState()).toMatchObject({
            selectedPlatformId: initial.platform,
            selectedPresetId: initial.id,
            selectedContentType: initial.contentType,
            favorites: [initial.id],
            recentPresetIds: [initial.id],
        });
        expect(useImageDesignStore.getState().customPresets).toEqual([expect.objectContaining({ id: initial.id, label: "编辑后名称", sourceLevel: "custom", isCustom: true })]);

        useImageDesignStore.getState().removeCustomPreset(initial.id);

        expect(useImageDesignStore.getState()).toMatchObject({
            selectedPlatformId: "manual",
            selectedPresetId: DEFAULT_PLATFORM_PRESET_ID,
            selectedContentType: "custom",
            customPresets: [],
            favorites: [],
            recentPresetIds: [],
        });
    });

    it("imports, updates and exports strict custom preset JSON", () => {
        const first = createCustomPreset("custom-import-1", "导入一");
        const second = createCustomPreset("custom-import-2", "导入二");
        const count = useImageDesignStore.getState().importCustomPresets(JSON.stringify({ version: 1, presets: [first, second] }));

        expect(count).toBe(2);
        expect(useImageDesignStore.getState().customPresets.map((preset) => preset.id)).toEqual([first.id, second.id]);
        expect(JSON.parse(useImageDesignStore.getState().exportCustomPresets())).toMatchObject({
            version: 1,
            presets: [expect.objectContaining({ id: first.id }), expect.objectContaining({ id: second.id })],
        });

        useImageDesignStore.getState().importCustomPresets(JSON.stringify({ presets: [{ ...first, label: "覆盖名称" }] }));
        expect(useImageDesignStore.getState().customPresets.find((preset) => preset.id === first.id)?.label).toBe("覆盖名称");
        expect(() => useImageDesignStore.getState().importCustomPresets(JSON.stringify({ presets: [{ ...first, id: DEFAULT_PLATFORM_PRESET_ID }] }))).toThrow("不能与内置预设重复");
        expect(() => useImageDesignStore.getState().importCustomPresets(JSON.stringify({ presets: [{ id: "broken" }] }))).toThrow("无效的平台预设");
    });

    it("rejects invalid custom-preset geometry and keeps failed imports atomic", () => {
        const existing = createCustomPreset("custom-existing", "已有预设");
        const validIncoming = createCustomPreset("custom-valid-incoming", "有效新预设");
        useImageDesignStore.getState().upsertCustomPreset(existing);
        const before = useImageDesignStore.getState().customPresets;
        const source = createCustomPreset("custom-invalid", "无效预设");
        const mismatchedAspect = source.aspectRatio === "1:1" ? "16:9" : "1:1";
        const mismatchedOrientation = source.orientation === "portrait" ? "landscape" : "portrait";
        const invalidCandidates = [
            { ...source, focalScale: 1.01 },
            { ...source, safeArea: { ...source.safeArea, top: 60, bottom: 40 } },
            {
                ...source,
                avoidZones: [{ id: "overflow-zone", label: "越界区", x: 90, y: 10, width: 11, height: 20, unit: "percent" as const }],
            },
            { ...source, aspectRatio: mismatchedAspect },
            { ...source, orientation: mismatchedOrientation },
            { ...source, outputFormat: "jpeg" },
        ];

        for (const invalid of invalidCandidates) {
            expect(() => useImageDesignStore.getState().importCustomPresets(JSON.stringify({ presets: [validIncoming, invalid] }))).toThrow();
            expect(useImageDesignStore.getState().customPresets).toEqual(before);
        }
    });

    it("clamps series count and batch concurrency to supported boundaries", () => {
        useImageDesignStore.getState().updatePreferences({ defaultSeriesCount: -100, batchSize: 0 });
        expect(useImageDesignStore.getState()).toMatchObject({ defaultSeriesCount: MIN_SERIES_COUNT, batchSize: MIN_BATCH_SIZE });

        useImageDesignStore.getState().updatePreferences({ defaultSeriesCount: 100, batchSize: 100 });
        expect(useImageDesignStore.getState()).toMatchObject({ defaultSeriesCount: MAX_SERIES_COUNT, batchSize: MAX_BATCH_SIZE });

        useImageDesignStore.getState().updatePreferences({ defaultSeriesCount: 6.9, batchSize: 3.8 });
        expect(useImageDesignStore.getState()).toMatchObject({ defaultSeriesCount: 6, batchSize: 3 });
    });

    it("edits series plan items without losing stable ordering", () => {
        useImageDesignStore.getState().setSeriesPlan(createPlan());
        useImageDesignStore.getState().addSeriesPlanItem({ id: "item-3", order: 99, kind: "summary", title: "总结", body: "总结正文" });
        useImageDesignStore.getState().updateSeriesPlanItem("item-2", { title: "更新标题", status: "failed", error: "失败原因" });
        useImageDesignStore.getState().moveSeriesPlanItem("item-3", 0);

        expect(useImageDesignStore.getState().seriesPlan?.items).toEqual([
            expect.objectContaining({ id: "item-3", order: 0 }),
            expect.objectContaining({ id: "item-1", order: 1 }),
            expect.objectContaining({ id: "item-2", order: 2, title: "更新标题", status: "failed", error: "失败原因" }),
        ]);

        useImageDesignStore.getState().removeSeriesPlanItem("item-1");
        expect(useImageDesignStore.getState().seriesPlan?.items.map((item) => [item.id, item.order])).toEqual([
            ["item-3", 0],
            ["item-2", 1],
        ]);
    });
});

function createCustomPreset(id: string, label: string): PlatformPreset {
    const source = BUILTIN_PLATFORM_PRESETS[0];
    return {
        ...source,
        id,
        platform: "custom-platform",
        platformLabel: "自定义平台",
        contentType: "custom-card",
        label,
        description: `${label}说明`,
        generationSize: { ...source.generationSize },
        targetPlatformSize: { ...source.targetPlatformSize },
        safeArea: { ...source.safeArea },
        avoidZones: source.avoidZones.map((zone) => ({ ...zone })),
        promptFragments: [...source.promptFragments],
        negativeFragments: [...source.negativeFragments],
        providerMappings: Object.fromEntries(Object.entries(source.providerMappings).map(([provider, mapping]) => [provider, { ...mapping }])) as PlatformPreset["providerMappings"],
        sourceLevel: "custom",
        isCustom: true,
    };
}

function createPlan(): StructuredPlan {
    return {
        id: "plan-1",
        type: "series",
        title: "系列计划",
        summary: "摘要",
        visualBible: "统一视觉语言",
        sourceDigest: "内容摘要",
        items: [
            { id: "item-1", order: 0, kind: "cover", title: "封面", body: "封面正文" },
            { id: "item-2", order: 1, kind: "content", title: "内容", body: "内容正文" },
        ],
    };
}
