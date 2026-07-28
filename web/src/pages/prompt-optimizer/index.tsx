import { Copy, ExternalLink, History, RotateCcw, Search, Settings, Sparkles, StopCircle, Trash2, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { App, Button, Empty, Input, Popconfirm, Select, Spin, Tag, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";

import { ModelPicker } from "@/components/model-picker";
import { PromptGardenLinks } from "@/components/prompts/prompt-garden-links";
import { useCopyText } from "@/hooks/use-copy-text";
import { useImagePromptOptimizer, type PromptOptimizerStatus } from "@/hooks/use-image-prompt-optimizer";
import { IMAGE_PROMPT_OPTIMIZATION_MODES, type ImagePromptOptimizationMode } from "@/services/api/prompt-optimizer";
import { stageImagePrompt } from "@/services/prompt-optimizer-transfer";
import type { PromptOptimizationVersion } from "@/stores/use-prompt-optimizer-store";

export default function PromptOptimizerPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const copyText = useCopyText();
    const optimizer = useImagePromptOptimizer();
    const {
        config,
        textModel,
        textModels,
        selectTextModel,
        openModelConfig,
        originalPrompt,
        setOriginalPrompt,
        optimizedPrompt,
        setOptimizedPrompt,
        mode,
        setMode,
        selectedMode,
        requirements,
        setRequirements,
        feedback,
        setFeedback,
        versions,
        historyHydrated,
        selectedVersionId,
        status,
        running,
        error,
        runOptimization,
        cancelOptimization,
        reset,
        selectVersion,
        deleteVersion,
        clearHistory,
    } = optimizer;
    const [historyKeyword, setHistoryKeyword] = useState("");

    const filteredVersions = useMemo(() => {
        const keyword = historyKeyword.trim().toLowerCase();
        if (!keyword) return versions;
        return versions.filter((item) => [item.sourcePrompt, item.optimizedPrompt, item.requirements, modeLabel(item.mode)].join(" ").toLowerCase().includes(keyword));
    }, [historyKeyword, versions]);

    const applyToImageWorkbench = () => {
        const value = optimizedPrompt.trim();
        if (!value) return;
        if (!stageImagePrompt(value)) {
            message.error("无法暂存提示词，请先复制结果");
            return;
        }
        navigate("/image");
    };

    return (
        <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <header className="shrink-0 border-b border-stone-200 bg-background px-4 py-3 dark:border-stone-800 sm:px-5 sm:py-4">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <WandSparkles className="size-6" />
                            <h1 className="text-xl font-semibold sm:text-2xl">提示词优化器</h1>
                            <Tag className="m-0">生图</Tag>
                        </div>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">从原始构想到可直接生图的提示词，并保留每次迭代版本。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button icon={<RotateCcw className="size-4" />} onClick={() => reset()} disabled={running}>
                            新建会话
                        </Button>
                        <Button icon={<Settings className="size-4" />} onClick={openModelConfig}>
                            模型配置
                        </Button>
                        <Button className="hidden sm:inline-flex" icon={<ExternalLink className="size-4" />} href="https://github.com/linshenkx/prompt-optimizer" target="_blank" rel="noopener noreferrer">
                            参考项目
                        </Button>
                    </div>
                </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto p-3 @min-[880px]:overflow-hidden">
                <div className="mx-auto grid min-h-full max-w-[1600px] gap-3 @min-[880px]:h-full @min-[880px]:grid-cols-[270px_minmax(0,1fr)_minmax(0,1fr)]">
                    <aside className="flex max-h-[440px] min-h-[360px] flex-col rounded-xl border border-stone-200 bg-background p-3 shadow-sm dark:border-stone-800 @min-[880px]:max-h-none @min-[880px]:min-h-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-semibold">
                                <History className="size-4" />
                                优化历史
                            </div>
                            <Tag className="m-0">{versions.length}</Tag>
                        </div>
                        <Input className="mt-3" size="small" prefix={<Search className="size-3.5 text-stone-400" />} value={historyKeyword} onChange={(event) => setHistoryKeyword(event.target.value)} placeholder="搜索原文、结果或约束" allowClear />
                        <div className="thin-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                            {!historyHydrated ? (
                                <div className="flex h-28 items-center justify-center">
                                    <Spin size="small" />
                                </div>
                            ) : null}
                            {historyHydrated
                                ? filteredVersions.map((version) => (
                                      <HistoryVersionItem
                                          key={version.id}
                                          version={version}
                                          versionNumber={versions.length - versions.findIndex((item) => item.id === version.id)}
                                          selected={selectedVersionId === version.id}
                                          disabled={running}
                                          onSelect={() => selectVersion(version)}
                                          onDelete={() => deleteVersion(version.id)}
                                      />
                                  ))
                                : null}
                            {historyHydrated && !filteredVersions.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={versions.length ? "没有匹配的历史版本" : "暂无优化历史"} className="py-8" /> : null}
                        </div>
                        <Popconfirm title="清空全部优化历史？" okText="清空" cancelText="取消" onConfirm={clearHistory} disabled={!versions.length || running}>
                            <Button className="mt-3" size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!versions.length || running} block>
                                清空历史
                            </Button>
                        </Popconfirm>
                        <div className="mt-3">
                            <PromptGardenLinks compact stacked />
                        </div>
                    </aside>

                    <section className="flex min-h-[520px] flex-col rounded-xl border border-stone-200 bg-background p-4 shadow-sm dark:border-stone-800 @min-[880px]:min-h-0 @min-[880px]:overflow-y-auto">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">原始提示词</h2>
                                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">先写清核心意图，再选择文本模型和优化模式。</p>
                            </div>
                            <Tag className="m-0">{originalPrompt.length} 字符</Tag>
                        </div>

                        <Input.TextArea
                            className="mt-4"
                            value={originalPrompt}
                            onChange={(event) => setOriginalPrompt(event.target.value)}
                            onKeyDown={(event) => {
                                if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !running) void runOptimization(false);
                            }}
                            autoSize={{ minRows: 12, maxRows: 22 }}
                            placeholder="输入主体、场景、风格、构图、光线、准确文字和禁止项。Ctrl/⌘ + Enter 开始优化。"
                            disabled={running}
                            showCount
                        />

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <label className="block min-w-0">
                                <span className="mb-2 block text-sm font-semibold">文本模型</span>
                                <ModelPicker config={config} value={textModel} onChange={selectTextModel} capability="text" fullWidth placeholder="选择文本模型" onMissingConfig={openModelConfig} />
                                {!textModels.length ? <span className="mt-1.5 block text-xs text-amber-600 dark:text-amber-400">尚未配置具备文本能力的模型</span> : null}
                            </label>
                            <label className="block min-w-0">
                                <span className="mb-2 block text-sm font-semibold">优化模式</span>
                                <Select
                                    className="w-full"
                                    value={mode}
                                    options={IMAGE_PROMPT_OPTIMIZATION_MODES.map((item) => ({ value: item.value, label: item.label }))}
                                    onChange={(value) => setMode(value as ImagePromptOptimizationMode)}
                                    disabled={running}
                                />
                            </label>
                        </div>
                        <div className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500 dark:bg-stone-900 dark:text-stone-400">{selectedMode.description}</div>

                        <div className="mt-4">
                            <div className="mb-2 text-sm font-semibold">附加约束</div>
                            <Input.TextArea
                                value={requirements}
                                onChange={(event) => setRequirements(event.target.value)}
                                autoSize={{ minRows: 4, maxRows: 8 }}
                                placeholder="例如：保留标题原文；16:9 横版；主体居中；深色背景；不要出现人物和水印。"
                                disabled={running}
                            />
                        </div>

                        <div className="mt-auto pt-5">
                            {running ? (
                                <Button danger size="large" block icon={<StopCircle className="size-4" />} onClick={() => cancelOptimization()}>
                                    取消优化
                                </Button>
                            ) : (
                                <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!originalPrompt.trim() || !textModel} onClick={() => void runOptimization(false)}>
                                    开始优化
                                </Button>
                            )}
                        </div>
                    </section>

                    <section className="flex min-h-[560px] flex-col rounded-xl border border-stone-200 bg-background p-4 shadow-sm dark:border-stone-800 @min-[880px]:min-h-0 @min-[880px]:overflow-y-auto">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">优化结果</h2>
                                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">完成后可手动修改、复制、继续优化或发送到生图工作台。</p>
                            </div>
                            <StatusTag status={status} hasResult={Boolean(optimizedPrompt.trim())} />
                        </div>

                        <Input.TextArea
                            className="mt-4"
                            value={optimizedPrompt}
                            onChange={(event) => setOptimizedPrompt(event.target.value)}
                            autoSize={{ minRows: 15, maxRows: 25 }}
                            placeholder={running ? "正在流式生成优化结果…" : "优化后的提示词将在这里显示，可继续手动编辑。"}
                            disabled={running}
                        />
                        {error ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-950 dark:bg-red-950/20 dark:text-red-300">{error}</div> : null}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Button icon={<Copy className="size-4" />} disabled={!optimizedPrompt.trim() || running} onClick={() => copyText(optimizedPrompt.trim(), "优化结果已复制")}>
                                复制结果
                            </Button>
                            <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={!optimizedPrompt.trim() || running} onClick={applyToImageWorkbench}>
                                应用到生图工作台
                            </Button>
                        </div>

                        <div className="my-5 border-t border-stone-200 dark:border-stone-800" />
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <RotateCcw className="size-4" />
                            继续优化
                        </div>
                        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">基于当前结果追加反馈，新结果会作为独立历史版本保存。</p>
                        <Input.TextArea
                            className="mt-3"
                            value={feedback}
                            onChange={(event) => setFeedback(event.target.value)}
                            onKeyDown={(event) => {
                                if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !running) void runOptimization(true);
                            }}
                            autoSize={{ minRows: 4, maxRows: 8 }}
                            placeholder="例如：减少形容词；强化电影感；增加标题留白；保持人物外观不变。"
                            disabled={running}
                        />
                        <Button className="mt-3" icon={<RotateCcw className="size-4" />} disabled={!optimizedPrompt.trim() || !feedback.trim() || running} onClick={() => void runOptimization(true)} block>
                            根据反馈继续优化
                        </Button>
                    </section>
                </div>
            </main>
        </div>
    );
}

