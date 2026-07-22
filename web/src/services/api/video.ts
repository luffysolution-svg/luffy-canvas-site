import axios from "axios";

import { centerCropImageDataUrl, dataUrlToFile } from "@/lib/image-utils";
import { geminiVideoCapabilities, normalizeGeminiVideoDuration, normalizeGeminiVideoRatio, normalizeGeminiVideoResolution, normalizeQwenVideoDuration, normalizeQwenVideoRatio, normalizeQwenVideoResolution } from "@/lib/native-video";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isSeedanceVideoConfig, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceVideoReferenceError, seedanceVideoReferenceHint, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { isOfficialOpenAIVideoModel, normalizeOpenAIVideoDuration, normalizeOpenAIVideoSize } from "@/lib/openai-video";
import { assertModelChannelAvailable, buildApiUrl, modelOptionName, resolveModelChannel, resolveModelRequestConfig, resolveModelScript, type AiConfig, type ChannelProvider } from "@/stores/use-config-store";
import { runModelPlugin } from "./model-plugin";
import { geminiApiBaseUrl, qwenApiUrl } from "./provider-urls";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = { id: string; status?: string; error?: { message?: string }; url?: string; result_url?: string; video_url?: string; content?: { video_url?: string; url?: string } | null };
type ApiVideoResponse = VideoResponse | { code?: number | string; data?: VideoResponse | null; msg?: string; message?: string; error?: { message?: string } };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "completed" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; url?: string; last_frame_url?: string } | null;
    url?: string;
    result_url?: string;
    video_url?: string;
};
type ApiEnvelope<T> = T | { code?: number | string; data?: T | null; msg?: string; message?: string; error?: { message?: string } };
type GeminiVideoOperation = {
    name?: string;
    done?: boolean;
    error?: { code?: number | string; message?: string };
    response?: {
        generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string; mimeType?: string } }> };
        generatedVideos?: Array<{ video?: { uri?: string; mimeType?: string } }>;
    };
};
type QwenVideoPayload = {
    code?: string;
    message?: string;
    output?: {
        task_id?: string;
        task_status?: string;
        video_url?: string;
        code?: string;
        message?: string;
    };
};
type QwenUploadPayload = {
    code?: string;
    message?: string;
    data?: {
        policy?: string;
        signature?: string;
        upload_dir?: string;
        upload_host?: string;
        max_file_size_mb?: string;
        oss_access_key_id?: string;
        x_oss_object_acl?: string;
        x_oss_forbid_overwrite?: string;
    };
};
type RequestOptions = { signal?: AbortSignal };

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask =
    | { id: string; provider: "openai" | "seedance" | "gemini" | "qwen"; model: string }
    | { id: "plugin"; provider: "plugin"; model: string; result: VideoGenerationResult };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

export type VideoReferencePolicy = {
    maxImages: number;
    maxVideos: number;
    maxAudios: number;
    imageMaxBytes: number;
    videoMaxBytes: number;
    audioMaxBytes: number;
    combinedImageVideoMax?: number;
    imageVideoExclusive?: boolean;
    maxImagesWithVideo?: number;
    videoAudioExclusive?: boolean;
    requiresImageOrVideo?: boolean;
    videoMinDurationMs?: number;
    videoMaxDurationMs?: number;
    audioMinDurationMs?: number;
    audioMaxDurationMs?: number;
    useSeedanceMediaValidation?: boolean;
};

const MB = 1024 * 1024;

