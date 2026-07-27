import { useState } from "react";
import { AlertTriangle, Bookmark, Check, Flag, FolderPlus, Image as ImageIcon, LayoutDashboard, Link2, PencilLine, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button, Empty, Input, Modal, Popconfirm, Select, Tag, Tooltip } from "antd";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { imageAspectOptions, imageQualityOptions } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { CreationImageIssue, CreationProject, ImageCandidate } from "@/types/creation";

type CandidatePatch = Partial<Pick<ImageCandidate, "promptVersionId" | "modelConfigId" | "size" | "quality" | "background">>;

type CandidateReviewPanelProps = {
    project: CreationProject;
    busy: boolean;
    onCandidateCountChange: (count: number) => void;
    onCandidateChange: (id: string, patch: CandidatePatch) => void;
    onGenerateAll: () => void;
    onRetryCandidate: (id: string) => void;
    onApproveCandidate: (id: string) => void;
    onUseAsReference: (id: string) => void;
    onMarkIssue: (id: string, issue: CreationImageIssue, note: string) => void;
    onSaveAsset: (id: string, asTemplate: boolean) => void;
    onEditPrompt: (id: string) => void;
    onInsert: (id: string) => void;
    onRemoveCandidate: (id: string) => void;
};

const ISSUE_OPTIONS: Array<{ value: CreationImageIssue; label: string }> = [
    { value: "text_error", label: "文字错误" },
    { value: "composition_error", label: "构图错误" },
    { value: "subject_error", label: "主体错误" },
    { value: "style_mismatch", label: "风格不符" },
    { value: "safe_area_conflict", label: "平台安全区冲突" },
    { value: "scientific_error", label: "科学错误" },
    { value: "unsupported_inference", label: "不支持的推断" },
    { value: "other", label: "其他" },
];

const BACKGROUND_OPTIONS = [
    { value: "", label: "默认背景" },
    { value: "opaque", label: "不透明" },
    { value: "transparent", label: "透明" },
];

const PENDING_STATUSES = new Set<ImageCandidate["status"]>(["queued", "generating", "downloading"]);
const IMAGE_STATUSES = new Set<ImageCandidate["status"]>(["generated", "stored", "remote_only"]);

