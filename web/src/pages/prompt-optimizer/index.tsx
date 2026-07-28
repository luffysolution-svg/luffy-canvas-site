import {
    Copy,
    ExternalLink,
    History,
    RotateCcw,
    Search,
    Settings,
    Sparkles,
    Trash2,
    WandSparkles,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { App, Button, Empty, Input, Popconfirm, Select, Tag, Tooltip } from "antd";
import { nanoid } from "nanoid";

import { ModelPicker } from "@/components/model-picker";
import { PromptGardenLinks } from "@/components/prompts/prompt-garden-links";
import {
    IMAGE_PROMPT_OPTIMIZATION_MODES,
    optimizeImagePrompt,
    type ImagePromptOptimizationMode,
} from "@/services/api/prompt-optimizer";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";

const HISTORY_STORAGE_KEY = "luffy-canvas:image-prompt-optimizer-history";
const PENDING_IMAGE_PROMPT_KEY = "luffy-canvas:pending-image-prompt";
const HISTORY_LIMIT = 20;

type PromptOptimizationVersion = {
    id: string;
    prompt: string;
    sourcePrompt: string;
    mode: ImagePromptOptimizationMode;
    createdAt: number;
};

export default function PromptOptimizerPage() {
    const { message } = App.useApp();
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    const [originalPrompt, setOriginalPrompt] = useState("");
    const [optimizedPrompt, setOptimizedPrompt] = useState("");
    const [mode, setMode] = useState<ImagePromptOptimizationMode>("general");
    const [requirements, setRequirements] = useState("");
    const [feedback, setFeedback] = useState("");
    const [historyKeyword, setHistoryKeyword] = useState("");
    const [versions, setVersions] = useState<PromptOptimizationVersion[]>(readHistory);
    const [selectedVersionId, setSelectedVersionId] = useState<string>();
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const abortControllerRef = useRef<AbortController | null>(null);

    const textModel = effectiveConfig.textModel.trim();
    const selectedMode = IMAGE_PROMPT_OPTIMIZATION_MODES.find((item) => item.value === mode) || IMAGE_PROMPT_OPTIMIZATION_MODES[0];
    const filteredVersions = useMemo(() => {
        const keyword = historyKeyword.trim().toLowerCase();
        if (!keyword) return versions;
        return versions.filter((item) => [item.sourcePrompt, item.prompt, modeLabel(item.mode)].join(" ").toLowerCase().includes(keyword));
    }, [historyKeyword, versions]);

    const runOptimization = async (iterate: boolean) => {
        if (!originalPrompt.trim()) {
            message.warning("请输入需要优化的提示词");
            return;
        }
        if (iterate && !optimizedPrompt.trim()) {
            message.warning("请先生成一个优化版本");
            return;
        }
        if (iterate && !feedback.trim()) {
            message.warning("请填写本轮改进要求");
            return;
        }
        if (!textModel || !isAiConfigReady(effectiveConfig, textModel)) {
            message.warning("请先配置可用的文本模型");
            openConfigDialog(true, "channels");
            return;
        }

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setRunning(true);
        setError("");
        if (!iterate) setOptimizedPrompt("");

        try {
            const result = await optimizeImagePrompt({
                config: effectiveConfig,
                prompt: originalPrompt,
                mode,
                requirements,
                previousPrompt: iterate ? optimizedPrompt : undefined,
                feedback: iterate ? feedback : undefined,
                signal: controller.signal,
                onDelta: setOptimizedPrompt,
            });
            setOptimizedPrompt(result);
            setFeedback("");
            const version: PromptOptimizationVersion = {
                id: nanoid(),
                prompt: result,
                sourcePrompt: originalPrompt,
                mode,
                createdAt: Date.now(),
            };
            setVersions((current) => {
                const next = [version, ...current].slice(0, HISTORY_LIMIT);
                writeHistory(next);
                return next;
            });
            setSelectedVersionId(version.id);
            message.success(iterate ? "已生成新的优化版本" : "提示词优化完成");
        } catch (requestError) {
            if (controller.signal.aborted) return;
            const requestMessage = requestError instanceof Error ? requestError.message : "提示词优化失败";
            setError(requestMessage);
            message.error(requestMessage);
        } finally {
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
                setRunning(false);
            }
        }
    };

    const selectVersion = (version: PromptOptimizationVersion) => {
        setSelectedVersionId(version.id);
        setOriginalPrompt(version.sourcePrompt);
        setOptimizedPrompt(version.prompt);
        setMode(version.mode);
        setFeedback("");
        setError("");
    };

    const deleteVersion = (id: string) => {
        setVersions((current) => {
            const next = current.filter((item) => item.id !== id);
            writeHistory(next);
            return next;
        });
        if (selectedVersionId === id) setSelectedVersionId(undefined);
    };

    const clearHistory = () => {
        setVersions([]);
        setSelectedVersionId(undefined);
        writeHistory([]);
        message.success("优化历史已清空");
    };

    const newSession = () => {
        abortControllerRef.current?.abort();
        setOriginalPrompt("");
        setOptimizedPrompt("");
        setRequirements("");
        setFeedback("");
        setSelectedVersionId(undefined);
        setError("");
        setRunning(false);
    };

    const copyResult = async () => {
        if (!optimizedPrompt.trim()) return;
        try {
            await navigator.clipboard.writeText(optimizedPrompt.trim());
            message.success("优化结果已复制");
        } catch {
            message.error("复制失败，请手动复制");
        }
    };

    const applyToImageWorkbench = () => {
        const value = optimizedPrompt.trim();
        if (!value) return;
        try {
            sessionStorage.setItem(PENDING_IMAGE_PROMPT_KEY, value);
        } catch {
            message.error("无法暂存提示词，请先复制结果");
            return;
        }
        window.location.assign("/image");
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <header className="shrink-0 border-b border-stone-200 bg-background px-5 py-4 dark:border-stone-800">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <WandSparkles className="size-6" />
                            <h1 className="text-2xl font-semibold">提示词优化器</h1>
                            <Tag className="m-0">生图</Tag>
                        </div>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">参考 Prompt Optimizer 的双栏工作流：优化、迭代、版本管理并回填生图工作台。</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button icon={<RotateCcw className="size-4" />} onClick={newSession} disabled={running}>
                            新建会话
                        </Button>
                        <Button icon={<Settings className="size-4" />} onClick={() => openConfigDialog(false, "channels")}>
                            模型配置
                        </Button>
                        <Button
                            icon={<ExternalLink className="size-4" />}
                            href="https://github.com/linshenkx/prompt-optimizer"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            参考项目
                        </Button>
                    </div>
                </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:overflow-hidden">
                <div className="mx-auto grid min-h-full max-w-[1600px] gap-3 lg:h-full lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]">
                    <aside className="flex min-h-[360px] flex-col rounded-xl border border-stone-200 bg-background p-3 shadow-sm dark:border-stone-800 lg:min-h-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-semibold">
                                <History className="size-4" />
                                优化历史
                            </div>
                            <Tag className="m-0">{versions.length}</Tag>
                        </div>
                        <Input
                            className="mt-3"
                            size="small"
                            prefix={<Search className="size-3.5 text-stone-400" />}
                            value={historyKeyword}
                            onChange={(event) => setHistoryKeyword(event.target.value)}
                            placeholder="搜索历史"
                            allowClear
                        />
                        <div className="thin-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                            {filteredVersions.map((version, index) => (
                                <button
                                    key={version.id}
                                    type="button"
                                    className={`group w-full rounded-lg border p-2.5 text-left transition ${
                                        selectedVersionId === version.id
                                            ? "border-stone-900 bg-stone-100 dark:border-stone-100 dark:bg-stone-900"
                                            : "border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"
                                    }`}
                                    onClick={() => selectVersion(version)}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium">{version.sourcePrompt || "未命名提示词"}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400">
                                                <span>版本 {versions.length - index}</span>
                                                <span>·</span>
                                                <span>{modeLabel(version.mode)}</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-stone-400">{formatVersionTime(version.createdAt)}</div>
                                        </div>
                                        <Tooltip title="删除版本">
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                className="hidden rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-red-500 group-hover:block dark:hover:bg-stone-800"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    deleteVersion(version.id);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        deleteVersion(version.id);
                                                    }
                                                }}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </span>
                                        </Tooltip>
                                    </div>
                                </button>
                            ))}
                            {!filteredVersions.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={versions.length ? "没有匹配的历史版本" : "暂无优化历史"} className="py-8" /> : null}
                        </div>
                        <Popconfirm title="清空全部优化历史？" okText="清空" cancelText="取消" onConfirm={clearHistory}>
                            <Button className="mt-3" size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!versions.length || running} block>
                                清空历史
                            </Button>
                        </Popconfirm>
                        <div className="mt-3">
                            <PromptGardenLinks compact />
                        </div>
                    </aside>

                    <section className="flex min-h-[520px] flex-col rounded-xl border border-stone-200 bg-background p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">原始提示词</h2>
                                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">先描述核心意图，再选择模型和优化模板。</p>
                            </div>
                            <Tag className="m-0">{originalPrompt.length} 字符</Tag>
                        </div>

                        <Input.TextArea
                            className="mt-4"
                            value={originalPrompt}
                            onChange={(event) => setOriginalPrompt(event.target.value)}
                            autoSize={{ minRows: 12, maxRows: 22 }}
                            placeholder="输入需要优化的生图提示词，例如主体、场景、风格、构图、光线、文字和禁止项。"
                            disabled={running}
                            showCount
                        />

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <label className="block min-w-0">
                                <span className="mb-2 block text-sm font-semibold">文本模型</span>
                                <ModelPicker
                                    config={effectiveConfig}
                                    value={config.textModel}
                                    onChange={(value) => updateConfig("textModel", value)}
                                    capability="text"
                                    fullWidth
                                    onMissingConfig={() => openConfigDialog(false, "channels")}
                                />
                            </label>
                            <label className="block min-w-0">
                                <span className="mb-2 block text-sm font-semibold">优化模板</span>
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
                            <Button
                                type="primary"
                                size="large"
                                block
                                icon={<Sparkles className="size-4" />}
                                loading={running}
                                disabled={!originalPrompt.trim() || running}
                                onClick={() => void runOptimization(false)}
                            >
                                开始优化
                            </Button>
                        </div>
                    </section>

                    <section className="flex min-h-[560px] flex-col rounded-xl border border-stone-200 bg-background p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold">优化结果</h2>
                                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">结果支持手动修改、复制、继续优化和发送到生图工作台。</p>
                            </div>
                            {running ? <Tag className="m-0">正在优化</Tag> : optimizedPrompt ? <Tag color="green" className="m-0">可用</Tag> : <Tag className="m-0">等待输入</Tag>}
                        </div>

                        <Input.TextArea
                            className="mt-4"
                            value={optimizedPrompt}
                            onChange={(event) => setOptimizedPrompt(event.target.value)}
                            autoSize={{ minRows: 15, maxRows: 25 }}
                            placeholder={running ? "正在生成优化结果…" : "优化后的提示词将在这里显示，可继续手动编辑。"}
                        />
                        {error ? <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-950 dark:bg-red-950/20 dark:text-red-300">{error}</div> : null}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Button icon={<Copy className="size-4" />} disabled={!optimizedPrompt.trim()} onClick={() => void copyResult()}>
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
                        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">根据当前结果追加反馈，生成新版本并保留历史记录。</p>
                        <Input.TextArea
                            className="mt-3"
                            value={feedback}
                            onChange={(event) => setFeedback(event.target.value)}
                            autoSize={{ minRows: 4, maxRows: 8 }}
                            placeholder="例如：减少形容词；强化电影感；增加标题留白；保持人物外观不变。"
                            disabled={running}
                        />
                        <Button
                            className="mt-3"
                            icon={<RotateCcw className="size-4" />}
                            loading={running}
                            disabled={!optimizedPrompt.trim() || !feedback.trim() || running}
                            onClick={() => void runOptimization(true)}
                            block
                        >
                            根据反馈继续优化
                        </Button>
                    </section>
                </div>
            </main>
        </div>
    );
}

function readHistory(): PromptOptimizationVersion[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]") as PromptOptimizationVersion[];
        return Array.isArray(parsed)
            ? parsed
                  .filter((item) => item && typeof item.id === "string" && typeof item.prompt === "string" && typeof item.sourcePrompt === "string")
                  .slice(0, HISTORY_LIMIT)
            : [];
    } catch {
        return [];
    }
}

function writeHistory(versions: PromptOptimizationVersion[]) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(versions.slice(0, HISTORY_LIMIT)));
    } catch {
        // Local history is optional; optimization must still work when storage is unavailable.
    }
}

function modeLabel(mode: ImagePromptOptimizationMode) {
    return IMAGE_PROMPT_OPTIMIZATION_MODES.find((item) => item.value === mode)?.label || "通用增强";
}

function formatVersionTime(timestamp: number) {
    return new Date(timestamp).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