export function getVideoReferencePolicy(config: AiConfig, selectedModel: string): VideoReferencePolicy {
    const model = selectedModel.trim() || config.model || config.videoModel;
    const requestConfig = resolveModelRequestConfig(config, model);
    const modelName = modelOptionName(model).toLowerCase();
    if (resolveModelScript(config, model, "video")) return { maxImages: 9, maxVideos: 3, maxAudios: 3, imageMaxBytes: 30 * MB, videoMaxBytes: 100 * MB, audioMaxBytes: 50 * MB };
    if (requestConfig.apiFormat === "gemini") {
        const capabilities = geminiVideoCapabilities(modelName);
        const interpolation = capabilities.supportsInterpolation && config.videoReferenceMode === "interpolation";
        return { maxImages: interpolation ? 2 : capabilities.supportsReferenceImages ? 3 : 1, maxVideos: interpolation ? 0 : capabilities.supportsExtension ? 1 : 0, maxAudios: 0, imageMaxBytes: 20 * MB, videoMaxBytes: 100 * MB, audioMaxBytes: 0, imageVideoExclusive: true };
    }
    if (requestConfig.apiFormat === "qwen") {
        const r2v = modelName.includes("r2v") || modelName.includes("reference-to-video");
        const i2v = modelName.includes("i2v") || modelName.includes("image-to-video");
        if (r2v) return { maxImages: 5, maxVideos: modelName.includes("2.6") ? 3 : 5, maxAudios: modelName.includes("2.7") ? 5 : 0, imageMaxBytes: 20 * MB, videoMaxBytes: 100 * MB, audioMaxBytes: 15 * MB, combinedImageVideoMax: 5, requiresImageOrVideo: true, ...(modelName.includes("2.7") ? { videoMinDurationMs: 1000, videoMaxDurationMs: 30000, audioMinDurationMs: 1000, audioMaxDurationMs: 10000 } : {}) };
        if (i2v && modelName.includes("2.7")) return { maxImages: 2, maxVideos: 1, maxAudios: 1, imageMaxBytes: 20 * MB, videoMaxBytes: 100 * MB, audioMaxBytes: 15 * MB, maxImagesWithVideo: 1, videoAudioExclusive: true, requiresImageOrVideo: true, videoMinDurationMs: 2000, videoMaxDurationMs: 10000, audioMinDurationMs: 2000, audioMaxDurationMs: 30000 };
        if (i2v) {
            const supportsAudio = modelName.includes("2.5") || modelName.includes("2.6");
            return { maxImages: 1, maxVideos: 0, maxAudios: supportsAudio ? 1 : 0, imageMaxBytes: supportsAudio ? 20 * MB : 10 * MB, videoMaxBytes: 0, audioMaxBytes: supportsAudio ? 15 * MB : 0, requiresImageOrVideo: true, ...(supportsAudio ? { audioMinDurationMs: 3000, audioMaxDurationMs: 30000 } : {}) };
        }
        const supportsAudio = modelName.includes("2.7") || modelName.includes("2.6") || modelName.includes("2.5");
        return { maxImages: 0, maxVideos: 0, maxAudios: supportsAudio ? 1 : 0, imageMaxBytes: 0, videoMaxBytes: 0, audioMaxBytes: supportsAudio ? 15 * MB : 0, ...(supportsAudio ? { audioMinDurationMs: modelName.includes("2.7") ? 2000 : 3000, audioMaxDurationMs: 30000 } : {}) };
    }
    if (isSeedanceVideoConfig(requestConfig)) {
        return {
            maxImages: SEEDANCE_REFERENCE_LIMITS.images,
            maxVideos: SEEDANCE_REFERENCE_LIMITS.videos,
            maxAudios: SEEDANCE_REFERENCE_LIMITS.audios,
            imageMaxBytes: SEEDANCE_REFERENCE_LIMITS.imageMaxBytes,
            videoMaxBytes: SEEDANCE_REFERENCE_LIMITS.videoMaxBytes,
            audioMaxBytes: SEEDANCE_REFERENCE_LIMITS.audioMaxBytes,
            useSeedanceMediaValidation: true,
        };
    }
    const provider = resolveModelChannel(config, model).provider;
    const singleImage = provider === "new-api" || isOfficialOpenAIVideoModel(provider, modelName);
    return { maxImages: singleImage ? 1 : 7, maxVideos: 0, maxAudios: 0, imageMaxBytes: 20 * MB, videoMaxBytes: 0, audioMaxBytes: 0 };
}

export function validateVideoReferences(config: AiConfig, selectedModel: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    const policy = getVideoReferencePolicy(config, selectedModel);
    if (images.length > policy.maxImages) throw new Error(`当前模型最多支持 ${policy.maxImages} 张参考图`);
    if (videos.length > policy.maxVideos) throw new Error(`当前模型最多支持 ${policy.maxVideos} 个参考视频`);
    if (audios.length > policy.maxAudios) throw new Error(`当前模型最多支持 ${policy.maxAudios} 段参考音频`);
    if (policy.combinedImageVideoMax && images.length + videos.length > policy.combinedImageVideoMax) throw new Error(`当前模型的参考图与参考视频合计最多 ${policy.combinedImageVideoMax} 个`);
    if (policy.imageVideoExclusive && images.length && videos.length) throw new Error("当前模型不能同时使用参考图和参考视频");
    if (policy.maxImagesWithVideo != null && videos.length && images.length > policy.maxImagesWithVideo) throw new Error(`使用参考视频时最多再添加 ${policy.maxImagesWithVideo} 张参考图`);
    if (policy.videoAudioExclusive && videos.length && audios.length) throw new Error("当前模型不能同时使用参考视频和参考音频");
    if (policy.requiresImageOrVideo && !images.length && !videos.length) throw new Error("当前 Wan I2V / R2V 模型至少需要 1 张参考图或 1 个参考视频");
    if (images.some((item) => item.bytes && item.bytes > policy.imageMaxBytes)) throw new Error(`参考图不能超过 ${formatBytes(policy.imageMaxBytes)}`);
    if (videos.some((item) => item.bytes && item.bytes > policy.videoMaxBytes)) throw new Error(`参考视频不能超过 ${formatBytes(policy.videoMaxBytes)}`);
    if (audios.some((item) => item.bytes && item.bytes > policy.audioMaxBytes)) throw new Error(`参考音频不能超过 ${formatBytes(policy.audioMaxBytes)}`);
    if (policy.videoMinDurationMs && videos.some((item) => item.durationMs && item.durationMs < policy.videoMinDurationMs!)) throw new Error(`参考视频时长不能少于 ${formatDuration(policy.videoMinDurationMs)}`);
    if (policy.videoMaxDurationMs && videos.some((item) => item.durationMs && item.durationMs > policy.videoMaxDurationMs!)) throw new Error(`参考视频时长不能超过 ${formatDuration(policy.videoMaxDurationMs)}`);
    if (policy.audioMinDurationMs && audios.some((item) => item.durationMs && item.durationMs < policy.audioMinDurationMs!)) throw new Error(`参考音频时长不能少于 ${formatDuration(policy.audioMinDurationMs)}`);
    if (policy.audioMaxDurationMs && audios.some((item) => item.durationMs && item.durationMs > policy.audioMaxDurationMs!)) throw new Error(`参考音频时长不能超过 ${formatDuration(policy.audioMaxDurationMs)}`);
    if (policy.useSeedanceMediaValidation) {
        const error = seedanceVideoReferenceError(videos);
        if (error) throw new Error(`${error}。${seedanceVideoReferenceHint}`);
    }
}

