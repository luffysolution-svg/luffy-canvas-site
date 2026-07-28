import { App, Button, Select, Tag } from "antd";
import { ArrowLeft, ArrowRight, ClipboardPaste, ImagePlus, Library, Trash2, Upload } from "lucide-react";
import { nanoid } from "nanoid";
import { useRef, useState, type DragEvent } from "react";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { cn } from "@/lib/utils";
import { uploadImage } from "@/services/image-storage";
import type { ImageReferenceRole, ReferenceImage } from "@/types/image";

export type ReferenceImagesFieldRole = ImageReferenceRole;

export type ReferenceImagesFieldProps = {
    value: ReferenceImage[];
    onChange: (value: ReferenceImage[]) => void;
    maxCount?: number;
    maxBytes?: number;
    allowedMimeTypes?: string[];
    className?: string;
    disabled?: boolean;
};

const ROLE_OPTIONS: Array<{ value: ReferenceImagesFieldRole; label: string }> = [
    { value: "direct", label: "直接采用" },
    { value: "subject", label: "主体" },
    { value: "identity", label: "身份" },
    { value: "style", label: "风格" },
    { value: "palette", label: "配色" },
    { value: "composition", label: "构图" },
    { value: "layout", label: "版式" },
    { value: "product", label: "产品" },
    { value: "character", label: "角色" },
    { value: "series-anchor", label: "系列锚点" },
];

const SOURCE_LABELS: Record<NonNullable<ReferenceImage["source"]>, string> = {
    user: "本地上传",
    asset: "我的素材",
    result: "生成结果",
    "series-anchor": "系列锚点",
};

