import { Alert, Button, Collapse, Input, Tag } from "antd";
import { Copy, RefreshCcw, RotateCcw, TextCursorInput } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import type { CompiledPrompt } from "../types";

export function FinalPromptPreview({
    compiled,
    value,
    manualOverride,
    onChange,
    onRestore,
    onRecompile,
    onReplaceOriginal,
    compact = false,
}: {
    compiled: CompiledPrompt;
    value: string;
    manualOverride: boolean;
    onChange: (value: string) => void;
    onRestore: () => void;
    onRecompile: () => void;
    onReplaceOriginal: (value: string) => void;
    compact?: boolean;
}) {
    const copyText = useCopyText();
    return (
        <div className={`min-w-0 ${compact ? "" : "rounded-lg border border-stone-200 bg-card p-3 dark:border-stone-800"}`}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2 font-medium">
                        最终提示词
                        {manualOverride ? (
                            <Tag color="gold" className="m-0">
                                已锁定
                            </Tag>
                        ) : (
                            <Tag className="m-0">系统编译</Tag>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        {compiled.resolvedSize} · {compiled.resolvedAspectRatio} · {compiled.resolvedQuality}
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                    <Button type="text" size="small" icon={<RefreshCcw className="size-3.5" />} onClick={onRecompile}>
                        重新编译
                    </Button>
                    <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} disabled={!manualOverride} onClick={onRestore}>
                        恢复系统版
                    </Button>
                </div>
            </div>

            <Collapse
                ghost
                size="small"
                className="-mx-2 mb-2"
                items={[
                    {
                        key: "sections",
                        label: "查看编译分段",
                        children: (
                            <div className="space-y-2">
                                {compiled.promptSections.map((section) => (
                                    <div key={section.id} className="rounded-md bg-stone-50 px-2.5 py-2 text-xs leading-5 dark:bg-stone-900/60">
                                        <div className="mb-0.5 font-medium">{section.label}</div>
                                        <div className="whitespace-pre-wrap text-stone-600 dark:text-stone-300">{section.content}</div>
                                    </div>
                                ))}
                            </div>
                        ),
                    },
                ]}
            />

            <Input.TextArea value={value} autoSize={{ minRows: compact ? 8 : 12, maxRows: compact ? 18 : 28 }} aria-label="最终组合提示词" onChange={(event) => onChange(event.target.value)} />

            <div className="mt-2 flex flex-wrap justify-between gap-2">
                <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                    <span>映射：</span>
                    <span>{compiled.providerMapping.note}</span>
                </div>
                <div className="flex gap-1">
                    <Button type="text" size="small" icon={<TextCursorInput className="size-3.5" />} onClick={() => onReplaceOriginal(value)}>
                        替换原始提示词
                    </Button>
                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(value, "最终提示词已复制")}>
                        复制
                    </Button>
                </div>
            </div>

            {compiled.warnings.length ? <Alert className="mt-3" type={compiled.providerMapping.requiresConfirmation ? "warning" : "info"} showIcon title="兼容提示" description={compiled.warnings.join("；")} /> : null}
        </div>
    );
}
