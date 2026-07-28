import { Copy, ExternalLink, History, RotateCcw, Settings, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Divider, Input, Modal, Select, Tag, Tooltip, Typography } from "antd";
import { nanoid } from "nanoid";

import { modelOptionLabel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import {
    IMAGE_PROMPT_OPTIMIZATION_MODES,
    optimizeImagePrompt,
    type ImagePromptOptimizationMode,
} from "@/services/api/prompt-optimizer";

const BUTTON_HOST_ATTRIBUTE = "data-luffy-prompt-optimizer-host";
const HISTORY_STORAGE_KEY = "luffy-canvas:image-prompt-optimizer-history";
const HISTORY_LIMIT = 20;

type PromptOptimizationVersion = {
    id: string;
    prompt: string;
    sourcePrompt: string;
    mode: ImagePromptOptimizationMode;
    createdAt: number;
};

type ImagePromptOptimizerDialogProps = {
    open: boolean;
    initialPrompt: string;
    onClose: () => void;
    onApply: (prompt: string) => void;
};

export function ImagePromptOptimizerBridge() {
    const { message } = App.useApp();
    const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [initialPrompt, setInitialPrompt] = useState("");
    const hostRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const ensureHost = () => {
            if (!isImageWorkbenchRoute()) {
                hostRef.current?.remove();
                hostRef.current = null;
                setPortalHost(null);
                setDialogOpen(false);
                return;
            }
            if (hostRef.current?.isConnected) return;

            const toolbar = findPromptToolbar();
            if (!toolbar) return;
            const existing = toolbar.querySelector<HTMLElement>(`[${BUTTON_HOST_ATTRIBUTE}]`);
            if (existing) {
                hostRef.current = existing;
                setPortalHost(existing);
                return;
            }

            const host = document.createElement("span");
            host.setAttribute(BUTTON_HOST_ATTRIBUTE, "");
            host.style.display = "contents";
            toolbar.appendChild(host);
            hostRef.current = host;
            setPortalHost(host);
        };

        const observer = new MutationObserver(ensureHost);
        observer.observe(document.body, { childList: true, subtree: true });
        ensureHost();

        return () => {
            observer.disconnect();
            hostRef.current?.remove();
            hostRef.current = null;
        };
    }, []);

    const openOptimizer = () => {
        const input = findImagePromptTextarea();
        setInitialPrompt(input?.value || "");
        setDialogOpen(true);
    };

    const applyPrompt = (value: string) => {
        const input = findImagePromptTextarea();
        if (!input) {
            message.error("未找到生图提示词输入框");
            return;
        }
        setNativeTextAreaValue(input, value);
        input.focus();
        setDialogOpen(false);
        message.success("已应用优化后的提示词");
    };

    return (
        <>
            {portalHost
                ? createPortal(
                      <Button size="small" icon={<WandSparkles className="size-3.5" />} onClick={openOptimizer}>
                          提示词优化器
                      </Button>,
                      portalHost,
                  )
                : null}
            <ImagePromptOptimizerDialog open={dialogOpen} initialPrompt={initialPrompt} onClose={() => setDialogOpen(false)} onApply={applyPrompt} />
        </>
    );
}

