import { normalizeSeedanceRatio } from "@/lib/seedance-video";

export const geminiVideoResolutionOptions = [
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p" },
    { value: "4K", label: "4K" },
] as const;

export const qwenVideoResolutionOptions = [
    { value: "480", label: "480p" },
    { value: "720", label: "720p" },
    { value: "1080", label: "1080p" },
] as const;

export const geminiVideoRatioOptions = [
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
] as const;

export const qwenVideoRatioOptions = [
    ...geminiVideoRatioOptions,
    { value: "1:1", label: "方形" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
] as const;

export function geminiVideoCapabilities(model: string) {
    const value = model.trim().toLowerCase();
    const veo2 = value.includes("veo-2");
    const veo31 = value.includes("veo-3.1");
    const lite = veo31 && value.includes("lite");
    const veo3 = !veo31 && (value.includes("veo-3") || value.includes("veo-3.0"));
    return {
        resolutionOptions: veo2 ? geminiVideoResolutionOptions.slice(0, 1) : veo31 && !lite ? geminiVideoResolutionOptions : geminiVideoResolutionOptions.slice(0, 2),
        durationOptions: veo2 ? ["5", "6", "8"] : veo3 ? ["8"] : ["4", "6", "8"],
        supportsInterpolation: veo31,
        supportsExtension: veo31 && !lite,
        supportsReferenceImages: veo31 && !lite,
        landscapeOnly: veo3,
    };
}

export function geminiVideoDurationOptions(model: string) {
    return geminiVideoCapabilities(model).durationOptions;
}

export function qwenVideoDurationOptions(model: string, hasVideoReference = false) {
    const value = model.trim().toLowerCase();
    const isI2v = value.includes("i2v") || value.includes("image-to-video");
    const isT2v = value.includes("t2v") || value.includes("text-to-video");
    const wan21 = value.includes("wanx2.1") || value.includes("wan2.1");
    if (wan21 && isI2v && value.includes("turbo")) return ["3", "4", "5"];
    if (value.includes("wan2.2") || wan21) return ["5"];
    if (value.includes("wan2.5") || (value.includes("-us") && isT2v)) return ["5", "10"];
    if (value.includes("-us") && isI2v) return ["5", "10", "15"];
    const r2v = value.includes("r2v") || value.includes("reference-to-video");
    return r2v && (hasVideoReference || !value.includes("2.7")) ? ["5", "10"] : ["5", "10", "15"];
}

export function qwenVideoResolutionOptionsForModel(model: string, baseUrl = "") {
    const value = model.trim().toLowerCase();
    const isT2v = value.includes("t2v") || value.includes("text-to-video");
    const isI2v = value.includes("i2v") || value.includes("image-to-video");
    const isR2v = value.includes("r2v") || value.includes("reference-to-video");
    const wan21 = value.includes("wanx2.1") || value.includes("wan2.1");
    if (value.includes("2.7") || (value.includes("2.6") && (isT2v || isI2v || isR2v))) return qwenVideoResolutionOptions.slice(1);
    if ((isT2v || isI2v) && value.includes("2.2") && value.includes("flash")) {
        const international = /dashscope-intl|ap-southeast|dashscope-us/i.test(baseUrl);
        return international ? qwenVideoResolutionOptions.slice(0, 2) : qwenVideoResolutionOptions;
    }
    if ((isT2v || isI2v) && value.includes("2.2")) return [qwenVideoResolutionOptions[0], qwenVideoResolutionOptions[2]];
    if ((isT2v || isI2v) && wan21 && value.includes("plus")) return qwenVideoResolutionOptions.slice(1, 2);
    if ((isT2v || isI2v) && wan21) return qwenVideoResolutionOptions.slice(0, 2);
    return qwenVideoResolutionOptions;
}

export function qwenVideoRatioOptionsForModel(model: string, resolution: string, baseUrl = "") {
    return normalizeQwenVideoResolution(resolution, model, baseUrl) === "480" ? qwenVideoRatioOptions.slice(0, 3) : qwenVideoRatioOptions;
}

export function normalizeGeminiVideoResolution(value: string, model = "") {
    let resolution = "720";
    if (String(value).toLowerCase() === "4k") resolution = "4K";
    const pixels = Number(String(value).replace(/p$/i, "")) || 720;
    if (pixels >= 2160) resolution = "4K";
    else if (pixels >= 1080) resolution = "1080";
    return geminiVideoCapabilities(model).resolutionOptions.some((item) => item.value === resolution) ? resolution : "720";
}

export function normalizeQwenVideoResolution(value: string, model: string, baseUrl = "") {
    const pixels = String(value).toLowerCase() === "4k" ? 1080 : Number(String(value).replace(/p$/i, "")) || 720;
    const requested = pixels >= 1080 ? "1080" : pixels <= 480 ? "480" : "720";
    const options = qwenVideoResolutionOptionsForModel(model, baseUrl).map((item) => item.value);
    if (options.includes(requested as (typeof options)[number])) return requested;
    if (requested === "720" && options.includes("1080")) return "1080";
    return options[0] || "720";
}

export function normalizeGeminiVideoRatio(value: string, model = "", resolution = "720") {
    if (geminiVideoCapabilities(model).landscapeOnly) return "16:9";
    return normalizeSeedanceRatio(value) === "9:16" ? "9:16" : "16:9";
}

export function normalizeQwenVideoRatio(value: string, model = "", resolution = "720", baseUrl = "") {
    const ratio = normalizeSeedanceRatio(value);
    return qwenVideoRatioOptionsForModel(model, resolution, baseUrl).some((item) => item.value === ratio) ? ratio : "16:9";
}

export function normalizeGeminiVideoDuration(value: string, model: string, constrained = false) {
    if (constrained) return "8";
    return nearestDuration(value, geminiVideoDurationOptions(model));
}

export function normalizeQwenVideoDuration(value: string, model: string, hasVideoReference = false) {
    const lowerModel = model.trim().toLowerCase();
    const isI2v = lowerModel.includes("i2v") || lowerModel.includes("image-to-video");
    const isT2v = lowerModel.includes("t2v") || lowerModel.includes("text-to-video");
    const wan21 = lowerModel.includes("wanx2.1") || lowerModel.includes("wan2.1");
    if (wan21 && isI2v && lowerModel.includes("turbo")) return nearestDuration(value, ["3", "4", "5"]);
    if (lowerModel.includes("wan2.2") || wan21) return "5";
    if (lowerModel.includes("wan2.5") || (lowerModel.includes("-us") && isT2v)) return nearestDuration(value, ["5", "10"]);
    if (lowerModel.includes("-us") && isI2v) return nearestDuration(value, ["5", "10", "15"]);
    const r2v = lowerModel.includes("r2v") || lowerModel.includes("reference-to-video");
    const max = r2v && (hasVideoReference || !lowerModel.includes("2.7")) ? 10 : 15;
    return String(Math.max(2, Math.min(max, Math.floor(Number(value) || 5))));
}

function nearestDuration(value: string, options: readonly string[]) {
    const seconds = Math.floor(Number(value) || Number(options[0]));
    return options.reduce((best, current) => (Math.abs(Number(current) - seconds) < Math.abs(Number(best) - seconds) ? current : best), options[0]);
}
