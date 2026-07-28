import { Button, Checkbox, Image, Tag, Tooltip, Typography } from "antd";
import { Copy, Download, ExternalLink, FolderPlus, LoaderCircle, PenLine, RefreshCw, Save, Sparkles } from "lucide-react";

import type { GenerationResult } from "@/features/image-design/generation/types";
import { formatBytes, formatDuration } from "@/lib/image-utils";

export type ImageResultCardProps = {
    result: GenerationResult;
    index: number;
    selected: boolean;
    layout: "grid" | "list";
    actionsDisabled?: boolean;
    onSelectedChange: (selected: boolean) => void;
    onDownload: (result: GenerationResult, index: number) => void | Promise<void>;
    onCopyLink: (result: GenerationResult, index: number) => void | Promise<void>;
    onSaveAsset: (result: GenerationResult, index: number) => void | Promise<void>;
    onAddReference: (result: GenerationResult, index: number) => void | Promise<void>;
    onRetry: (result: GenerationResult, index: number) => void | Promise<void>;
    onSaveLocal?: (result: GenerationResult, index: number) => void | Promise<void>;
    onRecompile?: (result: GenerationResult, index: number) => void | Promise<void>;
};

export function ImageResultCard({ result, index, selected, layout, actionsDisabled = false, onSelectedChange, onDownload, onCopyLink, onSaveAsset, onAddReference, onRetry, onSaveLocal, onRecompile }: ImageResultCardProps) {
    const image = result.image;
    const source = image?.dataUrl || image?.remoteUrl || "";
    const remote = Boolean(image?.remoteUrl);
    const stored = Boolean(image?.storageKey);
    const title = result.snapshot.structuredItem?.title || `生成结果 ${index + 1}`;
    const busy = actionsDisabled || result.status === "queued" || result.status === "generating" || result.status === "downloading";
    const durationMs = image?.durationMs ?? Math.max(0, (result.completedAt || 0) - (result.startedAt || 0));
    const sequenceLabel = resultSequenceLabel(result);

    return (
        <article
            data-testid={`image-result-${result.id}`}
            className={`min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800 ${layout === "list" ? "grid" : ""}`}
            style={layout === "list" ? { gridTemplateColumns: "minmax(0, 0.38fr) minmax(0, 0.62fr)" } : undefined}
        >
            <div className="relative min-w-0 bg-stone-50 dark:bg-stone-900">
                {source ? <Image src={source} alt={title} className="block h-auto w-full object-contain" /> : <ResultPlaceholder status={result.status} error={result.error} />}
                <Checkbox aria-label={`选择结果 ${title}`} className="absolute right-2 top-2 rounded bg-background/90 p-1" checked={selected} disabled={!source} onChange={(event) => onSelectedChange(event.target.checked)} />
            </div>

            <div className="min-w-0 space-y-2.5 border-t border-stone-200 px-3 py-3 dark:border-stone-800">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <strong className="mr-auto min-w-0 truncate text-sm">{title}</strong>
                    <span role="status" aria-live="polite">
                        <Tag className="m-0" color={resultStatusColor(result.status)}>
                            {resultStatusLabel(result.status)}
                        </Tag>
                    </span>
                </div>

                <div className="flex min-w-0 flex-wrap gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                    <span>平台 {result.snapshot.platformPresetLabel || "通用"}</span>
                    <span>Skill {result.snapshot.designSkillLabel}</span>
                    <span>比例 {result.snapshot.requestedAspectRatio || "未知"}</span>
                    {sequenceLabel ? <span>{sequenceLabel}</span> : null}
                </div>
                <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>{image?.width && image.height ? `实际尺寸 ${image.width}×${image.height}` : "实际尺寸待获取"}</span>
                    {image?.bytes ? <span>{formatBytes(image.bytes)}</span> : null}
                    <span>耗时 {formatDuration(durationMs)}</span>
                </div>

                {result.status === "remote_only" ? <div className="text-xs text-amber-700 dark:text-amber-300">当前为远程链接，可能过期，建议保存到本地。</div> : null}
                {image?.expiresAt ? <div className="text-xs text-stone-500 dark:text-stone-400">链接有效期至 {new Date(image.expiresAt).toLocaleString("zh-CN", { hour12: false })}</div> : null}
                {image?.persistenceError ? <div className="break-words text-xs text-amber-700 dark:text-amber-300">{image.persistenceError}</div> : null}
                {result.warnings?.length ? <div className="break-words text-xs text-amber-700 dark:text-amber-300">{result.warnings.join("；")}</div> : null}
                {source && result.error ? <div className="break-words text-xs text-red-600 dark:text-red-300">{result.error}</div> : null}

                <div className="flex min-w-0 flex-wrap gap-1">
                    {remote ? (
                        <Tooltip title="在新窗口打开远程原图">
                            <Button size="small" type="text" icon={<ExternalLink className="size-3.5" />} disabled={actionsDisabled} href={image?.remoteUrl} target="_blank" rel="noopener noreferrer">
                                打开原图
                            </Button>
                        </Tooltip>
                    ) : null}
                    {remote ? (
                        <Tooltip title="复制远程图片链接">
                            <Button size="small" type="text" icon={<Copy className="size-3.5" />} disabled={actionsDisabled} onClick={() => void onCopyLink(result, index)}>
                                复制链接
                            </Button>
                        </Tooltip>
                    ) : null}
                    {source ? (
                        <Button size="small" type="text" icon={<Download className="size-3.5" />} disabled={actionsDisabled} onClick={() => void onDownload(result, index)}>
                            下载
                        </Button>
                    ) : null}
                    {remote && onSaveLocal ? (
                        <Button size="small" type="text" icon={<Save className="size-3.5" />} loading={result.status === "downloading"} disabled={stored || actionsDisabled} onClick={() => void onSaveLocal(result, index)}>
                            {stored ? "已保存" : "保存到本地"}
                        </Button>
                    ) : null}
                    {source ? (
                        <Button size="small" type="text" icon={<FolderPlus className="size-3.5" />} disabled={busy} onClick={() => void onSaveAsset(result, index)}>
                            加入资产
                        </Button>
                    ) : null}
                    {source ? (
                        <Button size="small" type="text" icon={<PenLine className="size-3.5" />} disabled={busy} onClick={() => void onAddReference(result, index)}>
                            加入参考图
                        </Button>
                    ) : null}
                    {!["queued", "generating", "downloading", "unknown"].includes(result.status) ? (
                        <Button size="small" type="text" danger={result.status === "failed"} icon={<RefreshCw className="size-3.5" />} disabled={actionsDisabled} onClick={() => void onRetry(result, index)}>
                            重试
                        </Button>
                    ) : null}
                    {onRecompile ? (
                        <Button size="small" type="text" icon={<Sparkles className="size-3.5" />} disabled={busy} onClick={() => void onRecompile(result, index)}>
                            重新编译
                        </Button>
                    ) : null}
                </div>
            </div>
        </article>
    );
}