function ImagePromptOptimizerDialog({ open, initialPrompt, onClose, onApply }: ImagePromptOptimizerDialogProps) {
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [originalPrompt, setOriginalPrompt] = useState("");
    const [optimizedPrompt, setOptimizedPrompt] = useState("");
    const [mode, setMode] = useState<ImagePromptOptimizationMode>("general");
    const [requirements, setRequirements] = useState("");
    const [feedback, setFeedback] = useState("");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [versions, setVersions] = useState<PromptOptimizationVersion[]>(readHistory);
    const [selectedVersionId, setSelectedVersionId] = useState<string>();
    const abortControllerRef = useRef<AbortController | null>(null);

    const textModel = effectiveConfig.textModel.trim();
    const selectedMode = IMAGE_PROMPT_OPTIMIZATION_MODES.find((item) => item.value === mode) || IMAGE_PROMPT_OPTIMIZATION_MODES[0];
    const versionOptions = useMemo(
        () =>
            versions.map((item, index) => ({
                value: item.id,
                label: `版本 ${versions.length - index} · ${modeLabel(item.mode)} · ${formatVersionTime(item.createdAt)}`,
            })),
        [versions],
    );

    useEffect(() => {
        if (!open) return;
        setOriginalPrompt(initialPrompt);
        setOptimizedPrompt("");
        setFeedback("");
        setError("");
        setSelectedVersionId(undefined);
    }, [initialPrompt, open]);

    useEffect(() => () => abortControllerRef.current?.abort(), []);

    const closeDialog = () => {
        abortControllerRef.current?.abort();
        onClose();
    };

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
            openConfigDialog(true);
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

    const copyResult = async () => {
        if (!optimizedPrompt.trim()) return;
        try {
            await navigator.clipboard.writeText(optimizedPrompt);
            message.success("优化结果已复制");
        } catch {
            message.error("复制失败，请手动复制");
        }
    };

    const selectVersion = (id?: string) => {
        setSelectedVersionId(id);
        if (!id) return;
        const version = versions.find((item) => item.id === id);
        if (!version) return;
        setOptimizedPrompt(version.prompt);
        setOriginalPrompt(version.sourcePrompt);
        setMode(version.mode);
        setError("");
    };

    const clearHistory = () => {
        setVersions([]);
        setSelectedVersionId(undefined);
        try {
            localStorage.removeItem(HISTORY_STORAGE_KEY);
        } catch {
            // Local history is optional.
        }
        message.success("优化历史已清空");
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
        >
            <div data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="shrink-0 text-stone-500 dark:text-stone-400">文本模型</span>
                        <Tag className="m-0 max-w-[360px] truncate">{textModel ? modelOptionLabel(effectiveConfig, textModel) : "未配置"}</Tag>
                    </div>
                    <Button size="small" icon={<Settings className="size-3.5" />} onClick={() => openConfigDialog(false)}>
                        配置模型
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
                        <Input.TextArea
                            value={originalPrompt}
                            onChange={(event) => setOriginalPrompt(event.target.value)}
                            autoSize={{ minRows: 8, maxRows: 16 }}
                            placeholder="输入需要优化的生图提示词"
                            disabled={running}
                            showCount
                        />

                        <div className="mt-4">
                            <div className="mb-2 font-semibold">优化模板</div>
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
                            <div className="mb-2 font-semibold">附加要求</div>
                            <Input.TextArea
                                value={requirements}
                                onChange={(event) => setRequirements(event.target.value)}
                                autoSize={{ minRows: 3, maxRows: 6 }}
                                placeholder="例如：保留标题原文、主体居中、深色背景、不要出现人物"
                                disabled={running}
                            />
                        </div>

                        <Button
                            className="mt-4"
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
                    </section>

                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold">优化结果</h3>
                            <div className="flex items-center gap-2">
                                <Select
                                    className="min-w-56"
                                    value={selectedVersionId}
                                    options={versionOptions}
                                    placeholder="历史版本"
                                    suffixIcon={<History className="size-3.5" />}
                                    onChange={selectVersion}
                                    allowClear
                                />
                                <Tooltip title="清空本地优化历史">
                                    <Button size="small" icon={<Trash2 className="size-3.5" />} disabled={!versions.length || running} onClick={clearHistory} />
                                </Tooltip>
                            </div>
                        </div>

                        <Input.TextArea
                            value={optimizedPrompt}
                            onChange={(event) => setOptimizedPrompt(event.target.value)}
                            autoSize={{ minRows: 14, maxRows: 22 }}
                            placeholder={running ? "正在生成优化结果…" : "优化结果将在这里显示，可继续手动修改"}
                        />
                        {error ? <div className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <Button icon={<Copy className="size-4" />} disabled={!optimizedPrompt.trim()} onClick={() => void copyResult()}>
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
                        <Input.TextArea
                            value={feedback}
                            onChange={(event) => setFeedback(event.target.value)}
                            autoSize={{ minRows: 3, maxRows: 6 }}
                            placeholder="指出本轮需要改进的方向，例如：主体更突出、减少背景元素、保留更多留白"
                            disabled={running}
                        />
                        <Button className="mt-3" block loading={running} disabled={!optimizedPrompt.trim() || !feedback.trim() || running} onClick={() => void runOptimization(true)}>
                            生成新版本
                        </Button>
                    </section>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <span>优化记录仅保存在当前浏览器；模型调用使用 Luffy Canvas 已配置的文本模型。</span>
                    <Typography.Link href="https://github.com/linshenkx/prompt-optimizer" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                        功能设计参考 Prompt Optimizer（AGPL-3.0）
                        <ExternalLink className="size-3" />
                    </Typography.Link>
                </div>
            </div>
        </Modal>
    );
}

function isImageWorkbenchRoute() {
    return window.location.pathname.replace(/\/+$/, "").endsWith("/image");
}

function findPromptToolbar() {
    const libraryButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "查看提示词库");
    return libraryButton?.parentElement || null;
}

function findImagePromptTextarea() {
    return document.querySelector<HTMLTextAreaElement>('textarea[placeholder="描述画面主体、风格、构图、光线和用途"]');
}

function setNativeTextAreaValue(input: HTMLTextAreaElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function readHistory(): PromptOptimizationVersion[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]") as PromptOptimizationVersion[];
        return Array.isArray(parsed)
            ? parsed
                  .filter((item) => item && typeof item.id === "string" && typeof item.prompt === "string" && typeof item.sourcePrompt === "string" && IMAGE_PROMPT_OPTIMIZATION_MODES.some((mode) => mode.value === item.mode))
                  .slice(0, HISTORY_LIMIT)
            : [];
    } catch {
        return [];
    }
}

function writeHistory(versions: PromptOptimizationVersion[]) {
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(versions));
    } catch {
        // Local history is optional; optimization remains usable when storage is unavailable.
    }
}

function modeLabel(mode: ImagePromptOptimizationMode) {
    return IMAGE_PROMPT_OPTIMIZATION_MODES.find((item) => item.value === mode)?.label || mode;
}

function formatVersionTime(timestamp: number) {
    return new Date(timestamp).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
