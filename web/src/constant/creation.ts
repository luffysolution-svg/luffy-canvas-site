import type { CreationPromptStyle, SocialPlatform } from "@/types/creation";

export type SocialPlatformSafeArea = { top: number; right: number; bottom: number; left: number };

export type SocialPlatformPreset = {
    id: string;
    platform: SocialPlatform;
    label: string;
    width: number;
    height: number;
    aspectRatio: string;
    safeArea: SocialPlatformSafeArea;
    notes: string[];
};

export const SOCIAL_PLATFORM_IDS = ["wechat", "xiaohongshu", "x", "bilibili", "douyin"] as const satisfies readonly SocialPlatform[];

export const SOCIAL_PLATFORM_OPTIONS = [
    { value: "wechat", label: "微信公众号" },
    { value: "xiaohongshu", label: "小红书" },
    { value: "x", label: "X" },
    { value: "bilibili", label: "B站" },
    { value: "douyin", label: "抖音" },
] as const satisfies ReadonlyArray<{ value: SocialPlatform; label: string }>;

export const SOCIAL_PLATFORM_DEFAULTS = {
    wechat: {
        id: "wechat-cover",
        platform: "wechat",
        label: "微信公众号头条封面",
        width: 900,
        height: 383,
        aspectRatio: "900:383",
        safeArea: { top: 32, right: 48, bottom: 32, left: 48 },
        notes: ["标题与关键主体保持在安全区内", "避免在四角放置小字号文字"],
    },
    xiaohongshu: {
        id: "xiaohongshu-post",
        platform: "xiaohongshu",
        label: "小红书图文",
        width: 1080,
        height: 1440,
        aspectRatio: "3:4",
        safeArea: { top: 96, right: 72, bottom: 120, left: 72 },
        notes: ["标题和正文避开上下裁切区域", "系列卡片保持统一标题基线"],
    },
    x: {
        id: "x-landscape",
        platform: "x",
        label: "X 帖子横图",
        width: 1200,
        height: 675,
        aspectRatio: "16:9",
        safeArea: { top: 48, right: 60, bottom: 48, left: 60 },
        notes: ["关键信息居中，兼顾时间线缩略预览"],
    },
    bilibili: {
        id: "bilibili-cover",
        platform: "bilibili",
        label: "B站投稿封面",
        width: 1146,
        height: 717,
        aspectRatio: "16:10",
        safeArea: { top: 48, right: 64, bottom: 48, left: 64 },
        notes: ["标题避免贴边", "主体在缩略图尺寸下仍应清晰可辨"],
    },
    douyin: {
        id: "douyin-cover",
        platform: "douyin",
        label: "抖音视频封面",
        width: 1080,
        height: 1920,
        aspectRatio: "9:16",
        safeArea: { top: 160, right: 120, bottom: 300, left: 80 },
        notes: ["右侧避让互动按钮", "底部避让标题、账号与导航区域"],
    },
} as const satisfies Record<SocialPlatform, SocialPlatformPreset>;

export const SOCIAL_PLATFORM_PRESETS = Object.values(SOCIAL_PLATFORM_DEFAULTS);

export const SOCIAL_PLATFORM_PRESET_IDS = ["wechat-cover", "xiaohongshu-post", "x-landscape", "bilibili-cover", "douyin-cover"] as const;

export const SOCIAL_PLATFORM_PRESET_OPTIONS = SOCIAL_PLATFORM_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
    platform: preset.platform,
    width: preset.width,
    height: preset.height,
}));

export function resolveSocialPlatformPreset(idOrPlatform: string) {
    const value = idOrPlatform.trim();
    return SOCIAL_PLATFORM_PRESETS.find((preset) => preset.id === value || preset.platform === value);
}

export function socialPlatformPreset(id: string) {
    return resolveSocialPlatformPreset(id);
}

export const CREATION_PROMPT_STYLE_IDS = [
    "general-natural-language",
    "chinese-image-model",
    "social-media-cover",
    "xiaohongshu-knowledge-card",
    "wechat-cover",
    "bilibili-cover",
    "douyin-vertical-cover",
    "photography",
    "minimalist",
    "graphic-summary",
    "scientific-mechanism",
    "scientific-workflow",
] as const satisfies readonly CreationPromptStyle[];

export const CREATION_PROMPT_STYLE_OPTIONS = [
    { value: "general-natural-language", label: "通用自然语言" },
    { value: "chinese-image-model", label: "中文生图模型" },
    { value: "social-media-cover", label: "社交媒体封面" },
    { value: "xiaohongshu-knowledge-card", label: "小红书知识卡" },
    { value: "wechat-cover", label: "微信公众号封面" },
    { value: "bilibili-cover", label: "B站高点击封面" },
    { value: "douyin-vertical-cover", label: "抖音竖版封面" },
    { value: "photography", label: "摄影风格" },
    { value: "minimalist", label: "极简设计" },
    { value: "graphic-summary", label: "图形摘要" },
    { value: "scientific-mechanism", label: "科研机制图" },
    { value: "scientific-workflow", label: "科研方法流程图" },
] as const satisfies ReadonlyArray<{ value: CreationPromptStyle; label: string }>;

export function socialPlatformLabel(platform: SocialPlatform) {
    return SOCIAL_PLATFORM_OPTIONS.find((item) => item.value === platform)?.label || platform;
}
