import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, ClipboardPaste, Copy, Download, ExternalLink, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, Save, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { App, Button, Checkbox, Drawer, Empty, Image, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { modelOptionLabel, resolveModelChannel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration, getDataUrlByteSize, readImageMeta } from "@/lib/image-utils";
import { requestImageBatch } from "@/services/api/image-batch";
import { IMAGE_REQUEST_UNKNOWN_MESSAGE, ImageGenerationError } from "@/services/api/image-errors";
import { deleteStoredImages, downloadImageBlob, resolveImageUrl, storeImageBlob, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { useCopyText } from "@/hooks/use-copy-text";
import type { ImageFailureStage, ImageGenerationOutput, ImageGenerationStatus, ImageReferenceOptimization, ReferenceImage } from "@/types/image";

type GeneratedImage = {
    id: string;
    dataUrl?: string;
    remoteUrl?: string;
    storageKey?: string;
    durationMs: number;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    expiresAt?: number;
    providerTaskId?: string;
    providerRequestId?: string;
    failureStage?: ImageFailureStage;
    persistenceError?: string;
};

type GenerationResult = {
    id: string;
    status: ImageGenerationStatus;
    image?: GeneratedImage;
    error?: string;
    failureStage?: ImageFailureStage;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    unknownCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "成功" | "失败" | "待确认";
    images: GeneratedImage[];
    thumbnails: string[];
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "infinite-canvas:image_generation_logs";
const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const QWEN_REFERENCE_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/x-ms-bmp", "image/tiff", "image/webp", "image/gif"];

export default function ImagePage() {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [referenceOptimization, setReferenceOptimization] = useState<(ImageReferenceOptimization & { enabled: boolean }) | null>(null);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const logIdByImageIdRef = useRef(new Map<string, string>());
    const copyText = useCopyText();

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const qwenReferences = resolveModelChannel(effectiveConfig, model).apiFormat === "qwen";
    const referenceLimit = qwenReferences ? 3 : Number.MAX_SAFE_INTEGER;
    const referenceMaxBytes = qwenReferences ? 10 * 1024 * 1024 : Number.MAX_SAFE_INTEGER;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(15, Number(config.count) || 1));

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const candidates = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const imageFiles = candidates.filter((file) => file.size <= referenceMaxBytes && (!qwenReferences || QWEN_REFERENCE_MIME_TYPES.includes(file.type.toLowerCase()))).slice(0, Math.max(0, referenceLimit - references.length));
        if (imageFiles.length < candidates.length) message.warning(qwenReferences ? "Qwen 最多支持 3 张、单张不超过 10MB 的 JPG/PNG/BMP/TIFF/WEBP/GIF 参考图" : "部分参考图未能添加");
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, width: image.width, height: image.height };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, referenceLimit));
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            const acceptedBlobs = blobs.filter((blob) => blob.size <= referenceMaxBytes && (!qwenReferences || QWEN_REFERENCE_MIME_TYPES.includes(blob.type.toLowerCase()))).slice(0, Math.max(0, referenceLimit - references.length));
            if (acceptedBlobs.length < blobs.length) message.warning(qwenReferences ? "Qwen 最多支持 3 张、单张不超过 10MB 的 JPG/PNG/BMP/TIFF/WEBP/GIF 参考图" : "部分参考图未能添加");
            const nextReferences = await Promise.all(
                acceptedBlobs.map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, width: image.width, height: image.height };
                }),
            );
            setReferences((value) => [...value, ...nextReferences].slice(0, referenceLimit));
            message.success(`已读取 ${nextReferences.length} 张参考图`);
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = prompt.trim();
        if (!text) {
            message.error("请输入生图提示词");
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "请输入生图提示词" });
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning("请先完成配置");
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "生图配置不完整" });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: "生图参数无效" });
            return;
        }

        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setReferenceOptimization(() => null);
        setResults(() => Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "queued" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        try {
            const execution = await executeImageBatch(
                snapshot,
                Array.from({ length: generationCount }, (_, index) => index),
                batchStartedAt,
            );
            const successImages = execution.images;
            const successCount = execution.results.filter((item) => item.status === "fulfilled").length;
            const unknownCount = execution.results.filter((item) => item.status === "rejected" && item.reason instanceof ImageGenerationError && item.reason.resultUnknown).length;
            const failCount = generationCount - successCount - unknownCount;
            const failed = execution.results.find((item): item is PromiseRejectedResult => item.status === "rejected");
            const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? "生成失败" : undefined;
            if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount: failCount + unknownCount, error: successCount ? undefined : error });

            await saveLog(
                buildLog({
                    prompt: text,
                    model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    unknownCount,
                    status: successCount ? "成功" : unknownCount ? "待确认" : "失败",
                    images: successImages,
                }),
            );
            if (unknownCount) message.warning(IMAGE_REQUEST_UNKNOWN_MESSAGE);
            else if (successCount) message.success("图片已生成");
            else message.error(failed?.reason instanceof Error ? failed.reason.message : "生成失败");
        } catch (error) {
            const details = imageErrorDetails(error, "provider_submit");
            setResults((value) => value.map((item) => (isTerminalResultStatus(item.status) ? item : { ...item, status: "failed", error: details.message, failureStage: details.failureStage })));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: generationCount, error: details.message });
            message.error(details.message);
        } finally {
            setRunning(false);
        }
    };

    // 响应 Agent 面板下发的生图命令：填入提示词，并按需自动触发生成。
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: "生图工作台已有任务正在运行" });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const updateLoggedImage = async (image: GeneratedImage) => {
        const logId = logIdByImageIdRef.current.get(image.id);
        if (!logId) return;
        try {
            const log = await logStore.getItem<GenerationLog>(logId);
            if (!log) return;
            await logStore.setItem(logId, serializeLog({ ...log, images: (log.images || []).map((item) => (item.id === image.id ? image : item)) }));
            await refreshLogs();
        } catch {
            message.warning("图片已保存，但生成记录未能同步更新");
        }
    };

    const ensureResultStored = async (image: GeneratedImage, index: number) => {
        if (image.storageKey && image.dataUrl) return image;
        const source = imageDisplayUrl(image);
        if (!source) throw new Error("没有可保存的图片");
        setResults((value) => updateResultAt(value, index, { status: "downloading", image: { ...image, persistenceError: undefined, failureStage: undefined }, error: undefined, failureStage: undefined }));
        try {
            const stored = await storeImageBlob(await downloadImageBlob(source));
            const nextImage: GeneratedImage = {
                ...image,
                dataUrl: stored.url,
                storageKey: stored.storageKey,
                width: stored.width,
                height: stored.height,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
                persistenceError: undefined,
                failureStage: undefined,
            };
            setResults((value) => updateResultAt(value, index, { status: "stored", image: nextImage, error: undefined, failureStage: undefined }));
            await updateLoggedImage(nextImage);
            return nextImage;
        } catch (error) {
            const details = imageErrorDetails(error, image.remoteUrl ? "result_download" : "indexeddb_write");
            const nextImage = { ...image, persistenceError: details.message, failureStage: details.failureStage };
            setResults((value) => updateResultAt(value, index, { status: image.remoteUrl ? "remote_only" : "generated", image: nextImage, error: undefined, failureStage: details.failureStage }));
            throw error;
        }
    };

    const openOriginalImage = (image: GeneratedImage) => {
        if (image.remoteUrl) window.open(image.remoteUrl, "_blank", "noopener,noreferrer");
    };

    const copyImageLink = (image: GeneratedImage) => {
        if (image.remoteUrl) copyText(image.remoteUrl, "图片链接已复制");
    };

    const downloadImage = async (image: GeneratedImage, index: number) => {
        const source = imageDisplayUrl(image);
        if (!source) {
            message.error("没有可下载的图片");
            return;
        }
        try {
            if (image.remoteUrl && !image.storageKey) saveAs(await downloadImageBlob(image.remoteUrl), `image-${index + 1}.png`);
            else saveAs(source, `image-${index + 1}.png`);
        } catch (error) {
            message.error(imageErrorDetails(error, "result_download").message);
        }
    };

    const saveResultLocally = async (image: GeneratedImage, index: number) => {
        try {
            await ensureResultStored(image, index);
            message.success("图片已保存到本地");
        } catch (error) {
            message.error(imageErrorDetails(error, image.remoteUrl ? "result_download" : "indexeddb_write").message);
        }
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        if (references.length >= referenceLimit) {
            message.warning("Qwen 最多支持 3 张参考图，且单张不能超过 10MB");
            return;
        }
        try {
            const stored = await ensureResultStored(image, index);
            if ((stored.bytes || 0) > referenceMaxBytes || (qwenReferences && stored.mimeType && !QWEN_REFERENCE_MIME_TYPES.includes(stored.mimeType.toLowerCase()))) {
                message.warning("Qwen 最多支持 3 张、单张不超过 10MB 的 JPG/PNG/BMP/TIFF/WEBP/GIF 参考图");
                return;
            }
            setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType || "image/png", dataUrl: stored.dataUrl || "", storageKey: stored.storageKey, bytes: stored.bytes, width: stored.width, height: stored.height }].slice(0, referenceLimit));
            message.success("已加入参考图");
        } catch (error) {
            message.error(imageErrorDetails(error, image.remoteUrl ? "result_download" : "indexeddb_write").message);
        }
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        try {
            const stored = await ensureResultStored(image, index);
            if (!stored.dataUrl || !stored.storageKey) throw new Error("图片未能保存到本地");
            addAsset({
                kind: "image",
                title: `生成结果 ${index + 1}`,
                coverUrl: stored.dataUrl,
                tags: [],
                source: "生图工作台",
                data: { dataUrl: stored.dataUrl, storageKey: stored.storageKey, width: stored.width || 0, height: stored.height || 0, bytes: stored.bytes || 0, mimeType: stored.mimeType || "image/png" },
                metadata: { source: "image-page", prompt },
            });
            message.success("已加入我的资产");
        } catch (error) {
            message.error(imageErrorDetails(error, image.remoteUrl ? "result_download" : "indexeddb_write").message);
        }
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            if (references.length >= referenceLimit || stored.bytes > referenceMaxBytes || (qwenReferences && !QWEN_REFERENCE_MIME_TYPES.includes(stored.mimeType.toLowerCase()))) {
                message.warning("Qwen 最多支持 3 张、单张不超过 10MB 的 JPG/PNG/BMP/TIFF/WEBP/GIF 参考图");
                setAssetPickerOpen(false);
                return;
            }
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey, bytes: stored.bytes, width: stored.width, height: stored.height }].slice(0, referenceLimit));
        } else {
            message.warning("生图工作台只能使用文本或图片资产");
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setReferenceOptimization(() => null);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(refreshLogs);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = async (log: GenerationLog) => {
        log.images.forEach((image) => logIdByImageIdRef.current.set(image.id, log.id));
        try {
            await logStore.setItem(log.id, serializeLog(log));
            await refreshLogs();
        } catch {
            message.warning("生成记录未能保存到本地，请及时下载结果");
        }
    };

    const refreshLogs = async () => {
        const nextLogs = await readStoredLogs();
        logIdByImageIdRef.current.clear();
        nextLogs.forEach((log) => log.images.forEach((image) => logIdByImageIdRef.current.set(image.id, log.id)));
        setLogs(() => nextLogs);
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        setResults(() => [
            ...log.images.map((image) => ({ id: image.id, status: image.storageKey ? ("stored" as const) : image.remoteUrl ? ("remote_only" as const) : ("generated" as const), image })),
            ...Array.from({ length: log.unknownCount || 0 }, () => ({ id: nanoid(), status: "unknown" as const, error: IMAGE_REQUEST_UNKNOWN_MESSAGE })),
        ]);
        setReferenceOptimization(() => null);
    };

    const buildRequestSnapshot = (count = generationCount) => {
        const text = prompt.trim();
        if (!text) {
            message.error("请输入生图提示词");
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning("请先完成配置");
            openConfigDialog(true);
            return null;
        }
        return { text, config: { ...effectiveConfig, model, count: String(count) }, references: [...references] };
    };

    const executeImageBatch = async (snapshot: { text: string; config: AiConfig; references: ReferenceImage[] }, targetIndexes: number[], batchStartedAt: number) => {
        const batch = await requestImageBatch(snapshot.config, snapshot.text, snapshot.references, {
            onStatus: (batchIndex, status, detail) => {
                const targetIndex = targetIndexes[batchIndex];
                if (targetIndex === undefined) return;
                if (detail instanceof ImageGenerationError) {
                    setResults((value) => updateResultAt(value, targetIndex, { status, error: detail.message, failureStage: detail.failureStage, image: undefined }));
                    return;
                }
                const image = isImageGenerationOutput(detail) ? generatedImageFromOutput(detail, performance.now() - batchStartedAt) : undefined;
                setResults((value) => updateResultAt(value, targetIndex, { status, ...(image ? { image } : {}), error: undefined, failureStage: undefined }));
            },
        });
        setReferenceOptimization(() => ({ ...batch.referenceOptimization, enabled: snapshot.config.optimizeImageReferences }));

        const images = await Promise.all(
            batch.results.map(async (result, batchIndex) => {
                const targetIndex = targetIndexes[batchIndex];
                if (targetIndex === undefined) return null;
                if (result.status === "rejected") {
                    const details = imageErrorDetails(result.reason, "provider_processing");
                    const status = result.reason instanceof ImageGenerationError && result.reason.resultUnknown ? "unknown" : "failed";
                    setResults((value) => updateResultAt(value, targetIndex, { status, error: details.message, failureStage: details.failureStage, image: undefined }));
                    return null;
                }

                const output = result.value;
                const generatedImage = generatedImageFromOutput(output, performance.now() - batchStartedAt);
                if (output.source === "remote_url") {
                    setResults((value) => updateResultAt(value, targetIndex, { status: "remote_only", image: generatedImage, error: undefined, failureStage: undefined }));
                    return generatedImage;
                }

                setResults((value) => updateResultAt(value, targetIndex, { status: "generated", image: generatedImage, error: undefined, failureStage: undefined }));
                try {
                    const stored = await uploadImage(output.dataUrl);
                    const storedImage: GeneratedImage = {
                        ...generatedImage,
                        dataUrl: stored.url,
                        storageKey: stored.storageKey,
                        width: stored.width,
                        height: stored.height,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    setResults((value) => updateResultAt(value, targetIndex, { status: "stored", image: storedImage, error: undefined, failureStage: undefined }));
                    return storedImage;
                } catch (error) {
                    const meta = await readImageMeta(output.dataUrl);
                    const details = imageErrorDetails(error, "indexeddb_write");
                    const generatedOnlyImage: GeneratedImage = {
                        ...generatedImage,
                        width: meta.width,
                        height: meta.height,
                        bytes: getDataUrlByteSize(output.dataUrl),
                        mimeType: output.mimeType || meta.mimeType,
                        failureStage: details.failureStage,
                        persistenceError: details.message,
                    };
                    setResults((value) => updateResultAt(value, targetIndex, { status: "generated", image: generatedOnlyImage, error: undefined, failureStage: details.failureStage }));
                    return generatedOnlyImage;
                }
            }),
        );
        return { results: batch.results, images: images.filter((image): image is GeneratedImage => Boolean(image)) };
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot(1);
        if (!snapshot) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "queued", error: undefined, failureStage: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        setElapsedMs(0);
        setStartedAt(retryStartedAt);
        setRunning(true);
        try {
            const execution = await executeImageBatch(snapshot, [index], retryStartedAt);
            const result = execution.results[0];
            const image = execution.images[0];
            if (!result || result.status === "rejected" || !image) {
                if (result?.status === "rejected" && result.reason instanceof ImageGenerationError && result.reason.resultUnknown) message.warning(IMAGE_REQUEST_UNKNOWN_MESSAGE);
                else if (result?.status === "rejected") message.error(result.reason instanceof Error ? result.reason.message : "生成失败");
                return;
            }
            await saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    unknownCount: 0,
                    status: "成功",
                    images: [image],
                }),
            );
            message.success("重试成功");
        } catch (error) {
            const details = imageErrorDetails(error, "provider_submit");
            setResults((value) => updateResultAt(value, index, { status: "failed", error: details.message, failureStage: details.failureStage, image: undefined }));
            message.error(details.message);
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:block">
                    <LogPanel
                        logs={logs}
                        selectedLogIds={selectedLogIds}
                        activeLogId={previewLog?.id}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={() => setDeleteConfirmOpen(true)}
                        onPreviewLog={(log) => void previewGenerationLog(log)}
                    />
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[420px_minmax(0,1fr)]">
                    <div className="thin-scrollbar flex flex-col rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto">
                        <div>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">生图工作台</h1>
                                </div>
                                <div className="flex shrink-0 gap-2 lg:hidden">
                                    <Button icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                        记录
                                    </Button>
                                    <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                        参数
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 space-y-5">
                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">提示词</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setPromptDialogOpen(true)}>
                                            查看提示词库
                                        </Button>
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            查看我的资产
                                        </Button>
                                    </div>
                                </div>
                                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={7} placeholder="描述画面主体、风格、构图、光线和用途" />
                            </div>

                            <div className="min-w-0">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">参考图</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addReferencesFromClipboard()}>
                                            剪切板
                                        </Button>
                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                            上传
                                        </Button>
                                    </div>
                                </div>
                                <div
                                    className="hover-scrollbar hover-scrollbar-hint flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed border-stone-300 p-2 pb-3 overscroll-x-contain dark:border-stone-700"
                                    onWheel={(event) => {
                                        if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                        event.preventDefault();
                                        event.currentTarget.scrollLeft += event.deltaY;
                                    }}
                                >
                                    {references.map((item, index) => (
                                        <div key={item.id} className="group relative size-20 shrink-0 overflow-hidden rounded-md border border-stone-200 dark:border-stone-800">
                                            <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                                            <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                            <button
                                                type="button"
                                                className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex"
                                                onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                aria-label="移除参考图"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {!references.length ? <div className="flex min-w-full items-center justify-center text-sm text-stone-500">暂无参考图</div> : null}
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900 sm:hidden">
                                <span className="truncate text-stone-500 dark:text-stone-400">
                                    {modelOptionLabel(effectiveConfig, model)} · {effectiveConfig.size} · {effectiveConfig.quality}
                                </span>
                                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    调整
                                </Button>
                            </div>

                            <div className="hidden gap-4 sm:grid sm:grid-cols-2">
                                <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                            </div>
                        </div>

                        <div className="mt-auto pt-6">
                            <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running} disabled={!canGenerate || running} onClick={() => void generate()}>
                                开始生成
                            </Button>
                        </div>
                    </div>

                    <div className="thin-scrollbar rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold">生成结果</h2>
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                                {referenceOptimization?.total ? (
                                    <Tag className="m-0 px-2 py-1" color={referenceOptimization.optimized ? "green" : undefined}>
                                        参考图优化 {referenceOptimization.optimized}/{referenceOptimization.total}
                                        {!referenceOptimization.enabled ? "（已关闭）" : ""}
                                    </Tag>
                                ) : null}
                                {running ? <Tag className="m-0 px-2 py-1">等待 {formatDuration(elapsedMs)}</Tag> : null}
                            </div>
                        </div>
                        {results.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                                {results.map((result, index) =>
                                    isDisplayableResultStatus(result.status) && result.image ? (
                                        <ResultImageCard
                                            key={result.id}
                                            image={result.image}
                                            status={result.status}
                                            actionsDisabled={running}
                                            index={index}
                                            onEdit={addResultToReferences}
                                            onDownload={downloadImage}
                                            onSaveAsset={saveResultToAssets}
                                            onOpenOriginal={openOriginalImage}
                                            onCopyLink={copyImageLink}
                                            onSaveLocal={saveResultLocally}
                                        />
                                    ) : result.status === "unknown" ? (
                                        <UnknownImageCard key={result.id} error={result.error || IMAGE_REQUEST_UNKNOWN_MESSAGE} />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || "生成失败"} retryDisabled={running} onRetry={() => retryResult(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} status={result.status} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 text-center dark:border-stone-700 lg:min-h-[560px]">
                                <ImagePlus className="mb-4 size-11 text-stone-400" />
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有生成图片" />
                            </div>
                        )}
                    </div>
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer title="生成记录" placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Drawer>
            <Drawer title="参数" placement="bottom" size="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title="删除生成记录" open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除选中的 {selectedLogIds.length} 条生成记录吗？
            </Modal>
        </div>
    );
}

function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <>
            <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">模型</span>
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("imageModel", value)} capability="image" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <div className="col-span-2">
                <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" maxCount={15} />
            </div>
        </>
    );
}