export function ReferenceImagesField({ value, onChange, maxCount, maxBytes, allowedMimeTypes, className, disabled = false }: ReferenceImagesFieldProps) {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const references = value;
    const remaining = maxCount ? Math.max(0, maxCount - value.length) : Number.POSITIVE_INFINITY;
    const atLimit = remaining === 0;

    const addFiles = async (files: File[]) => {
        if (disabled || uploading || atLimit) return;
        const candidates = files.filter((file) => file.type.startsWith("image/"));
        const compatible = candidates.filter((file) => (!maxBytes || file.size <= maxBytes) && (!allowedMimeTypes?.length || allowedMimeTypes.includes(file.type.toLowerCase())));
        const accepted = Number.isFinite(remaining) ? compatible.slice(0, remaining) : compatible;
        if (!accepted.length) {
            message.warning(candidates.length ? "图片不符合当前模型的格式或大小限制" : "请选择图片文件");
            return;
        }
        if (accepted.length < candidates.length || candidates.length < files.length) message.warning(maxCount ? `当前模型最多使用 ${maxCount} 张参考图，已忽略不兼容或超出上限的文件` : "已忽略不兼容的文件");

        setUploading(true);
        try {
            const settled = await Promise.allSettled(
                accepted.map(async (file): Promise<ReferenceImage> => {
                    const image = await uploadImage(file);
                    return {
                        id: nanoid(),
                        name: file.name,
                        type: image.mimeType,
                        dataUrl: image.url,
                        storageKey: image.storageKey,
                        bytes: image.bytes,
                        width: image.width,
                        height: image.height,
                        source: "user",
                    };
                }),
            );
            const added = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
            if (added.length) onChange(maxCount ? [...value, ...added].slice(0, maxCount) : [...value, ...added]);
            if (added.length < accepted.length) message.error("部分参考图上传失败，请重试");
        } finally {
            setUploading(false);
        }
    };

    const addAsset = (payload: InsertAssetPayload) => {
        if (payload.kind !== "image") {
            message.warning("请选择图片素材");
            return;
        }
        if (atLimit) {
            message.warning(`当前模型最多使用 ${maxCount} 张参考图`);
            setAssetPickerOpen(false);
            return;
        }
        if ((maxBytes && (payload.bytes || 0) > maxBytes) || (allowedMimeTypes?.length && payload.mimeType && !allowedMimeTypes.includes(payload.mimeType.toLowerCase()))) {
            message.warning("该素材不符合当前模型的格式或大小限制");
            setAssetPickerOpen(false);
            return;
        }
        onChange([
            ...value,
            {
                id: nanoid(),
                name: payload.title,
                type: payload.mimeType || "image/png",
                dataUrl: payload.dataUrl,
                storageKey: payload.storageKey,
                bytes: payload.bytes,
                width: payload.width,
                height: payload.height,
                source: "asset",
            },
        ]);
        setAssetPickerOpen(false);
    };

    const addClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.warning("剪切板里没有可读取的图片");
                return;
            }
            const files = blobs.map((blob, index) => new File([blob], `clipboard-${index + 1}.${blob.type.split("/")[1] || "png"}`, { type: blob.type }));
            await addFiles(files);
        } catch {
            message.error("无法读取剪切板图片，请检查浏览器权限");
        }
    };

    const updateRole = (id: string, role?: ReferenceImagesFieldRole) => {
        onChange(
            value.map((reference) => {
                if (reference.id !== id) return reference;
                const next = { ...reference };
                if (role) next.role = role;
                else delete next.role;
                return next;
            }),
        );
    };

    return (
        <section className={cn("min-w-0 space-y-3", className)} aria-label="参考图">
            <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium">参考图</div>
                    <div className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">为每张图片标记主体、身份、风格或版式等用途</div>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400">
                    {references.length}
                    {maxCount ? `/${maxCount}` : ""}
                </span>
            </div>

            {references.length ? (
                <ImageReferencePicker value={references} disabled={disabled} onRoleChange={updateRole} onRemove={(id) => onChange(value.filter((reference) => reference.id !== id))} onMove={(index, offset) => onChange(moveItem(value, index, offset))} />
            ) : null}

            {maxCount && references.length > maxCount ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    当前模型最多支持 {maxCount} 张参考图，现有 {references.length} 张。请删除超出部分或切换模型后再生成。
                </div>
            ) : null}

            <ImageDropZone disabled={disabled || atLimit} uploading={uploading} remaining={remaining} onFiles={(files) => void addFiles(files)} onPickAsset={() => setAssetPickerOpen(true)} onClipboard={() => void addClipboard()} />

            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={addAsset} onClose={() => setAssetPickerOpen(false)} />
        </section>
    );
}

function ImageDropZone({ disabled, uploading, remaining, onFiles, onPickAsset, onClipboard }: { disabled: boolean; uploading: boolean; remaining: number; onFiles: (files: File[]) => void; onPickAsset: () => void; onClipboard: () => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    const dropFiles = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
    };

    return (
        <div
            className={cn(
                "flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-center transition",
                dragging ? "border-stone-500 bg-stone-100 dark:border-stone-400 dark:bg-stone-800/70" : "border-stone-300 bg-stone-50/60 dark:border-stone-700 dark:bg-stone-900/30",
                disabled ? "opacity-60" : "",
            )}
            onDragEnter={(event) => {
                event.preventDefault();
                if (!disabled) setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
            }}
            onDrop={dropFiles}
        >
            <ImagePlus className="size-5 text-stone-400" />
            <div className="text-xs text-stone-500 dark:text-stone-400">{remaining ? (Number.isFinite(remaining) ? `拖入图片，或选择添加（还可添加 ${remaining} 张）` : "拖入图片，或从剪切板、文件与素材库添加") : "已达到当前模型的参考图上限"}</div>
            <div className="flex flex-wrap justify-center gap-2">
                <Button size="small" icon={<ClipboardPaste className="size-3.5" />} disabled={disabled || uploading} onClick={onClipboard}>
                    剪切板
                </Button>
                <Button size="small" icon={<Upload className="size-3.5" />} loading={uploading} disabled={disabled} onClick={() => inputRef.current?.click()}>
                    上传图片
                </Button>
                <Button size="small" icon={<Library className="size-3.5" />} disabled={disabled || uploading} onClick={onPickAsset}>
                    我的素材
                </Button>
            </div>
            <input
                ref={inputRef}
                className="hidden"
                type="file"
                accept="image/*"
                multiple
                disabled={disabled}
                onChange={(event) => {
                    onFiles(Array.from(event.target.files || []));
                    event.target.value = "";
                }}
            />
        </div>
    );
}

