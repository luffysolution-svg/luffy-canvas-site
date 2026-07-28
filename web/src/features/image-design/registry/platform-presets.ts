import type { ChannelProvider } from "@/stores/use-config-store";

import { PLATFORM_PRESET_VERSION } from "../constants";
import type { MappingSupport, PlatformAvoidZone, PlatformInsets, PlatformPreset, PlatformProviderMapping, PlatformSize, PlatformSourceLevel } from "../types";

const GEMINI_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const ALL_PROVIDERS: ChannelProvider[] = ["openai", "new-api", "openai-compatible", "gemini", "qwen", "custom"];

type PresetInput = Omit<PlatformPreset, "generationSize" | "targetPlatformSize" | "safeArea" | "avoidZones" | "providerMappings" | "version" | "verifiedAt"> & {
    generationSize: [number, number];
    targetPlatformSize: [number, number];
    safeArea?: Partial<Omit<PlatformInsets, "unit" | "description">> & { description?: string };
    avoidZones?: Array<Omit<PlatformAvoidZone, "unit">>;
};

function definePreset(input: PresetInput): PlatformPreset {
    const generationSize = toSize(input.generationSize);
    const safeArea: PlatformInsets = {
        top: input.safeArea?.top ?? 8,
        right: input.safeArea?.right ?? 8,
        bottom: input.safeArea?.bottom ?? 8,
        left: input.safeArea?.left ?? 8,
        unit: "percent",
        description: input.safeArea?.description || "关键主体和文字保持在安全边距以内。",
    };
    return {
        ...input,
        generationSize,
        targetPlatformSize: toSize(input.targetPlatformSize),
        safeArea,
        avoidZones: (input.avoidZones || []).map((zone) => ({ ...zone, unit: "percent" })),
        version: PLATFORM_PRESET_VERSION,
        verifiedAt: "2026-07",
        providerMappings: createProviderMappings(generationSize, input.aspectRatio),
    };
}

function createProviderMappings(size: PlatformSize, aspectRatio: string): Record<ChannelProvider, PlatformProviderMapping> {
    const exactSize = `${size.width}x${size.height}`;
    const geminiRatio = closestRatio(aspectRatio, GEMINI_RATIOS);
    const mappings = {} as Record<ChannelProvider, PlatformProviderMapping>;
    for (const provider of ALL_PROVIDERS) {
        const mapping: PlatformProviderMapping =
            provider === "gemini"
                ? {
                      requestSize: geminiRatio,
                      requestAspectRatio: geminiRatio,
                      support: geminiRatio === aspectRatio ? "same-ratio" : "closest-ratio",
                      note: geminiRatio === aspectRatio ? "Gemini 使用原生比例并按质量档位选择分辨率。" : `Gemini 无此精确比例，运行时需确认映射为 ${geminiRatio}。`,
                  }
                : provider === "new-api" || provider === "openai-compatible" || provider === "custom"
                  ? {
                        requestSize: exactSize,
                        requestAspectRatio: aspectRatio,
                        support: "unknown",
                        note: "按目标尺寸请求；实际支持范围由所选兼容渠道或自定义脚本决定。",
                    }
                  : {
                        requestSize: exactSize,
                        requestAspectRatio: aspectRatio,
                        support: "unknown",
                        note: provider === "qwen" ? "保留平台预设目标尺寸；具体 Qwen 模型是否原生支持由运行时能力解析确认。" : "保留平台预设目标尺寸；具体 OpenAI 模型是否原生支持由运行时能力解析确认。",
                    };
        mappings[provider] = mapping;
    }
    return mappings;
}

function toSize([width, height]: [number, number]): PlatformSize {
    return { width, height };
}

function closestRatio(value: string, supported: string[]) {
    const requested = ratioValue(value);
    return supported.reduce((best, current) => (Math.abs(ratioValue(current) - requested) < Math.abs(ratioValue(best) - requested) ? current : best));
}

function ratioValue(value: string) {
    const [width, height] = value.split(":").map(Number);
    return width / height;
}

const centeredSafeArea = {
    top: 14,
    right: 16,
    bottom: 14,
    left: 16,
    description: "关键主体和文字集中在中央区域，兼顾列表裁切与缩略图展示。",
};

const productDefault: PlatformSourceLevel = "product-default";
const industryRecommended: PlatformSourceLevel = "industry-recommended";

