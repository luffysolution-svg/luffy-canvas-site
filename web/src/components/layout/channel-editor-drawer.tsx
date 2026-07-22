import { App, Button, Drawer, Dropdown, Input, Select, Space } from "antd";
import { Code2, ListPlus, Trash2, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchChannelModels } from "@/services/api/image";
import { channelProviderPreset, channelProviderPresets, defaultBaseUrlForApiFormat, guessCapabilities, normalizeChannelModels, type ApiCallFormat, type ChannelAuthType, type ChannelModel, type ChannelProvider, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
    { label: "OpenAI", value: "openai" },
    { label: "Gemini", value: "gemini" },
    { label: "Qwen / DashScope", value: "qwen" },
];

const capabilityOptions: Array<{ label: string; value: ModelCapability }> = [
    { label: "生图", value: "image" },
    { label: "视频", value: "video" },
    { label: "文本", value: "text" },
    { label: "音频", value: "audio" },
];

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const { message } = App.useApp();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (open && channel) setDraft(channel);
    }, [open, channel]);

    if (!draft) return null;

    const patch = (value: Partial<ModelChannel>) => setDraft((current) => (current ? { ...current, ...value } : current));
    const setModels = (models: ChannelModel[]) => patch({ models });

    const changeProvider = (provider: ChannelProvider) => {
        if (provider === draft.provider) return;
        const nextPreset = channelProviderPreset(provider);
        if (provider === "custom") {
            patch({ provider });
            return;
        }
        patch({
            provider,
            apiFormat: nextPreset.apiFormat,
            authType: nextPreset.authType,
            baseUrl: nextPreset.baseUrl,
            apiKey: "",
            models: normalizeChannelModels(nextPreset.models),
        });
    };

    const changeApiFormat = (apiFormat: ApiCallFormat) => {
        const baseUrl = !draft.baseUrl.trim() || draft.baseUrl.trim() === defaultBaseUrlForApiFormat(draft.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : draft.baseUrl;
        patch({ apiFormat, baseUrl, provider: "custom" });
    };

    const applySelection = (names: string[]) => {
        const map = new Map(draft.models.map((model) => [model.name, model]));
        setModels(names.map((name) => map.get(name) || { name, capabilities: guessCapabilities(name) }));
    };

    const setCapabilities = (name: string, capabilities: ModelCapability[]) => setModels(draft.models.map((model) => (model.name === name ? { ...model, capabilities: capabilities.length ? capabilities : model.capabilities } : model)));
    const setScript = (name: string, capability: ModelCapability, script: string) =>
        setModels(
            draft.models.map((model) => {
                if (model.name !== name) return model;
                const scripts = { ...model.scripts, [capability]: script.trim() || undefined };
                return { ...model, scripts: Object.values(scripts).some(Boolean) ? scripts : undefined };
            }),
        );
    const removeModel = (name: string) => setModels(draft.models.filter((model) => model.name !== name));

    const testConnection = async () => {
        if (!draft.baseUrl.trim()) return message.error("请先填写接口地址");
        if (draft.authType !== "none" && !draft.apiKey.trim()) return message.error("请先填写 API Key，或选择无需鉴权");
        setTesting(true);
        try {
            const models = await fetchChannelModels(draft);
            message.success(models.length ? `连接成功，发现 ${models.length} 个模型` : "连接成功，上游未返回模型");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "连接测试失败");
        } finally {
            setTesting(false);
        }
    };

    const save = () => {
        onSave({ ...draft, name: draft.name.trim() || "未命名渠道", models: normalizeChannelModels(draft.models) });
        onClose();
    };

    return (
        <Drawer
            open={open}
            width={640}
            title="编辑渠道"
            onClose={onClose}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button icon={<Wifi className="size-4" />} loading={testing} onClick={() => void testConnection()}>
                        测试连接
                    </Button>
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={save}>
                        保存
                    </Button>
                </Space>
            }
        >
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">提供商预设</span>
                    <Select className="w-full" value={draft.provider} options={channelProviderPresets.map((preset) => ({ label: preset.label, value: preset.id }))} onChange={changeProvider} />
                    <span className="mt-1 block text-xs text-stone-500">{channelProviderPreset(draft.provider).description}</span>
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">渠道名称</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">协议</span>
                    <Select className="w-full" value={draft.apiFormat} options={apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">接口地址</span>
                    <Input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder={draft.apiFormat === "qwen" ? "https://dashscope.aliyuncs.com" : "https://api.example.com"} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">鉴权方式</span>
                    <Select
                        className="w-full"
                        value={draft.authType}
                        options={[
                            { label: "API Key", value: "bearer" as ChannelAuthType },
                            { label: "无需鉴权", value: "none" as ChannelAuthType },
                        ]}
                        onChange={(authType) => patch({ authType })}
                    />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">API Key</span>
                    <Input.Password disabled={draft.authType === "none"} value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder={draft.authType === "none" ? "当前渠道不发送鉴权信息" : "sk-..."} />
                </label>
            </div>

            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">渠道模型</div>
                    <div className="mt-0.5 text-xs text-stone-500">已选 {draft.models.length} 个；为每个模型指定能力并可自定义调用脚本。</div>
                </div>
                <Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setSelectOpen(true)}>
                    选择模型
                </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? (
                    draft.models.map((model) => (
                        <div key={model.name} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <span className="min-w-0 flex-1 truncate text-sm" title={model.name}>
                                {model.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                                <Select
                                    mode="multiple"
                                    size="small"
                                    className="min-w-[190px]"
                                    maxTagCount="responsive"
                                    value={model.capabilities}
                                    options={capabilityOptions}
                                    onChange={(values) => setCapabilities(model.name, values)}
                                />
                                <Dropdown
                                    trigger={["click"]}
                                    menu={{
                                        items: model.capabilities.map((capability) => ({ key: capability, label: `${capabilityOptions.find((item) => item.value === capability)?.label || capability}${model.scripts?.[capability] ? " · 已设置" : ""}` })),
                                        onClick: ({ key }) => {
                                            const capability = key as ModelCapability;
                                            setScriptTarget({ name: model.name, capability, value: model.scripts?.[capability] || "" });
                                        },
                                    }}
                                >
                                    <Button size="small" type={Object.values(model.scripts || {}).some(Boolean) ? "primary" : "default"} ghost={Object.values(model.scripts || {}).some(Boolean)} icon={<Code2 className="size-3.5" />}>
                                        调用脚本
                                    </Button>
                                </Dropdown>
                                <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(model.name)} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-2 py-8 text-center text-sm text-stone-500">点击「选择模型」拉取或手动增加模型。</div>
                )}
            </div>

            <ModelSelectModal open={selectOpen} channel={draft} selectedNames={draft.models.map((model) => model.name)} onConfirm={applySelection} onClose={() => setSelectOpen(false)} />

            <ModelScriptEditor
                open={Boolean(scriptTarget)}
                capability={scriptTarget?.capability || "text"}
                modelName={scriptTarget?.name || ""}
                value={scriptTarget?.value || ""}
                onSave={(script) => scriptTarget && setScript(scriptTarget.name, scriptTarget.capability, script)}
                onClose={() => setScriptTarget(null)}
            />
        </Drawer>
    );
}
