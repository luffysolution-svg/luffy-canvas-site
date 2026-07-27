import { ArrowLeft, Clock3, FilePlus2, History, Save, X } from "lucide-react";
import { Alert, App, Button, Modal, Radio, Segmented, Select, Spin, Steps, Tag } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { BriefPromptReviewPanel } from "@/pages/creation/components/brief-prompt-review-panel";
import { CandidateReviewPanel } from "@/pages/creation/components/candidate-review-panel";
import { CardDeckPanel } from "@/pages/creation/components/card-deck-panel";
import { CreationHistoryDrawer, statusLabel } from "@/pages/creation/components/creation-history-drawer";
import { CreationSourcePanel } from "@/pages/creation/components/creation-source-panel";
import { useCreationWorkflow } from "@/pages/creation/use-creation-workflow";
import { currentStepForStatus } from "@/lib/creation/creation-machine";
import { SOCIAL_PLATFORM_DEFAULTS, resolveSocialPlatformPreset } from "@/constant/creation";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasTransferStore } from "@/stores/canvas/use-canvas-transfer-store";
import { useCreationStore } from "@/stores/use-creation-store";
import type { CreationProject } from "@/types/creation";

type MobilePane = "source" | "review" | "candidates";
type WorkspaceMode = "single" | "cards";
type EditableProjectField = "name" | "platformPresetId" | "scene" | "additionalRequirements" | "sourceContent";

const WORKFLOW_STEPS = ["内容输入", "方案分析", "提示词审核", "图片生成", "候选审核", "插入画布"].map((title) => ({ title }));
const MOBILE_PANES = [
    { label: "内容", value: "source" },
    { label: "方案与提示词", value: "review" },
    { label: "图片候选", value: "candidates" },
] satisfies Array<{ label: string; value: MobilePane }>;

