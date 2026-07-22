import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

export type ApiCallFormat = "openai" | "gemini" | "qwen";
export type ModelCapability = "image" | "video" | "text" | "audio";
export type ChannelProvider = "openai" | "new-api" | "openai-compatible" | "gemini" | "qwen" | "custom";
export type ChannelAuthType = "bearer" | "none";

export type ChannelModel = {
    name: string;
    capabilities: ModelCapability[];
    scripts?: Partial<Record<ModelCapability, string>>;
    /** Legacy persisted fields are read by normalizeChannelModels and never emitted. */
    capability?: ModelCapability;
    script?: string;
};

export type ModelChannel = {
    id: string;
    name: string;
    provider: ChannelProvider;
    baseUrl: string;
    apiKey: string;
    authType: ChannelAuthType;
    apiFormat: ApiCallFormat;
    models: ChannelModel[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    authType: ChannelAuthType;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    videoSeconds: string;
    vquality: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    videoReferenceMode: string;
    systemPrompt: string;
    models: string[];
    quality: string;
    size: string;
    background: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};
export type ConfigTabKey = "channels" | "preferences" | "prompt-sources" | "webdav";

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
const CHANNEL_MODEL_SEPARATOR = "::";
const OPENAI_BASE_URL = "https://api.openai.com";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const QWEN_BASE_URL = "https://dashscope.aliyuncs.com";

export type ChannelProviderPreset = {
    id: ChannelProvider;
    label: string;
    description: string;
    apiFormat: ApiCallFormat;
    baseUrl: string;
    authType: ChannelAuthType;
    models: ChannelModel[];
};

export const channelProviderPresets: ChannelProviderPreset[] = [
    {
        id: "openai",
        label: "OpenAI 官方",
        description: "OpenAI Images、Responses、Audio 与 Videos 接口。",
        apiFormat: "openai",
        baseUrl: OPENAI_BASE_URL,
        authType: "bearer",
        models: [
            { name: "gpt-image-2", capabilities: ["image"] },
            { name: "sora-2", capabilities: ["video"] },
            { name: "gpt-5.5", capabilities: ["text"] },
            { name: "gpt-4o-mini-tts", capabilities: ["audio"] },
        ],
    },
    {
        id: "new-api",
        label: "New API",
        description: "填写你的 New API 站点地址，按 OpenAI 兼容协议调用。",
        apiFormat: "openai",
        baseUrl: "",
        authType: "bearer",
        models: [],
    },
    {
        id: "openai-compatible",
        label: "OpenAI 兼容 / 中转站",
        description: "适用于实现 OpenAI 标准路径的自建服务与第三方中转站。",
        apiFormat: "openai",
        baseUrl: "",
        authType: "bearer",
        models: [],
    },
    {
        id: "gemini",
        label: "Google Gemini",
        description: "原生 Gemini 生图、文本与 Veo 视频接口。",
        apiFormat: "gemini",
        baseUrl: GEMINI_BASE_URL,
        authType: "bearer",
        models: [
            { name: "gemini-3.1-flash-image", capabilities: ["image", "text"] },
            { name: "veo-3.1-generate-preview", capabilities: ["video"] },
        ],
    },
    {
        id: "qwen",
        label: "Qwen / 阿里云百炼",
        description: "原生 Qwen-Image、Qwen Responses 与 Wan 视频任务接口。",
        apiFormat: "qwen",
        baseUrl: QWEN_BASE_URL,
        authType: "bearer",
        models: [
            { name: "qwen-image-2.0-pro", capabilities: ["image"] },
            { name: "wan2.7-t2v-2026-06-12", capabilities: ["video"] },
            { name: "qwen3.7-plus", capabilities: ["text"] },
        ],
    },
    {
        id: "custom",
        label: "完全自定义",
        description: "自定义 URL、鉴权与每种能力的调用脚本。",
        apiFormat: "openai",
        baseUrl: "",
        authType: "bearer",
        models: [],
    },
];

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: OPENAI_BASE_URL,
    apiKey: "",
    authType: "bearer",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: "默认渠道",
            provider: "openai",
            baseUrl: OPENAI_BASE_URL,
            apiKey: "",
            authType: "bearer",
            apiFormat: "openai",
            models: [
                { name: "gpt-image-2", capabilities: ["image"] },
                { name: "sora-2", capabilities: ["video"] },
                { name: "gpt-5.5", capabilities: ["text"] },
                { name: "gpt-4o-mini-tts", capabilities: ["audio"] },
            ],
        },
    ],
    model: "default::gpt-image-2",
    imageModel: "default::gpt-image-2",
    videoModel: "default::sora-2",
    textModel: "default::gpt-5.5",
    audioModel: "default::gpt-4o-mini-tts",
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    videoSeconds: "4",
    vquality: "720",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    videoReferenceMode: "reference",
    systemPrompt: "",
    models: ["default::gpt-image-2", "default::sora-2", "default::gpt-5.5", "default::gpt-4o-mini-tts"],
    quality: "auto",
    size: "1:1",
    background: "",
    count: "1",
    canvasImageCount: "3",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    url: "",
    username: "",
    password: "",
    directory: "infinite-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    configTab: ConfigTabKey;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean, tab?: ConfigTabKey) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