function formatBytes(bytes: number) {
    return `${Math.round(bytes / MB)}MB`;
}

function formatDuration(durationMs: number) {
    return `${durationMs / 1000} 秒`;
}

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        ...(config.authType === "none" ? {} : { Authorization: `Bearer ${config.apiKey}` }),
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, options);
    const delayMs = ["seedance", "gemini", "qwen"].includes(task.provider) ? 5000 : 2500;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === 119) throw new Error(`${task.provider === "seedance" ? "Seedance " : task.provider === "gemini" ? "Gemini " : task.provider === "qwen" ? "Qwen " : ""}视频生成超时，请稍后重试`);
        await delay(delayMs, options?.signal);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    assertModelChannelAvailable(config, selectedModel);
    const channel = resolveModelChannel(config, selectedModel);
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const script = resolveModelScript(config, selectedModel, "video");
    validateVideoReferences(config, selectedModel, references, videoReferences, audioReferences);
    if (script) return createPluginVideoTask(requestConfig, selectedModel, script, prompt, references, videoReferences, audioReferences, options);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (requestConfig.apiFormat === "gemini") return createGeminiVideoTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    if (requestConfig.apiFormat === "qwen") return createQwenVideoTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    if (isSeedanceVideoConfig(requestConfig)) {
        return createSeedanceTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请切换到 Seedance 2.0 / 火山 Agent Plan 模型，或移除参考资产");
    }
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, channel.provider, options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    if (task.provider === "plugin") {
        return { status: "completed", result: task.result };
    }
    assertModelChannelAvailable(config, task.model);
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    if (task.provider === "gemini") return pollGeminiVideoTask(requestConfig, task, options);
    if (task.provider === "qwen") return pollQwenVideoTask(requestConfig, task, options);
    return task.provider === "seedance" ? pollSeedanceTask(requestConfig, task, options) : pollOpenAIVideoTask(requestConfig, task, options);
}

async function createPluginVideoTask(config: AiConfig, model: string, script: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (config.authType !== "none" && !config.apiKey.trim()) throw new Error("请先配置 API Key");
    const refs = await Promise.all(references.map((image) => imageToDataUrl(image)));
    const videos = await Promise.all(videoReferences.map(resolveSeedanceVideoUrl));
    const audios = await Promise.all(audioReferences.map(resolveSeedanceAudioUrl));
    const result = videoPluginResult(
        await runModelPlugin({
            capability: "video",
            script,
            config,
            prompt,
            images: refs,
            videos,
            audios,
            params: {
                seconds: normalizeVideoSeconds(config.videoSeconds),
                size: normalizeVideoSize(config.size),
                resolution: normalizeVideoResolution(config.vquality),
                ratio: config.size,
                generateAudio: boolConfig(config.videoGenerateAudio, true),
                watermark: boolConfig(config.videoWatermark, false),
            },
            signal: options?.signal,
        }),
    );
    return { id: "plugin", provider: "plugin", model, result };
}

