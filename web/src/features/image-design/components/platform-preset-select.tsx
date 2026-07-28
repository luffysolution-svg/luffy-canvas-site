import { Button, Empty, Input, Select, Tag, Tooltip } from "antd";
import { Pencil, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { BUILTIN_PLATFORM_PRESETS } from "../registry/platform-presets";
import type { PlatformPreset } from "../types";

const sourceLabels = {
    official: "官方",
    "industry-recommended": "行业推荐",
    "product-default": "产品默认",
    custom: "自定义",
};

export function PlatformPresetSelect({
    value,
    platform,
    customPresets,
    favorites,
    recentPresetIds = [],
    onChange,
    onToggleFavorite,
    onEditCustom,
}: {
    value: string;
    platform: string;
    customPresets: PlatformPreset[];
    favorites: string[];
    recentPresetIds?: string[];
    onChange: (preset: PlatformPreset | undefined) => void;
    onToggleFavorite: (id: string) => void;
    onEditCustom: () => void;
}) {
    const [query, setQuery] = useState("");
    const presets = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return [...customPresets, ...BUILTIN_PLATFORM_PRESETS]
            .filter((preset) => platform === "all" || platform === "manual" || preset.platform === platform)
            .filter((preset) => !needle || `${preset.platformLabel} ${preset.label} ${preset.description}`.toLowerCase().includes(needle))
            .toSorted((left, right) => {
                const favoriteOrder = Number(favorites.includes(right.id)) - Number(favorites.includes(left.id));
                if (favoriteOrder) return favoriteOrder;
                const leftRecent = recentPresetIds.indexOf(left.id);
                const rightRecent = recentPresetIds.indexOf(right.id);
                if (leftRecent < 0 && rightRecent < 0) return 0;
                if (leftRecent < 0) return 1;
                if (rightRecent < 0) return -1;
                return leftRecent - rightRecent;
            });
    }, [customPresets, favorites, platform, query, recentPresetIds]);

    return (
        <div className="block min-w-0">
            <span className="mb-1.5 flex items-center justify-between gap-3 text-sm font-medium">
                <span>平台预设</span>
                <Button aria-label="新建或编辑自定义平台预设" type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={onEditCustom}>
                    自定义
                </Button>
            </span>
            <Select
                value={value}
                className="w-full"
                popupMatchSelectWidth={false}
                styles={{
                    popup: {
                        root: {
                            width: "min(420px, calc(100vw - 48px))",
                            maxWidth: "calc(100vw - 48px)",
                        },
                    },
                }}
                aria-label="平台预设"
                onChange={(id) => onChange(id === "manual" ? undefined : [...customPresets, ...BUILTIN_PLATFORM_PRESETS].find((preset) => preset.id === id))}
                popupRender={(menu) => (
                    <div>
                        <div className="p-2 pb-1">
                            <Input aria-label="搜索平台或内容类型" value={query} allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder="搜索平台或内容类型" onChange={(event) => setQuery(event.target.value)} />
                        </div>
                        {presets.length ? menu : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配预设" className="my-5" />}
                    </div>
                )}
                options={[
                    { value: "manual", label: "手动参数（保持原行为）", description: "不施加平台规则，使用当前模型尺寸。", sourceLevel: "product-default", favorite: false, recent: false, custom: false },
                    ...presets.map((preset) => ({
                        value: preset.id,
                        label: `${preset.platformLabel} · ${preset.label}`,
                        description: preset.description,
                        sourceLevel: preset.sourceLevel,
                        favorite: favorites.includes(preset.id),
                        recent: recentPresetIds.includes(preset.id),
                        custom: Boolean(preset.isCustom),
                    })),
                ]}
                optionRender={(option) => (
                    <div className="flex min-w-0 items-start gap-2 py-1">
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{option.label}</div>
                            <div className="mt-0.5 whitespace-normal text-xs text-stone-500 dark:text-stone-400">{option.data.description}</div>
                            <Tag variant="filled" className="m-0 mt-1 px-1.5 text-[11px]">
                                {sourceLabels[option.data.sourceLevel as keyof typeof sourceLabels]}
                            </Tag>
                            {option.data.recent ? (
                                <Tag variant="filled" className="m-0 ml-1 mt-1 px-1.5 text-[11px]">
                                    最近使用
                                </Tag>
                            ) : null}
                        </div>
                        {option.value !== "manual" ? (
                            <Tooltip title={option.data.favorite ? "取消收藏" : "收藏"}>
                                <Button
                                    type="text"
                                    size="small"
                                    className="!h-10 !w-10 !min-w-10 shrink-0 sm:!h-6 sm:!w-6 sm:!min-w-6"
                                    aria-label={option.data.favorite ? "取消收藏预设" : "收藏预设"}
                                    icon={<Star className={`size-3.5 ${option.data.favorite ? "fill-current" : ""}`} />}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onToggleFavorite(String(option.value));
                                    }}
                                />
                            </Tooltip>
                        ) : null}
                    </div>
                )}
            />
        </div>
    );
}