function HistoryVersionItem({ version, versionNumber, selected, disabled, onSelect, onDelete }: { version: PromptOptimizationVersion; versionNumber: number; selected: boolean; disabled: boolean; onSelect: () => void; onDelete: () => void }) {
    return (
        <div className={`group flex items-start rounded-lg border transition ${selected ? "border-stone-900 bg-stone-100 dark:border-stone-100 dark:bg-stone-900" : "border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}>
            <button type="button" className="min-w-0 flex-1 p-2.5 text-left" onClick={onSelect} disabled={disabled}>
                <span className="block truncate text-sm font-medium">{version.sourcePrompt || "未命名提示词"}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
                    <span>版本 {versionNumber}</span>
                    <span>·</span>
                    <span>{modeLabel(version.mode)}</span>
                </span>
                <span className="mt-1 block text-[11px] text-stone-400">{formatVersionTime(version.createdAt)}</span>
            </button>
            <Popconfirm title="删除这个历史版本？" okText="删除" cancelText="取消" onConfirm={onDelete} disabled={disabled}>
                <Tooltip title="删除版本">
                    <Button
                        className="mr-1 mt-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                        type="text"
                        size="small"
                        danger
                        icon={<Trash2 className="size-3.5" />}
                        disabled={disabled}
                        aria-label={`删除版本 ${versionNumber}`}
                    />
                </Tooltip>
            </Popconfirm>
        </div>
    );
}

function StatusTag({ status, hasResult }: { status: PromptOptimizerStatus; hasResult: boolean }) {
    if (status === "running") return <Tag className="m-0">正在优化</Tag>;
    if (status === "error")
        return (
            <Tag color="red" className="m-0">
                优化失败
            </Tag>
        );
    if (status === "cancelled") return <Tag className="m-0">已取消</Tag>;
    if (status === "success" || hasResult)
        return (
            <Tag color="green" className="m-0">
                可用
            </Tag>
        );
    return <Tag className="m-0">等待输入</Tag>;
}

function modeLabel(mode: ImagePromptOptimizationMode) {
    return IMAGE_PROMPT_OPTIMIZATION_MODES.find((item) => item.value === mode)?.label || "通用增强";
}

function formatVersionTime(timestamp: number) {
    return new Date(timestamp).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