function videoPluginResult(result: unknown): VideoGenerationResult {
    if (result instanceof Blob) return { blob: result };
    if (typeof result === "string") return { url: result, mimeType: "video/mp4" };
    if (result && typeof result === "object") {
        const record = result as Record<string, unknown>;
        if (record.blob instanceof Blob) return { blob: record.blob };
        const url = [record.url, record.video_url, record.result_url].find((value) => typeof value === "string" && value) as string | undefined;
        if (url) return { url, mimeType: "video/mp4" };
    }
    throw new Error("模型调用脚本没有返回视频");
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) {
        try {
            return await uploadMediaFile(result.url, "video");
        } catch {
            return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
        }
    }
    throw new Error("视频接口没有返回可播放的视频");
}

async function createGeminiVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const modelName = modelOptionName(config.model).replace(/^models\//, "");
    const capabilities = geminiVideoCapabilities(modelName);
    const interpolation = capabilities.supportsInterpolation && config.videoReferenceMode === "interpolation";
    if (interpolation && (references.length !== 2 || videoReferences.length)) throw new Error("Gemini Veo 首尾帧模式需要且只能使用 2 张参考图，不能同时使用参考视频");
    if (audioReferences.length) throw new Error("Gemini Veo 暂不支持独立参考音频，请把音频要求写入提示词");
    if (references.length && videoReferences.length) throw new Error("Gemini Veo 不能同时使用参考图和续写视频");
    if (references.length > (interpolation ? 2 : 3)) throw new Error(interpolation ? "Gemini Veo 首尾帧模式最多支持 2 张图" : "Gemini Veo 最多支持 3 张参考图");
    if (videoReferences.length > 1) throw new Error("Gemini Veo 每次只能续写 1 个视频");
    if (videoReferences.length && !capabilities.supportsExtension) throw new Error("视频续写仅支持 Gemini Veo 3.1 / 3.1 Fast 模型");
    if (!interpolation && references.length > 1 && !capabilities.supportsReferenceImages) throw new Error("多参考图仅支持 Gemini Veo 3.1 / 3.1 Fast 模型");

    const instance: Record<string, unknown> = { prompt: withVideoSystemPrompt(config, buildSeedancePromptText(prompt, references, videoReferences, audioReferences)) };
    const images = await Promise.all(references.map(async (image) => geminiInlineData(await imageToDataUrl(image), "图片")));
    if (images.length && interpolation) {
        instance.image = images[0];
        if (images[1]) instance.lastFrame = images[1];
    } else if (images.length === 1) instance.image = images[0];
    if (images.length > 1 && !interpolation) {
        instance.referenceImages = images.map((image) => ({ image, referenceType: "asset" }));
    }
    if (videoReferences.length) instance.video = geminiInlineData(await geminiVideoDataUrl(config, videoReferences[0], options), "视频");

    const resolution = videoReferences.length ? "720p" : geminiVideoResolution(config.vquality, modelName);
    const constrained = images.length > 1 || videoReferences.length > 0 || resolution !== "720p";
    const parameters: Record<string, unknown> = {
        numberOfVideos: 1,
        ...(videoReferences.length ? {} : { aspectRatio: geminiVideoRatio(config.size, modelName, resolution) }),
        durationSeconds: geminiVideoDuration(config.videoSeconds, modelName, constrained),
        ...(modelName.toLowerCase().includes("veo-2") ? {} : { resolution }),
    };
    try {
        const response = await axios.post<GeminiVideoOperation>(
            `${geminiApiBaseUrl(config.baseUrl)}/models/${encodeURIComponent(modelName)}:predictLongRunning`,
            { instances: [instance], parameters },
            { headers: geminiHeaders(config), signal: options?.signal },
        );
        if (response.data.error?.message) throw new Error(response.data.error.message);
        if (!response.data.name) throw new Error("Gemini 接口没有返回任务名称");
        return { id: response.data.name, provider: "gemini", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Gemini 视频任务创建失败"));
    }
}

async function pollGeminiVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const operationUrl = /^https?:\/\//i.test(task.id) ? task.id : `${geminiApiBaseUrl(config.baseUrl)}/${task.id.replace(/^\/+/, "")}`;
    try {
        const operation = (await axios.get<GeminiVideoOperation>(operationUrl, { headers: geminiHeaders(config, false), signal: options?.signal })).data;
        if (operation.error?.message) return { status: "failed", error: operation.error.message };
        if (!operation.done) return { status: "pending" };
        const video = operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video || operation.response?.generatedVideos?.[0]?.video;
        if (!video?.uri) return { status: "failed", error: "Gemini 视频任务已完成，但没有返回下载地址" };
        const response = await axios.get<Blob>(video.uri, { headers: geminiHeaders(config, false), responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { status: "completed", result: { blob: response.data, mimeType: video.mimeType || response.data.type || "video/mp4" } };
    } catch (error) {
        throw new Error(readAxiosError(error, "Gemini 视频任务查询失败"));
    }
}

async function createQwenVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const modelName = modelOptionName(config.model);
    const input = await buildQwenVideoInput(config, prompt, references, videoReferences, audioReferences, options);
    const payload = {
        model: modelName,
        input,
        parameters: qwenVideoParameters(config, modelName, videoReferences.length > 0),
    };
    try {
        const response = await axios.post<QwenVideoPayload>(qwenApiUrl(config.baseUrl, "services/aigc/video-generation/video-synthesis"), payload, {
            headers: { ...aiHeaders(config, "application/json"), "X-DashScope-Async": "enable", "X-DashScope-OssResourceResolve": "enable" },
            signal: options?.signal,
        });
        if (response.data.code) throw new Error(response.data.message || response.data.code);
        const taskId = response.data.output?.task_id;
        if (!taskId) throw new Error(response.data.output?.message || "Qwen 接口没有返回任务 ID");
        return { id: taskId, provider: "qwen", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Qwen 视频任务创建失败"));
    }
}

async function pollQwenVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const payload = (await axios.get<QwenVideoPayload>(qwenApiUrl(config.baseUrl, `tasks/${encodeURIComponent(task.id)}`), { headers: aiHeaders(config), signal: options?.signal })).data;
        if (payload.code) return { status: "failed", error: payload.message || payload.code };
        const output = payload.output;
        const status = output?.task_status?.toUpperCase();
        if (status === "SUCCEEDED") {
            if (!output?.video_url) return { status: "failed", error: "Qwen 视频任务已完成，但没有返回下载地址" };
            return { status: "completed", result: await videoResultFromUrl(output.video_url, options) };
        }
        if (["FAILED", "CANCELED", "CANCELLED", "UNKNOWN"].includes(status || "")) return { status: "failed", error: output?.message || output?.code || `Qwen 视频生成${status === "UNKNOWN" ? "任务不存在或已过期" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Qwen 视频任务查询失败"));
    }
}

async function buildQwenVideoInput(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions) {
    const model = modelOptionName(config.model).toLowerCase();
    const isR2v = model.includes("r2v") || model.includes("reference-to-video");
    const isI2v = model.includes("i2v") || model.includes("image-to-video");
    const text = withVideoSystemPrompt(config, buildSeedancePromptText(prompt, references, videoReferences, audioReferences));
    const images = await Promise.all(references.map((image, index) => resolveQwenImageUrl(config, model, image, index, options)));
    const videos = await Promise.all(videoReferences.map((video, index) => resolveQwenVideoUrl(config, model, video, index, options)));
    const audios = await Promise.all(audioReferences.map((audio, index) => resolveQwenAudioUrl(config, model, audio, index, options)));

    if (isR2v) {
        const referenceUrls = [...images, ...videos];
        if (!referenceUrls.length) throw new Error("Wan R2V 模型至少需要 1 张参考图或 1 个参考视频");
        if (referenceUrls.length > 5) throw new Error("Wan R2V 参考图与参考视频合计最多 5 个");
        if (!model.includes("2.7")) {
            if (audios.length) throw new Error("Wan 2.6 R2V 不支持独立参考音频，请使用带原声的参考视频或切换 Wan 2.7 R2V");
            return { prompt: qwenLegacyR2vPrompt(text, images.length, videos.length), reference_urls: referenceUrls };
        }
        const media = [
            ...images.map((url) => ({ type: "reference_image", url })),
            ...videos.map((url) => ({ type: "reference_video", url })),
        ];
        if (audios.length > media.length) throw new Error("Wan R2V 每段参考音频都需要对应一张参考图或一个参考视频");
        audios.forEach((url, index) => Object.assign(media[index], { reference_voice: url }));
        return { prompt: qwen27R2vPrompt(text, images.length, videos.length), media };
    }

    if (isI2v && model.includes("2.7")) {
        if (images.length > 2 || videos.length > 1 || audios.length > 1) throw new Error("Wan 2.7 I2V 最多支持 2 张图、1 个续写视频和 1 段驱动音频");
        if (images.length && videos.length && images.length > 1) throw new Error("Wan 2.7 视频续写最多再接 1 张尾帧图");
        if (videos.length && audios.length) throw new Error("Wan 2.7 视频续写不能同时使用驱动音频");
        if (!images.length && !videos.length) throw new Error("Wan I2V 模型至少需要 1 张参考图或 1 个续写视频");
        const media: Array<{ type: string; url: string }> = [];
        if (videos.length) {
            media.push({ type: "first_clip", url: videos[0] });
            if (images.length) media.push({ type: "last_frame", url: images[0] });
        } else {
            if (images[0]) media.push({ type: "first_frame", url: images[0] });
            if (images[1]) media.push({ type: "last_frame", url: images[1] });
            if (audios[0]) media.push({ type: "driving_audio", url: audios[0] });
        }
        return { prompt: text, media };
    }

    if (isI2v) {
        if (images.length !== 1) throw new Error("当前 Wan I2V 模型需要且仅支持 1 张参考图");
        if (videos.length) throw new Error("当前 Wan I2V 模型不支持参考视频");
        if (audios.length > 1) throw new Error("当前 Wan I2V 模型最多支持 1 段参考音频");
        return { prompt: text, img_url: images[0], ...(audios[0] ? { audio_url: audios[0] } : {}) };
    }

    if (images.length || videos.length) throw new Error("当前 Wan 文生视频模型不支持参考图或参考视频，请切换到 I2V / R2V 模型");
    if (audios.length > 1) throw new Error("Wan 文生视频模型最多支持 1 段参考音频");
    return { prompt: text, ...(audios[0] ? { audio_url: audios[0] } : {}) };
}

function qwenVideoParameters(config: AiConfig, model: string, hasVideoReference: boolean) {
    const lowerModel = model.toLowerCase();
    const isI2v = lowerModel.includes("i2v") || lowerModel.includes("image-to-video");
    const isR2v = lowerModel.includes("r2v") || lowerModel.includes("reference-to-video");
    const resolution = qwenVideoResolution(config.vquality, lowerModel, config.baseUrl);
    const ratio = qwenVideoRatio(config.size, lowerModel, resolution, config.baseUrl);
    const common = {
        prompt_extend: true,
        watermark: boolConfig(config.videoWatermark, false),
        duration: qwenVideoDuration(model, config.videoSeconds, hasVideoReference),
    };
    if (lowerModel.includes("2.7")) return { resolution, ...(!isI2v ? { ratio } : {}), ...common };
    if (isR2v) {
        return {
            size: qwenLegacyVideoSize(resolution, ratio),
            duration: qwenVideoDuration(model, config.videoSeconds, hasVideoReference),
            ...(lowerModel.includes("2.6") && lowerModel.includes("flash") ? { audio: boolConfig(config.videoGenerateAudio, true) } : {}),
            shot_type: "multi",
            watermark: boolConfig(config.videoWatermark, false),
        };
    }
    if (isI2v) return { resolution, ...common, ...(lowerModel.includes("2.6") && lowerModel.includes("flash") ? { audio: boolConfig(config.videoGenerateAudio, true) } : {}) };
    return { size: qwenLegacyVideoSize(resolution, ratio), ...common };
}

function qwenLegacyR2vPrompt(prompt: string, imageCount: number, videoCount: number) {
    let result = prompt;
    for (let index = 0; index < imageCount; index += 1) result = result.replaceAll(`图片${index + 1}`, `character${index + 1}`);
    for (let index = 0; index < videoCount; index += 1) result = result.replaceAll(`视频${index + 1}`, `character${imageCount + index + 1}`);
    return result;
}

function qwen27R2vPrompt(prompt: string, imageCount: number, videoCount: number) {
    let result = prompt;
    for (let index = 0; index < imageCount; index += 1) result = result.replaceAll(`图片${index + 1}`, `Image ${index + 1}`);
    for (let index = 0; index < videoCount; index += 1) result = result.replaceAll(`视频${index + 1}`, `Video ${index + 1}`);
    return result;
}

function withVideoSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function geminiHeaders(config: AiConfig, json = true) {
    return { ...(config.authType === "none" ? {} : { "x-goog-api-key": config.apiKey }), ...(json ? { "Content-Type": "application/json" } : {}) };
}

function geminiInlineData(dataUrl: string, kind: string) {
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) throw new Error(`Gemini ${kind}引用必须能读取为 base64 数据`);
    return { inlineData: { mimeType: match[1], data: match[2] } };
}

async function geminiVideoDataUrl(config: AiConfig, video: ReferenceVideo, options?: RequestOptions) {
    let blob: Blob | null = video.storageKey ? await getMediaBlob(video.storageKey) : null;
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob && isPublicMediaUrl(video.url)) {
        const sameProvider = mediaHost(video.url) === mediaHost(config.baseUrl) || mediaHost(video.url).endsWith(".googleapis.com");
        blob = (await axios.get<Blob>(video.url, { headers: sameProvider ? geminiHeaders(config, false) : undefined, responseType: "blob", signal: options?.signal })).data;
    }
    if (!blob) throw new Error("Gemini 参考视频必须是可读取的本地视频或公网 URL");
    return blobToDataUrl(blob);
}

function mediaHost(url: string) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return "";
    }
}

function geminiVideoRatio(value: string, model: string, resolution: string) {
    return normalizeGeminiVideoRatio(value, model, resolution);
}

function qwenVideoRatio(value: string, model: string, resolution: string, baseUrl: string) {
    return normalizeQwenVideoRatio(value, model, resolution, baseUrl);
}

function geminiVideoResolution(value: string, model: string) {
    const resolution = normalizeGeminiVideoResolution(value, model);
    return resolution === "4K" ? "4k" : `${resolution}p`;
}

function qwenVideoResolution(value: string, model: string, baseUrl: string) {
    return `${normalizeQwenVideoResolution(value, model, baseUrl)}P`;
}

function qwenLegacyVideoSize(resolution: string, ratio: string) {
    const sizes: Record<string, Record<string, string>> = {
        "480P": { "16:9": "832*480", "9:16": "480*832", "1:1": "624*624", "4:3": "704*528", "3:4": "528*704" },
        "720P": { "16:9": "1280*720", "9:16": "720*1280", "1:1": "960*960", "4:3": "1088*832", "3:4": "832*1088" },
        "1080P": { "16:9": "1920*1080", "9:16": "1080*1920", "1:1": "1440*1440", "4:3": "1632*1248", "3:4": "1248*1632" },
    };
    const tier = /P$/i.test(resolution) ? resolution.toUpperCase() : `${normalizeQwenVideoResolution(resolution, "")}P`;
    return sizes[tier][ratio] || sizes[tier]["16:9"];
}

function qwenVideoDuration(model: string, value: string, hasVideoReference = false) {
    return Number(normalizeQwenVideoDuration(value, model, hasVideoReference));
}

function geminiVideoDuration(value: string, model: string, constrained: boolean) {
    return normalizeGeminiVideoDuration(value, model, constrained);
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], provider: ChannelProvider, options?: RequestOptions): Promise<VideoGenerationTask> {
    if (isOfficialOpenAIVideoModel(provider, modelOptionName(model))) return createOfficialOpenAIVideoTask(config, model, prompt, references, options);
    if (provider === "new-api") return createNewApiVideoTask(config, model, prompt, references, options);
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", withVideoSystemPrompt(config, prompt));
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(async (image) => dataUrlToFile({ ...image, dataUrl: await imageToDataUrl(image) })));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function createNewApiVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (references.length > 1) throw new Error("New API 的 Sora 格式最多支持 1 张参考图；多参考模型请配置自定义调用脚本");
    const size = normalizeVideoSize(config.size) || "1280x720";
    const [width, height] = size.split("x").map(Number);
    const body = new FormData();
    body.set("model", modelOptionName(model));
    body.set("prompt", withVideoSystemPrompt(config, prompt));
    body.set("duration", normalizeVideoSeconds(config.videoSeconds));
    body.set("width", String(width || 1280));
    body.set("height", String(height || 720));
    if (references[0]) body.set("image", await centerCropImageDataUrl(await imageToDataUrl(references[0]), width || 1280, height || 720));
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error("New API 视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "New API 视频任务创建失败"));
    }
}

async function createOfficialOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (references.length > 1) throw new Error("OpenAI Sora 官方接口最多支持 1 张参考图");
    const body = new FormData();
    const size = normalizeOpenAIVideoSize(config.size, modelOptionName(model));
    const [width, height] = size.split("x").map(Number);
    body.set("model", modelOptionName(model));
    body.set("prompt", withVideoSystemPrompt(config, prompt));
    body.set("seconds", normalizeOpenAIVideoDuration(config.videoSeconds));
    body.set("size", size);
    if (references[0]) body.set("input_reference", dataUrlToFile({ ...references[0], name: `${references[0].name.replace(/\.[^.]+$/, "") || "reference"}.png`, type: "image/png", dataUrl: await centerCropImageDataUrl(await imageToDataUrl(references[0]), width, height) }));
    try {
        const created = unwrapVideoResponse(
            (
                await axios.post<ApiVideoResponse>(
                    aiApiUrl(config, "/videos"),
                    body,
                    { headers: aiHeaders(config), signal: options?.signal },
                )
            ).data,
        );
        if (!created.id) throw new Error("OpenAI 视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "OpenAI 视频任务创建失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(video);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (video.status === "completed") {
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: readApiErrorMessage(video.error?.message) || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

async function createSeedanceTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model: modelOptionName(model),
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, modelOptionName(model)),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function pollSeedanceTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, task.id), { headers: aiHeaders(config), signal: options?.signal })).data);
        const url = videoResultUrl(state);
        if (url) return { status: "completed", result: await videoResultFromUrl(url, options) };
        if (state.status === "succeeded" || state.status === "completed") return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: readApiErrorMessage(state.error?.message) || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}` };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "Seedance 任务查询失败"));
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function resolveQwenImageUrl(config: AiConfig, model: string, image: ReferenceImage, index: number, options?: RequestOptions) {
    const directUrl = image.url || image.dataUrl;
    if (isQwenMediaUrl(directUrl)) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (isQwenMediaUrl(dataUrl)) return dataUrl;
    const blob = await dataUrlBlob(dataUrl, "Qwen 参考图读取失败");
    return uploadQwenMedia(config, model, blob, `image-${index + 1}`, options);
}

