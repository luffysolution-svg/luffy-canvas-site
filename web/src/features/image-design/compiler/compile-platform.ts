import type { PlatformPreset } from "../types";

export function compilePlatformRules(preset: PlatformPreset | undefined) {
    if (!preset) return { prompt: "", negatives: [] as string[] };
    const safe = preset.safeArea;
    const safeArea = `安全区：上 ${safe.top}%、右 ${safe.right}%、下 ${safe.bottom}%、左 ${safe.left}%；${safe.description}`;
    const avoidZones = preset.avoidZones.length ? `避让区域：${preset.avoidZones.map((zone) => `${zone.label}（x ${zone.x}% / y ${zone.y}% / 宽 ${zone.width}% / 高 ${zone.height}%）`).join("；")}` : "";
    const prompt = [
        `${preset.platformLabel}「${preset.label}」使用场景`,
        ...preset.promptFragments,
        safeArea,
        avoidZones,
        `主体位置：${preset.subjectPosition}`,
        `标题位置：${preset.titlePosition}；文字密度 ${textDensityLabel(preset.textDensity)}；标题最多 ${preset.maxTitleLines} 行`,
        `画面边缘至少保留约 ${preset.edgeMargin}% 呼吸空间，主体视觉占比约 ${Math.round(preset.focalScale * 100)}%`,
    ]
        .filter(Boolean)
        .join("；");
    return { prompt, negatives: preset.negativeFragments };
}

function textDensityLabel(value: PlatformPreset["textDensity"]) {
    if (value === "low") return "低";
    if (value === "high") return "高";
    return "中";
}
