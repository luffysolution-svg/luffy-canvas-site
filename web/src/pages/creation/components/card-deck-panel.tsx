import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Download, FileArchive, LayoutDashboard, Plus, RefreshCw, Save, ShieldCheck, Square, Trash2, WandSparkles } from "lucide-react";
import { Alert, Button, Empty, Input, InputNumber, Modal, Popconfirm, Radio, Segmented, Select, Spin, Switch, Tag, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";

import { ModelPicker } from "@/components/model-picker";
import { imageQualityOptions } from "@/components/image-settings-panel";
import { resolveSocialPlatformPreset, SOCIAL_PLATFORM_DEFAULTS, SOCIAL_PLATFORM_PRESET_OPTIONS } from "@/constant/creation";
import { PlatformArtboard } from "@/pages/creation/components/platform-artboard";
import { useCardDeckWorkflow } from "@/pages/creation/use-card-deck-workflow";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasTransferStore } from "@/stores/canvas/use-canvas-transfer-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { CreationCardDeck, CreationCardLayout, CreationCardPage, CreationCandidateStatus, CreationGeneratedImage, CreationProject } from "@/types/creation";

type CardDeckPanelProps = { project: CreationProject };
type MobilePane = "pages" | "preview" | "edit";
type InsertScope = "current" | "all";

const MOBILE_PANES = [
    { label: "页面", value: "pages" },
    { label: "预览", value: "preview" },
    { label: "编辑", value: "edit" },
] satisfies Array<{ label: string; value: MobilePane }>;

const LAYOUT_OPTIONS = [
    { label: "封面", value: "cover" },
    { label: "编辑", value: "editorial" },
    { label: "分屏", value: "split" },
    { label: "引语", value: "quote" },
] satisfies Array<{ label: string; value: CreationCardLayout }>;

const BACKGROUND_OPTIONS = [
    { value: "", label: "默认背景" },
    { value: "opaque", label: "不透明" },
    { value: "transparent", label: "透明" },
];

const PENDING_STATUSES = new Set<CreationCandidateStatus>(["queued", "generating", "downloading"]);

