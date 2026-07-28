import { Copy, ExternalLink, History, RotateCcw, Settings, Sparkles, StopCircle, Trash2, WandSparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button, Divider, Input, Modal, Popconfirm, Select, Tag, Tooltip, Typography } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { useCopyText } from "@/hooks/use-copy-text";
import { useImagePromptOptimizer, type PromptOptimizerStatus } from "@/hooks/use-image-prompt-optimizer";
import { IMAGE_PROMPT_OPTIMIZATION_MODES, type ImagePromptOptimizationMode } from "@/services/api/prompt-optimizer";

type ImagePromptOptimizerDialogProps = {
    open: boolean;
    initialPrompt: string;
    onClose: () => void;
    onApply: (prompt: string) => void;
};

export function ImagePromptOptimizerDialog({ open, initialPrompt, onClose, onApply }: ImagePromptOptimizerDialogProps) {
    const optimizer = useImagePromptOptimizer();
    const copyText = useCopyText();
    const {
        config,
        textModel,
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

    const versionOptions = useMemo(
        () =>
            versions.map((item, index) => ({
                value: item.id,
                label: `版本 ${versions.length - index} · ${modeLabel(item.mode)} · ${formatVersionTime(item.createdAt)}`,
            })),
        [versions],
    );

    useEffect(() => {
        if (open) reset(initialPrompt);
    }, [initialPrompt, open, reset]);

    const closeDialog = () => {
        cancelOptimization(false);
        onClose();
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <WandSparkles className="size-5" />
                    <span>提示词优化器</span>
                    <Tag className="m-0">生图</Tag>
                </div>
            }
            open={open}
            onCancel={closeDialog}
            footer={null}
            width={1120}
            centered
            destroyOnHidden
        >
            <div data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <div className="mb-4 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 dark:border-stone-800 dark:bg-stone-900 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <ModelPicker config={config} value={textModel} onChange={selectTextModel} capability="text" fullWidth placeholder="选择文本模型" onMissingConfig={openModelConfig} />
                    <Button size="small" icon={<Settings className="size-3.5" />} onClick={openModelConfig}>
                        模型配置
                    </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className="font-semibold">原始提示词</h3>
                            <Typography.Text type="secondary" className="text-xs">
                                {originalPrompt.length} 字符
                            </Typography.Text>
                        </div>
                        <Input.TextArea value={originalPrompt} onChange={(event) => setOriginalPrompt(event.target.value)} autoSize={{ minRows: 8, maxRows: 16 }} placeholder="输入需要优化的生图提示词" disabled={running} showCount />

                        <div className="mt-4">
                            <div className="mb-2 font-semibold">优化模式</div>
                            <Select
                                className="w-full"
                                value={mode}
                                options={IMAGE_PROMPT_OPTIMIZATION_MODES.map((item) => ({ value: item.value, label: item.label }))}
                                onChange={(value) => setMode(value as ImagePromptOptimizationMode)}
                                disabled={running}
                            />
                            <div className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{selectedMode.description}</div>
                        </div>

                        <div className="mt-4">
                            <div className="mb-2 font-semibold">附加约束</div>
                            <Input.TextArea value={requirements} onChange={(event) => setRequirements(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} placeholder="例如：保留标题原文、主体居中、深色背景、不要出现人物" disabled={running} />
                        </div>

                        {running ? (
                            <Button className="mt-4" danger size="large" block icon={<StopCircle className="size-4" />} onClick={() => cancelOptimization()}>
                                取消优化
                            </Button>
                        ) : (
                            <Button className="mt-4" type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!originalPrompt.trim() || !textModel} onClick={() => void runOptimization(false)}>
                                开始优化
                            </Button>
                        )}
                    </section>

                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold">优化结果</h3>
                                <StatusTag status={status} hasResult={Boolean(optimizedPrompt.trim())} />
                            </div>
                            <div className="flex min-w-0 flex-1 justify-end gap-1 sm:flex-none">
                                <Select
                                    className="min-w-0 flex-1 sm:w-64"
                                    value={selectedVersionId}
                                    options={versionOptions}
                                    placeholder={historyHydrated ? "历史版本" : "正在读取历史…"}
                                    suffixIcon={<History className="size-3.5" />}
                                    onChange={(id) => {
                                        const version = versions.find((item) => item.id === id);
                                        if (version) selectVersion(version);
                                    }}
                                    disabled={!historyHydrated || !versions.length || running}
                                />
                                <Popconfirm title="删除当前历史版本？" okText="删除" cancelText="取消" onConfirm={() => selectedVersionId && deleteVersion(selectedVersionId)} disabled={!selectedVersionId || running}>
                                    <Tooltip title="删除当前版本">
                                        <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedVersionId || running} aria-label="删除当前历史版本" />
                                    </Tooltip>
                                </Popconfirm>
                                <Popconfirm title="清空全部优化历史？" okText="清空" cancelText="取消" onConfirm={clearHistory} disabled={!versions.length || running}>
                                    <Tooltip title="清空全部历史">
                                        <Button size="small" icon={<Trash2 className="size-3.5" />} disabled={!versions.length || running} aria-label="清空全部优化历史" />
                                    </Tooltip>
                                </Popconfirm>
                            </div>
                        </div>

                        <Input.TextArea
                            value={optimizedPrompt}
                            onChange={(event) => setOptimizedPrompt(event.target.value)}
                            autoSize={{ minRows: 14, maxRows: 22 }}
                            placeholder={running ? "正在流式生成优化结果…" : "优化结果将在这里显示，可继续手动修改"}
                            disabled={running}
                        />
                        {error ? <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Button icon={<Copy className="size-4" />} disabled={!optimizedPrompt.trim() || running} onClick={() => copyText(optimizedPrompt.trim(), "优化结果已复制")}>
                                复制结果
                            </Button>
                            <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={!optimizedPrompt.trim() || running} onClick={() => onApply(optimizedPrompt.trim())}>
                                应用到生图提示词
                            </Button>
                        </div>

                        <Divider className="!my-4" />
                        <div className="mb-2 flex items-center gap-2 font-semibold">
                            <RotateCcw className="size-4" />
                            继续优化
                        </div>
                        <Input.TextArea value={feedback} onChange={(event) => setFeedback(event.target.value)} autoSize={{ minRows: 3, maxRows: 6 }} placeholder="例如：主体更突出、减少背景元素、保留更多留白" disabled={running} />
                        <Button className="mt-3" block icon={<RotateCcw className="size-4" />} disabled={!optimizedPrompt.trim() || !feedback.trim() || running} onClick={() => void runOptimization(true)}>
                            根据反馈继续优化
                        </Button>
                    </section>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <span>历史保存在当前浏览器；请求使用 Luffy Canvas 已配置的文本模型。</span>
                    <Typography.Link href="https://github.com/linshenkx/prompt-optimizer" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1">
                        产品结构参考 Prompt Optimizer
                        <ExternalLink className="size-3" />
                    </Typography.Link>
                </div>
            </div>
        </Modal>
    );
}

function StatusTag({ status, hasResult }: { status: PromptOptimizerStatus; hasResult: boolean }) {
    if (status === "running") return <Tag className="m-0">正在优化</Tag>;
    if (status === "error")
        return (
            <Tag color="red" className="m-0">
                失败
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