function ResultImageCard({
    image,
    status,
    actionsDisabled,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
    onOpenOriginal,
    onCopyLink,
    onSaveLocal,
}: {
    image: GeneratedImage;
    status: ImageGenerationStatus;
    actionsDisabled: boolean;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void | Promise<void>;
    onDownload: (image: GeneratedImage, index: number) => void | Promise<void>;
    onSaveAsset: (image: GeneratedImage, index: number) => void | Promise<void>;
    onOpenOriginal: (image: GeneratedImage) => void;
    onCopyLink: (image: GeneratedImage) => void;
    onSaveLocal: (image: GeneratedImage, index: number) => void | Promise<void>;
}) {
    const source = imageDisplayUrl(image);
    const remote = Boolean(image.remoteUrl);
    const stored = Boolean(image.storageKey);
    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <Image src={source} alt={`生成结果 ${index + 1}`} className="block h-auto w-full object-contain" />
            <div className="space-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <Tag className="m-0">{imageStatusLabel(status)}</Tag>
                    {image.width && image.height ? <span>{image.width}x{image.height}</span> : null}
                    {image.bytes ? <span>{formatBytes(image.bytes)}</span> : null}
                    <span>{formatDuration(image.durationMs)}</span>
                </div>
                {status === "remote_only" ? <div className="text-xs text-amber-700 dark:text-amber-300">当前为远程链接，可能过期，建议保存到本地。</div> : null}
                {image.expiresAt ? <div className="text-xs text-stone-500 dark:text-stone-400">链接有效期至 {new Date(image.expiresAt).toLocaleString("zh-CN", { hour12: false })}</div> : null}
                {image.persistenceError ? <div className="text-xs text-amber-700 dark:text-amber-300">{image.persistenceError}</div> : null}
                {remote ? (
                    <div className="grid min-w-0 grid-cols-2 gap-2">
                        <Tooltip title="在新窗口打开远程原图">
                            <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<ExternalLink className="size-3.5" />} disabled={actionsDisabled} onClick={() => onOpenOriginal(image)}>
                                打开原图
                            </Button>
                        </Tooltip>
                        <Tooltip title="复制远程图片链接">
                            <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<Copy className="size-3.5" />} disabled={actionsDisabled} onClick={() => onCopyLink(image)}>
                                复制链接
                            </Button>
                        </Tooltip>
                        <Tooltip title="下载图片">
                            <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<Download className="size-3.5" />} disabled={actionsDisabled} onClick={() => void onDownload(image, index)}>
                                下载
                            </Button>
                        </Tooltip>
                        <Tooltip title={stored ? "已保存到浏览器本地" : "下载远程图片并保存到浏览器本地"}>
                            <Button
                                className={RESULT_ACTION_BUTTON_CLASS}
                                size="small"
                                icon={<Save className="size-3.5" />}
                                loading={status === "downloading"}
                                disabled={stored || actionsDisabled}
                                onClick={() => void onSaveLocal(image, index)}
                            >
                                {stored ? "已保存" : "保存到本地"}
                            </Button>
                        </Tooltip>
                    </div>
                ) : null}
                <div className={`grid min-w-0 gap-2 ${remote ? "grid-cols-2" : "grid-cols-3"}`}>
                    <Tooltip title="添加到资产">
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<FolderPlus className="size-3.5" />} disabled={actionsDisabled || status === "downloading"} onClick={() => void onSaveAsset(image, index)}>
                            添加到资产
                        </Button>
                    </Tooltip>
                    <Tooltip title="加入参考图">
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<PenLine className="size-3.5" />} disabled={actionsDisabled || status === "downloading"} onClick={() => void onEdit(image, index)}>
                            加入参考图
                        </Button>
                    </Tooltip>
                    {!remote ? (
                        <Tooltip title="下载">
                            <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<Download className="size-3.5" />} disabled={actionsDisabled} onClick={() => void onDownload(image, index)}>
                                下载
                            </Button>
                        </Tooltip>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function PendingImageCard({ status }: { status: ImageGenerationStatus }) {
    return (
        <div className="relative aspect-square overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{status === "queued" ? "排队中" : status === "downloading" ? "保存中" : "生成中"}</span>
            </div>
        </div>
    );
}

function FailedImageCard({ error, retryDisabled, onRetry }: { error: string; retryDisabled: boolean; onRetry: () => void }) {
    return (
        <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-square flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-red-600 dark:text-red-300">生成失败</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" danger disabled={retryDisabled} onClick={onRetry}>
                    重试
                </Button>
            </div>
        </div>
    );
}

function UnknownImageCard({ error }: { error: string }) {
    return (
        <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-950 dark:bg-amber-950/20">
            <div className="flex aspect-square flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-amber-700 dark:text-amber-300">结果待确认</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-amber-700 dark:!text-amber-200">
                    {error}
                </Typography.Paragraph>
            </div>
        </div>
    );
}

function isImageGenerationOutput(value: unknown): value is ImageGenerationOutput {
    return Boolean(value && typeof value === "object" && "source" in value && "status" in value);
}

function generatedImageFromOutput(output: ImageGenerationOutput, durationMs: number): GeneratedImage {
    return {
        id: output.id,
        ...(output.source === "data_url" ? { dataUrl: output.dataUrl, bytes: getDataUrlByteSize(output.dataUrl) } : { remoteUrl: output.remoteUrl }),
        durationMs,
        mimeType: output.mimeType,
        expiresAt: output.expiresAt,
        providerTaskId: output.providerTaskId,
        providerRequestId: output.providerRequestId,
    };
}

function imageDisplayUrl(image: GeneratedImage) {
    return image.dataUrl || image.remoteUrl || "";
}

function imageErrorDetails(error: unknown, fallbackStage: ImageFailureStage) {
    return {
        message: error instanceof Error ? error.message : "图片处理失败",
        failureStage: error instanceof ImageGenerationError ? error.failureStage : fallbackStage,
    };
}

function isDisplayableResultStatus(status: ImageGenerationStatus) {
    return status === "generated" || status === "downloading" || status === "stored" || status === "remote_only";
}

function isTerminalResultStatus(status: ImageGenerationStatus) {
    return status === "generated" || status === "stored" || status === "remote_only" || status === "unknown" || status === "failed";
}

function imageStatusLabel(status: ImageGenerationStatus) {
    if (status === "stored") return "已保存";
    if (status === "remote_only") return "仅远程";
    if (status === "downloading") return "保存中";
    if (status === "generated") return "已生成";
    return status === "queued" ? "排队中" : status === "generating" ? "生成中" : status === "unknown" ? "待确认" : "失败";
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold">生成记录</h2>
                </div>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    新建
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? "取消" : "全选"}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    删除
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700">暂无生成记录</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const thumbnails = (log.thumbnails || []).filter(Boolean).slice(0, 4);

    return (
        <button
            type="button"
            className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}
            onClick={onClick}
        >
            <div className="grid grid-cols-[minmax(128px,1fr)_auto] gap-2">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                    <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                        {thumbnails.length ? (
                            <div className="mt-2 flex gap-1 overflow-hidden">
                                {thumbnails.map((image, index) => (
                                    <img key={`${log.id}-${index}`} src={image} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <div className="flex gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="blue">
                            成功 {log.successCount ?? log.imageCount}
                        </Tag>
                        {log.failCount ? (
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="red">
                                失败 {log.failCount}
                            </Tag>
                        ) : null}
                        {log.unknownCount ? (
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="orange">
                                待确认 {log.unknownCount}
                            </Tag>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.imageCount} 张</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                            {formatDuration(log.durationMs)}
                        </Tag>
                    </div>
                    <div className="flex justify-end">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.time}</Tag>
                    </div>
                </div>
            </div>
        </button>
    );
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const values: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            values.push(value);
        });
        const logs = await Promise.all(values.map(normalizeLog));
        return logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl),
        })),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            const dataUrl = item.storageKey ? await resolveImageUrl(item.storageKey, item.dataUrl || "") : item.dataUrl;
            return { ...item, dataUrl };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || "未命名",
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString("zh-CN", { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        unknownCount: log.unknownCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || (log.unknownCount ? "待确认" : "成功"),
        images,
        thumbnails: images.map(imageDisplayUrl).filter((value): value is string => Boolean(value)),
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
        thumbnails: [],
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    unknownCount,
    status,
    images,
}: {
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    unknownCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        quality: config.quality,
        size: config.size,
        count: config.count,
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || "未命名",
        prompt,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        unknownCount,
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
        thumbnails: images.map(imageDisplayUrl).filter((value): value is string => Boolean(value)),
    };
}
