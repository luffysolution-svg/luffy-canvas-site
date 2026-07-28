import { ShieldCheck } from "lucide-react";

import type { PlatformPreset } from "../types";

export function PlatformRecommendationStrip({ preset }: { preset?: PlatformPreset }) {
    if (!preset) {
        return <div className="rounded-md border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">当前使用手动模型参数，不施加平台安全区或比例规则。</div>;
    }
    return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border border-stone-200 bg-stone-50/70 px-3 py-2.5 text-xs dark:border-stone-800 dark:bg-stone-900/40 sm:grid-cols-4">
            <Metric label="推荐比例" value={preset.aspectRatio} />
            <Metric label="生图尺寸" value={`${preset.generationSize.width}×${preset.generationSize.height}`} />
            <Metric label="文字密度" value={textDensityLabel(preset.textDensity)} />
            <div className="min-w-0">
                <div className="text-stone-500 dark:text-stone-400">安全区</div>
                <div className="mt-0.5 flex items-center gap-1 truncate font-medium" title={preset.safeArea.description}>
                    <ShieldCheck className="size-3.5 shrink-0" />
                    已启用
                </div>
            </div>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-stone-500 dark:text-stone-400">{label}</div>
            <div className="mt-0.5 truncate font-medium" title={value}>
                {value}
            </div>
        </div>
    );
}

function textDensityLabel(value: PlatformPreset["textDensity"]) {
    if (value === "none") return "无文字";
    if (value === "low") return "低";
    if (value === "medium") return "中";
    return "高";
}
