import { Button, Checkbox, Empty, Input, Select, Tag } from "antd";
import { CheckSquare, Plus, Search, Trash2 } from "lucide-react";

import type { GenerationLog } from "@/features/image-design/generation/types";
import type { DesignSkillId } from "@/features/image-design/types";

export type ImageHistoryFilters = {
    keyword: string;
    platformPresetId?: string;
    designSkillId?: DesignSkillId;
    status?: GenerationLog["status"];
};

export type ImageHistoryPanelProps = {
    logs: GenerationLog[];
    filters: ImageHistoryFilters;
    selectedLogIds: string[];
    activeLogId?: string;
    disabled?: boolean;
    className?: string;
    onFiltersChange: (filters: ImageHistoryFilters) => void;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: (ids: string[]) => void;
    onPreviewLog: (log: GenerationLog) => void;
};

const STATUS_OPTIONS: Array<{ label: GenerationLog["status"]; value: GenerationLog["status"] }> = [
    { label: "成功", value: "成功" },
    { label: "部分成功", value: "部分成功" },
    { label: "失败", value: "失败" },
    { label: "待确认", value: "待确认" },
    { label: "已取消", value: "已取消" },
];

export function ImageHistoryPanel({ logs, filters, selectedLogIds, activeLogId, disabled = false, className, onFiltersChange, onSelectedLogIdsChange, onCreateSession, onDeleteSelected, onPreviewLog }: ImageHistoryPanelProps) {
    const filteredLogs = filterGenerationLogs(logs, filters);
    const visibleIds = filteredLogs.map((log) => log.id);
    const visibleIdSet = new Set(visibleIds);
    const allVisibleSelected = Boolean(visibleIds.length) && visibleIds.every((id) => selectedLogIds.includes(id));
    const platformOptions = uniqueOptions(
        logs,
        (log) => log.platformPresetId,
        (log) => log.platformPresetLabel || log.platformPresetId,
    );
    const skillOptions = uniqueOptions(
        logs,
        (log) => log.designSkillId,
        (log) => log.designSkillLabel,
    );

    const toggleAllVisible = () => {
        if (allVisibleSelected) {
            onSelectedLogIdsChange(selectedLogIds.filter((id) => !visibleIdSet.has(id)));
            return;
        }
        onSelectedLogIdsChange(Array.from(new Set([...selectedLogIds, ...visibleIds])));
    };

    return (
        <section className={`[&_.ant-btn-sm]:!min-h-10 sm:[&_.ant-btn-sm]:!min-h-6 ${className || ""}`} aria-label="生成记录">
            <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">生成记录</h2>
                <Tag className="m-0">{filteredLogs.length === logs.length ? logs.length : `${filteredLogs.length}/${logs.length}`}</Tag>
            </div>

            <div className="mb-3 flex min-w-0 flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} disabled={disabled} onClick={onCreateSession}>
                    新建
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!visibleIds.length} onClick={toggleAllVisible}>
                    {allVisibleSelected ? "取消全选" : "全选"}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={disabled || !selectedLogIds.length} onClick={() => onDeleteSelected(selectedLogIds)}>
                    删除
                </Button>
            </div>

            <div className="mb-4 grid min-w-0 gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 10rem), 1fr))" }}>
                <Input
                    aria-label="搜索生成记录"
                    allowClear
                    prefix={<Search className="size-3.5 text-stone-400" />}
                    placeholder="搜索标题、提示词"
                    value={filters.keyword}
                    onChange={(event) => onFiltersChange({ ...filters, keyword: event.target.value })}
                />
                <Select
                    className="[&_.ant-select-placeholder]:!text-stone-500 dark:[&_.ant-select-placeholder]:!text-stone-400"
                    aria-label="平台筛选"
                    allowClear
                    placeholder="全部平台"
                    value={filters.platformPresetId}
                    options={platformOptions}
                    onChange={(platformPresetId) => onFiltersChange({ ...filters, platformPresetId })}
                />
                <Select
                    className="[&_.ant-select-placeholder]:!text-stone-500 dark:[&_.ant-select-placeholder]:!text-stone-400"
                    aria-label="Skill 筛选"
                    allowClear
                    placeholder="全部 Skill"
                    value={filters.designSkillId}
                    options={skillOptions}
                    onChange={(designSkillId) => onFiltersChange({ ...filters, designSkillId })}
                />
                <Select
                    className="[&_.ant-select-placeholder]:!text-stone-500 dark:[&_.ant-select-placeholder]:!text-stone-400"
                    aria-label="状态筛选"
                    allowClear
                    placeholder="全部状态"
                    value={filters.status}
                    options={STATUS_OPTIONS}
                    onChange={(status) => onFiltersChange({ ...filters, status })}
                />
            </div>

            <div className="space-y-3">
                {filteredLogs.map((log) => (
                    <ImageHistoryCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        disabled={disabled}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? Array.from(new Set([...selectedLogIds, log.id])) : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!filteredLogs.length ? (
                    <Empty className="[&_.ant-empty-description]:!text-stone-500 dark:[&_.ant-empty-description]:!text-stone-400" image={Empty.PRESENTED_IMAGE_SIMPLE} description={logs.length ? "没有符合筛选条件的记录" : "暂无生成记录"} />
                ) : null}
            </div>
        </section>
    );
}

