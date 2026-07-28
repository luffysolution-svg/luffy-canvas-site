import type { ApiCallFormat, ChannelProvider } from "@/stores/use-config-store";

export const DESIGN_SKILL_IDS = ["none", "cover-image", "xhs-images", "infographic", "article-illustrator", "comic", "diagram"] as const;
export type DesignSkillId = (typeof DESIGN_SKILL_IDS)[number];

export const REFERENCE_IMAGE_ROLES = ["direct", "subject", "identity", "style", "palette", "composition", "layout", "product", "character", "series-anchor"] as const;
export type ReferenceImageRole = (typeof REFERENCE_IMAGE_ROLES)[number];

export type ImageDesignLanguage = "zh-CN" | "en";
export type PlatformSourceLevel = "official" | "industry-recommended" | "product-default" | "custom";
export type PlatformOrientation = "landscape" | "portrait" | "square";
export type PlatformTextDensity = "none" | "low" | "medium" | "high";
export type MappingSupport = "exact" | "same-ratio" | "closest-ratio" | "scaled" | "unknown";

export type RegistryRecommendationRule = {
    keywords: string[];
    reason: string;
    priority?: number;
};

export type RegistryCompatibility = {
    preferredWith?: Record<string, string[]>;
    incompatibleWith?: Record<string, string[]>;
    notes: string[];
};

export type RegistryOption<Id extends string = string> = {
    id: Id;
    nameZh: string;
    nameEn: string;
    description: string;
    useCases: string[];
    promptFragment: string;
    negativeFragment: string;
    recommendation: RegistryRecommendationRule;
    compatibility: RegistryCompatibility;
};

export type SkillOptionValue = string | number | boolean;

export type SkillOptionGroup = {
    key: string;
    label: string;
    description: string;
    control: "select" | "segmented" | "text" | "textarea" | "number" | "switch";
    defaultValue: SkillOptionValue;
    options?: RegistryOption[];
    min?: number;
    max?: number;
    step?: number;
    visibleWhen?: { key: string; values: SkillOptionValue[] };
};

export type DesignSkillDefinition = {
    id: DesignSkillId;
    label: string;
    nameEn: string;
    description: string;
    useCases: string[];
    supportsSeries: boolean;
    maxItems: number;
    workflow: "single" | "series" | "structured" | "article" | "storyboard";
    optionGroups: SkillOptionGroup[];
    contentStructureFragment: string;
    compositionFragment: string;
    lightingMaterialFragment: string;
    promptTemplateVersion: string;
};

export type PlatformSize = {
    width: number;
    height: number;
};

export type PlatformInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
    unit: "percent";
    description: string;
};

export type PlatformAvoidZone = {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    unit: "percent";
};

export type PlatformProviderMapping = {
    requestSize: string;
    requestAspectRatio: string;
    support: MappingSupport;
    note: string;
};

export type PlatformPreset = {
    id: string;
    platform: string;
    platformLabel: string;
    contentType: string;
    label: string;
    description: string;
    aspectRatio: string;
    generationSize: PlatformSize;
    targetPlatformSize: PlatformSize;
    orientation: PlatformOrientation;
    quality: string;
    outputFormat: "png" | "jpeg" | "webp";
    safeArea: PlatformInsets;
    avoidZones: PlatformAvoidZone[];
    subjectPosition: string;
    titlePosition: string;
    textDensity: PlatformTextDensity;
    maxTitleLines: number;
    edgeMargin: number;
    focalScale: number;
    promptFragments: string[];
    negativeFragments: string[];
    sourceLevel: PlatformSourceLevel;
    verifiedAt: string;
    version: string;
    providerMappings: Record<ChannelProvider, PlatformProviderMapping>;
    isCustom?: boolean;
};

export type RecommendationSource = "local" | "ai" | "fallback";

export type ImageDesignRecommendation = {
    skillId: DesignSkillId;
    platformPresetId: string;
    options: Record<string, SkillOptionValue>;
    reasoning: Record<string, string>;
    source: RecommendationSource;
    confidence: number;
    warnings: string[];
    inputSignature?: string;
    contentSignature?: string;
    applied?: boolean;
};

export type StructuredPlanType = "series" | "article" | "infographic" | "storyboard" | "diagram";
export type StructuredPlanItemKind = "cover" | "content" | "summary" | "illustration" | "panel" | "page" | "section";
export type StructuredPlanItemStatus = "idle" | "queued" | "generating" | "succeeded" | "failed" | "cancelled";