const VIDEO_KEYWORDS = ["seedance", "video", "sora", "veo", "kling", "wan2", "wanx", "hailuo"];
const AUDIO_KEYWORDS = ["audio", "tts", "speech", "voice", "music", "sound"];
const IMAGE_KEYWORDS = ["seedream", "gpt-image", "image", "dall-e", "dalle", "imagen", "flux", "sdxl", "stable-diffusion", "midjourney"];

/** Best-effort default capability for a freshly fetched model name; user can override in the channel editor. */
export function guessCapability(name: string): ModelCapability {
    const value = name.toLowerCase();
    if (VIDEO_KEYWORDS.some((keyword) => value.includes(keyword))) return "video";
    if (AUDIO_KEYWORDS.some((keyword) => value.includes(keyword))) return "audio";
    if (IMAGE_KEYWORDS.some((keyword) => value.includes(keyword))) return "image";
    return "text";
}

export function guessCapabilities(name: string): ModelCapability[] {
    return [guessCapability(name)];
}

function findChannelModel(config: AiConfig, value: string): { channel: ModelChannel; model: ChannelModel } | null {
    const decoded = decodeChannelModel(value);
    const name = decoded?.model || value;
    const channel = decoded ? config.channels.find((item) => item.id === decoded.channelId) : config.channels.find((item) => item.models.some((model) => model.name === name));
    const model = channel?.models.find((item) => item.name === name);
    return channel && model ? { channel, model } : null;
}

export function modelCapabilityOf(config: AiConfig, value: string): ModelCapability | undefined {
    return modelCapabilitiesOf(config, value)[0];
}

export function modelCapabilitiesOf(config: AiConfig, value: string): ModelCapability[] {
    return findChannelModel(config, value)?.model.capabilities || [];
}

export function modelMatchesCapability(config: AiConfig, value: string, capability?: ModelCapability) {
    if (!capability) return true;
    return modelCapabilitiesOf(config, value).includes(capability);
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return config.channels.flatMap((channel) => channel.models.filter((model) => model.capabilities.includes(capability)).map((model) => encodeChannelModel(channel.id, model.name)));
}

/** The user script (if any) attached to a model; empty string means use the system default call. */
export function resolveModelScript(config: AiConfig, value: string, capability: ModelCapability) {
    const model = findChannelModel(config, value)?.model;
    return model?.scripts?.[capability]?.trim() || model?.script?.trim() || "";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && (channel.authType === "none" || channel.apiKey.trim()));
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            configTab: "channels",
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
            openConfigDialog: (shouldPromptContinue = false, configTab = "channels") => set({ isConfigOpen: true, shouldPromptContinue, configTab }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                const imageModel = normalizeModelOptionValue(config.imageModel || config.model, channels);
                return {
                    ...current,
                    webdav: { ...defaultWebdavSyncConfig, ...persistedWebdav },
                    config: {
                        ...config,
                        channelMode: "local",
                        apiFormat: normalizeApiFormat(config.apiFormat),
                        authType: normalizeAuthType(config.authType),
                        channels,
                        models,
                        model: normalizeModelOptionValue(config.model, channels) || imageModel,
                        imageModel,
                        videoModel: normalizeModelOptionValue(config.videoModel, channels),
                        textModel: normalizeModelOptionValue(config.textModel || config.model, channels),
                        audioModel: normalizeModelOptionValue(config.audioModel || defaultConfig.audioModel, channels),
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || defaultConfig.videoSeconds,
                        vquality: config.vquality || "720",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        videoReferenceMode: config.videoReferenceMode === "interpolation" ? "interpolation" : "reference",
                        canvasImageCount: config.canvasImageCount || "3",
                    },
                };
            },
        },
    ),
);

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

/** Normalize a mixed list of raw model names or model objects into deduped ChannelModel entries. */
export function normalizeChannelModels(models: Array<string | ChannelModel> | undefined): ChannelModel[] {
    const seen = new Set<string>();
    const result: ChannelModel[] = [];
    for (const item of models || []) {
        const name = (typeof item === "string" ? item : item?.name || "").trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        const capabilities = normalizeCapabilities(typeof item === "string" ? undefined : item.capabilities, typeof item === "string" ? undefined : item.capability, name);
        const scripts = typeof item === "string" ? undefined : normalizeScripts(item.scripts, item.script, capabilities);
        result.push({ name, capabilities, ...(scripts ? { scripts } : {}) });
    }
    return result;
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    const provider = normalizeChannelProvider(channel?.provider, apiFormat, channel?.baseUrl);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || "新渠道",
        provider,
        baseUrl: channel?.baseUrl === undefined ? defaultBaseUrlForApiFormat(apiFormat) : channel.baseUrl.trim(),
        apiKey: channel?.apiKey || "",
        authType: normalizeAuthType(channel?.authType),
        apiFormat,
        models: normalizeChannelModels(channel?.models),
    };
}