async function resolveQwenVideoUrl(config: AiConfig, model: string, video: ReferenceVideo, index: number, options?: RequestOptions) {
    if (isQwenMediaUrl(video.url)) return video.url;
    let blob: Blob | null = video.storageKey ? await getMediaBlob(video.storageKey) : null;
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("Qwen 参考视频必须是公网/OSS URL，或可读取的本地视频");
    return uploadQwenMedia(config, model, blob, `video-${index + 1}`, options);
}

async function resolveQwenAudioUrl(config: AiConfig, model: string, audio: ReferenceAudio, index: number, options?: RequestOptions) {
    if (isQwenMediaUrl(audio.url)) return audio.url;
    let blob: Blob | null = audio.storageKey ? await getMediaBlob(audio.storageKey) : null;
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("Qwen 参考音频必须是公网/OSS URL，或可读取的本地音频");
    return uploadQwenMedia(config, model, blob, `audio-${index + 1}`, options);
}

async function uploadQwenMedia(config: AiConfig, model: string, blob: Blob, name: string, options?: RequestOptions) {
    try {
        const response = await axios.get<QwenUploadPayload>(qwenApiUrl(config.baseUrl, "uploads"), {
            headers: aiHeaders(config, "application/json"),
            params: { action: "getPolicy", model },
            signal: options?.signal,
        });
        if (response.data.code) throw new Error(response.data.message || response.data.code);
        const policy = response.data.data;
        if (!policy?.upload_host || !policy.upload_dir || !policy.oss_access_key_id || !policy.policy || !policy.signature) throw new Error("Qwen 没有返回完整的临时上传凭证");
        const limitBytes = (Number(policy.max_file_size_mb) || 0) * 1024 * 1024;
        if (limitBytes && blob.size > limitBytes) throw new Error(`本地参考素材超过 Qwen 临时上传限制（${policy.max_file_size_mb}MB）`);
        const extension = mediaExtension(blob.type);
        const key = `${policy.upload_dir}/${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
        const form = new FormData();
        form.set("OSSAccessKeyId", policy.oss_access_key_id);
        form.set("policy", policy.policy);
        form.set("Signature", policy.signature);
        form.set("key", key);
        form.set("x-oss-object-acl", policy.x_oss_object_acl || "private");
        form.set("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite || "true");
        form.set("success_action_status", "200");
        form.set("file", blob, `${name}.${extension}`);
        await axios.post(policy.upload_host, form, { signal: options?.signal });
        return `oss://${key}`;
    } catch (error) {
        throw new Error(readAxiosError(error, "Qwen 本地参考素材上传失败"));
    }
}