export function CardDeckPanel({ project }: CardDeckPanelProps) {
    const navigate = useNavigate();
    const workflow = useCardDeckWorkflow(project);
    const config = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const transferHydrated = useCanvasTransferStore((state) => state.hydrated);
    const [targetPageCount, setTargetPageCount] = useState(6);
    const [selectedPageId, setSelectedPageId] = useState("");
    const [mobilePane, setMobilePane] = useState<MobilePane>("pages");
    const [showSafeArea, setShowSafeArea] = useState(true);
    const [insertOpen, setInsertOpen] = useState(false);
    const { ref: workspaceRef, wide } = useWideDeckWorkspace();
    const deck = workflow.deck;
    const pages = deck?.pages;
    const selectedPage = pages?.find((page) => page.id === selectedPageId) || pages?.[0];
    const activePreset = resolveSocialPlatformPreset(deck?.activePlatformPresetId || project.platformPresetId) || SOCIAL_PLATFORM_DEFAULTS.xiaohongshu;
    const imagesById = useMemo(() => new Map(project.generatedImages.map((image) => [image.id, image])), [project.generatedImages]);
    const selectedImage = selectedPage?.imageId ? imagesById.get(selectedPage.imageId) : undefined;
    const generatedCount = pages?.filter((page) => Boolean(page.imageId)).length || 0;
    const approvedCount = pages?.filter((page) => page.reviewStatus === "approved").length || 0;
    const allPagesGenerated = Boolean(pages?.length && pages.every((page) => page.imageId));
    const locked = workflow.busy || workflow.exporting;

    useEffect(() => {
        if (!pages?.length) {
            setSelectedPageId("");
            return;
        }
        if (!pages.some((page) => page.id === selectedPageId)) setSelectedPageId(pages[0].id);
    }, [pages, selectedPageId]);

    if (!deck) {
        return (
            <section className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-card dark:border-stone-800">
                <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">04 · Multi-page</div>
                    <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">多页卡片</h2>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
                    <div className="w-full max-w-xl border-y border-stone-200 py-10 text-center dark:border-stone-800">
                        <WandSparkles className="mx-auto size-8 text-stone-300 dark:text-stone-600" />
                        <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-stone-100">把文章整理成连续卡片</h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500 dark:text-stone-400">按原文结构拆出 1–10 页，默认生成 6 页。拆页后可逐页编辑、选择布局，再统一生图和跨平台导出。</p>
                        <div className="mx-auto mt-6 flex max-w-xs items-center gap-3">
                            <span className="shrink-0 text-sm text-stone-500 dark:text-stone-400">目标页数</span>
                            <InputNumber className="min-w-0 flex-1" min={1} max={10} value={targetPageCount} onChange={(value) => setTargetPageCount(value || 6)} />
                            <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={!project.sourceContent.trim()} onClick={() => workflow.splitIntoPages(targetPageCount)}>
                                智能拆页
                            </Button>
                        </div>
                        {!project.sourceContent.trim() ? <p className="mt-4 text-xs text-amber-600 dark:text-amber-300">先在内容输入区粘贴文章或 Markdown。</p> : null}
                    </div>
                </div>
            </section>
        );
    }

    const pageList = <DeckPageList pages={deck.pages} selectedPageId={selectedPage?.id || ""} imagesById={imagesById} busy={locked} onSelect={setSelectedPageId} onMove={workflow.movePage} onAdd={workflow.addPage} onRemove={workflow.removePage} />;
    const preview = selectedPage ? <DeckPreview page={selectedPage} preset={activePreset} image={selectedImage} showSafeArea={showSafeArea} onShowSafeAreaChange={setShowSafeArea} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无页面" />;
    const editor = selectedPage ? (
        <DeckPageEditor
            page={selectedPage}
            deck={deck}
            config={config}
            busy={locked}
            onMissingConfig={() => openConfigDialog(false, "channels")}
            onUpdate={(patch) => workflow.updatePage(selectedPage.id, patch)}
            onDeckUpdate={workflow.updateDeck}
            onPlatformsChange={workflow.setPlatformPresetIds}
            onGenerate={() => void workflow.generatePages([selectedPage.id])}
            onReview={(approved) => workflow.setPageReview(selectedPage.id, approved)}
            onExport={() => void workflow.exportDeck([selectedPage.id], [activePreset.id])}
            onSaveAsset={() => void workflow.savePageAsset(selectedPage.id, activePreset.id)}
        />
    ) : null;

    return (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-card dark:border-stone-800">
            <div className="shrink-0 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">04–06 · Card deck</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-stone-950 dark:text-stone-100">多页卡片工作区</h2>
                            <Tag className="!m-0">{deck.pages.length} 页</Tag>
                            <Tag className="!m-0">已生成 {generatedCount}</Tag>
                            {approvedCount ? (
                                <Tag color="success" className="!m-0">
                                    已审核 {approvedCount}
                                </Tag>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {workflow.activityText ? (
                            <span className="flex items-center gap-2 text-xs text-stone-400">
                                <Spin size="small" />
                                {workflow.activityText}
                            </span>
                        ) : null}
                        {workflow.busy ? (
                            <Button icon={<Square className="size-3.5" />} onClick={workflow.cancelGeneration}>
                                取消生成
                            </Button>
                        ) : (
                            <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={!deck.pages.length || workflow.exporting} onClick={() => void workflow.generatePages()}>
                                批量生成
                            </Button>
                        )}
                        <Button icon={<FileArchive className="size-4" />} disabled={!allPagesGenerated || locked} onClick={() => void workflow.exportDeck(undefined, deck.platformPresetIds)}>
                            导出 ZIP
                        </Button>
                        <Button icon={<LayoutDashboard className="size-4" />} disabled={!generatedCount || locked} onClick={() => setInsertOpen(true)}>
                            批量插入画布
                        </Button>
                    </div>
                </div>
            </div>

            <div ref={workspaceRef} className="min-h-0 flex-1 overflow-hidden p-3">
                <div className={wide ? "grid h-full min-h-0 grid-cols-[220px_minmax(320px,1fr)_330px] gap-3" : "flex h-full min-h-0 flex-col gap-3"}>
                    <div className={wide ? "hidden" : "shrink-0"}>
                        <Segmented<MobilePane> block options={MOBILE_PANES} value={mobilePane} onChange={setMobilePane} />
                    </div>
                    <div key="pages" className={wide || mobilePane === "pages" ? "grid min-h-0 min-w-0 flex-1" : "hidden"}>
                        {pageList}
                    </div>
                    <div key="preview" className={wide || mobilePane === "preview" ? "grid min-h-0 min-w-0 flex-1" : "hidden"}>
                        {preview}
                    </div>
                    <div key="editor" className={wide || mobilePane === "edit" ? "grid min-h-0 min-w-0 flex-1" : "hidden"}>
                        {editor}
                    </div>
                </div>
            </div>

            {selectedPage ? (
                <CanvasInsertModal
                    open={insertOpen}
                    project={project}
                    deck={deck}
                    currentPage={selectedPage}
                    presetId={activePreset.id}
                    canvasHydrated={canvasHydrated}
                    transferHydrated={transferHydrated}
                    canvasProjects={canvasProjects}
                    onClose={() => setInsertOpen(false)}
                    onCreateCanvas={createCanvas}
                    onInsert={async (pageIds, canvasProjectId) => {
                        const queued = await workflow.insertPagesToCanvas(pageIds, activePreset.id, canvasProjectId);
                        if (!queued) return;
                        setInsertOpen(false);
                        navigate(`/canvas/${canvasProjectId}`);
                    }}
                />
            ) : null}
        </section>
    );
}

function DeckPageList({
    pages,
    selectedPageId,
    imagesById,
    busy,
    onSelect,
    onMove,
    onAdd,
    onRemove,
}: {
    pages: CreationCardPage[];
    selectedPageId: string;
    imagesById: Map<string, CreationGeneratedImage>;
    busy: boolean;
    onSelect: (pageId: string) => void;
    onMove: (pageId: string, direction: -1 | 1) => void;
    onAdd: (afterPageId?: string) => void;
    onRemove: (pageId: string) => void;
}) {
    return (
        <aside className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-background dark:border-stone-800">
            <div className="flex items-center justify-between border-b border-stone-200 px-3 py-3 dark:border-stone-800">
                <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">Pages</div>
                    <div className="mt-0.5 text-sm font-semibold text-stone-800 dark:text-stone-100">页面顺序</div>
                </div>
                <Button type="text" size="small" icon={<Plus className="size-3.5" />} disabled={busy || pages.length >= 10} onClick={() => onAdd(selectedPageId)}>
                    添加
                </Button>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {pages.map((page, index) => {
                    const image = page.imageId ? imagesById.get(page.imageId) : undefined;
                    const selected = page.id === selectedPageId;
                    return (
                        <article
                            key={page.id}
                            className={`rounded-lg border p-2 transition ${selected ? "border-stone-900 bg-stone-50 dark:border-stone-100 dark:bg-stone-900" : "border-stone-200 hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"}`}
                        >
                            <button type="button" className="flex w-full items-center gap-2.5 text-left" onClick={() => onSelect(page.id)}>
                                <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-stone-100 text-xs font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-300">
                                    {imageUrl(image) ? <img src={imageUrl(image)} alt="" className="size-full object-cover" /> : String(index + 1).padStart(2, "0")}
                                    {PENDING_STATUSES.has(page.status) ? (
                                        <span className="absolute inset-0 grid place-items-center bg-black/45">
                                            <Spin size="small" />
                                        </span>
                                    ) : null}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                                        {String(index + 1).padStart(2, "0")} · {page.title || "未命名页面"}
                                    </span>
                                    <span className="mt-1 block">
                                        <PageStatusTag page={page} />
                                    </span>
                                </span>
                            </button>
                            <div className="mt-2 flex items-center justify-end border-t border-stone-100 pt-1.5 dark:border-stone-800">
                                <Tooltip title="上移">
                                    <Button type="text" size="small" aria-label="上移页面" icon={<ArrowUp className="size-3.5" />} disabled={busy || index === 0} onClick={() => onMove(page.id, -1)} />
                                </Tooltip>
                                <Tooltip title="下移">
                                    <Button type="text" size="small" aria-label="下移页面" icon={<ArrowDown className="size-3.5" />} disabled={busy || index === pages.length - 1} onClick={() => onMove(page.id, 1)} />
                                </Tooltip>
                                <Popconfirm title="删除这一页？" description="页面文字和生成记录会从当前卡片组移除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => onRemove(page.id)}>
                                    <Button type="text" danger size="small" aria-label="删除页面" icon={<Trash2 className="size-3.5" />} disabled={busy || pages.length <= 1} />
                                </Popconfirm>
                            </div>
                        </article>
                    );
                })}
            </div>
        </aside>
    );
}

function DeckPreview({
    page,
    preset,
    image,
    showSafeArea,
    onShowSafeAreaChange,
}: {
    page: CreationCardPage;
    preset: NonNullable<ReturnType<typeof resolveSocialPlatformPreset>>;
    image?: CreationGeneratedImage;
    showSafeArea: boolean;
    onShowSafeAreaChange: (value: boolean) => void;
}) {
    return (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-background dark:border-stone-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">{preset.label}</div>
                    <div className="mt-0.5 text-xs text-stone-400">
                        {preset.width} × {preset.height} · {preset.aspectRatio}
                    </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <ShieldCheck className="size-3.5" />
                    安全区
                    <Switch size="small" checked={showSafeArea} onChange={onShowSafeAreaChange} />
                </label>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-auto p-4 sm:p-6">
                <div className={`mx-auto w-full ${preset.height > preset.width ? "max-w-[520px]" : "max-w-[900px]"}`}>
                    <PlatformArtboard page={page} preset={preset} imageUrl={imageUrl(image)} showSafeArea={showSafeArea} />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
                        <span>
                            页面修订 {page.revision}
                            {page.generatedRevision !== undefined && page.generatedRevision !== page.revision ? " · 内容已修改，建议重绘" : ""}
                        </span>
                        <PageStatusTag page={page} />
                    </div>
                    {page.error ? <Alert className="mt-3" type="error" showIcon title="当前页生成失败" description={page.error.message} /> : null}
                </div>
            </div>
        </section>
    );
}

function DeckPageEditor({
    page,
    deck,
    config,
    busy,
    onMissingConfig,
    onUpdate,
    onDeckUpdate,
    onPlatformsChange,
    onGenerate,
    onReview,
    onExport,
    onSaveAsset,
}: {
    page: CreationCardPage;
    deck: CreationCardDeck;
    config: ReturnType<typeof useEffectiveConfig>;
    busy: boolean;
    onMissingConfig: () => void;
    onUpdate: (patch: Partial<Pick<CreationCardPage, "title" | "body" | "layout">>) => void;
    onDeckUpdate: (patch: Partial<Pick<CreationCardDeck, "activePlatformPresetId" | "modelConfigId" | "quality" | "background">>) => void;
    onPlatformsChange: (values: string[]) => void;
    onGenerate: () => void;
    onReview: (approved: boolean) => void;
    onExport: () => void;
    onSaveAsset: () => void;
}) {
    const [title, setTitle] = useState(page.title);
    const [body, setBody] = useState(page.body);

    useEffect(() => {
        setTitle(page.title);
        setBody(page.body);
    }, [page.id, page.title, page.body]);
    const saveText = () => {
        if (title.trim() !== page.title || body.trim() !== page.body) onUpdate({ title, body });
    };

    return (
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-background dark:border-stone-800">
            <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">Inspector</div>
                <div className="mt-0.5 text-sm font-semibold text-stone-800 dark:text-stone-100">页面编辑与输出</div>
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                <EditorField label="页面标题">
                    <Input value={title} disabled={busy} maxLength={120} onChange={(event) => setTitle(event.target.value)} onBlur={saveText} />
                </EditorField>
                <EditorField label="页面正文">
                    <Input.TextArea value={body} disabled={busy} maxLength={2400} autoSize={{ minRows: 6, maxRows: 14 }} onChange={(event) => setBody(event.target.value)} onBlur={saveText} />
                    <div className="mt-1 text-right text-[11px] text-stone-400">{body.length}/2400</div>
                </EditorField>
                <EditorField label="独立布局">
                    <Segmented<CreationCardLayout> block options={LAYOUT_OPTIONS} value={page.layout} disabled={busy} onChange={(layout) => onUpdate({ layout })} />
                </EditorField>

                <div className="border-t border-stone-200 pt-5 dark:border-stone-800">
                    <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">平台与生成</div>
                    <div className="space-y-4">
                        <EditorField label="输出平台">
                            <Select mode="multiple" maxTagCount="responsive" className="w-full" value={deck.platformPresetIds} options={SOCIAL_PLATFORM_PRESET_OPTIONS} disabled={busy} onChange={onPlatformsChange} />
                        </EditorField>
                        <EditorField label="当前编辑平台">
                            <Select
                                className="w-full"
                                value={deck.activePlatformPresetId}
                                options={SOCIAL_PLATFORM_PRESET_OPTIONS.filter((option) => deck.platformPresetIds.includes(option.value))}
                                disabled={busy}
                                onChange={(activePlatformPresetId) => onDeckUpdate({ activePlatformPresetId })}
                            />
                        </EditorField>
                        <EditorField label="生图模型">
                            <div className={busy ? "pointer-events-none opacity-60" : undefined}>
                                <ModelPicker config={config} value={deck.modelConfigId || config.imageModel} capability="image" fullWidth onChange={(modelConfigId) => onDeckUpdate({ modelConfigId })} onMissingConfig={onMissingConfig} />
                            </div>
                        </EditorField>
                        <div className="grid grid-cols-2 gap-3">
                            <EditorField label="质量">
                                <Select className="w-full" value={deck.quality} options={imageQualityOptions} disabled={busy} onChange={(quality) => onDeckUpdate({ quality })} />
                            </EditorField>
                            <EditorField label="背景">
                                <Select className="w-full" value={deck.background} options={BACKGROUND_OPTIONS} disabled={busy} onChange={(background) => onDeckUpdate({ background })} />
                            </EditorField>
                        </div>
                    </div>
                </div>

                {page.generation ? (
                    <div className="rounded-lg border-l-2 border-stone-300 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
                        <div className="font-medium text-stone-700 dark:text-stone-200">生成溯源</div>
                        <div className="mt-1 break-all">模型 {page.generation.modelId || page.generation.modelConfigId}</div>
                        <div>
                            风格 {page.generation.styleId} · 修订 {page.generation.pageRevision}
                        </div>
                        {page.generation.referencePageId ? <div>参考页 {page.generation.referencePageId}</div> : null}
                    </div>
                ) : null}
            </div>

            <div className="shrink-0 space-y-2 border-t border-stone-200 p-4 dark:border-stone-800">
                <div className="grid grid-cols-2 gap-2">
                    <Button type="primary" icon={<RefreshCw className="size-3.5" />} loading={busy || PENDING_STATUSES.has(page.status)} disabled={busy} onClick={onGenerate}>
                        {page.imageId ? "单页重绘" : "生成当前页"}
                    </Button>
                    <Button icon={<Check className="size-3.5" />} disabled={busy || !page.imageId || page.reviewStatus === "approved"} onClick={() => onReview(true)}>
                        {page.reviewStatus === "approved" ? "已审核" : "审核通过"}
                    </Button>
                    <Button icon={<ShieldCheck className="size-3.5" />} disabled={busy || !page.imageId} onClick={() => onReview(false)}>
                        要求修改
                    </Button>
                    <Button icon={<Download className="size-3.5" />} disabled={busy || !page.imageId} onClick={onExport}>
                        导出当前页
                    </Button>
                </div>
                <Button block type="text" icon={<Save className="size-3.5" />} disabled={busy || !page.imageId} onClick={onSaveAsset}>
                    保存当前页到资产
                </Button>
            </div>
        </aside>
    );
}

function CanvasInsertModal({
    open,
    project,
    deck,
    currentPage,
    presetId,
    canvasHydrated,
    transferHydrated,
    canvasProjects,
    onClose,
    onCreateCanvas,
    onInsert,
}: {
    open: boolean;
    project: CreationProject;
    deck: CreationCardDeck;
    currentPage: CreationCardPage;
    presetId: string;
    canvasHydrated: boolean;
    transferHydrated: boolean;
    canvasProjects: Array<{ id: string; title: string }>;
    onClose: () => void;
    onCreateCanvas: (title?: string) => string;
    onInsert: (pageIds: string[], canvasProjectId: string) => Promise<void>;
}) {
    const [scope, setScope] = useState<InsertScope>("all");
    const [mode, setMode] = useState<"new" | "existing">("new");
    const [targetId, setTargetId] = useState<string>();
    const [submitting, setSubmitting] = useState(false);
    const preset = resolveSocialPlatformPreset(presetId) || SOCIAL_PLATFORM_DEFAULTS.xiaohongshu;
    const allReady = deck.pages.every((page) => page.imageId);
    const currentReady = Boolean(currentPage.imageId);

    useEffect(() => {
        if (!open) return;
        setScope(allReady ? "all" : "current");
        setMode("new");
        setTargetId(canvasProjects[0]?.id);
    }, [allReady, canvasProjects, open]);

    const selectedReady = scope === "all" ? allReady : currentReady;
    return (
        <Modal
            title="插入 Luffy Canvas"
            open={open}
            centered
            okText={scope === "all" ? `插入全部 ${deck.pages.length} 页` : "插入当前页"}
            cancelText="取消"
            confirmLoading={submitting}
            closable={!submitting}
            keyboard={!submitting}
            mask={{ closable: !submitting }}
            cancelButtonProps={{ disabled: submitting }}
            okButtonProps={{ disabled: !canvasHydrated || !transferHydrated || !selectedReady || (mode === "existing" && !targetId) }}
            onCancel={() => {
                if (!submitting) onClose();
            }}
            onOk={async () => {
                const canvasProjectId = mode === "new" ? onCreateCanvas(`${project.name} · ${preset.label}`) : targetId;
                if (!canvasProjectId) return;
                setSubmitting(true);
                try {
                    await onInsert(scope === "all" ? deck.pages.map((page) => page.id) : [currentPage.id], canvasProjectId);
                } finally {
                    setSubmitting(false);
                }
            }}
        >
            <div className="space-y-5 pt-2">
                <div>
                    <div className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-200">插入范围</div>
                    <Radio.Group value={scope} onChange={(event) => setScope(event.target.value)}>
                        <Radio value="current" disabled={!currentReady}>
                            当前页
                        </Radio>
                        <Radio value="all" disabled={!allReady}>
                            全部页（{deck.pages.length}）
                        </Radio>
                    </Radio.Group>
                </div>
                {!allReady ? <Alert type="warning" showIcon title="部分页面尚未生成" description="生成全部页面后才可批量插入；当前可先插入已生成的当前页。" /> : null}
                <div>
                    <div className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-200">目标画布</div>
                    <Radio.Group value={mode} onChange={(event) => setMode(event.target.value)}>
                        <Radio value="new">新建画布</Radio>
                        <Radio value="existing" disabled={!canvasProjects.length}>
                            已有画布
                        </Radio>
                    </Radio.Group>
                </div>
                {mode === "existing" ? (
                    <Select className="w-full" value={targetId} options={canvasProjects.map((canvas) => ({ value: canvas.id, label: canvas.title }))} placeholder="选择目标画布" onChange={setTargetId} />
                ) : (
                    <div className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
                        <div className="font-medium text-stone-800 dark:text-stone-100">
                            {project.name} · {preset.label}
                        </div>
                        <div className="mt-1 text-xs text-stone-400">
                            {preset.width} × {preset.height}；多页会按页码从左到右确定性排开。
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

function EditorField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-600 dark:text-stone-300">{label}</span>
            {children}
        </label>
    );
}

function PageStatusTag({ page }: { page: CreationCardPage }) {
    const status =
        page.reviewStatus === "approved"
            ? { color: "success", label: "已审核" }
            : page.reviewStatus === "changes_requested"
              ? { color: "warning", label: "待修改" }
              : page.status === "failed"
                ? { color: "error", label: "失败" }
                : page.status === "unknown"
                  ? { color: "warning", label: "待确认" }
                  : PENDING_STATUSES.has(page.status)
                    ? { color: "processing", label: "生成中" }
                    : page.imageId
                      ? { color: "default", label: "待审核" }
                      : { color: "default", label: "未生成" };
    return (
        <Tag color={status.color} variant="filled" className="!m-0 !px-1.5 text-[10px]">
            {status.label}
        </Tag>
    );
}

function imageUrl(image?: CreationGeneratedImage) {
    return image?.url || image?.dataUrl || image?.remoteUrl || "";
}

function useWideDeckWorkspace() {
    const [element, setElement] = useState<HTMLElement | null>(null);
    const [wide, setWide] = useState(false);
    useEffect(() => {
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 1040));
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);
    return { ref: setElement, wide };
}
