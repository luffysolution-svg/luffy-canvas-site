import type { DesignSkillId, ImageDesignPreferences, ReferenceImageRole } from "./types";

export const IMAGE_DESIGN_STORE_KEY = "infinite-canvas:image_design_store:v1";
export const IMAGE_DESIGN_COMPILER_VERSION = "1.0.0";
export const IMAGE_DESIGN_PROMPT_VERSION = "baoyu-web-1";
export const PLATFORM_PRESET_VERSION = "1.0.0";
export const BAOYU_SKILLS_COMMIT = "6b7a2e417500561a5ecdd0b168332f4142584617";
export const BAOYU_SKILLS_URL = "https://github.com/JimLiu/baoyu-skills";

export const DEFAULT_SKILL_ID: DesignSkillId = "none";
export const DEFAULT_PLATFORM_PRESET_ID = "manual";

export const REFERENCE_ROLE_OPTIONS: Array<{ value: ReferenceImageRole; label: string; description: string }> = [
    { value: "direct", label: "直接采用", description: "把参考图作为内容与视觉结构的直接依据。" },
    { value: "subject", label: "主体", description: "沿用参考图中的主要对象与关键外观。" },
    { value: "identity", label: "身份", description: "保持同一人物或产品身份特征。" },
    { value: "style", label: "风格", description: "只复用视觉风格，不复制具体主体。" },
    { value: "palette", label: "配色", description: "提取并复用主要色彩关系。" },
    { value: "composition", label: "构图", description: "参考空间与视线组织，不复制主体。" },
    { value: "layout", label: "版式", description: "参考信息层级、网格和留白。" },
    { value: "product", label: "产品", description: "保持产品造型、材质和品牌细节。" },
    { value: "character", label: "角色", description: "保持角色脸部、服装和比例设定。" },
    { value: "series-anchor", label: "系列锚点", description: "作为后续图片的一致性视觉基准。" },
];

export const DEFAULT_IMAGE_DESIGN_PREFERENCES: ImageDesignPreferences = {
    selectedSkillId: DEFAULT_SKILL_ID,
    selectedPlatformId: "manual",
    selectedPresetId: DEFAULT_PLATFORM_PRESET_ID,
    selectedContentType: "custom",
    skillOptions: {},
    customOptions: {},
    quickMode: false,
    confirmBeforeGeneration: true,
    useAiRecommendation: true,
    finalPromptPreviewOpen: true,
    finalPromptPreviewEnabled: true,
    defaultLanguage: "zh-CN",
    defaultSkillId: DEFAULT_SKILL_ID,
    defaultPlatformId: "wechat",
    defaultPalette: "auto",
    defaultStyle: "auto",
    defaultSeriesCount: 3,
    anchorChainEnabled: true,
    batchSize: 2,
    customPresets: [],
    favorites: [],
    recentPresetIds: [],
    lastUsedBySkill: {},
    seriesPlan: null,
};