export function createModelChannelFromPreset(provider: ChannelProvider, options?: { id?: string; name?: string }) {
    const preset = channelProviderPreset(provider);
    return createModelChannel({
        id: options?.id,
        name: options?.name || preset.label,
        provider,
        baseUrl: preset.baseUrl,
        apiKey: "",
        authType: preset.authType,
        apiFormat: preset.apiFormat,
        models: preset.models,
    });
}

export function channelProviderPreset(provider: ChannelProvider) {
    return channelProviderPresets.find((preset) => preset.id === provider) || channelProviderPresets[channelProviderPresets.length - 1];
}

export function channelProviderLabel(provider: ChannelProvider) {
    return channelProviderPreset(provider).label;
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel ? `${decoded.model}（${channel.name}）` : `${decoded.model}（渠道已删除）`;
}

export function assertModelChannelAvailable(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (decoded && !config.channels.some((channel) => channel.id === decoded.channelId)) {
        throw new Error(`模型 ${decoded.model} 所属渠道已删除，请重新选择模型`);
    }
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model.name))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.some((item) => item.name === decoded.model) ? model : "";
    }
    const channel = channels.find((item) => item.models.some((entry) => entry.name === model)) || channels[0];
    return channel && channel.models.some((item) => item.name === model) ? encodeChannelModel(channel.id, model) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.some((item) => item.name === model));
    if (decoded && !matched) {
        return createModelChannel({ id: decoded.channelId, name: "已删除渠道", provider: "custom", baseUrl: "", apiKey: "", authType: "none", apiFormat: "openai", models: [{ name: model, capabilities: guessCapabilities(model) }] });
    }
    return matched || config.channels[0] || createModelChannel({ id: "default", name: "默认渠道", baseUrl: config.baseUrl, apiKey: config.apiKey, authType: config.authType, apiFormat: config.apiFormat, models: config.models.map(modelOptionName).map((name) => ({ name, capabilities: guessCapabilities(name) })) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    return {
        ...config,
        model: modelOptionName(value || config.model),
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        authType: channel.authType,
        apiFormat: channel.apiFormat,
    };
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "默认渠道" : `渠道 ${index + 1}`),
            models: normalizeChannelModels(channel.models),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: "默认渠道",
                baseUrl: config.baseUrl || defaultConfig.baseUrl,
                apiKey: config.apiKey || "",
                authType: config.authType || defaultConfig.authType,
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: normalizeChannelModels([config.model, config.imageModel, config.videoModel, config.textModel, config.audioModel].map(modelOptionName)),
            }),
        );
    }
    return channels;
}

export function defaultBaseUrlForApiFormat(apiFormat: ApiCallFormat) {
    if (apiFormat === "gemini") return GEMINI_BASE_URL;
    if (apiFormat === "qwen") return QWEN_BASE_URL;
    return OPENAI_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" || apiFormat === "qwen" ? apiFormat : "openai";
}

function normalizeAuthType(authType: unknown): ChannelAuthType {
    return authType === "none" ? "none" : "bearer";
}

function normalizeChannelProvider(provider: unknown, apiFormat: ApiCallFormat, baseUrl?: string): ChannelProvider {
    if (channelProviderPresets.some((preset) => preset.id === provider)) return provider as ChannelProvider;
    if (apiFormat === "gemini") return "gemini";
    if (apiFormat === "qwen") return "qwen";
    return (baseUrl || "").toLowerCase().includes("api.openai.com") ? "openai" : "openai-compatible";
}

function normalizeCapabilities(capabilities: ModelCapability[] | undefined, legacyCapability: ModelCapability | undefined, name: string) {
    const valid: ModelCapability[] = ["image", "video", "text", "audio"];
    const values = Array.isArray(capabilities) ? capabilities : legacyCapability ? [legacyCapability] : guessCapabilities(name);
    const normalized = Array.from(new Set(values.filter((capability): capability is ModelCapability => valid.includes(capability))));
    return normalized.length ? normalized : guessCapabilities(name);
}

function normalizeScripts(scripts: Partial<Record<ModelCapability, string>> | undefined, legacyScript: string | undefined, capabilities: ModelCapability[]) {
    const normalized = Object.fromEntries(
        Object.entries(scripts || {})
            .map(([capability, script]) => [capability, script?.trim() || ""])
            .filter(([, script]) => script),
    ) as Partial<Record<ModelCapability, string>>;
    if (legacyScript?.trim() && capabilities[0] && !normalized[capabilities[0]]) normalized[capabilities[0]] = legacyScript.trim();
    return Object.keys(normalized).length ? normalized : undefined;
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
