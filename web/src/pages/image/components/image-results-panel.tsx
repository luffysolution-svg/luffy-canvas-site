import { Button, Empty, Tag } from "antd";
import { CheckSquare, Download, FolderPlus, Grid2X2, List } from "lucide-react";

import type { GenerationResult } from "@/features/image-design/generation/types";
import { ImageResultCard, type ImageResultCardProps } from "./image-result-card";

export type ImageResultsLayout = "grid" | "list";

export type ImageResultsPanelProps = Pick<ImageResultCardProps, "actionsDisabled" | "onDownload" | "onCopyLink" | "onSaveAsset" | "onAddReference" | "onRetry" | "onSaveLocal" | "onRecompile"> & {
    results: GenerationResult[];
    selectedResultIds: string[];
    layout: ImageResultsLayout;
    className?: string;
    onSelectedResultIdsChange: (ids: string[]) => void;
    onLayoutChange: (layout: ImageResultsLayout) => void;
    onBatchDownload: (results: GenerationResult[]) => void | Promise<void>;
    onBatchSaveAsset: (results: GenerationResult[]) => void | Promise<void>;
};

export function ImageResultsPanel({
    results,
    selectedResultIds,
    layout,
    className,
    actionsDisabled = false,
    onSelectedResultIdsChange,
    onLayoutChange,
    onBatchDownload,
    onBatchSaveAsset,
    onDownload,
    onCopyLink,
    onSaveAsset,
    onAddReference,
    onRetry,
    onSaveLocal,
    onRecompile,
}: ImageResultsPanelProps) {
    const selectableResults = results.filter(hasDisplayableImage);
    const selectableIds = selectableResults.map((result) => result.id);
    const selectableIdSet = new Set(selectableIds);
    const allSelected = Boolean(selectableIds.length) && selectableIds.every((id) => selectedResultIds.includes(id));
    const selectedResults = results.filter((result) => selectedResultIds.includes(result.id) && hasDisplayableImage(result));

    const toggleAll = () => {
        if (allSelected) {
            onSelectedResultIdsChange(selectedResultIds.filter((id) => !selectableIdSet.has(id)));
            return;
        }
        onSelectedResultIdsChange(Array.from(new Set([...selectedResultIds, ...selectableIds])));
    };

    return (
        <section className={`[&_.ant-btn-sm]:!min-h-10 sm:[&_.ant-btn-sm]:!min-h-6 ${className || ""}`} aria-label="生成结果" aria-busy={actionsDisabled}>
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <h2 className="text-base font-semibold">生成结果</h2>
                    <Tag className="m-0">{results.length}</Tag>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        aria-label="网格布局"
                        aria-pressed={layout === "grid"}
                        className="!w-10 !min-w-10 sm:!w-6 sm:!min-w-6"
                        size="small"
                        type={layout === "grid" ? "primary" : "text"}
                        icon={<Grid2X2 className="size-3.5" />}
                        onClick={() => onLayoutChange("grid")}
                    />
                    <Button
                        aria-label="列表布局"
                        aria-pressed={layout === "list"}
                        className="!w-10 !min-w-10 sm:!w-6 sm:!min-w-6"
                        size="small"
                        type={layout === "list" ? "primary" : "text"}
                        icon={<List className="size-3.5" />}
                        onClick={() => onLayoutChange("list")}
                    />
                </div>
            </div>

            <div className="mb-4 flex min-w-0 flex-wrap gap-2">
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!selectableIds.length} onClick={toggleAll}>
                    {allSelected ? "取消全选" : "全选"}
                </Button>
                <Button size="small" icon={<Download className="size-3.5" />} disabled={actionsDisabled || !selectedResults.length} onClick={() => void onBatchDownload(selectedResults)}>
                    批量下载
                </Button>
                <Button size="small" icon={<FolderPlus className="size-3.5" />} disabled={actionsDisabled || !selectedResults.length} onClick={() => void onBatchSaveAsset(selectedResults)}>
                    批量加入资产
                </Button>
            </div>

            {results.length ? (
                <div className={`grid min-w-0 gap-4 ${layout === "list" ? "grid-cols-1" : ""}`} style={layout === "grid" ? { gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" } : undefined}>
                    {results.map((result, index) => (
                        <ImageResultCard
                            key={result.id}
                            result={result}
                            index={index}
                            selected={selectedResultIds.includes(result.id)}
                            layout={layout}
                            actionsDisabled={actionsDisabled}
                            onSelectedChange={(selected) => onSelectedResultIdsChange(selected ? Array.from(new Set([...selectedResultIds, result.id])) : selectedResultIds.filter((id) => id !== result.id))}
                            onDownload={onDownload}
                            onCopyLink={onCopyLink}
                            onSaveAsset={onSaveAsset}
                            onAddReference={onAddReference}
                            onRetry={onRetry}
                            onSaveLocal={onSaveLocal}
                            onRecompile={onRecompile}
                        />
                    ))}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生成结果" />
            )}
        </section>
    );
}

function hasDisplayableImage(result: GenerationResult) {
    return Boolean(result.image?.dataUrl || result.image?.remoteUrl);
}
