import { ArrowLeft, Check, GitCompareArrows, History, Save, Sparkles, WandSparkles } from "lucide-react";
import { App, Button, Empty, Input, Modal, Select, Spin, Tag, Tooltip } from "antd";
import { useState, type ReactNode } from "react";

import { CREATION_PROMPT_STYLE_OPTIONS, SOCIAL_PLATFORM_DEFAULTS, socialPlatformLabel } from "@/constant/creation";
import type { BriefVersion, CreationProject, CreationPromptStyle, CreativeBrief, PromptVersion, SocialPlatform } from "@/types/creation";

type BriefPromptReviewPanelProps = {
    project: CreationProject;
    busy: boolean;
    activityText: string;
    onSelectBrief: (id: string) => void;
    onApproveBrief: (brief: CreativeBrief) => void;
    onGeneratePrompts: (styles: CreationPromptStyle[]) => void;
    onSelectPrompt: (id: string) => void;
    onSavePrompt: (content: string) => void;
    onRestorePrompt: (id: string) => void;
    onApprovePrompt: (content: string) => void;
    onBack: () => void;
    onIteratePrompts: (styles: CreationPromptStyle[]) => void;
};

const SOCIAL_PROMPT_STYLE_OPTIONS = CREATION_PROMPT_STYLE_OPTIONS.filter((option) => option.value !== "scientific-mechanism" && option.value !== "scientific-workflow");
const BRIEF_APPROVED_STATES = new Set(["brief_approved", "prompts_ready", "prompt_approved", "awaiting_image_review", "image_approved", "inserted_to_canvas"]);
const PROMPT_KIND_LABELS: Record<PromptVersion["kind"], string> = {
    original: "原始",
    optimized: "优化",
    manual: "手动",
    restored: "恢复",
};

export function BriefPromptReviewPanel({ project, busy, activityText, onSelectBrief, onApproveBrief, onGeneratePrompts, onSelectPrompt, onSavePrompt, onRestorePrompt, onApprovePrompt, onBack, onIteratePrompts }: BriefPromptReviewPanelProps) {
    const selectedBriefVersion = project.briefVersions.find((version) => version.id === project.selectedBriefVersionId) || project.briefVersions.at(-1);
    const selectedPromptVersion = project.promptVersions.find((version) => version.id === project.selectedPromptVersionId) || project.promptVersions.at(-1);

    return (
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-card dark:border-stone-800">
            <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">02–03 · Review</div>
                        <h2 className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">方案与提示词审核</h2>
                    </div>
                    <Button type="text" size="small" icon={<ArrowLeft className="size-3.5" />} disabled={busy || project.status === "draft"} onClick={onBack}>
                        上一步
                    </Button>
                </div>
                {busy ? (
                    <div className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400" role="status" aria-live="polite">
                        <Spin size="small" />
                        <span>{activityText || "正在处理，请稍候…"}</span>
                    </div>
                ) : null}
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                <ReviewBlock index="02" eyebrow="Creative brief" title="结构化创作方案" description="确认内容策略和视觉约束后，才会开放提示词生成。">
                    <VersionPicker
                        value={selectedBriefVersion?.id}
                        placeholder="等待生成创作方案"
                        options={project.briefVersions.map((version, index) => ({ value: version.id, label: briefVersionLabel(version, index) }))}
                        disabled={busy}
                        onChange={onSelectBrief}
                    />

                    {selectedBriefVersion ? (
                        <BriefEditor key={selectedBriefVersion.id} version={selectedBriefVersion} busy={busy} onApprove={onApproveBrief} />
                    ) : (
                        <PanelEmpty busy={busy} busyText={activityText || "正在分析内容并组织创作方案…"} text="完成左侧内容分析后，结构化方案会出现在这里。" />
                    )}
                </ReviewBlock>

                <div className="border-t border-stone-200 dark:border-stone-800">
                    <PromptReviewSection
                        key={selectedBriefVersion?.brief.platform || project.platformPresetId}
                        project={project}
                        briefVersion={selectedBriefVersion}
                        promptVersion={selectedPromptVersion}
                        busy={busy}
                        activityText={activityText}
                        onGeneratePrompts={onGeneratePrompts}
                        onSelectPrompt={onSelectPrompt}
                        onSavePrompt={onSavePrompt}
                        onRestorePrompt={onRestorePrompt}
                        onApprovePrompt={onApprovePrompt}
                        onIteratePrompts={onIteratePrompts}
                    />
                </div>
            </div>
        </section>
    );
}

