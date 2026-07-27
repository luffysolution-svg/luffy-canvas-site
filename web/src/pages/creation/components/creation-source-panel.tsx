import { BookOpen, RotateCcw, Save, Sparkles, Square } from "lucide-react";
import { Button, Input, Select, Tag } from "antd";
import { useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { SOCIAL_PLATFORM_DEFAULTS, SOCIAL_PLATFORM_OPTIONS, resolveSocialPlatformPreset } from "@/constant/creation";
import { modelOptionLabel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { CreationProject, SocialPlatform } from "@/types/creation";

type EditableProjectField = "name" | "platformPresetId" | "scene" | "additionalRequirements" | "sourceContent";

type CreationSourcePanelProps = {
    project: CreationProject;
    busy: boolean;
    onChange: (field: EditableProjectField, value: string) => void;
    onAnalyze: () => void;
    onSaveDraft: () => void;
    onCancelRequest: () => void;
};

export function CreationSourcePanel({ project, busy, onChange, onAnalyze, onSaveDraft, onCancelRequest }: CreationSourcePanelProps) {
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
    const platform = platformFromPreset(project.platformPresetId);
    const preset = SOCIAL_PLATFORM_DEFAULTS[platform];
    const selectedBrief = project.briefVersions.find((version) => version.id === project.selectedBriefVersionId)?.brief;
    const sourceChanged = Boolean(selectedBrief && selectedBrief.sourceContent !== project.sourceContent.trim());

    return (
        <section className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-card dark:border-stone-800">
            <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">01 · Input</div>
                        <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">内容与目标</h2>
                    </div>
                    <Button type="text" size="small" icon={<Save className="size-3.5" />} onClick={onSaveDraft}>
                        保存草稿
                    </Button>
                </div>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                <Field label="任务名称">
                    <Input value={project.name} maxLength={80} onChange={(event) => onChange("name", event.target.value)} placeholder="例如：小红书知识卡封面" />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    <Field label="目标平台">
                        <Select className="w-full" value={platform} options={[...SOCIAL_PLATFORM_OPTIONS]} onChange={(value: SocialPlatform) => onChange("platformPresetId", SOCIAL_PLATFORM_DEFAULTS[value].id)} />
                    </Field>
                    <Field label="目标规格">
                        <div className="flex h-8 items-center gap-2 rounded-md border border-stone-200 px-3 text-sm text-stone-600 dark:border-stone-700 dark:text-stone-300">
                            <span>
                                {preset.width} × {preset.height}
                            </span>
                            <Tag variant="filled" className="!m-0 !bg-transparent !p-0 text-stone-400">
                                {preset.aspectRatio}
                            </Tag>
                        </div>
                    </Field>
                </div>

                <Field label="创作场景">
                    <Input value={project.scene} maxLength={120} onChange={(event) => onChange("scene", event.target.value)} placeholder="例如：知识卡、教程封面、产品测评" />
                </Field>

                <Field label="补充要求" optional>
                    <Input.TextArea value={project.additionalRequirements} onChange={(event) => onChange("additionalRequirements", event.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="受众、语气、品牌元素或明确禁忌" />
                </Field>

                <Field
                    label="原始内容"
                    action={
                        <Button type="text" size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setPromptLibraryOpen(true)}>
                            从提示词库导入
                        </Button>
                    }
                >
                    <Input.TextArea
                        value={project.sourceContent}
                        onChange={(event) => onChange("sourceContent", event.target.value)}
                        autoSize={{ minRows: 10, maxRows: 24 }}
                        placeholder="粘贴文章、Markdown、主题说明或图件需求。文本模型只负责分析，不会自动触发生图。"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-400">
                        <span>{project.sourceContent.trim().length.toLocaleString("zh-CN")} 字</span>
                        {sourceChanged ? <span className="text-amber-600 dark:text-amber-300">内容已变化，需要重新分析</span> : null}
                    </div>
                </Field>

                <Field label="分析模型">
                    <ModelPicker config={config} value={config.textModel} capability="text" fullWidth onChange={(value) => updateConfig("textModel", value)} onMissingConfig={() => openConfigDialog(false)} />
                    <p className="mt-2 truncate text-xs text-stone-400" title={modelOptionLabel(config, config.textModel)}>
                        仅用于内容分析与提示词优化
                    </p>
                </Field>
            </div>

            <div className="border-t border-stone-200 p-4 dark:border-stone-800">
                {busy ? (
                    <Button block icon={<Square className="size-3.5" />} onClick={onCancelRequest}>
                        取消当前请求
                    </Button>
                ) : (
                    <Button type="primary" size="large" block icon={project.briefVersions.length ? <RotateCcw className="size-4" /> : <Sparkles className="size-4" />} disabled={!project.sourceContent.trim()} onClick={onAnalyze}>
                        {project.briefVersions.length ? "重新分析并保留旧方案" : "分析内容"}
                    </Button>
                )}
            </div>

            <PromptSelectDialog open={promptLibraryOpen} onOpenChange={setPromptLibraryOpen} onSelect={(prompt) => onChange("sourceContent", prompt)} />
        </section>
    );
}

function Field({ label, optional, action, children }: { label: string; optional?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-200">
                    {label}
                    {optional ? <span className="ml-1 font-normal text-stone-400">可选</span> : null}
                </label>
                {action}
            </div>
            {children}
        </div>
    );
}

function platformFromPreset(value: string): SocialPlatform {
    return (resolveSocialPlatformPreset(value) || SOCIAL_PLATFORM_DEFAULTS.xiaohongshu).platform;
}
