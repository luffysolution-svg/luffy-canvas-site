export const openAIVideoDurationOptions = ["4", "8", "12"] as const;

export const openAIVideoSizeOptions = [
    { value: "1280x720", label: "横屏", width: 1280, height: 720 },
    { value: "720x1280", label: "竖屏", width: 720, height: 1280 },
    { value: "1792x1024", label: "高清横屏", width: 1792, height: 1024 },
    { value: "1024x1792", label: "高清竖屏", width: 1024, height: 1792 },
    { value: "1920x1080", label: "全高清横屏", width: 1920, height: 1080 },
    { value: "1080x1920", label: "全高清竖屏", width: 1080, height: 1920 },
] as const;

export function openAIVideoSizeOptionsForModel(model: string) {
    return model.trim().toLowerCase().includes("sora-2-pro") ? openAIVideoSizeOptions : openAIVideoSizeOptions.slice(0, 2);
}

export function isOfficialOpenAIVideoModel(provider: string, model: string) {
    return provider === "openai" || (provider === "openai-compatible" && model.trim().toLowerCase().startsWith("sora-2"));
}

export function normalizeOpenAIVideoDuration(value: string) {
    const seconds = Math.floor(Number(value) || 4);
    return openAIVideoDurationOptions.reduce((best, current) => (Math.abs(Number(current) - seconds) < Math.abs(Number(best) - seconds) ? current : best), openAIVideoDurationOptions[0]);
}

export function normalizeOpenAIVideoSize(value: string, model = "sora-2") {
    const exact = openAIVideoSizeOptionsForModel(model).find((item) => item.value === value);
    if (exact) return exact.value;
    return ["9:16", "2:3", "3:4"].includes(value) ? "720x1280" : "1280x720";
}