export function filterGenerationLogs(logs: GenerationLog[], filters: ImageHistoryFilters) {
    const keyword = filters.keyword.trim().toLocaleLowerCase();
    return logs.filter((log) => {
        if (filters.platformPresetId && log.platformPresetId !== filters.platformPresetId) return false;
        if (filters.designSkillId && log.designSkillId !== filters.designSkillId) return false;
        if (filters.status && log.status !== filters.status) return false;
        if (!keyword) return true;
        return [log.title, log.originalPrompt, log.finalPrompt, log.platformPresetLabel, log.designSkillLabel].filter(Boolean).join("\n").toLocaleLowerCase().includes(keyword);
    });
}

function ImageHistoryCard({ log, selected, active, disabled, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; disabled: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const thumbnail = log.thumbnails.find(Boolean);
    const statusColor = log.status === "成功" ? "green" : log.status === "失败" ? "red" : log.status === "待确认" ? "orange" : log.status === "部分成功" ? "blue" : undefined;

    return (
        <article
            data-testid={`image-history-${log.id}`}
            className={`min-w-0 overflow-hidden rounded-lg border transition ${
                active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"
            }`}
        >
            <div className="flex min-w-0 items-start gap-2 p-3">
                <Checkbox aria-label={`选择记录 ${log.title}`} className="mt-0.5 shrink-0" checked={selected} disabled={disabled} onChange={(event) => onSelectedChange(event.target.checked)} />
                <button type="button" className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-70" disabled={disabled} onClick={onClick}>
                    <div className="flex min-w-0 items-start gap-3">
                        {thumbnail ? <img src={thumbnail} alt={`${log.title} 缩略图`} className="size-14 shrink-0 rounded-md object-cover" /> : <div className="size-14 shrink-0 rounded-md border border-dashed border-stone-300 dark:border-stone-700" />}
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                            <div className="mt-1 line-clamp-2 break-words text-xs text-stone-500 dark:text-stone-400">{log.originalPrompt || log.finalPrompt}</div>
                        </div>
                    </div>
                    <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
                        <Tag className="m-0 max-w-full truncate">平台 {log.platformPresetLabel || "通用"}</Tag>
                        <Tag className="m-0 max-w-full truncate">Skill {log.designSkillLabel}</Tag>
                        <Tag className="m-0">比例 {log.requestedAspectRatio || "未知"}</Tag>
                        <Tag className="m-0">{log.imageCount} 张</Tag>
                        <Tag className="m-0" color={statusColor}>
                            {log.status}
                        </Tag>
                        <Tag className="m-0">{log.time}</Tag>
                    </div>
                </button>
            </div>
        </article>
    );
}

function uniqueOptions<T extends string>(logs: GenerationLog[], getValue: (log: GenerationLog) => T | undefined, getLabel: (log: GenerationLog) => string | undefined) {
    const values = new Map<T, string>();
    for (const log of logs) {
        const value = getValue(log);
        const label = getLabel(log);
        if (value && label) values.set(value, label);
    }
    return Array.from(values, ([value, label]) => ({ value, label }));
}