export default function CreationPage() {
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const hydrated = useCreationStore((state) => state.hydrated);
    const storageError = useCreationStore((state) => state.storageError);
    const projects = useCreationStore((state) => state.projects);
    const activeProjectId = useCreationStore((state) => state.activeProjectId);
    const project = useCreationStore((state) => state.projects.find((item) => item.id === state.activeProjectId));
    const createProject = useCreationStore((state) => state.createProject);
    const setActiveProject = useCreationStore((state) => state.setActiveProject);
    const updateProject = useCreationStore((state) => state.updateProject);
    const deleteProject = useCreationStore((state) => state.deleteProject);
    const workflow = useCreationWorkflow(project);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [mobilePane, setMobilePane] = useState<MobilePane>("source");
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("single");
    const [insertCandidateId, setInsertCandidateId] = useState<string | null>(null);
    const { ref: workspaceRef, wide } = useWideWorkspace();

    useEffect(() => {
        if (hydrated && !projects.length) createProject();
    }, [createProject, hydrated, projects.length]);

    useEffect(() => {
        if (!project) return;
        const step = currentStepForStatus(project.status, project.error?.retryStatus);
        if (step <= 1) setMobilePane("source");
        else if (step <= 3) setMobilePane("review");
        else setMobilePane("candidates");
    }, [project?.id, project?.status, project?.error?.retryStatus]);

    if (!hydrated || !project) {
        return (
            <div className="flex h-full items-center justify-center bg-stone-50 dark:bg-stone-950">
                <Spin description="正在恢复创作任务" />
            </div>
        );
    }

    const currentStep = currentStepForStatus(project.status, project.error?.retryStatus) - 1;
    const updateField = (field: EditableProjectField, value: string) => {
        if (workflow.busy) return;
        updateProject(project.id, (current) => {
            const nextValue = field === "name" ? value || "未命名创作" : value;
            const invalidatesAnalysis = field !== "name" && current.briefVersions.length > 0 && current[field] !== nextValue;
            return {
                ...current,
                [field]: nextValue,
                ...(invalidatesAnalysis ? { status: "draft" as const, lastStableStatus: "draft" as const, selectedImageId: undefined, error: undefined } : {}),
            };
        });
    };

    const sourcePanel = (
        <CreationSourcePanel
            project={project}
            busy={workflow.busy}
            onChange={updateField}
            onAnalyze={() => void workflow.analyze()}
            onSaveDraft={() => {
                workflow.saveDraft();
                message.success("草稿已保存到浏览器本地");
            }}
            onCancelRequest={workflow.cancelCurrentRequest}
        />
    );
    const reviewPanel = (
        <BriefPromptReviewPanel
            project={project}
            busy={workflow.busy}
            activityText={workflow.activityText}
            onSelectBrief={workflow.selectBrief}
            onApproveBrief={workflow.approveBrief}
            onGeneratePrompts={(styles) => void workflow.generatePrompts(styles)}
            onSelectPrompt={workflow.selectPrompt}
            onSavePrompt={workflow.savePrompt}
            onRestorePrompt={workflow.restorePrompt}
            onApprovePrompt={workflow.approvePrompt}
            onBack={workflow.back}
            onIteratePrompts={(styles) => void workflow.iteratePrompts(styles)}
        />
    );
    const candidatePanel = (
        <CandidateReviewPanel
            project={project}
            busy={workflow.busy}
            onCandidateCountChange={workflow.setCandidateCount}
            onCandidateChange={workflow.updateCandidateConfig}
            onGenerateAll={() => void workflow.generateCandidates()}
            onRetryCandidate={(id) => void workflow.generateCandidates([id])}
            onApproveCandidate={workflow.approveCandidate}
            onUseAsReference={workflow.useAsReference}
            onMarkIssue={workflow.markIssue}
            onSaveAsset={(id, asTemplate) => void workflow.saveCandidateAsset(id, asTemplate)}
            onEditPrompt={(id) => {
                workflow.editCandidatePrompt(id);
                setMobilePane("review");
            }}
            onInsert={(id) => {
                void workflow.prepareCanvasInsert(id).then((ready) => {
                    if (ready) setInsertCandidateId(id);
                });
            }}
            onRemoveCandidate={workflow.removeCandidate}
        />
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <header className="shrink-0 border-b border-stone-200 bg-background px-4 py-3 dark:border-stone-800 lg:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400">Luffy editorial workflow</span>
                            <Tag variant="filled" className="!m-0 !bg-stone-100 dark:!bg-stone-800">
                                社交媒体 · Phase 1–2
                            </Tag>
                            <Tag color={project.status === "failed" ? "error" : project.status === "inserted_to_canvas" ? "success" : undefined} className="!m-0">
                                {statusLabel(project.status)}
                            </Tag>
                        </div>
                        <div className="mt-1 flex min-w-0 items-baseline gap-3">
                            <h1 className="truncate text-xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">AI 创作审核台</h1>
                            <span className="hidden truncate text-sm text-stone-400 sm:inline">{project.name}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                        <Segmented<WorkspaceMode>
                            size="small"
                            options={[
                                { label: "单图审核", value: "single" },
                                { label: "多页卡片", value: "cards" },
                            ]}
                            value={workspaceMode}
                            onChange={setWorkspaceMode}
                        />
                        <Button type="text" icon={<History className="size-4" />} onClick={() => setHistoryOpen(true)}>
                            历史
                        </Button>
                        <Button
                            type="text"
                            icon={<Save className="size-4" />}
                            onClick={() => {
                                workflow.saveDraft();
                                message.success("草稿已保存到浏览器本地");
                            }}
                        >
                            保存
                        </Button>
                        {project.status !== "draft" ? (
                            <Button type="text" icon={<ArrowLeft className="size-4" />} disabled={workflow.busy} onClick={workflow.back}>
                                回退
                            </Button>
                        ) : null}
                        <Button type="text" icon={<FilePlus2 className="size-4" />} onClick={() => createProject()}>
                            新建
                        </Button>
                        {project.status !== "inserted_to_canvas" ? (
                            <Button
                                type="text"
                                danger
                                icon={<X className="size-4" />}
                                onClick={() =>
                                    modal.confirm({ title: "取消当前任务？", content: "任务会回到草稿状态，已生成的方案、提示词和图片历史仍会保留。", okText: "取消任务", cancelText: "继续编辑", okButtonProps: { danger: true }, onOk: workflow.cancelTask })
                                }
                            >
                                取消
                            </Button>
                        ) : null}
                    </div>
                </div>

                {workspaceMode === "single" ? (
                    <>
                        <div className="mt-3 hidden border-t border-stone-100 pt-3 md:block dark:border-stone-800">
                            <Steps size="small" current={currentStep} items={WORKFLOW_STEPS} />
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-400 md:hidden dark:border-stone-800">
                            <span>
                                步骤 {currentStep + 1} / 6 · {WORKFLOW_STEPS[currentStep]?.title}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock3 className="size-3" />
                                本地自动保存
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-400 dark:border-stone-800">
                        <span>文章拆页 · 独立编辑 · 统一风格 · 多平台交付</span>
                        <span className="flex items-center gap-1">
                            <Clock3 className="size-3" />
                            本地自动保存
                        </span>
                    </div>
                )}
            </header>

            {storageError || project.error ? (
                <div className="shrink-0 px-3 pt-3">
                    <Alert type={project.error ? "error" : "warning"} showIcon closable title={project.error ? `${errorStageLabel(project.error.stage)}错误` : "本地历史恢复提醒"} description={project.error?.message || storageError} />
                </div>
            ) : null}

            <main ref={workspaceRef} className="min-h-0 flex-1 overflow-hidden p-3">
                <div className={workspaceMode === "cards" ? "grid h-full" : "hidden"}>
                    <CardDeckPanel project={project} />
                </div>
                <div className={workspaceMode === "single" ? (wide ? "grid h-full min-h-0 grid-cols-[290px_400px_minmax(0,1fr)] gap-3" : "flex h-full min-h-0 flex-col gap-3") : "hidden"}>
                    <div className={wide ? "hidden" : "flex shrink-0 justify-center"}>
                        <Segmented<MobilePane> block options={MOBILE_PANES} value={mobilePane} onChange={setMobilePane} />
                    </div>
                    <div key="source" className={wide || mobilePane === "source" ? "grid min-h-0 min-w-0 flex-1" : "hidden"}>
                        {sourcePanel}
                    </div>
                    <div key="review" className={wide || mobilePane === "review" ? "grid min-h-0 min-w-0 flex-1" : "hidden"}>
                        {reviewPanel}
                    </div>
                    <div key="candidates" className={wide || mobilePane === "candidates" ? "grid min-h-0 min-w-0 flex-1" : "hidden"}>
                        {candidatePanel}
                    </div>
                </div>
            </main>

            <CreationHistoryDrawer
                open={historyOpen}
                projects={projects}
                activeProjectId={activeProjectId}
                onClose={() => setHistoryOpen(false)}
                onCreate={() => {
                    createProject();
                    setHistoryOpen(false);
                }}
                onSelect={setActiveProject}
                onDelete={deleteProject}
            />
            <CanvasInsertModal
                candidateId={insertCandidateId}
                project={project}
                onClose={() => setInsertCandidateId(null)}
                onInsert={(candidateId, canvasProjectId) => {
                    const command = workflow.queueCanvasInsert(candidateId, canvasProjectId);
                    if (!command) return;
                    setInsertCandidateId(null);
                    navigate(`/canvas/${canvasProjectId}`);
                }}
            />
        </div>
    );
}