export const BUILTIN_PLATFORM_PRESETS: PlatformPreset[] = [
    definePreset({
        id: "wechat-headline-cover",
        platform: "wechat",
        platformLabel: "微信公众号",
        contentType: "headline-cover",
        label: "头条封面",
        description: "公众号头条消息的超宽封面，适合单一焦点与短标题。",
        aspectRatio: "2.35:1",
        generationSize: [1920, 816],
        targetPlatformSize: [900, 383],
        orientation: "landscape",
        quality: "high",
        outputFormat: "png",
        safeArea: centeredSafeArea,
        subjectPosition: "中央或略偏左，避免贴边",
        titlePosition: "中央安全区内，最多两行",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 12,
        focalScale: 0.72,
        promptFragments: ["超宽公众号头条封面，中央安全区承载关键主体和文字，缩略图下仍保持清晰焦点"],
        negativeFragments: ["边缘关键内容", "过小文字", "拥挤信息"],
        sourceLevel: productDefault,
    }),
    definePreset({
        id: "wechat-secondary-cover",
        platform: "wechat",
        platformLabel: "微信公众号",
        contentType: "secondary-cover",
        label: "次条封面",
        description: "公众号次条消息的方形封面，强调缩略图辨识度。",
        aspectRatio: "1:1",
        generationSize: [2048, 2048],
        targetPlatformSize: [1024, 1024],
        orientation: "square",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "中央",
        titlePosition: "中上或中下安全区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 10,
        focalScale: 0.68,
        promptFragments: ["方形次条封面，单一视觉焦点，适合小尺寸列表展示"],
        negativeFragments: ["细碎元素", "长段落", "贴边标题"],
        sourceLevel: productDefault,
    }),
    definePreset({
        id: "wechat-article-landscape",
        platform: "wechat",
        platformLabel: "微信公众号",
        contentType: "article-landscape",
        label: "正文横图",
        description: "公众号正文中的 16:9 横向插图。",
        aspectRatio: "16:9",
        generationSize: [1920, 1080],
        targetPlatformSize: [1920, 1080],
        orientation: "landscape",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "中央或三分线交点",
        titlePosition: "按文章内容留白",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 8,
        focalScale: 0.72,
        promptFragments: ["适合文章正文阅读节奏的 16:9 横图，层级清楚，留白充足"],
        negativeFragments: ["海报式过量文字", "边缘拥挤"],
        sourceLevel: productDefault,
    }),
    definePreset({
        id: "wechat-knowledge-long",
        platform: "wechat",
        platformLabel: "微信公众号",
        contentType: "knowledge-long",
        label: "正文知识长图",
        description: "适合知识梳理、步骤说明和内容摘要的竖向长图。",
        aspectRatio: "3:4",
        generationSize: [1536, 2048],
        targetPlatformSize: [1536, 2048],
        orientation: "portrait",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "自上而下组织",
        titlePosition: "顶部安全区",
        textDensity: "high",
        maxTitleLines: 2,
        edgeMargin: 8,
        focalScale: 0.62,
        promptFragments: ["3:4 竖向知识长图，模块自上而下排列，阅读路径明确"],
        negativeFragments: ["不可读小字", "无层级堆叠", "信息越界"],
        sourceLevel: productDefault,
    }),
    definePreset({
        id: "xiaohongshu-note-cover",
        platform: "xiaohongshu",
        platformLabel: "小红书",
        contentType: "note-cover",
        label: "图文笔记封面",
        description: "小红书图文笔记常用的 3:4 竖版封面。",
        aspectRatio: "3:4",
        generationSize: [1536, 2048],
        targetPlatformSize: [1536, 2048],
        orientation: "portrait",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 8, right: 8, bottom: 11, left: 8, description: "标题和主体避开底部信息区并保持移动端可读。" },
        subjectPosition: "中央偏上",
        titlePosition: "顶部或中上区域",
        textDensity: "medium",
        maxTitleLines: 3,
        edgeMargin: 8,
        focalScale: 0.74,
        promptFragments: ["小红书 3:4 竖版封面，移动端首屏焦点鲜明，标题层级清楚"],
        negativeFragments: ["底部关键文字", "过度密集", "低对比标题"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "xiaohongshu-square-card",
        platform: "xiaohongshu",
        platformLabel: "小红书",
        contentType: "square-card",
        label: "方形图卡",
        description: "适合引用、清单、单点知识和产品展示的方形图卡。",
        aspectRatio: "1:1",
        generationSize: [2048, 2048],
        targetPlatformSize: [2048, 2048],
        orientation: "square",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "中央",
        titlePosition: "顶部或中央",
        textDensity: "medium",
        maxTitleLines: 3,
        edgeMargin: 8,
        focalScale: 0.68,
        promptFragments: ["小红书方形图卡，移动端阅读层级清楚，中心信息突出"],
        negativeFragments: ["贴边排版", "无主次信息"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "xiaohongshu-video-cover",
        platform: "xiaohongshu",
        platformLabel: "小红书",
        contentType: "vertical-video-cover",
        label: "竖屏视频封面",
        description: "小红书竖屏视频的 9:16 关键封面画面。",
        aspectRatio: "9:16",
        generationSize: [1152, 2048],
        targetPlatformSize: [1080, 1920],
        orientation: "portrait",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 9, right: 11, bottom: 15, left: 9, description: "主体和标题避开顶部状态区及底部说明区。" },
        avoidZones: [{ id: "bottom-caption", label: "底部说明区", x: 0, y: 84, width: 100, height: 16 }],
        subjectPosition: "中央偏上",
        titlePosition: "中上安全区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 9,
        focalScale: 0.7,
        promptFragments: ["9:16 竖屏视频封面，人物或主体在中央偏上，底部保留界面空间"],
        negativeFragments: ["底部关键信息", "主体贴边"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "douyin-video-cover",
        platform: "douyin",
        platformLabel: "抖音",
        contentType: "vertical-video-cover",
        label: "竖屏视频封面",
        description: "抖音竖屏视频封面，显式避开右侧交互和底部标题导航区。",
        aspectRatio: "9:16",
        generationSize: [1152, 2048],
        targetPlatformSize: [1080, 1920],
        orientation: "portrait",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 8, right: 18, bottom: 18, left: 8, description: "核心信息置于左中部安全区，避开右侧交互和底部标题导航。" },
        avoidZones: [
            { id: "right-actions", label: "右侧交互区", x: 82, y: 20, width: 18, height: 62 },
            { id: "bottom-caption", label: "底部标题与导航", x: 0, y: 82, width: 100, height: 18 },
        ],
        subjectPosition: "中央偏左、略偏上",
        titlePosition: "中上或左中安全区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 9,
        focalScale: 0.72,
        promptFragments: ["抖音 9:16 竖屏封面，主体偏左，右侧和底部保留界面避让区"],
        negativeFragments: ["右侧关键主体", "底部标题", "边缘人脸"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "douyin-image-post-cover",
        platform: "douyin",
        platformLabel: "抖音",
        contentType: "image-post-cover",
        label: "图文首图",
        description: "抖音图文内容的 3:4 首图。",
        aspectRatio: "3:4",
        generationSize: [1536, 2048],
        targetPlatformSize: [1536, 2048],
        orientation: "portrait",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 8, right: 10, bottom: 13, left: 8, description: "首图主体居中偏上，底部保留信息区。" },
        subjectPosition: "中央偏上",
        titlePosition: "中上安全区",
        textDensity: "medium",
        maxTitleLines: 3,
        edgeMargin: 8,
        focalScale: 0.72,
        promptFragments: ["抖音 3:4 图文首图，强首屏焦点，移动端标题清楚"],
        negativeFragments: ["底部关键文字", "过多细节"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "youtube-thumbnail",
        platform: "youtube",
        platformLabel: "YouTube",
        contentType: "video-thumbnail",
        label: "视频缩略图",
        description: "YouTube 视频的 16:9 高分辨率缩略图。",
        aspectRatio: "16:9",
        generationSize: [3840, 2160],
        targetPlatformSize: [1280, 720],
        orientation: "landscape",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "三分线交点，避开右下时长角标",
        titlePosition: "左侧或右侧大字区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 7,
        focalScale: 0.78,
        promptFragments: ["YouTube 16:9 缩略图，强对比单一焦点，小尺寸仍清晰，右下角预留时长角标"],
        negativeFragments: ["细小文字", "多个同权焦点", "右下关键信息"],
        sourceLevel: "official",
        avoidZones: [{ id: "duration-badge", label: "视频时长角标", x: 84, y: 84, width: 16, height: 16 }],
    }),
    definePreset({
        id: "youtube-channel-banner",
        platform: "youtube",
        platformLabel: "YouTube",
        contentType: "channel-banner",
        label: "频道横幅",
        description: "YouTube 频道横幅，文字与 Logo 仅放入中央跨设备安全区。",
        aspectRatio: "16:9",
        generationSize: [2560, 1440],
        targetPlatformSize: [2560, 1440],
        orientation: "landscape",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 35.3, right: 19.8, bottom: 35.3, left: 19.8, description: "文字和 Logo 保持在约 1544×423 的中央跨设备安全区。" },
        subjectPosition: "中央横向延展",
        titlePosition: "中央 1544×423 安全区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 6,
        focalScale: 0.55,
        promptFragments: ["YouTube 频道横幅，中央窄条安全区承载 Logo 与文字，外围作为可裁切延展背景"],
        negativeFragments: ["安全区外文字", "边缘关键人物", "上下关键细节"],
        sourceLevel: "official",
    }),
    definePreset({
        id: "youtube-shorts-keyframe",
        platform: "youtube",
        platformLabel: "YouTube",
        contentType: "shorts-keyframe",
        label: "Shorts 关键帧",
        description: "用于 Shorts 内容中的 9:16 关键画面，不宣称为独立可上传缩略图。",
        aspectRatio: "9:16",
        generationSize: [1152, 2048],
        targetPlatformSize: [1080, 1920],
        orientation: "portrait",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 9, right: 16, bottom: 16, left: 9, description: "关键画面避开右侧交互和底部说明区域。" },
        avoidZones: [
            { id: "right-actions", label: "右侧交互区", x: 84, y: 25, width: 16, height: 56 },
            { id: "bottom-caption", label: "底部说明区", x: 0, y: 84, width: 100, height: 16 },
        ],
        subjectPosition: "中央偏左",
        titlePosition: "中上安全区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 9,
        focalScale: 0.72,
        promptFragments: ["Shorts 9:16 关键帧，主体居中偏左，保留界面避让区"],
        negativeFragments: ["右侧关键内容", "底部关键信息"],
        sourceLevel: "official",
    }),
    definePreset({
        id: "x-portrait-post",
        platform: "x",
        platformLabel: "X",
        contentType: "portrait-post",
        label: "竖版帖子",
        description: "X 信息流中的 4:5 竖版图片。",
        aspectRatio: "4:5",
        generationSize: [1440, 1800],
        targetPlatformSize: [1440, 1800],
        orientation: "portrait",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "中央",
        titlePosition: "中上区域",
        textDensity: "medium",
        maxTitleLines: 3,
        edgeMargin: 8,
        focalScale: 0.7,
        promptFragments: ["X 信息流 4:5 竖版图片，首屏焦点明确，文字在移动端可读"],
        negativeFragments: ["边缘关键信息", "低对比文字"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "x-square-post",
        platform: "x",
        platformLabel: "X",
        contentType: "square-post",
        label: "方形帖子",
        description: "X 信息流中的方形图片。",
        aspectRatio: "1:1",
        generationSize: [1200, 1200],
        targetPlatformSize: [1200, 1200],
        orientation: "square",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "中央",
        titlePosition: "顶部或中部",
        textDensity: "medium",
        maxTitleLines: 3,
        edgeMargin: 8,
        focalScale: 0.68,
        promptFragments: ["X 方形帖子，中心构图，信息层级适合时间线浏览"],
        negativeFragments: ["贴边排版", "过小文本"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "x-landscape-link",
        platform: "x",
        platformLabel: "X",
        contentType: "landscape-link",
        label: "横图 / 链接图",
        description: "X 横向帖子或链接卡片的约 1.91:1 图片。",
        aspectRatio: "1.91:1",
        generationSize: [2048, 1072],
        targetPlatformSize: [1200, 628],
        orientation: "landscape",
        quality: "high",
        outputFormat: "png",
        safeArea: centeredSafeArea,
        subjectPosition: "中央或偏左",
        titlePosition: "中央安全区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 9,
        focalScale: 0.7,
        promptFragments: ["X 约 1.91:1 横图或链接图，中央安全区信息清楚"],
        negativeFragments: ["边缘标题", "密集小字"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "x-profile-banner",
        platform: "x",
        platformLabel: "X",
        contentType: "profile-banner",
        label: "主页横幅",
        description: "X 主页 3:1 横幅，上下预留裁切安全区。",
        aspectRatio: "3:1",
        generationSize: [1500, 500],
        targetPlatformSize: [1500, 500],
        orientation: "landscape",
        quality: "high",
        outputFormat: "png",
        safeArea: { top: 16, right: 8, bottom: 16, left: 22, description: "上下预留裁切空间，左下避开头像覆盖区域。" },
        avoidZones: [{ id: "avatar-overlap", label: "头像覆盖区", x: 0, y: 55, width: 24, height: 45 }],
        subjectPosition: "中央偏右",
        titlePosition: "中央或右侧安全区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 8,
        focalScale: 0.58,
        promptFragments: ["X 主页 3:1 横幅，背景横向延展，上下可裁切，左下避开头像"],
        negativeFragments: ["左下关键内容", "上下贴边文字"],
        sourceLevel: industryRecommended,
    }),
    definePreset({
        id: "bilibili-video-cover",
        platform: "bilibili",
        platformLabel: "哔哩哔哩",
        contentType: "video-cover",
        label: "视频封面",
        description: "哔哩哔哩视频的约 8:5 横向封面。",
        aspectRatio: "8:5",
        generationSize: [1920, 1200],
        targetPlatformSize: [1146, 716],
        orientation: "landscape",
        quality: "high",
        outputFormat: "png",
        subjectPosition: "中央或三分线交点",
        titlePosition: "左侧或右侧大字区",
        textDensity: "low",
        maxTitleLines: 2,
        edgeMargin: 8,
        focalScale: 0.76,
        promptFragments: ["哔哩哔哩约 8:5 视频封面，缩略图焦点明确，标题短而醒目"],
        negativeFragments: ["过量小字", "多个同权主体", "边缘关键信息"],
        sourceLevel: industryRecommended,
    }),
];

export const PLATFORM_LABELS = Array.from(new Map(BUILTIN_PLATFORM_PRESETS.map((preset) => [preset.platform, preset.platformLabel])).entries()).map(([value, label]) => ({ value, label }));

export function platformPresetById(id: string, customPresets: PlatformPreset[] = []) {
    return [...customPresets, ...BUILTIN_PLATFORM_PRESETS].find((preset) => preset.id === id);
}

export function platformPresetsForPlatform(platform: string, customPresets: PlatformPreset[] = []) {
    return [...BUILTIN_PLATFORM_PRESETS, ...customPresets].filter((preset) => !platform || preset.platform === platform);
}

export function validatePlatformPreset(value: unknown): value is PlatformPreset {
    if (!value || typeof value !== "object") return false;
    const preset = value as Partial<PlatformPreset>;
    return Boolean(
        preset.id &&
        preset.platform &&
        preset.platformLabel &&
        preset.label &&
        preset.aspectRatio &&
        /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(preset.aspectRatio) &&
        validSize(preset.generationSize) &&
        validSize(preset.targetPlatformSize) &&
        preset.safeArea &&
        Array.isArray(preset.avoidZones) &&
        Array.isArray(preset.promptFragments) &&
        Array.isArray(preset.negativeFragments),
    );
}

function validSize(value: unknown): value is PlatformSize {
    return Boolean(value && typeof value === "object" && Number.isInteger((value as PlatformSize).width) && (value as PlatformSize).width > 0 && Number.isInteger((value as PlatformSize).height) && (value as PlatformSize).height > 0);
}

export function createCustomPlatformPreset(input: Omit<PresetInput, "sourceLevel">): PlatformPreset {
    return definePreset({ ...input, sourceLevel: "custom", isCustom: true });
}

export function exportPlatformPresets(presets: PlatformPreset[]) {
    return JSON.stringify({ version: 1, presets }, null, 2);
}

export function mappingSupportLabel(value: MappingSupport) {
    if (value === "exact") return "精确尺寸";
    if (value === "same-ratio") return "同原生比例";
    if (value === "closest-ratio") return "近似比例";
    if (value === "scaled") return "等比缩放";
    return "待渠道确认";
}
