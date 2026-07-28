import { Alert, Button, Tag } from "antd";
import { Check, Sparkles, X } from "lucide-react";

import { designSkillById } from "../registry/design-skills";
import { platformPresetById } from "../registry/platform-presets";
import type { ImageDesignRecommendation } from "../types";

export function RecommendationReview({ recommendation, onApply, onDismiss }: { recommendation: ImageDesignRecommendation; onApply: () => void; onDismiss: () => void }) {
    const skill = designSkillById(recommendation.skillId);
    const preset = platformPresetById(recommendation.platformPresetId);
    return (
        <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/40">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2 font-medium">
                        <Sparkles className="size-4" />
                        推荐确认
                        <Tag className="m-0">{recommendation.source === "ai" ? "文本模型" : recommendation.source === "fallback" ? "本地回退" : "本地规则"}</Tag>
                    </div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {skill.label}
                        {preset ? ` · ${preset.platformLabel} ${preset.label}` : " · 手动平台参数"}
                    </div>
                </div>
                <div className="flex gap-1">
                    <Button type="text" size="small" icon={<X className="size-3.5" />} onClick={onDismiss}>
                        忽略
                    </Button>
                    <Button type="primary" size="small" icon={<Check className="size-3.5" />} onClick={onApply}>
                        应用推荐
                    </Button>
                </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Object.entries(recommendation.reasoning).map(([key, reason]) => (
                    <div key={key} className="min-w-0 rounded-md bg-white px-2.5 py-2 text-xs dark:bg-stone-950/70">
                        <div className="font-medium">{reasonLabel(key, skill)}</div>
                        <div className="mt-0.5 leading-5 text-stone-500 dark:text-stone-400">{reason}</div>
                    </div>
                ))}
            </div>
            {recommendation.warnings.length ? <Alert className="mt-3" type="warning" showIcon title={recommendation.warnings.join("；")} /> : null}
        </div>
    );
}

function reasonLabel(key: string, skill: ReturnType<typeof designSkillById>) {
    if (key === "skillId") return "设计 Skill";
    if (key === "platformPresetId") return "平台预设";
    return skill.optionGroups.find((group) => group.key === key)?.label || key;
}