export function CandidateReviewPanel({
    project,
    busy,
    onCandidateCountChange,
    onCandidateChange,
    onGenerateAll,
    onRetryCandidate,
    onApproveCandidate,
    onUseAsReference,
    onMarkIssue,
    onSaveAsset,
    onEditPrompt,
    onInsert,
    onRemoveCandidate,
}: CandidateReviewPanelProps) {
    const config = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [issueCandidateId, setIssueCandidateId] = useState<string | null>(null);
    const [issue, setIssue] = useState<CreationImageIssue>("composition_error");
    const [issueNote, setIssueNote] = useState("");
    const candidateCount = Math.max(2, Math.min(4, project.candidates.length || 2));
    const successCount = project.candidates.filter((candidate) => IMAGE_STATUSES.has(candidate.status) && candidate.image).length;
    const pendingCount = project.candidates.filter((candidate) => PENDING_STATUSES.has(candidate.status)).length;
    const canGenerate = project.status === "prompt_approved" || project.status === "awaiting_image_review" || project.status === "image_approved";
    const gridClass = candidateCount === 2 ? "2xl:grid-cols-2" : candidateCount === 3 ? "2xl:grid-cols-3" : "2xl:grid-cols-4";

    const openIssueModal = (candidateId: string) => {
        setIssueCandidateId(candidateId);
        setIssue("composition_error");
        setIssueNote("");
    };

    const closeIssueModal = () => {
        setIssueCandidateId(null);
        setIssueNote("");
    };

    return (
        <section className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-card dark:border-stone-800">
            <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">04 · Review</div>
                        <div className="mt-1 flex items-center gap-2">
                            <h2 className="text-base font-semibold text-stone-950 dark:text-stone-100">候选图片审核</h2>
                            {successCount ? <Tag className="!m-0">可审核 {successCount}</Tag> : null}
                            {pendingCount ? <Tag className="!m-0">生成中 {pendingCount}</Tag> : null}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center rounded-lg border border-stone-200 p-0.5 dark:border-stone-700" aria-label="候选列数">
                            {[2, 3, 4].map((count) => (
                                <button
                                    key={count}
                                    type="button"
                                    className={`h-7 min-w-8 rounded-md px-2 text-xs transition ${candidateCount === count ? "bg-stone-200 font-medium text-stone-950 dark:bg-stone-700 dark:text-stone-100" : "text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/10"}`}
                                    disabled={busy || !project.promptVersions.length}
                                    onClick={() => onCandidateCountChange(count)}
                                >
                                    {count}列
                                </button>
                            ))}
                        </div>
                        <Button type="primary" icon={<Sparkles className="size-4" />} loading={busy} disabled={!project.promptVersions.length || !canGenerate} onClick={onGenerateAll}>
                            运行全部候选
                        </Button>
                    </div>
                </div>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                {project.candidates.length ? (
                    <div className={`grid gap-4 md:grid-cols-2 ${gridClass}`}>
                        {project.candidates.map((candidate) => (
                            <CandidateCard
                                key={candidate.id}
                                candidate={candidate}
                                project={project}
                                config={config}
                                busy={busy}
                                onMissingConfig={() => openConfigDialog(false)}
                                onChange={(patch) => onCandidateChange(candidate.id, patch)}
                                onRetry={() => onRetryCandidate(candidate.id)}
                                onApprove={() => onApproveCandidate(candidate.id)}
                                onUseAsReference={() => onUseAsReference(candidate.id)}
                                onSaveAsset={(asTemplate) => onSaveAsset(candidate.id, asTemplate)}
                                onEditPrompt={() => onEditPrompt(candidate.id)}
                                onInsert={() => onInsert(candidate.id)}
                                onMarkIssue={() => openIssueModal(candidate.id)}
                                onRemove={() => onRemoveCandidate(candidate.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="选择 2–4 个候选位，审核通过提示词后开始生成" className="py-20" />
                )}
            </div>

            <Modal
                title="标记候选问题"
                open={Boolean(issueCandidateId)}
                okText="保存问题"
                cancelText="取消"
                centered
                destroyOnHidden
                onCancel={closeIssueModal}
                onOk={() => {
                    if (issueCandidateId) onMarkIssue(issueCandidateId, issue, issueNote.trim());
                    closeIssueModal();
                }}
            >
                <div className="space-y-4 pt-2">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-200">问题类型</label>
                        <Select className="w-full" value={issue} options={ISSUE_OPTIONS} onChange={setIssue} />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-stone-700 dark:text-stone-200">补充说明</label>
                        <Input.TextArea value={issueNote} autoSize={{ minRows: 4, maxRows: 8 }} maxLength={1000} placeholder="描述具体位置、错误表现或下一次生成需要修正的方向" onChange={(event) => setIssueNote(event.target.value)} />
                        <div className="mt-1 text-right text-xs text-stone-400">{issueNote.length}/1000</div>
                    </div>
                    <p className="text-xs leading-5 text-stone-400">问题会保留在候选记录中，可用于下一轮提示词迭代。</p>
                </div>
            </Modal>
        </section>
    );
}

function CandidateCard({
    candidate,
    project,
    config,
    busy,
    onMissingConfig,
    onChange,
    onRetry,
    onApprove,
    onUseAsReference,
    onSaveAsset,
    onEditPrompt,
    onInsert,
    onMarkIssue,
    onRemove,
}: {
    candidate: ImageCandidate;
    project: CreationProject;
    config: ReturnType<typeof useEffectiveConfig>;
    busy: boolean;
    onMissingConfig: () => void;
    onChange: (patch: CandidatePatch) => void;
    onRetry: () => void;
    onApprove: () => void;
    onUseAsReference: () => void;
    onSaveAsset: (asTemplate: boolean) => void;
    onEditPrompt: () => void;
    onInsert: () => void;
    onMarkIssue: () => void;
    onRemove: () => void;
}) {
    const image = candidate.image;
    const imageUrl = image?.url || image?.dataUrl || image?.remoteUrl || "";
    const hasImage = Boolean(image && imageUrl && IMAGE_STATUSES.has(candidate.status));
    const pending = PENDING_STATUSES.has(candidate.status);
    const approved = Boolean(image && project.selectedImageId === image.id);
    const usedAsReference = Boolean(image && project.referenceImageId === image.id);
    const retryDisabled = busy || pending || candidate.status === "unknown";
    const canApprove = project.status === "awaiting_image_review" || project.status === "image_approved";
    const canInsert = project.status === "image_approved" && approved;
    const promptOptions = project.promptVersions.map((version, index) => ({ value: version.id, label: version.label || `提示词版本 ${index + 1}` }));

    return (
        <article
            className={`group flex min-w-0 flex-col overflow-hidden rounded-xl border bg-background transition-colors ${approved ? "border-stone-950 ring-1 ring-stone-950 dark:border-stone-100 dark:ring-stone-100" : "border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700"}`}
        >
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-3.5 py-3 dark:border-stone-800">
                <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Candidate {String(candidate.index + 1).padStart(2, "0")}</div>
                    <div className="mt-1 truncate text-sm font-medium text-stone-800 dark:text-stone-100">{promptOptions.find((option) => option.value === candidate.promptVersionId)?.label || "未选择提示词"}</div>
                </div>
                <CandidateStatusTag status={candidate.status} approved={approved} />
            </div>

            <CandidatePreview candidate={candidate} imageUrl={imageUrl} />

            <div className="space-y-3 border-b border-stone-200 p-3.5 dark:border-stone-800">
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-stone-400">提示词版本</label>
                    <Select size="small" className="w-full" value={candidate.promptVersionId} options={promptOptions} disabled={busy} onChange={(promptVersionId) => onChange({ promptVersionId })} />
                </div>
                <div>
                    <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-stone-400">生图模型</label>
                    <div className={busy ? "pointer-events-none opacity-60" : undefined}>
                        <ModelPicker
                            config={config}
                            value={candidate.modelConfigId}
                            capability="image"
                            fullWidth
                            className="!h-8 !rounded-md !px-2.5 !text-xs !shadow-none"
                            onChange={(modelConfigId) => onChange({ modelConfigId })}
                            onMissingConfig={onMissingConfig}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <CompactField label="尺寸">
                        <Select size="small" className="w-full" value={candidate.size} options={imageAspectOptions} disabled={busy} onChange={(size) => onChange({ size })} />
                    </CompactField>
                    <CompactField label="质量">
                        <Select size="small" className="w-full" value={candidate.quality} options={imageQualityOptions} disabled={busy} onChange={(quality) => onChange({ quality })} />
                    </CompactField>
                    <CompactField label="背景" className="col-span-2">
                        <Select size="small" className="w-full" value={candidate.background} options={BACKGROUND_OPTIONS} disabled={busy} onChange={(background) => onChange({ background })} />
                    </CompactField>
                </div>
            </div>

            {candidate.feedback.length ? (
                <div className="flex flex-wrap gap-1.5 border-b border-stone-200 px-3.5 py-2.5 dark:border-stone-800">
                    {candidate.feedback.slice(-3).map((feedback) => (
                        <Tag key={feedback.id} color="warning" className="!m-0 max-w-full truncate" title={feedback.note}>
                            {issueLabel(feedback.issue)}
                        </Tag>
                    ))}
                </div>
            ) : null}

            <div className="mt-auto space-y-2.5 p-3.5">
                <div className="grid grid-cols-2 gap-2">
                    <Button size="small" type={approved ? "default" : "primary"} icon={<Check className="size-3.5" />} disabled={busy || !hasImage || approved || !canApprove} onClick={onApprove}>
                        {approved ? "已采用" : "采用"}
                    </Button>
                    <Button size="small" icon={<LayoutDashboard className="size-3.5" />} disabled={busy || !hasImage || !canInsert} onClick={onInsert}>
                        插入画布
                    </Button>
                    <Tooltip title={candidate.status === "unknown" ? "结果状态待确认，为避免重复扣费不能直接重试" : undefined}>
                        <Button size="small" block icon={<RefreshCw className="size-3.5" />} disabled={retryDisabled} onClick={onRetry}>
                            {candidate.status === "failed" ? "重试" : "重新生成"}
                        </Button>
                    </Tooltip>
                    <Button size="small" icon={<PencilLine className="size-3.5" />} disabled={busy} onClick={onEditPrompt}>
                        改提示词
                    </Button>
                    <Button size="small" icon={<Link2 className="size-3.5" />} disabled={busy || !hasImage || usedAsReference} onClick={onUseAsReference}>
                        {usedAsReference ? "已作参考" : "作为参考图"}
                    </Button>
                    <Button size="small" icon={<Flag className="size-3.5" />} disabled={busy || !hasImage} onClick={onMarkIssue}>
                        标记问题
                    </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1 border-t border-stone-100 pt-2 dark:border-stone-800">
                    <div className="flex flex-wrap">
                        <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} disabled={busy || !hasImage} onClick={() => onSaveAsset(false)}>
                            保存资产
                        </Button>
                        <Button type="text" size="small" icon={<Bookmark className="size-3.5" />} disabled={busy || !hasImage} onClick={() => onSaveAsset(true)}>
                            保存模板
                        </Button>
                    </div>
                    <Popconfirm title="删除这个候选位？" description="候选配置和问题记录会一并移除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={onRemove}>
                        <Button type="text" danger size="small" aria-label="删除候选" icon={<Trash2 className="size-3.5" />} disabled={busy || project.candidates.length <= 2} />
                    </Popconfirm>
                </div>
            </div>
        </article>
    );
}

function CandidatePreview({ candidate, imageUrl }: { candidate: ImageCandidate; imageUrl: string }) {
    if (PENDING_STATUSES.has(candidate.status)) {
        const label = candidate.status === "queued" ? "等待生成队列" : candidate.status === "downloading" ? "正在保存候选图" : "正在生成候选图";
        return <ImageGenerationPending className="!aspect-[4/3]" label={label} />;
    }

    if (candidate.status === "failed") {
        return (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-red-50 px-6 text-center dark:bg-red-950/20">
                <AlertTriangle className="size-6 text-red-500" />
                <div>
                    <div className="text-sm font-medium text-red-700 dark:text-red-300">本列生成失败</div>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-red-600/80 dark:text-red-300/70">{candidate.error?.message || "生图模型未返回可用结果"}</p>
                </div>
            </div>
        );
    }

    if (candidate.status === "unknown") {
        return (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-amber-50 px-6 text-center dark:bg-amber-950/20">
                <AlertTriangle className="size-6 text-amber-500" />
                <div>
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-200">生成结果待确认</div>
                    <p className="mt-1 text-xs leading-5 text-amber-700/80 dark:text-amber-200/70">渠道可能已消费请求，请先核对任务状态，避免直接重试造成重复扣费。</p>
                </div>
            </div>
        );
    }

    if (imageUrl && candidate.image) {
        return (
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[linear-gradient(45deg,rgba(120,113,108,0.08)_25%,transparent_25%,transparent_75%,rgba(120,113,108,0.08)_75%),linear-gradient(45deg,rgba(120,113,108,0.08)_25%,transparent_25%,transparent_75%,rgba(120,113,108,0.08)_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]">
                <img src={imageUrl} alt={`候选 ${candidate.index + 1}`} loading="lazy" className="size-full object-contain" />
                <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                    <div className="rounded-md bg-stone-950/72 px-2 py-1 text-[10px] text-white backdrop-blur-sm">{candidate.image.width && candidate.image.height ? `${candidate.image.width} × ${candidate.image.height}` : "尺寸待读取"}</div>
                    {candidate.status === "remote_only" ? <div className="rounded-md bg-amber-500/90 px-2 py-1 text-[10px] font-medium text-stone-950">仅远程 · 可能过期</div> : null}
                </div>
            </div>
        );
    }

    if (IMAGE_STATUSES.has(candidate.status)) {
        return (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-stone-50 px-6 text-center dark:bg-stone-900/60">
                <AlertTriangle className="size-6 text-amber-500" />
                <div>
                    <div className="text-sm font-medium text-stone-700 dark:text-stone-200">候选图片无法读取</div>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-stone-400">{candidate.image?.persistenceError || "本地文件可能已被清理，请重新生成该候选。"}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-stone-50 text-center dark:bg-stone-900/60">
            <div className="flex size-10 items-center justify-center rounded-full border border-stone-200 text-stone-400 dark:border-stone-700">
                <ImageIcon className="size-4" />
            </div>
            <div>
                <div className="text-sm font-medium text-stone-600 dark:text-stone-300">等待生成</div>
                <div className="mt-1 text-xs text-stone-400">为本列选择提示词与模型</div>
            </div>
        </div>
    );
}

function CandidateStatusTag({ status, approved }: { status: ImageCandidate["status"]; approved: boolean }) {
    if (approved)
        return (
            <Tag color="success" className="!m-0">
                已采用
            </Tag>
        );
    const labels: Record<ImageCandidate["status"], string> = {
        idle: "待生成",
        queued: "排队中",
        generating: "生成中",
        generated: "已生成",
        downloading: "保存中",
        stored: "已保存",
        remote_only: "仅远程",
        unknown: "待确认",
        failed: "失败",
    };
    const color =
        status === "failed"
            ? "error"
            : status === "unknown" || status === "remote_only"
              ? "warning"
              : status === "stored" || status === "generated"
                ? "success"
                : status === "queued" || status === "generating" || status === "downloading"
                  ? "processing"
                  : "default";
    return (
        <Tag color={color} className="!m-0 shrink-0">
            {labels[status]}
        </Tag>
    );
}

function CompactField({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
    return (
        <div className={className}>
            <label className="mb-1.5 block text-[11px] font-medium text-stone-500 dark:text-stone-400">{label}</label>
            {children}
        </div>
    );
}

function issueLabel(issue: CreationImageIssue) {
    return ISSUE_OPTIONS.find((option) => option.value === issue)?.label || "其他";
}
