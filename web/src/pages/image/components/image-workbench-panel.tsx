import { Alert, Button, Collapse, Input, Select, Tag } from "antd";
import { BookOpen, Eye, FolderPlus, History, ListTree, Settings2, SlidersHorizontal, Sparkles, Square, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { CustomPresetDialog } from "@/features/image-design/components/custom-preset-dialog";
import { DesignSkillSelect } from "@/features/image-design/components/design-skill-select";
import { FinalPromptPreview } from "@/features/image-design/components/final-prompt-preview";
import { PlatformPresetSelect } from "@/features/image-design/components/platform-preset-select";
import { PlatformQuickTabs } from "@/features/image-design/components/platform-quick-tabs";
import { PlatformRecommendationStrip } from "@/features/image-design/components/platform-recommendation-strip";
import { RecommendationReview } from "@/features/image-design/components/recommendation-review";
import { SafeAreaPreview } from "@/features/image-design/components/safe-area-preview";
import { SeriesPlanEditor } from "@/features/image-design/components/series-plan-editor";
import { SkillOptionsPanel } from "@/features/image-design/components/skill-options-panel";
import { StoryboardEditor } from "@/features/image-design/components/storyboard-editor";
import type { GenerationResult } from "@/features/image-design/generation/types";
import { BUILTIN_PLATFORM_PRESETS } from "@/features/image-design/registry/platform-presets";
import { useImageDesignStore } from "@/features/image-design/store/use-image-design-store";
import type { CompiledPrompt, DesignSkillDefinition, ImageDesignRecommendation, PlatformPreset, SkillOptionValue, StructuredPlan, StructuredPlanItem } from "@/features/image-design/types";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import { ImageGenerationSettings, type ImageGenerationSettingsValue } from "./image-generation-settings";
import { ReferenceImagesField } from "./reference-images-field";

export type ImageWorkbenchPanelProps = {
    prompt: string;
    references: ReferenceImage[];
    config: AiConfig;
    skill: DesignSkillDefinition;
    preset?: PlatformPreset;
    skillOptions: Record<string, SkillOptionValue>;
    compiled: CompiledPrompt | null;
    finalPrompt: string;
    manualOverride: boolean;
    customInstructions: string;
    negativeInstructions: string;
    recommendation: ImageDesignRecommendation | null;
    recommending: boolean;
    plan: StructuredPlan | null;
    planWarnings: string[];
    results: GenerationResult[];
    running: boolean;
    elapsedMs: number;
    referenceMaxCount?: number;
    referenceMaxBytes?: number;
    referenceMimeTypes?: string[];
    onPromptChange: (value: string) => void;
    onReferencesChange: (value: ReferenceImage[]) => void;
    onConfigChange: (patch: Partial<ImageGenerationSettingsValue>) => void;
    onFinalPromptChange: (value: string) => void;
    onRestoreFinalPrompt: () => void;
    onRecompile: () => void;
    onReplaceOriginal: (value: string) => void;
    onCustomInstructionsChange: (value: string) => void;
    onNegativeInstructionsChange: (value: string) => void;
    onRecommend: () => void;
    onApplyRecommendation: () => void;
    onDismissRecommendation: () => void;
    onCreatePlan: () => void;
    onPlanChange: (plan: StructuredPlan) => void;
    onGeneratePlanItem: (item: StructuredPlanItem) => void;
    onRetryFailed: () => void;
    onGenerate: () => void;
    onCancel: () => void;
    onOpenHistory: () => void;
    onOpenPromptLibrary: () => void;
    onOpenPromptOptimizer: () => void;
    onOpenAssets: () => void;
    onOpenPreferences: () => void;
    onOpenGenerationSettings: () => void;
    onMissingConfig: () => void;
};

export function ImageWorkbenchPanel(props: ImageWorkbenchPanelProps) {
    const [platformFilter, setPlatformFilter] = useState(props.preset?.platform || "all");
    const [customPresetOpen, setCustomPresetOpen] = useState(false);
    const [editingPreset, setEditingPreset] = useState<PlatformPreset | undefined>();
    const selectedSkillId = useImageDesignStore((state) => state.selectedSkillId);
    const selectedPresetId = useImageDesignStore((state) => state.selectedPresetId);
    const selectedContentType = useImageDesignStore((state) => state.selectedContentType);
    const customOptions = useImageDesignStore((state) => state.customOptions);
    const customPresets = useImageDesignStore((state) => state.customPresets);
    const favorites = useImageDesignStore((state) => state.favorites);
    const recentPresetIds = useImageDesignStore((state) => state.recentPresetIds);
    const preferences = useImageDesignStore(
        useShallow((state) => ({
            quickMode: state.quickMode,
            confirmBeforeGeneration: state.confirmBeforeGeneration,
            useAiRecommendation: state.useAiRecommendation,
            finalPromptPreviewOpen: state.finalPromptPreviewOpen,
            finalPromptPreviewEnabled: state.finalPromptPreviewEnabled,
            defaultLanguage: state.defaultLanguage,
            defaultSkillId: state.defaultSkillId,
            defaultPlatformId: state.defaultPlatformId,
            defaultPalette: state.defaultPalette,
            defaultStyle: state.defaultStyle,
            defaultSeriesCount: state.defaultSeriesCount,
            anchorChainEnabled: state.anchorChainEnabled,
            batchSize: state.batchSize,
        })),
    );
    const selectSkill = useImageDesignStore((state) => state.selectSkill);
    const selectPlatformPreset = useImageDesignStore((state) => state.selectPlatformPreset);
    const selectContentType = useImageDesignStore((state) => state.selectContentType);
    const updateSkillOption = useImageDesignStore((state) => state.updateSkillOption);
    const updateCustomOption = useImageDesignStore((state) => state.updateCustomOption);
    const updatePreferences = useImageDesignStore((state) => state.updatePreferences);
    const toggleFavorite = useImageDesignStore((state) => state.toggleFavorite);
    const upsertCustomPreset = useImageDesignStore((state) => state.upsertCustomPreset);
    const removeCustomPreset = useImageDesignStore((state) => state.removeCustomPreset);
    const contentTypeOptions = useMemo(() => {
        const presets = [...customPresets, ...BUILTIN_PLATFORM_PRESETS].filter((item) => platformFilter === "all" || item.platform === platformFilter);
        return Array.from(new Map(presets.map((item) => [item.contentType, { value: item.contentType, label: item.label, presetId: item.id }])).values());
    }, [customPresets, platformFilter]);
    const failedCount = props.results.filter((result) => result.status === "failed").length;

    useEffect(() => {
        if (props.preset) setPlatformFilter(props.preset.platform);
    }, [props.preset]);

    const selectPreset = (preset?: PlatformPreset) => {
        selectPlatformPreset(preset?.id || "manual");
        if (preset) setPlatformFilter(preset.platform);
    };
    const editCustom = () => {
        const selected = customPresets.find((preset) => preset.id === selectedPresetId);
        setEditingPreset(selected);
        setCustomPresetOpen(true);
    };

    return (
        <section className="@container/workbench min-w-0 [&_.ant-btn-sm]:!min-h-10 sm:[&_.ant-btn-sm]:!min-h-6" aria-label="生图工作台">
            <header className="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-semibold tracking-tight">生图工作台</h1>
                        <Tag className="m-0">{preferences.quickMode ? "快速模式" : "引导模式"}</Tag>
                    </div>
                    <p className="mb-0 mt-1 text-xs text-stone-500 dark:text-stone-400">平台控制画幅，Skill 组织内容；真正请求始终复用当前图片模型渠道。</p>
                </div>
                <div className="flex shrink-0 gap-1">
                    <span className="@min-[1200px]/image-page:hidden">
                        <Button className="!min-h-10 sm:!min-h-8" type="text" icon={<History className="size-4" />} onClick={props.onOpenHistory}>
                            记录
                        </Button>
                    </span>
                    <span className="sm:hidden">
                        <Button className="!min-h-10 sm:!min-h-8" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={props.onOpenGenerationSettings}>
                            参数
                        </Button>
                    </span>
                    <Button className="!min-h-10 sm:!min-h-8" type="text" icon={<Settings2 className="size-4" />} onClick={props.onOpenPreferences}>
                        偏好
                    </Button>
                </div>
            </header>
            <WorkflowProgress
                hasInput={Boolean(props.prompt.trim())}
                recommending={props.recommending}
                hasRecommendation={Boolean(props.recommendation)}
                needsPlan={props.skill.workflow !== "single"}
                hasPlan={Boolean(props.plan)}
                compiled={Boolean(props.compiled)}
                running={props.running}
                hasResults={Boolean(props.results.length)}
            />

            <div className="mt-5 grid min-w-0 gap-5 @min-[560px]/workbench:grid-cols-[minmax(0,1fr)_minmax(220px,0.68fr)]">
                <div className="min-w-0 space-y-5">
                    <div>
                        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                            <label htmlFor="image-workbench-prompt" className="text-sm font-medium">
                                原始提示词或长文本
                            </label>
                            <div className="flex min-w-0 flex-wrap justify-end gap-1">
                                <Button size="small" type="text" icon={<BookOpen className="size-3.5" />} onClick={props.onOpenPromptLibrary}>
                                    提示词库
                                </Button>
                                <Button size="small" type="text" icon={<WandSparkles className="size-3.5" />} onClick={props.onOpenPromptOptimizer}>
                                    优化
                                </Button>
                                <Button size="small" type="text" icon={<FolderPlus className="size-3.5" />} onClick={props.onOpenAssets}>
                                    我的资产
                                </Button>
                            </div>
                        </div>
                        <Input.TextArea
                            id="image-workbench-prompt"
                            value={props.prompt}
                            autoSize={{ minRows: 6, maxRows: 18 }}
                            placeholder="描述主题、必须保留的信息、目标受众和使用场景；也可以直接粘贴文章、Markdown 或故事。"
                            onChange={(event) => props.onPromptChange(event.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        <PlatformQuickTabs value={platformFilter} onChange={setPlatformFilter} />
                        <div className="grid min-w-0 gap-3 @min-[480px]/workbench:grid-cols-2">
                            <DesignSkillSelect value={selectedSkillId} disabled={props.running} onChange={selectSkill} />
                            <PlatformPresetSelect
                                value={selectedPresetId}
                                platform={platformFilter}
                                customPresets={customPresets}
                                favorites={favorites}
                                recentPresetIds={recentPresetIds}
                                onChange={selectPreset}
                                onToggleFavorite={toggleFavorite}
                                onEditCustom={editCustom}
                            />
                            <label className="block min-w-0 @min-[480px]/workbench:col-span-2">
                                <span className="mb-1.5 block text-sm font-medium">内容类型</span>
                                <Select
                                    className="w-full [&_.ant-select-placeholder]:!text-stone-500 dark:[&_.ant-select-placeholder]:!text-stone-400"
                                    aria-label="内容类型"
                                    value={props.preset ? selectedContentType : undefined}
                                    placeholder="选择平台预设后确定"
                                    options={contentTypeOptions}
                                    onChange={(contentType) => {
                                        const option = contentTypeOptions.find((item) => item.value === contentType);
                                        if (option) selectPlatformPreset(option.presetId);
                                        else selectContentType(contentType);
                                    }}
                                />
                            </label>
                        </div>
                        <PlatformRecommendationStrip preset={props.preset} />
                        {props.preset ? <Collapse ghost size="small" className="-mx-2" items={[{ key: "safe-area", label: "查看安全区与避让区", children: <SafeAreaPreview preset={props.preset} /> }]} /> : null}
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Button className="!min-h-10 sm:!min-h-8" icon={<Sparkles className="size-3.5" />} loading={props.recommending} disabled={!props.prompt.trim() || props.running} onClick={props.onRecommend}>
                            智能推荐
                        </Button>
                        {props.skill.workflow !== "single" ? (
                            <Button className="!min-h-10 sm:!min-h-8" icon={<ListTree className="size-3.5" />} disabled={!props.prompt.trim() || props.running} onClick={props.onCreatePlan}>
                                分析并生成计划
                            </Button>
                        ) : null}
                        <span className="text-xs text-stone-500 dark:text-stone-400">{preferences.useAiRecommendation ? "文本模型推荐，失败自动本地回退" : "本地确定性推荐"}</span>
                        {props.compiled && !preferences.finalPromptPreviewEnabled ? (
                            <Button className="!min-h-10 sm:!min-h-8" type="text" icon={<Eye className="size-3.5" />} onClick={() => updatePreferences({ finalPromptPreviewEnabled: true, finalPromptPreviewOpen: true })}>
                                查看最终 Prompt
                            </Button>
                        ) : null}
                    </div>

                    {props.recommendation ? <RecommendationReview recommendation={props.recommendation} onApply={props.onApplyRecommendation} onDismiss={props.onDismissRecommendation} /> : null}

                    <SkillOptionsPanel
                        skill={props.skill}
                        values={props.skillOptions}
                        customValues={customOptions}
                        onChange={(key, value) => {
                            updateSkillOption(selectedSkillId, key, value);
                            if (key.startsWith("custom") && typeof value === "string") updateCustomOption(key, value);
                        }}
                        onCustomChange={updateCustomOption}
                    />

                    <Collapse
                        ghost
                        className="-mx-2"
                        items={[
                            {
                                key: "instructions",
                                label: "用户自定义规则与禁止项",
                                children: (
                                    <div className="grid min-w-0 gap-3">
                                        <label>
                                            <span className="mb-1.5 block text-sm font-medium">自定义规则</span>
                                            <Input.TextArea value={props.customInstructions} autoSize={{ minRows: 2, maxRows: 6 }} placeholder="例如：保留品牌蓝和产品正面角度" onChange={(event) => props.onCustomInstructionsChange(event.target.value)} />
                                        </label>
                                        <label>
                                            <span className="mb-1.5 block text-sm font-medium">额外禁止项</span>
                                            <Input.TextArea value={props.negativeInstructions} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="例如：不要水印，不要错误数字" onChange={(event) => props.onNegativeInstructionsChange(event.target.value)} />
                                        </label>
                                    </div>
                                ),
                            },
                        ]}
                    />

                    {props.planWarnings.map((warning) => (
                        <Alert key={warning} type="warning" showIcon title={warning} />
                    ))}
                    {props.plan ? (
                        props.plan.type === "storyboard" ? (
                            <StoryboardEditor plan={props.plan} disabled={props.running} onChange={props.onPlanChange} onRegeneratePanel={props.onGeneratePlanItem} onRetryFailed={failedCount ? props.onRetryFailed : undefined} />
                        ) : (
                            <SeriesPlanEditor plan={props.plan} disabled={props.running} onChange={props.onPlanChange} onRegenerateItem={props.onGeneratePlanItem} onRetryFailed={failedCount ? props.onRetryFailed : undefined} />
                        )
                    ) : null}

                    <ReferenceImagesField value={props.references} disabled={props.running} maxCount={props.referenceMaxCount} maxBytes={props.referenceMaxBytes} allowedMimeTypes={props.referenceMimeTypes} onChange={props.onReferencesChange} />

                    <Collapse
                        className="rounded-lg border border-stone-200 bg-card dark:border-stone-800"
                        items={[
                            {
                                key: "generation-settings",
                                label: (
                                    <span className="flex min-w-0 items-center justify-between gap-3">
                                        <span>模型与生成参数</span>
                                        <span className="truncate text-xs font-normal text-stone-500 dark:text-stone-400">
                                            {props.config.size} · {props.config.quality} · {props.config.count} 张
                                        </span>
                                    </span>
                                ),
                                children: <ImageGenerationSettings config={props.config} batchSize={preferences.batchSize} onMissingConfig={props.onMissingConfig} onChange={props.onConfigChange} />,
                            },
                        ]}
                    />

                    {props.compiled && preferences.finalPromptPreviewEnabled ? (
                        <div className="@min-[560px]/workbench:hidden">
                            <Collapse
                                defaultActiveKey={preferences.finalPromptPreviewOpen ? ["prompt-preview"] : []}
                                onChange={(keys) => updatePreferences({ finalPromptPreviewOpen: keys.includes("prompt-preview") })}
                                items={[
                                    {
                                        key: "prompt-preview",
                                        label: "最终 Prompt 与尺寸映射",
                                        children: (
                                            <FinalPromptPreview
                                                compact
                                                compiled={props.compiled}
                                                value={props.finalPrompt}
                                                manualOverride={props.manualOverride}
                                                onChange={props.onFinalPromptChange}
                                                onRestore={props.onRestoreFinalPrompt}
                                                onRecompile={props.onRecompile}
                                                onReplaceOriginal={props.onReplaceOriginal}
                                            />
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    ) : null}
                </div>

                {props.compiled && preferences.finalPromptPreviewEnabled ? (
                    <aside className="hidden min-w-0 self-start @min-[560px]/workbench:sticky @min-[560px]/workbench:top-0 @min-[560px]/workbench:block">
                        <FinalPromptPreview
                            compact
                            compiled={props.compiled}
                            value={props.finalPrompt}
                            manualOverride={props.manualOverride}
                            onChange={props.onFinalPromptChange}
                            onRestore={props.onRestoreFinalPrompt}
                            onRecompile={props.onRecompile}
                            onReplaceOriginal={props.onReplaceOriginal}
                        />
                    </aside>
                ) : null}
            </div>

            <div className="sticky bottom-0 z-10 -mx-4 mt-5 hidden border-t border-stone-200 bg-card/95 px-4 py-3 backdrop-blur @min-[760px]/image-page:flex dark:border-stone-800">
                {props.running ? (
                    <Button danger size="large" block icon={<Square className="size-4 fill-current" />} onClick={props.onCancel}>
                        取消生成 · {Math.round(props.elapsedMs / 1000)} 秒
                    </Button>
                ) : (
                    <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!props.prompt.trim() || !props.compiled} onClick={props.onGenerate}>
                        开始生成
                    </Button>
                )}
            </div>

            <CustomPresetDialog
                open={customPresetOpen}
                preset={editingPreset}
                presets={customPresets}
                onClose={() => {
                    setCustomPresetOpen(false);
                    setEditingPreset(undefined);
                }}
                onSave={(preset) => {
                    upsertCustomPreset(preset);
                    selectPlatformPreset(preset.id);
                    setPlatformFilter(preset.platform);
                }}
                onDelete={(id) => {
                    removeCustomPreset(id);
                    setCustomPresetOpen(false);
                    setEditingPreset(undefined);
                }}
                onImport={(presets) => presets.forEach(upsertCustomPreset)}
            />
        </section>
    );
}

function WorkflowProgress({
    hasInput,
    recommending,
    hasRecommendation,
    needsPlan,
    hasPlan,
    compiled,
    running,
    hasResults,
}: {
    hasInput: boolean;
    recommending: boolean;
    hasRecommendation: boolean;
    needsPlan: boolean;
    hasPlan: boolean;
    compiled: boolean;
    running: boolean;
    hasResults: boolean;
}) {
    const stages = [
        { label: "内容", active: hasInput, busy: false },
        { label: "分析", active: hasRecommendation || compiled, busy: recommending },
        { label: "规划", active: !needsPlan || hasPlan, busy: false },
        { label: "编译", active: compiled, busy: false },
        { label: hasResults ? "结果" : "生成", active: hasResults, busy: running },
    ];
    return (
        <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1" role="group" aria-label="创作进度">
            {stages.map((stage, index) => (
                <div key={stage.label} className="flex shrink-0 items-center gap-1.5">
                    {index ? <span className="h-px w-3 bg-stone-300 dark:bg-stone-700" /> : null}
                    <Tag className="m-0" color={stage.busy ? "processing" : stage.active ? "green" : undefined}>
                        {stage.busy ? `${stage.label}中` : stage.label}
                    </Tag>
                </div>
            ))}
        </div>
    );
}