function BriefEditor({ version, busy, onApprove }: { version: BriefVersion; busy: boolean; onApprove: (brief: CreativeBrief) => void }) {
    const [draft, setDraft] = useState<CreativeBrief>(() => version.brief);
    const normalized = normalizeBrief(draft);
    const changed = JSON.stringify(normalized) !== JSON.stringify(version.brief);
    const complete = isBriefComplete(normalized);
    const updateText = (field: BriefTextField, value: string) => setDraft((current) => ({ ...current, [field]: value }));
    const updateList = (field: BriefListField, value: string[]) => setDraft((current) => ({ ...current, [field]: value }));

    return (
        <div className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-2 border-y border-stone-100 py-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
                <Tag variant="filled" className="!m-0 !bg-stone-100 dark:!bg-stone-800">
                    {socialPlatformLabel(draft.platform)}
                </Tag>
                <span>
                    {draft.width} × {draft.height}
                </span>
                <span className="text-stone-300 dark:text-stone-700">/</span>
                <span>{draft.aspectRatio}</span>
                <span className="ml-auto">{version.source === "model" ? "模型生成" : "人工修订"}</span>
                {version.approvedAt ? (
                    <Tag color="green" variant="filled" className="!m-0">
                        已批准
                    </Tag>
                ) : null}
            </div>

            <EditorGroup title="内容策略" description="这些字段决定画面要讲什么、对谁讲。">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="创作场景">
                        <Input value={draft.scene} disabled={busy} onChange={(event) => updateText("scene", event.target.value)} />
                    </Field>
                    <Field label="目标受众">
                        <Input value={draft.audience} disabled={busy} onChange={(event) => updateText("audience", event.target.value)} />
                    </Field>
                </div>
                <Field label="创作目的">
                    <Input.TextArea value={draft.purpose} disabled={busy} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => updateText("purpose", event.target.value)} />
                </Field>
                <Field label="核心信息">
                    <Input.TextArea value={draft.coreMessage} disabled={busy} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => updateText("coreMessage", event.target.value)} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="标题">
                        <Input value={draft.title} disabled={busy} onChange={(event) => updateText("title", event.target.value)} />
                    </Field>
                    <Field label="副标题" optional>
                        <Input value={draft.subtitle || ""} disabled={busy} onChange={(event) => updateText("subtitle", event.target.value)} />
                    </Field>
                </div>
            </EditorGroup>

            <EditorGroup title="视觉方案" description="描述主体、空间秩序和最终观感。">
                <Field label="视觉主体">
                    <Input.TextArea value={draft.visualSubject} disabled={busy} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => updateText("visualSubject", event.target.value)} />
                </Field>
                <Field label="构图">
                    <Input.TextArea value={draft.composition} disabled={busy} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => updateText("composition", event.target.value)} />
                </Field>
                <Field label="视觉风格">
                    <Input value={draft.visualStyle} disabled={busy} onChange={(event) => updateText("visualStyle", event.target.value)} />
                </Field>
                <TagListField label="色彩" value={draft.colorPalette} disabled={busy} placeholder="输入颜色后按回车" onChange={(value) => updateList("colorPalette", value)} />
            </EditorGroup>

            <EditorGroup title="文字与边界" description="审批后会作为不可删除硬约束附加到每个提示词版本。">
                <TagListField label="画面文字" value={draft.onImageText} disabled={busy} placeholder="输入准确文案后按回车" onChange={(value) => updateList("onImageText", value)} />
                <TagListField label="必须出现" value={draft.requiredElements} disabled={busy} placeholder="输入元素后按回车" onChange={(value) => updateList("requiredElements", value)} />
                <TagListField label="禁止出现" value={draft.forbiddenElements} disabled={busy} placeholder="输入禁用元素后按回车" onChange={(value) => updateList("forbiddenElements", value)} />
                <Field label="分析摘要" optional>
                    <Input.TextArea value={draft.analysisReasoning || ""} disabled={busy} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(event) => updateText("analysisReasoning", event.target.value)} />
                </Field>
            </EditorGroup>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                <div className="text-xs text-stone-400">{changed ? "有尚未保存的方案修改" : version.approvedAt ? "当前版本已通过审核" : "请检查全部字段后批准"}</div>
                <Button type="primary" icon={<Check className="size-4" />} disabled={busy || !complete} onClick={() => onApprove(normalized)}>
                    {version.approvedAt ? "保存修改并重新批准" : "保存并批准方案"}
                </Button>
            </div>
        </div>
    );
}