function CanvasInsertModal({ candidateId, project, onClose, onInsert }: { candidateId: string | null; project: CreationProject; onClose: () => void; onInsert: (candidateId: string, canvasProjectId: string) => void }) {
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const transferHydrated = useCanvasTransferStore((state) => state.hydrated);
    const canvasProjects = useCanvasStore((state) => state.projects);
    const createCanvas = useCanvasStore((state) => state.createProject);
    const [mode, setMode] = useState<"new" | "existing">("new");
    const [targetId, setTargetId] = useState<string>();
    const preset = resolveSocialPlatformPreset(project.platformPresetId) || SOCIAL_PLATFORM_DEFAULTS.xiaohongshu;

    useEffect(() => {
        if (candidateId) {
            setMode("new");
            setTargetId(canvasProjects[0]?.id);
        }
    }, [candidateId, canvasProjects]);

    return (
        <Modal
            title="插入 Luffy Canvas"
            open={Boolean(candidateId)}
            okText="确认并打开画布"
            cancelText="取消"
            centered
            onCancel={onClose}
            onOk={() => {
                if (!candidateId) return;
                const canvasProjectId = mode === "new" ? createCanvas(`${project.name} · ${preset.label}`) : targetId;
                if (canvasProjectId) onInsert(candidateId, canvasProjectId);
            }}
            okButtonProps={{ disabled: !canvasHydrated || !transferHydrated || (mode === "existing" && !targetId) }}
        >
            <div className="space-y-4 pt-2">
                <Radio.Group value={mode} onChange={(event) => setMode(event.target.value)}>
                    <Radio value="new">新建普通画布</Radio>
                    <Radio value="existing" disabled={!canvasProjects.length}>
                        插入已有画布
                    </Radio>
                </Radio.Group>
                {mode === "existing" ? (
                    <Select className="w-full" value={targetId} options={canvasProjects.map((item) => ({ value: item.id, label: item.title }))} placeholder="选择目标画布" onChange={setTargetId} />
                ) : (
                    <div className="rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-800">
                        <div className="font-medium text-stone-800 dark:text-stone-100">
                            {project.name} · {preset.label}
                        </div>
                        <div className="mt-1 text-xs text-stone-400">
                            目标规格 {preset.width} × {preset.height}（{preset.aspectRatio}）会写入节点溯源。
                        </div>
                    </div>
                )}
                <Alert type="info" showIcon title="Phase 1 插入为等比普通图片节点" description="平台画板、背景锁定和安全区覆盖层将在 Phase 2 实现，本次不会用普通节点伪装这些能力。" />
            </div>
        </Modal>
    );
}

function useWideWorkspace() {
    const [element, setElement] = useState<HTMLElement | null>(null);
    const [wide, setWide] = useState(false);
    useEffect(() => {
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 1180));
        observer.observe(element);
        return () => observer.disconnect();
    }, [element]);
    return { ref: setElement, wide };
}

function errorStageLabel(stage: NonNullable<CreationProject["error"]>["stage"]) {
    return ({ text_model: "文本模型", image_model: "生图模型", network: "网络", parse: "解析", storage: "存储", unknown: "未知" } as const)[stage];
}
