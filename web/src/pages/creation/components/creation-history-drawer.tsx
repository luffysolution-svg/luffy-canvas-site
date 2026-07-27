import { Clock3, FilePlus2, Trash2 } from "lucide-react";
import { Button, Drawer, Empty, Popconfirm, Tag } from "antd";

import type { CreationProject, CreationStatus } from "@/types/creation";
import { cn } from "@/lib/utils";

type CreationHistoryDrawerProps = {
    open: boolean;
    projects: CreationProject[];
    activeProjectId: string | null;
    onClose: () => void;
    onCreate: () => void;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
};

export function CreationHistoryDrawer({ open, projects, activeProjectId, onClose, onCreate, onSelect, onDelete }: CreationHistoryDrawerProps) {
    return (
        <Drawer
            title="创作历史"
            placement="left"
            size={380}
            open={open}
            onClose={onClose}
            extra={
                <Button type="text" size="small" icon={<FilePlus2 className="size-3.5" />} onClick={onCreate}>
                    新建
                </Button>
            }
        >
            {projects.length ? (
                <div className="space-y-2">
                    {projects.map((project) => {
                        const active = project.id === activeProjectId;
                        return (
                            <article
                                key={project.id}
                                className={cn(
                                    "group rounded-xl border p-3 transition",
                                    active ? "border-stone-900 bg-stone-50 dark:border-stone-100 dark:bg-stone-900" : "border-stone-200 hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600",
                                )}
                            >
                                <button
                                    type="button"
                                    className="block w-full text-left"
                                    onClick={() => {
                                        onSelect(project.id);
                                        onClose();
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{project.name}</div>
                                            <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-400">{project.sourceContent || "尚未输入内容"}</div>
                                        </div>
                                        <Tag variant="filled" className="!m-0 shrink-0">
                                            {statusLabel(project.status)}
                                        </Tag>
                                    </div>
                                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-stone-400">
                                        <Clock3 className="size-3" />
                                        <span>{formatTime(project.updatedAt)}</span>
                                        <span className="mx-1 text-stone-300 dark:text-stone-700">·</span>
                                        <span>{project.briefVersions.length} 份方案</span>
                                        <span>·</span>
                                        <span>{project.generatedImages.length} 张图</span>
                                        {project.cardDeck ? (
                                            <>
                                                <span>·</span>
                                                <span>{project.cardDeck.pages.length} 页卡片</span>
                                            </>
                                        ) : null}
                                    </div>
                                </button>
                                <div className="mt-2 flex justify-end border-t border-stone-100 pt-2 opacity-0 transition group-hover:opacity-100 dark:border-stone-800">
                                    <Popconfirm title="删除这个创作任务？" description="只删除任务记录，共享给资产或画布的图片不会立即删除。" okText="删除" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={() => onDelete(project.id)}>
                                        <Button type="text" danger size="small" icon={<Trash2 className="size-3.5" />}>
                                            删除
                                        </Button>
                                    </Popconfirm>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无创作任务" />
            )}
        </Drawer>
    );
}

export function statusLabel(status: CreationStatus) {
    return (
        {
            draft: "草稿",
            analyzing: "分析中",
            brief_ready: "待审方案",
            brief_approved: "方案已批",
            generating_prompts: "提示词生成中",
            prompts_ready: "待审提示词",
            prompt_approved: "待确认生图",
            generating_images: "生图中",
            awaiting_image_review: "待审图片",
            image_approved: "图片已采用",
            inserted_to_canvas: "已插入画布",
            failed: "失败",
        } satisfies Record<CreationStatus, string>
    )[status];
}

function formatTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