async function dataUrlBlob(value: string, message: string) {
    if (!value?.startsWith("data:")) throw new Error(message);
    try {
        return await (await fetch(value)).blob();
    } catch {
        throw new Error(message);
    }
}

function mediaExtension(mimeType: string) {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes("jpeg")) return "jpg";
    if (normalized.includes("quicktime")) return "mov";
    if (normalized.includes("mpeg")) return "mp3";
    return normalized.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
}

function isQwenMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "") || /^oss:\/\//i.test(value || "");
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、资产 ID，或本地已保存的视频");
    return blobToDataUrl(blob);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、资产 ID，或本地已保存的音频");
    return blobToDataUrl(blob);
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (config.authType !== "none" && !config.apiKey.trim()) throw new Error("请先配置 API Key");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && payload.code !== undefined) {
        if (payload.code !== 0 && payload.code !== "0") throw new Error(readApiErrorMessage(payload) || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function videoResultUrl(payload: VideoResponse | SeedanceTask) {
    return [payload.video_url, payload.result_url, payload.url, payload.content?.video_url, payload.content?.url].find((url) => typeof url === "string" && (isPublicMediaUrl(url) || /\.mp4(\?|#|$)/i.test(url)));
}

function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            return readApiErrorMessage(JSON.parse(value)) || value;
        } catch {
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: { message?: unknown } };
    return readApiErrorMessage(payload.msg) || readApiErrorMessage(payload.message) || readApiErrorMessage(payload.error?.message);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; message?: string; code?: number | string }>(error)) {
        const responseData = error.response?.data;
        if (!error.response) return "无法连接接口，请检查 Base URL、网络连接，以及服务是否允许浏览器跨域（CORS）请求";
        return readApiErrorMessage(responseData) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return "无法连接接口，请检查 Base URL、网络连接，以及服务是否允许浏览器跨域（CORS）请求";
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(readApiErrorMessage(payload) || "视频下载失败");
    if (payload.error?.message) throw new Error(readApiErrorMessage(payload.error.message) || payload.error.message);
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地资产失败"));
        reader.readAsDataURL(blob);
    });
}
