import { Drawer, InputNumber, Select, Switch } from "antd";

import { DESIGN_SKILLS } from "../registry/design-skills";
import { PLATFORM_LABELS } from "../registry/platform-presets";
import type { ImageDesignPreferences } from "../types";

type PreferencePatch = Partial<
    Pick<
        ImageDesignPreferences,
        | "quickMode"
        | "confirmBeforeGeneration"
        | "useAiRecommendation"
        | "finalPromptPreviewEnabled"
        | "defaultLanguage"
        | "defaultSkillId"
        | "defaultPlatformId"
        | "defaultPalette"
        | "defaultStyle"
        | "defaultSeriesCount"
        | "anchorChainEnabled"
        | "batchSize"
    >
>;

type ImageDesignPreferenceValues = Pick<
    ImageDesignPreferences,
    "quickMode" | "confirmBeforeGeneration" | "useAiRecommendation" | "finalPromptPreviewEnabled" | "defaultLanguage" | "defaultSkillId" | "defaultPlatformId" | "defaultPalette" | "defaultStyle" | "defaultSeriesCount" | "anchorChainEnabled" | "batchSize"
>;

const DEFAULT_PALETTE_OPTIONS = preferenceOptions(["palette"]);
const DEFAULT_STYLE_OPTIONS = preferenceOptions(["style", "rendering", "artStyle"]);

export function ImageDesignPreferencesDrawer({ open, preferences, onChange, onClose }: { open: boolean; preferences: ImageDesignPreferenceValues; onChange: (patch: PreferencePatch) => void; onClose: () => void }) {
    return (
        <Drawer title="生图工作台偏好" open={open} onClose={onClose} size={420}>
            <div className="space-y-5">
                <PreferenceSwitch label="默认快速模式" description="点击开始生成时直接编译；兼容映射仍会要求确认。" checked={preferences.quickMode} onChange={(quickMode) => onChange({ quickMode })} />
                <PreferenceSwitch label="每次生成前显示确认" description="在真正请求模型前核对平台、Skill、比例和最终提示词。" checked={preferences.confirmBeforeGeneration} onChange={(confirmBeforeGeneration) => onChange({ confirmBeforeGeneration })} />
                <PreferenceSwitch label="使用文本模型智能推荐" description="失败或输出无效时自动回退到本地确定性规则。" checked={preferences.useAiRecommendation} onChange={(useAiRecommendation) => onChange({ useAiRecommendation })} />
                <PreferenceSwitch
                    label="默认显示最终 Prompt 预览"
                    description="关闭后仍会编译并保存快照，可随时手动展开。"
                    checked={preferences.finalPromptPreviewEnabled}
                    onChange={(finalPromptPreviewEnabled) => onChange({ finalPromptPreviewEnabled })}
                />
                <PreferenceSwitch label="启用图片 1 锚点链" description="系列图后续项可把图片 1 作为附加参考；不会覆盖用户原始参考图。" checked={preferences.anchorChainEnabled} onChange={(anchorChainEnabled) => onChange({ anchorChainEnabled })} />

                <PreferenceSelect label="默认设计 Skill" value={preferences.defaultSkillId} options={DESIGN_SKILLS.map((skill) => ({ value: skill.id, label: skill.label }))} onChange={(defaultSkillId) => onChange({ defaultSkillId })} />
                <PreferenceSelect label="默认平台" value={preferences.defaultPlatformId} options={[{ value: "manual", label: "手动参数" }, ...PLATFORM_LABELS]} onChange={(defaultPlatformId) => onChange({ defaultPlatformId })} />
                <PreferenceSelect
                    label="默认文字语言"
                    value={preferences.defaultLanguage}
                    options={[
                        { value: "zh-CN", label: "中文" },
                        { value: "en", label: "English" },
                    ]}
                    onChange={(defaultLanguage) => onChange({ defaultLanguage })}
                />
                <PreferenceSelect label="默认配色" value={preferences.defaultPalette} options={DEFAULT_PALETTE_OPTIONS} onChange={(defaultPalette) => onChange({ defaultPalette })} />
                <PreferenceSelect label="默认风格" value={preferences.defaultStyle} options={DEFAULT_STYLE_OPTIONS} onChange={(defaultStyle) => onChange({ defaultStyle })} />

                <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">默认系列张数</span>
                    <InputNumber min={1} max={10} value={preferences.defaultSeriesCount} className="w-full" onChange={(value) => onChange({ defaultSeriesCount: value || 1 })} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">批量并发</span>
                    <InputNumber aria-label="批量并发" min={1} max={10} value={preferences.batchSize} className="w-full" onChange={(value) => onChange({ batchSize: value || 1 })} />
                    <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">底层全局队列仍会按模型与高分辨率限制并发。</span>
                </label>
            </div>
        </Drawer>
    );
}

function PreferenceSwitch({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="flex items-start justify-between gap-4">
            <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</span>
            </span>
            <Switch checked={checked} className="mt-0.5 shrink-0" onChange={onChange} />
        </label>
    );
}

function PreferenceSelect<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: Array<{ value: Value; label: string }>; onChange: (value: Value) => void }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{label}</span>
            <Select showSearch optionFilterProp="label" value={value} options={options} className="w-full" onChange={onChange} />
        </label>
    );
}

function preferenceOptions(keys: string[]) {
    const options = new Map<string, { value: string; label: string }>([["auto", { value: "auto", label: "自动推荐" }]]);
    for (const skill of DESIGN_SKILLS) {
        for (const group of skill.optionGroups) {
            if (!keys.includes(group.key)) continue;
            for (const option of group.options || []) {
                if (!options.has(option.id)) options.set(option.id, { value: option.id, label: option.nameZh });
            }
        }
    }
    return Array.from(options.values());
}