function PromptReviewSection({
    project,
    briefVersion,
    promptVersion,
    busy,
    activityText,
    onGeneratePrompts,
    onSelectPrompt,
    onSavePrompt,
    onRestorePrompt,
    onApprovePrompt,
    onIteratePrompts,
}: {
    project: CreationProject;
    briefVersion?: BriefVersion;
    promptVersion?: PromptVersion;
    busy: boolean;
    activityText: string;
    onGeneratePrompts: (styles: CreationPromptStyle[]) => void;
    onSelectPrompt: (id: string) => void;
    onSavePrompt: (content: string) => void;
    onRestorePrompt: (id: string) => void;
    onApprovePrompt: (content: string) => void;
    onIteratePrompts: (styles: CreationPromptStyle[]) => void;
}) {
    const { message } = App.useApp();
    const [styles, setStyles] = useState<CreationPromptStyle[]>(() => defaultPromptStyles(briefVersion?.brief.platform || platformFromPreset(project.platformPresetId)));
    const [compareOpen, setCompareOpen] = useState(false);
    const [compareLeftId, setCompareLeftId] = useState("");
    const [compareRightId, setCompareRightId] = useState("");
    const briefApproved = Boolean(briefVersion?.approvedAt && briefVersion.id === project.selectedBriefVersionId && BRIEF_APPROVED_STATES.has(project.status));
    const styleSelectionReady = styles.length === 3;

    const toggleStyle = (style: CreationPromptStyle) => {
        setStyles((current) => {
            if (current.includes(style)) return current.filter((item) => item !== style);
            if (current.length >= 3) {
                message.warning("每轮最多选择 3 种提示词风格");
                return current;
            }
            return [...current, style];
        });
    };

    const openCompare = () => {
        const selectedId = promptVersion?.id || project.promptVersions.at(-1)?.id || "";
        const otherId = project.promptVersions.find((version) => version.id !== selectedId)?.id || selectedId;
        setCompareLeftId(otherId);
        setCompareRightId(selectedId);
        setCompareOpen(true);
    };

    return (
        <ReviewBlock index="03" eyebrow="Prompt review" title="提示词版本" description="选择三种优化方向，人工修订后再批准生图。">
            <StyleSelector styles={styles} onToggle={toggleStyle} />

            {project.promptVersions.length ? (
                <div className="mt-4 space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <VersionPicker
                            value={promptVersion?.id}
                            placeholder="选择提示词版本"
                            options={project.promptVersions.map((version, index) => ({ value: version.id, label: promptVersionLabel(version, index) }))}
                            disabled={busy}
                            onChange={onSelectPrompt}
                        />
                        <div className="flex shrink-0 gap-2">
                            <Tooltip title={project.promptVersions.length < 2 ? "至少需要两个版本" : "并排比较两个提示词版本"}>
                                <Button icon={<GitCompareArrows className="size-3.5" />} disabled={project.promptVersions.length < 2} onClick={openCompare}>
                                    对比
                                </Button>
                            </Tooltip>
                            <Button icon={<History className="size-3.5" />} disabled={busy || !promptVersion} onClick={() => promptVersion && onRestorePrompt(promptVersion.id)}>
                                恢复旧版
                            </Button>
                        </div>
                    </div>

                    {promptVersion ? (
                        <PromptEditor key={promptVersion.id} version={promptVersion} busy={busy} onSave={onSavePrompt} onApprove={onApprovePrompt} />
                    ) : (
                        <PanelEmpty busy={busy} busyText={activityText || "正在生成提示词版本…"} text="请选择一个提示词版本继续审核。" compact />
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                        <span className="text-xs text-stone-400">每次迭代都会保留当前和更早的版本。</span>
                        <Button icon={<WandSparkles className="size-4" />} loading={busy} disabled={busy || !styleSelectionReady || !briefApproved} onClick={() => onIteratePrompts(styles)}>
                            继续迭代 3 个版本
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="mt-4">
                    {busy ? (
                        <PanelEmpty busy busyText={activityText || "正在生成三个提示词版本…"} text="" />
                    ) : (
                        <div className="flex min-h-44 flex-col items-center justify-center border-y border-stone-100 px-5 py-8 text-center dark:border-stone-800">
                            <Sparkles className="mb-3 size-7 text-stone-300 dark:text-stone-600" />
                            <div className="text-sm font-medium text-stone-700 dark:text-stone-200">{briefApproved ? "准备生成提示词版本" : "等待方案批准"}</div>
                            <p className="mt-2 max-w-sm text-xs leading-5 text-stone-400">{briefApproved ? "系统会按所选三种风格生成独立版本，硬约束由应用统一附加。" : "先保存并批准上方创作方案，系统不会绕过人工审核直接生图。"}</p>
                            <Button className="mt-5" type="primary" icon={<Sparkles className="size-4" />} disabled={!briefApproved || !styleSelectionReady} onClick={() => onGeneratePrompts(styles)}>
                                生成 3 个提示词版本
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <PromptCompareModal open={compareOpen} versions={project.promptVersions} leftId={compareLeftId} rightId={compareRightId} onLeftChange={setCompareLeftId} onRightChange={setCompareRightId} onClose={() => setCompareOpen(false)} />
        </ReviewBlock>
    );
}

function PromptEditor({ version, busy, onSave, onApprove }: { version: PromptVersion; busy: boolean; onSave: (content: string) => void; onApprove: (content: string) => void }) {
    const [content, setContent] = useState(version.content);
    const trimmed = content.trim();
    const changed = trimmed !== version.content.trim();

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
                <Tag variant="filled" className="!m-0 !bg-stone-100 dark:!bg-stone-800">
                    {styleLabel(version.style)}
                </Tag>
                <Tag variant="filled" className="!m-0 !bg-transparent !p-0">
                    {PROMPT_KIND_LABELS[version.kind]}版本
                </Tag>
                <span>{formatDate(version.createdAt)}</span>
            </div>
            <Input.TextArea value={content} disabled={busy} autoSize={{ minRows: 12, maxRows: 24 }} onChange={(event) => setContent(event.target.value)} placeholder="编辑最终用于生图的提示词" />
            <div className="rounded-lg border-l-2 border-stone-300 bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
                <span className="font-medium text-stone-700 dark:text-stone-200">优化说明：</span>
                {version.reasoning}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-stone-400">{changed ? "编辑尚未保存" : "当前内容与此版本一致"}</span>
                <div className="flex gap-2">
                    <Button icon={<Save className="size-3.5" />} disabled={busy || !trimmed || !changed} onClick={() => onSave(trimmed)}>
                        保存为新版本
                    </Button>
                    <Button type="primary" icon={<Check className="size-3.5" />} disabled={busy || !trimmed} onClick={() => onApprove(trimmed)}>
                        批准并进入生图
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PromptCompareModal({
    open,
    versions,
    leftId,
    rightId,
    onLeftChange,
    onRightChange,
    onClose,
}: {
    open: boolean;
    versions: PromptVersion[];
    leftId: string;
    rightId: string;
    onLeftChange: (id: string) => void;
    onRightChange: (id: string) => void;
    onClose: () => void;
}) {
    const left = versions.find((version) => version.id === leftId);
    const right = versions.find((version) => version.id === rightId);
    const options = versions.map((version, index) => ({ value: version.id, label: promptVersionLabel(version, index) }));

    return (
        <Modal title="提示词版本对比" open={open} width={1040} destroyOnHidden footer={<Button onClick={onClose}>关闭</Button>} onCancel={onClose}>
            <div className="grid gap-4 pt-2 md:grid-cols-2">
                <ComparisonColumn label="版本 A" version={left} value={leftId} options={options.map((option) => ({ ...option, disabled: option.value === rightId }))} onChange={onLeftChange} />
                <ComparisonColumn label="版本 B" version={right} value={rightId} options={options.map((option) => ({ ...option, disabled: option.value === leftId }))} onChange={onRightChange} />
            </div>
        </Modal>
    );
}

function ComparisonColumn({ label, version, value, options, onChange }: { label: string; version?: PromptVersion; value: string; options: Array<{ value: string; label: string; disabled?: boolean }>; onChange: (id: string) => void }) {
    return (
        <div className="min-w-0 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{label}</span>
                {version ? (
                    <Tag variant="filled" className="!m-0 !bg-stone-100 dark:!bg-stone-800">
                        {styleLabel(version.style)}
                    </Tag>
                ) : null}
            </div>
            <Select className="w-full" value={value || undefined} options={options} onChange={onChange} />
            {version ? (
                <>
                    <div className="thin-scrollbar mt-4 max-h-[420px] min-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-3 text-sm leading-6 text-stone-700 dark:bg-stone-900 dark:text-stone-200">{version.content}</div>
                    <p className="mt-3 text-xs leading-5 text-stone-400">{version.reasoning}</p>
                </>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择版本" className="py-16" />
            )}
        </div>
    );
}

function StyleSelector({ styles, onToggle }: { styles: CreationPromptStyle[]; onToggle: (style: CreationPromptStyle) => void }) {
    return (
        <div className="mt-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-300">本轮优化风格</span>
                <span className="text-xs tabular-nums text-stone-400">{styles.length} / 3</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {SOCIAL_PROMPT_STYLE_OPTIONS.map((option) => {
                    const selected = styles.includes(option.value);
                    return (
                        <Tag.CheckableTag key={option.value} checked={selected} className={`prompt-filter-tag ${selected ? "is-active" : ""}`} onChange={() => onToggle(option.value)}>
                            {option.label}
                        </Tag.CheckableTag>
                    );
                })}
            </div>
        </div>
    );
}

function ReviewBlock({ index, eyebrow, title, description, children }: { index: string; eyebrow: string; title: string; description: string; children: ReactNode }) {
    return (
        <section className="p-4">
            <div className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                <div className="pt-0.5 font-mono text-xs text-stone-300 dark:text-stone-700">{index}</div>
                <div className="min-w-0">
                    <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone-400">{eyebrow}</div>
                    <h3 className="mt-1 text-base font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
                    <p className="mt-1 text-xs leading-5 text-stone-400">{description}</p>
                    {children}
                </div>
            </div>
        </section>
    );
}

function VersionPicker({ value, placeholder, options, disabled = false, onChange }: { value?: string; placeholder: string; options: Array<{ value: string; label: string }>; disabled?: boolean; onChange: (id: string) => void }) {
    return (
        <div className="mt-4 flex min-w-0 items-center gap-2">
            <History className="size-3.5 shrink-0 text-stone-400" />
            <Select className="min-w-0 flex-1" value={value} placeholder={placeholder} options={options} disabled={disabled || !options.length} onChange={onChange} />
            <Tag variant="filled" className="!m-0 shrink-0 !bg-transparent !p-0 text-xs text-stone-400">
                {options.length} 版
            </Tag>
        </div>
    );
}

function EditorGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
    return (
        <div className="space-y-3">
            <div>
                <div className="text-sm font-semibold text-stone-800 dark:text-stone-100">{title}</div>
                <p className="mt-0.5 text-xs text-stone-400">{description}</p>
            </div>
            {children}
        </div>
    );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
    return (
        <label className="block min-w-0">
            <span className="mb-1.5 block text-xs font-medium text-stone-600 dark:text-stone-300">
                {label}
                {optional ? <span className="ml-1 font-normal text-stone-400">可选</span> : null}
            </span>
            {children}
        </label>
    );
}

function TagListField({ label, value, disabled, placeholder, onChange }: { label: string; value: string[]; disabled: boolean; placeholder: string; onChange: (value: string[]) => void }) {
    return (
        <Field label={label} optional>
            <Select mode="tags" className="w-full" value={value} disabled={disabled} tokenSeparators={[",", "，", "\n"]} options={value.map((item) => ({ value: item, label: item }))} placeholder={placeholder} onChange={onChange} />
        </Field>
    );
}

function PanelEmpty({ busy, busyText, text, compact = false }: { busy: boolean; busyText: string; text: string; compact?: boolean }) {
    return (
        <div className={`mt-4 flex flex-col items-center justify-center border-y border-stone-100 px-4 text-center dark:border-stone-800 ${compact ? "min-h-36 py-6" : "min-h-52 py-8"}`}>
            {busy ? (
                <>
                    <Spin />
                    <div className="mt-3 text-sm text-stone-500 dark:text-stone-400">{busyText}</div>
                </>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-xs text-stone-400">{text}</span>} />
            )}
        </div>
    );
}

type BriefTextField = "scene" | "purpose" | "audience" | "coreMessage" | "title" | "subtitle" | "visualSubject" | "composition" | "visualStyle" | "analysisReasoning";
type BriefListField = "colorPalette" | "onImageText" | "requiredElements" | "forbiddenElements";

function normalizeBrief(brief: CreativeBrief): CreativeBrief {
    return {
        ...brief,
        scene: brief.scene.trim(),
        purpose: brief.purpose.trim(),
        audience: brief.audience.trim(),
        coreMessage: brief.coreMessage.trim(),
        title: brief.title.trim(),
        subtitle: brief.subtitle?.trim() || undefined,
        visualSubject: brief.visualSubject.trim(),
        composition: brief.composition.trim(),
        visualStyle: brief.visualStyle.trim(),
        colorPalette: uniqueStrings(brief.colorPalette),
        onImageText: uniqueStrings(brief.onImageText),
        requiredElements: uniqueStrings(brief.requiredElements),
        forbiddenElements: uniqueStrings(brief.forbiddenElements),
        analysisReasoning: brief.analysisReasoning?.trim() || undefined,
    };
}

function isBriefComplete(brief: CreativeBrief) {
    return Boolean(brief.scene && brief.purpose && brief.audience && brief.coreMessage && brief.title && brief.visualSubject && brief.composition && brief.visualStyle && brief.colorPalette.length);
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function briefVersionLabel(version: BriefVersion, index: number) {
    return `方案 ${String(index + 1).padStart(2, "0")} · ${version.source === "model" ? "模型" : "人工"} · ${formatDate(version.createdAt)}`;
}

function promptVersionLabel(version: PromptVersion, index: number) {
    return `V${String(index + 1).padStart(2, "0")} · ${PROMPT_KIND_LABELS[version.kind]} · ${styleLabel(version.style)}`;
}

function styleLabel(style: CreationPromptStyle) {
    return CREATION_PROMPT_STYLE_OPTIONS.find((option) => option.value === style)?.label || style;
}

function defaultPromptStyles(platform: SocialPlatform): CreationPromptStyle[] {
    const platformStyle: Record<SocialPlatform, CreationPromptStyle> = {
        wechat: "wechat-cover",
        xiaohongshu: "xiaohongshu-knowledge-card",
        x: "social-media-cover",
        bilibili: "bilibili-cover",
        douyin: "douyin-vertical-cover",
    };
    return ["general-natural-language", "chinese-image-model", platformStyle[platform]];
}

function platformFromPreset(value: string): SocialPlatform {
    return value in SOCIAL_PLATFORM_DEFAULTS ? (value as SocialPlatform) : "xiaohongshu";
}

function formatDate(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
