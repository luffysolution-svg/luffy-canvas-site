import { Button, Collapse, Input, Select, Tag } from "antd";
import { ArrowDown, ArrowUp, Plus, RefreshCcw, RotateCcw, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";

import type { StructuredPlan, StructuredPlanItem, StructuredPlanItemKind } from "../types";
import { reorderPlanItems } from "../planning/text-planning";
import { ARTICLE_TYPE_OPTIONS } from "../registry/article-illustrator";

const kindOptions: Array<{ value: StructuredPlanItemKind; label: string }> = [
    { value: "cover", label: "封面卡" },
    { value: "content", label: "内容卡" },
    { value: "summary", label: "总结卡" },
    { value: "illustration", label: "文章插图" },
    { value: "panel", label: "分镜" },
    { value: "page", label: "页面" },
    { value: "section", label: "信息模块" },
];
const illustrationTypeOptions = ARTICLE_TYPE_OPTIONS.filter((option) => !["auto", "custom"].includes(option.id)).map((option) => ({ value: option.id, label: option.nameZh }));

export function SeriesPlanEditor({
    plan,
    onChange,
    onRegenerateItem,
    onRetryFailed,
    disabled,
}: {
    plan: StructuredPlan;
    onChange: (plan: StructuredPlan) => void;
    onRegenerateItem?: (item: StructuredPlanItem) => void;
    onRetryFailed?: () => void;
    disabled?: boolean;
}) {
    const updateItem = (id: string, patch: Partial<StructuredPlanItem>) =>
        onChange({
            ...plan,
            items: plan.items.map((item) =>
                item.id === id
                    ? {
                          ...item,
                          ...patch,
                          ...("finalPrompt" in patch ? {} : { finalPrompt: undefined }),
                          status: "idle",
                          error: undefined,
                      }
                    : item,
            ),
        });
    const updatePlanRules = (patch: Partial<Pick<StructuredPlan, "summary" | "visualBible" | "learningGoals">>) =>
        onChange({
            ...plan,
            ...patch,
            items: plan.items.map((item) => ({ ...item, finalPrompt: undefined, status: "idle", error: undefined })),
        });
    const failed = plan.items.filter((item) => item.status === "failed").length;
    return (
        <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="font-medium">{plan.type === "storyboard" ? "分镜计划" : plan.type === "article" ? "文章插图计划" : plan.type === "infographic" ? "结构化内容" : "系列计划"}</div>
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{plan.summary}</div>
                </div>
                <div className="flex gap-1">
                    {failed && onRetryFailed ? (
                        <Button type="text" size="small" icon={<RotateCcw className="size-3.5" />} disabled={disabled} onClick={onRetryFailed}>
                            仅重试失败 {failed}
                        </Button>
                    ) : null}
                    <Button
                        type="text"
                        size="small"
                        icon={<Plus className="size-3.5" />}
                        disabled={disabled || plan.items.length >= (plan.type === "storyboard" ? 40 : 10)}
                        onClick={() =>
                            onChange({
                                ...plan,
                                items: [
                                    ...plan.items,
                                    {
                                        id: nanoid(),
                                        order: plan.items.length,
                                        kind: plan.type === "storyboard" ? "panel" : plan.type === "article" ? "illustration" : "content",
                                        title: `新增${plan.type === "storyboard" ? "分镜" : "项目"} ${plan.items.length + 1}`,
                                        body: "",
                                        ...(plan.type === "article" ? { illustrationType: "conceptual" } : {}),
                                    },
                                ],
                            })
                        }
                    >
                        新增
                    </Button>
                </div>
            </div>

            <Collapse
                ghost
                size="small"
                className="-mx-2 mb-3"
                items={[
                    {
                        key: "plan-bible",
                        label: plan.type === "storyboard" ? "故事梗概、角色与场景视觉圣经" : "计划摘要与系列视觉圣经",
                        children: (
                            <div className="grid gap-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs text-stone-500">计划摘要</span>
                                    <Input.TextArea value={plan.summary} autoSize={{ minRows: 2, maxRows: 5 }} disabled={disabled} onChange={(event) => updatePlanRules({ summary: event.target.value })} />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs text-stone-500">视觉圣经</span>
                                    <Input.TextArea value={plan.visualBible} autoSize={{ minRows: 2, maxRows: 7 }} disabled={disabled} onChange={(event) => updatePlanRules({ visualBible: event.target.value })} />
                                </label>
                                {plan.type === "infographic" ? (
                                    <label className="block">
                                        <span className="mb-1 block text-xs text-stone-500">学习 / 传播目标（每行一项）</span>
                                        <Input.TextArea
                                            value={(plan.learningGoals || []).join("\n")}
                                            autoSize={{ minRows: 2, maxRows: 5 }}
                                            disabled={disabled}
                                            onChange={(event) =>
                                                updatePlanRules({
                                                    learningGoals: event.target.value
                                                        .split(/\r?\n/)
                                                        .map((value) => value.trim())
                                                        .filter(Boolean)
                                                        .slice(0, 3),
                                                })
                                            }
                                        />
                                    </label>
                                ) : null}
                            </div>
                        ),
                    },
                ]}
            />

            <div className="space-y-2">
                {plan.items.map((item, index) => (
                    <Collapse
                        key={item.id}
                        size="small"
                        className="min-w-0 [&_.ant-collapse-header]:min-w-0 [&_.ant-collapse-header-text]:min-w-0 [&_.ant-collapse-header-text]:overflow-hidden [&_.ant-collapse-title]:min-w-0 [&_.ant-collapse-title]:overflow-hidden"
                        items={[
                            {
                                key: item.id,
                                label: (
                                    <div className="flex min-w-0 items-center gap-2 pr-2">
                                        <span className="w-5 shrink-0 text-xs text-stone-400">{index + 1}</span>
                                        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                                        <Tag className="m-0 shrink-0">{kindOptions.find((option) => option.value === item.kind)?.label || item.kind}</Tag>
                                        {item.status ? <StatusTag status={item.status} /> : null}
                                    </div>
                                ),
                                extra: (
                                    <div className="flex items-center" onClick={(event) => event.stopPropagation()}>
                                        <Button
                                            type="text"
                                            size="small"
                                            className="!h-10 !w-10 !min-w-10 sm:!h-6 sm:!w-6 sm:!min-w-6"
                                            aria-label="上移"
                                            icon={<ArrowUp className="size-3.5" />}
                                            disabled={disabled || index === 0}
                                            onClick={() => onChange({ ...plan, items: reorderPlanItems(plan.items, item.id, -1) })}
                                        />
                                        <Button
                                            type="text"
                                            size="small"
                                            className="!h-10 !w-10 !min-w-10 sm:!h-6 sm:!w-6 sm:!min-w-6"
                                            aria-label="下移"
                                            icon={<ArrowDown className="size-3.5" />}
                                            disabled={disabled || index === plan.items.length - 1}
                                            onClick={() => onChange({ ...plan, items: reorderPlanItems(plan.items, item.id, 1) })}
                                        />
                                    </div>
                                ),
                                children: (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label className="block">
                                            <span className="mb-1 block text-xs text-stone-500">类型</span>
                                            <Select value={item.kind} className="w-full" options={kindOptions} disabled={disabled} onChange={(kind) => updateItem(item.id, { kind })} />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1 block text-xs text-stone-500">标题</span>
                                            <Input value={item.title} disabled={disabled} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                                        </label>
                                        {plan.type === "article" || plan.type === "storyboard" ? (
                                            <label className="block sm:col-span-2">
                                                <span className="mb-1 block text-xs text-stone-500">{plan.type === "storyboard" ? "页面 / 场景" : "对应章节"}</span>
                                                <Input value={item.chapter || ""} disabled={disabled} onChange={(event) => updateItem(item.id, { chapter: event.target.value })} />
                                            </label>
                                        ) : null}
                                        {plan.type === "article" ? (
                                            <label className="block sm:col-span-2">
                                                <span className="mb-1 block text-xs text-stone-500">插图类型</span>
                                                <Select value={item.illustrationType || "conceptual"} className="w-full" options={illustrationTypeOptions} disabled={disabled} onChange={(illustrationType) => updateItem(item.id, { illustrationType })} />
                                            </label>
                                        ) : null}
                                        <label className="block sm:col-span-2">
                                            <span className="mb-1 block text-xs text-stone-500">正文 / 场景</span>
                                            <Input.TextArea value={item.body} autoSize={{ minRows: 2, maxRows: 6 }} disabled={disabled} onChange={(event) => updateItem(item.id, { body: event.target.value })} />
                                        </label>
                                        <label className="block sm:col-span-2">
                                            <span className="mb-1 block text-xs text-stone-500">目的</span>
                                            <Input.TextArea value={item.purpose || ""} autoSize={{ minRows: 1, maxRows: 4 }} disabled={disabled} onChange={(event) => updateItem(item.id, { purpose: event.target.value })} />
                                        </label>
                                        <label className="block sm:col-span-2">
                                            <span className="mb-1 block text-xs text-stone-500">视觉内容</span>
                                            <Input.TextArea value={item.visualDescription || ""} autoSize={{ minRows: 1, maxRows: 5 }} disabled={disabled} onChange={(event) => updateItem(item.id, { visualDescription: event.target.value })} />
                                        </label>
                                        <label className="block sm:col-span-2">
                                            <span className="mb-1 block text-xs text-stone-500">必须逐字保留（每行一项）</span>
                                            <Input.TextArea
                                                value={(item.requiredText || []).join("\n")}
                                                autoSize={{ minRows: 1, maxRows: 5 }}
                                                disabled={disabled}
                                                onChange={(event) =>
                                                    updateItem(item.id, {
                                                        requiredText: event.target.value
                                                            .split(/\r?\n/)
                                                            .map((value) => value.trim())
                                                            .filter(Boolean),
                                                    })
                                                }
                                            />
                                        </label>
                                        {item.finalPrompt ? (
                                            <label className="block sm:col-span-2">
                                                <span className="mb-1 block text-xs text-stone-500">该项最终 Prompt（可编辑）</span>
                                                <Input.TextArea value={item.finalPrompt} disabled={disabled} autoSize={{ minRows: 3, maxRows: 8 }} onChange={(event) => updateItem(item.id, { finalPrompt: event.target.value })} />
                                            </label>
                                        ) : null}
                                        <div className="flex justify-between gap-2 sm:col-span-2">
                                            <Button
                                                danger
                                                type="text"
                                                size="small"
                                                icon={<Trash2 className="size-3.5" />}
                                                disabled={disabled || plan.items.length <= 1}
                                                onClick={() => onChange({ ...plan, items: plan.items.filter((candidate) => candidate.id !== item.id).map((candidate, order) => ({ ...candidate, order })) })}
                                            >
                                                删除
                                            </Button>
                                            {onRegenerateItem ? (
                                                <Button type="text" size="small" icon={<RefreshCcw className="size-3.5" />} disabled={disabled} onClick={() => onRegenerateItem(item)}>
                                                    单独生成
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                ),
                            },
                        ]}
                    />
                ))}
            </div>
        </div>
    );
}

function StatusTag({ status }: { status: NonNullable<StructuredPlanItem["status"]> }) {
    const color = status === "succeeded" ? "green" : status === "failed" ? "red" : status === "generating" ? "blue" : status === "cancelled" ? "default" : "orange";
    const label = status === "succeeded" ? "成功" : status === "failed" ? "失败" : status === "generating" ? "生成中" : status === "cancelled" ? "已取消" : status === "queued" ? "排队" : "未生成";
    return (
        <Tag color={color} className="m-0 shrink-0">
            {label}
        </Tag>
    );
}