export type StructuredPlanItem = {
    id: string;
    order: number;
    kind: StructuredPlanItemKind;
    title: string;
    body: string;
    chapter?: string;
    purpose?: string;
    illustrationType?: string;
    visualDescription?: string;
    requiredText?: string[];
    finalPrompt?: string;
    status?: StructuredPlanItemStatus;
    error?: string;
};

export type StructuredPlan = {
    id: string;
    type: StructuredPlanType;
    title: string;
    summary: string;
    visualBible: string;
    items: StructuredPlanItem[];
    sourceDigest: string;
    planningSignature?: string;
    visualSignature?: string;
    autoVisualBible?: string;
    learningGoals?: string[];
};

export type PromptSectionId = "user" | "goal" | "structure" | "custom" | "layout" | "composition" | "style" | "palette" | "lighting" | "text" | "platform" | "references" | "output" | "negative";

export type PromptSection = {
    id: PromptSectionId;
    label: string;
    content: string;
};

export type PromptReference = {
    id: string;
    label: string;
    role: ReferenceImageRole;
    name?: string;
};

export type ImageModelContext = {
    provider: ChannelProvider;
    apiFormat: ApiCallFormat;
    model: string;
    quality: string;
    count: number;
    requestedSize?: string;
    requestedAspectRatio?: string;
    supportsReferenceImages?: boolean;
    supportsSeriesAnchor?: boolean;
    maxReferenceImages?: number;
    resolvedSize?: string;
    resolvedAspectRatio?: string;
    mappingSupport?: MappingSupport;
    mappingNote?: string;
    mappingRequiresConfirmation?: boolean;
    validationError?: string;
};

export type ResolvedProviderMapping = {
    provider: ChannelProvider;
    model: string;
    requestedSize: string;
    requestedAspectRatio: string;
    resolvedSize: string;
    resolvedAspectRatio: string;
    support: MappingSupport;
    requiresConfirmation: boolean;
    note: string;
};

export type PromptCompileInput = {
    userPrompt: string;
    platformPreset?: PlatformPreset;
    designSkill: DesignSkillDefinition;
    skillOptions: Record<string, SkillOptionValue>;
    structuredContent?: StructuredPlan | StructuredPlanItem | string;
    customInstructions?: string;
    negativeInstructions?: string;
    referenceImageRoles?: PromptReference[];
    language?: ImageDesignLanguage;
    model: ImageModelContext;
    manualFinalPrompt?: string;
    manualOverride?: boolean;
};

export type ReproducibilitySnapshot = {
    compilerVersion: string;
    promptVersion: string;
    designSkillId: DesignSkillId;
    platformPresetId?: string;
    skillOptions: Record<string, SkillOptionValue>;
    structuredContent?: StructuredPlan | StructuredPlanItem | string;
    customInstructions?: string;
    negativeInstructions?: string;
    referenceImageRoles?: PromptReference[];
    language?: ImageDesignLanguage;
    promptSections: PromptSection[];
    systemFinalPrompt: string;
    finalPrompt: string;
    manualOverride: boolean;
    resolvedSize: string;
    resolvedAspectRatio: string;
    resolvedQuality: string;
    resolvedCount: number;
    providerMapping: ResolvedProviderMapping;
};

export type CompiledPrompt = {
    systemFinalPrompt: string;
    finalPrompt: string;
    negativePromptFragments: string[];
    resolvedSize: string;
    resolvedAspectRatio: string;
    resolvedQuality: string;
    resolvedCount: number;
    promptSections: PromptSection[];
    warnings: string[];
    providerMapping: ResolvedProviderMapping;
    reproducibilitySnapshot: ReproducibilitySnapshot;
    manualOverride: boolean;
};

export type ImageDesignPreferences = {
    selectedSkillId: DesignSkillId;
    selectedPlatformId: string;
    selectedPresetId: string;
    selectedContentType: string;
    skillOptions: Record<string, Record<string, SkillOptionValue>>;
    customOptions: Record<string, string>;
    quickMode: boolean;
    confirmBeforeGeneration: boolean;
    useAiRecommendation: boolean;
    finalPromptPreviewOpen: boolean;
    finalPromptPreviewEnabled: boolean;
    defaultLanguage: ImageDesignLanguage;
    defaultSkillId: DesignSkillId;
    defaultPlatformId: string;
    defaultPalette: string;
    defaultStyle: string;
    defaultSeriesCount: number;
    anchorChainEnabled: boolean;
    batchSize: number;
    customPresets: PlatformPreset[];
    favorites: string[];
    recentPresetIds: string[];
    lastUsedBySkill: Partial<Record<DesignSkillId, Record<string, SkillOptionValue>>>;
    seriesPlan: StructuredPlan | null;
};