function ImageReferencePicker({
    value,
    disabled,
    onRoleChange,
    onRemove,
    onMove,
}: {
    value: ReferenceImage[];
    disabled: boolean;
    onRoleChange: (id: string, role?: ReferenceImagesFieldRole) => void;
    onRemove: (id: string) => void;
    onMove: (index: number, offset: number) => void;
}) {
    return (
        <div className="grid min-w-0 gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))" }}>
            {value.map((reference) => (
                <article key={reference.id} className="min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
                    <div className="group relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-stone-900">
                        <img src={reference.dataUrl || reference.url} alt={reference.name} className="size-full object-cover" />
                        <Tag className="absolute bottom-1 left-1 m-0 max-w-[calc(100%_-_0.5rem)] truncate border-0 bg-black/65 text-[10px] text-white">{reference.source ? SOURCE_LABELS[reference.source] : "未标记来源"}</Tag>
                        <Button
                            aria-label={`删除参考图 ${reference.name}`}
                            className="!absolute !right-1 !top-1 !h-10 !w-10 !min-w-10 !bg-black/60 !p-0 !text-white opacity-100 sm:!h-7 sm:!w-7 sm:!min-w-7 sm:opacity-0 sm:group-hover:opacity-100"
                            type="text"
                            danger
                            disabled={disabled}
                            icon={<Trash2 className="size-3.5" />}
                            onClick={() => onRemove(reference.id)}
                        />
                        {value.length > 1 ? (
                            <div className="absolute inset-x-1 bottom-1 flex justify-between">
                                <Button
                                    aria-label={`前移参考图 ${reference.name}`}
                                    className="!h-10 !w-10 !min-w-10 !bg-black/60 !p-0 !text-white sm:!h-7 sm:!w-7 sm:!min-w-7"
                                    type="text"
                                    disabled={disabled || value[0].id === reference.id}
                                    icon={<ArrowLeft className="size-3.5" />}
                                    onClick={() => onMove(value.indexOf(reference), -1)}
                                />
                                <Button
                                    aria-label={`后移参考图 ${reference.name}`}
                                    className="!h-10 !w-10 !min-w-10 !bg-black/60 !p-0 !text-white sm:!h-7 sm:!w-7 sm:!min-w-7"
                                    type="text"
                                    disabled={disabled || value[value.length - 1].id === reference.id}
                                    icon={<ArrowRight className="size-3.5" />}
                                    onClick={() => onMove(value.indexOf(reference), 1)}
                                />
                            </div>
                        ) : null}
                    </div>
                    <div className="space-y-2 p-2">
                        <div className="truncate text-xs font-medium" title={reference.name}>
                            {reference.name}
                        </div>
                        <Select
                            aria-label={`${reference.name} 的参考用途`}
                            className="w-full"
                            size="small"
                            allowClear
                            disabled={disabled}
                            placeholder="选择用途"
                            value={isFieldRole(reference.role) ? reference.role : undefined}
                            options={ROLE_OPTIONS}
                            onChange={(role) => onRoleChange(reference.id, role)}
                        />
                    </div>
                </article>
            ))}
        </div>
    );
}

function isFieldRole(role: ReferenceImage["role"]): role is ReferenceImagesFieldRole {
    return ROLE_OPTIONS.some((option) => option.value === role);
}

function moveItem<T>(items: T[], index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}