export function resultStatusLabel(status: GenerationResult["status"]) {
    if (status === "stored") return "已保存";
    if (status === "remote_only") return "仅远程";
    if (status === "downloading") return "保存中";
    if (status === "generated") return "已生成";
    if (status === "queued") return "排队中";
    if (status === "generating") return "生成中";
    if (status === "unknown") return "待确认";
    if (status === "cancelled") return "已取消";
    return "失败";
}

function ResultPlaceholder({ status, error }: { status: GenerationResult["status"]; error?: string }) {
    const pending = status === "queued" || status === "generating" || status === "downloading";
    const unknown = status === "unknown";
    return (
        <div
            className={`flex aspect-square min-w-0 flex-col items-center justify-center gap-3 p-5 text-center ${status === "failed" ? "bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-300" : unknown ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300" : "text-stone-500 dark:text-stone-400"}`}
        >
            {pending ? <LoaderCircle className="size-6 animate-spin" /> : null}
            <div className="text-sm font-medium">{pending ? resultStatusLabel(status) : unknown ? "结果待确认" : status === "failed" ? "生成失败" : status === "cancelled" ? "已取消" : "结果尚不可用"}</div>
            {error ? (
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !max-w-full !text-xs !text-current">
                    {error}
                </Typography.Paragraph>
            ) : null}
        </div>
    );
}

function resultStatusColor(status: GenerationResult["status"]) {
    if (status === "stored") return "green";
    if (status === "generated") return "blue";
    if (status === "remote_only" || status === "unknown") return "orange";
    if (status === "failed") return "red";
    return undefined;
}

function resultSequenceLabel(result: GenerationResult) {
    const { snapshot } = result;
    const sequence = snapshot.seriesIndex === undefined ? (snapshot.structuredItem ? snapshot.structuredItem.order + 1 : undefined) : snapshot.seriesIndex + 1;
    if (sequence === undefined) return "";
    const storyboard = snapshot.structuredPlan?.type === "storyboard" || snapshot.structuredItem?.kind === "panel";
    return `${storyboard ? "分镜" : "系列"} ${sequence}`;
}
