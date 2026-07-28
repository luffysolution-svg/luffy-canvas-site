import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";

import { channelProviderPreset, createModelChannelFromPreset, encodeChannelModel, modelOptionsFromChannels, useConfigStore, type ChannelProvider, type ModelCapability } from "@/stores/use-config-store";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const config = useConfigStore((state) => state.config);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    usePromptSourceScheduler();

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
        const hashHasConfig = ["baseUrl", "baseurl", "apiKey", "apikey", "provider"].some((key) => hashParams.has(key));
        const readParam = (...keys: string[]) => keys.map((key) => searchParams.get(key) || hashParams.get(key)).find(Boolean) || "";
        const baseUrl = readParam("baseUrl", "baseurl");
        const apiKey = readParam("apiKey", "apikey");
        const providerParam = readParam("provider");
        if (!baseUrl && !apiKey && !providerParam) return;
        const provider = providerParam ? normalizeImportedProvider(providerParam, baseUrl) : baseUrl ? normalizeImportedProvider("", baseUrl) : config.channels[0]?.provider || "openai";
        const preset = channelProviderPreset(provider);
        handledConfigParams.current = true;
        [searchParams, hashParams].forEach((params) => ["baseUrl", "baseurl", "apiKey", "apikey", "provider"].forEach((key) => params.delete(key)));
        const nextHash = hashHasConfig ? (hashParams.size ? `#${hashParams}` : "") : window.location.hash;
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${nextHash}`);
        const firstChannel = config.channels[0];
        const providerChanged = Boolean(firstChannel && firstChannel.provider !== provider);
        const protocolChanged = Boolean(firstChannel && firstChannel.apiFormat !== preset.apiFormat);
        const resetModels = protocolChanged || Boolean(providerChanged && preset.models.length);
        const nextChannels = firstChannel
            ? config.channels.map((channel, index) =>
                  index === 0
                      ? {
                            ...channel,
                            provider,
                            apiFormat: preset.apiFormat,
                            authType: preset.authType,
                            ...(resetModels ? { models: preset.models } : {}),
                            ...(baseUrl ? { baseUrl } : providerParam ? { baseUrl: preset.baseUrl } : {}),
                            ...(apiKey ? { apiKey } : providerChanged ? { apiKey: "" } : {}),
                        }
                      : channel,
              )
            : [{ ...createModelChannelFromPreset(provider, { id: "default", name: preset.label }), ...(baseUrl ? { baseUrl } : {}), apiKey }];
        updateConfig("channels", nextChannels);
        updateConfig("models", modelOptionsFromChannels(nextChannels));
        updateConfig("baseUrl", nextChannels[0]?.baseUrl || "");
        updateConfig("apiKey", nextChannels[0]?.apiKey || "");
        updateConfig("apiFormat", preset.apiFormat);
        updateConfig("authType", preset.authType);
        if (resetModels || !firstChannel) {
            const channel = nextChannels[0];
            const defaultKeys: Array<[ModelCapability, "imageModel" | "videoModel" | "textModel" | "audioModel"]> = [
                ["image", "imageModel"],
                ["video", "videoModel"],
                ["text", "textModel"],
                ["audio", "audioModel"],
            ];
            defaultKeys.forEach(([capability, key]) => {
                const model = channel.models.find((item) => item.capabilities.includes(capability));
                const value = model ? encodeChannelModel(channel.id, model.name) : "";
                updateConfig(key, value);
                if (capability === "image") updateConfig("model", value);
            });
        }
        openConfigDialog(false);
        message.success(`已导入 ${preset.label} 直连配置`);
    }, [config.channels, message, openConfigDialog, updateConfig]);

    return <>{children}</>;
}

function normalizeImportedProvider(value: string, baseUrl: string): ChannelProvider {
    const provider = value.trim().toLowerCase().replace(/_/g, "-");
    if (provider === "newapi" || provider === "new-api") return "new-api";
    if (provider === "openai" || provider === "gemini" || provider === "qwen" || provider === "custom" || provider === "openai-compatible") return provider;
    const url = baseUrl.toLowerCase();
    if (url.includes("generativelanguage.googleapis.com")) return "gemini";
    if (url.includes("dashscope") || url.includes("maas.aliyuncs.com")) return "qwen";
    if (url.includes("api.openai.com")) return "openai";
    return "openai-compatible";
}
