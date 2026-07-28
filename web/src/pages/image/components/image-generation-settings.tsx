import { InputNumber } from "antd";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type ImageConfigKey = "imageModel" | "quality" | "size" | "count" | "background" | "optimizeImageReferences";

export type ImageGenerationSettingsValue = Pick<AiConfig, ImageConfigKey> & {
    batchSize: number;
};

export type ImageGenerationSettingsProps = {
    config: AiConfig;
    batchSize: number;
    onChange: (patch: Partial<ImageGenerationSettingsValue>) => void;
    onMissingConfig?: () => void;
    className?: string;
};

export function ImageGenerationSettings({ config, batchSize, onChange, onMissingConfig, className }: ImageGenerationSettingsProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const model = config.imageModel || config.model;
    const concurrency = clampInteger(batchSize, 1, 10);

    const updateConfig = <Key extends ImageConfigKey>(key: Key, value: AiConfig[Key]) => {
        onChange({ [key]: value });
    };

    return (
        <section className={cn("min-w-0 space-y-5", className)} aria-label="图片生成设置">
            <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium">图片模型</span>
                <ModelPicker config={config} value={model} capability="image" fullWidth onChange={(imageModel) => onChange({ imageModel })} onMissingConfig={onMissingConfig} />
            </label>

            <label className="block min-w-0 rounded-lg border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-800 dark:bg-stone-900/30">
                <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">批量并发</span>
                    <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">{concurrency} 路</span>
                </span>
                <InputNumber aria-label="批量并发" className="mt-2 w-full" min={1} max={10} precision={0} value={concurrency} onChange={(value) => onChange({ batchSize: clampInteger(value || 1, 1, 10) })} />
                <span className="mt-1.5 block text-xs leading-5 text-stone-500 dark:text-stone-400">系列任务最多配置 10 路，实际并发仍受模型与全局队列限制。</span>
            </label>

            <ImageSettingsPanel config={config} theme={theme} showTitle={false} maxCount={15} className="min-w-0 space-y-5" onConfigChange={updateConfig} />
        </section>
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampInteger(value: number, min: number, max: number) {
    return Math.round(clamp(value, min, max));
}
