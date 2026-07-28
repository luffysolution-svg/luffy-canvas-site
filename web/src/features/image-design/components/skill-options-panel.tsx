import { Collapse, Input, InputNumber, Select, Segmented, Switch } from "antd";
import { SlidersHorizontal } from "lucide-react";

import type { DesignSkillDefinition, SkillOptionGroup, SkillOptionValue } from "../types";

export function SkillOptionsPanel({
    skill,
    values,
    customValues,
    onChange,
    onCustomChange,
}: {
    skill: DesignSkillDefinition;
    values: Record<string, SkillOptionValue>;
    customValues: Record<string, string>;
    onChange: (key: string, value: SkillOptionValue) => void;
    onCustomChange: (key: string, value: string) => void;
}) {
    if (!skill.optionGroups.length) return null;
    return (
        <Collapse
            ghost
            defaultActiveKey={["options"]}
            className="-mx-1"
            items={[
                {
                    key: "options",
                    label: (
                        <span className="flex items-center gap-1.5 font-medium">
                            <SlidersHorizontal className="size-3.5" />
                            Skill 动态参数
                        </span>
                    ),
                    children: (
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                            {skill.optionGroups
                                .filter((group) => visible(group, values))
                                .map((group) => (
                                    <OptionField
                                        key={group.key}
                                        group={group}
                                        value={values[group.key] ?? group.defaultValue}
                                        customValue={customValues[group.key] || ""}
                                        inlineCustom={!skill.optionGroups.some((candidate) => candidate.visibleWhen?.key === group.key && (candidate.control === "text" || candidate.control === "textarea"))}
                                        onChange={(value) => onChange(group.key, value)}
                                        onCustomChange={(value) => onCustomChange(group.key, value)}
                                    />
                                ))}
                        </div>
                    ),
                },
            ]}
        />
    );
}

function OptionField({
    group,
    value,
    customValue,
    inlineCustom,
    onChange,
    onCustomChange,
}: {
    group: SkillOptionGroup;
    value: SkillOptionValue;
    customValue: string;
    inlineCustom: boolean;
    onChange: (value: SkillOptionValue) => void;
    onCustomChange: (value: string) => void;
}) {
    const custom = value === "custom" && inlineCustom;
    return (
        <label className={`block min-w-0 ${group.control === "textarea" ? "sm:col-span-2" : ""}`}>
            <span className="mb-1.5 block text-sm font-medium">{group.label}</span>
            {group.control === "switch" ? (
                <Switch checked={Boolean(value)} onChange={onChange} aria-label={group.label} />
            ) : group.control === "number" ? (
                <InputNumber className="w-full" value={Number(value)} min={group.min} max={group.max} step={group.step} aria-label={group.label} onChange={(next) => onChange(next ?? Number(group.defaultValue))} />
            ) : group.control === "text" ? (
                <Input value={String(value)} aria-label={group.label} onChange={(event) => onChange(event.target.value)} />
            ) : group.control === "textarea" ? (
                <Input.TextArea value={String(value)} autoSize={{ minRows: 2, maxRows: 5 }} aria-label={group.label} onChange={(event) => onChange(event.target.value)} />
            ) : group.control === "segmented" && (group.options?.length || 0) <= 5 ? (
                <Segmented block value={String(value)} options={(group.options || []).map((option) => ({ value: option.id, label: option.nameZh }))} onChange={onChange} />
            ) : (
                <Select
                    value={String(value)}
                    className="w-full"
                    popupMatchSelectWidth={320}
                    aria-label={group.label}
                    options={(group.options || []).map((option) => ({ value: option.id, label: option.nameZh, description: option.description }))}
                    optionRender={(option) => (
                        <div className="py-0.5">
                            <div>{option.label}</div>
                            <div className="whitespace-normal text-xs text-stone-500 dark:text-stone-400">{option.data.description}</div>
                        </div>
                    )}
                    onChange={onChange}
                />
            )}
            {custom ? <Input className="mt-2" value={customValue} placeholder={`填写自定义${group.label}`} aria-label={`自定义${group.label}`} onChange={(event) => onCustomChange(event.target.value)} /> : null}
            <span className="mt-1 block text-xs leading-4 text-stone-500 dark:text-stone-400">{group.description}</span>
        </label>
    );
}

function visible(group: SkillOptionGroup, values: Record<string, SkillOptionValue>) {
    if (!group.visibleWhen) return true;
    return group.visibleWhen.values.includes(values[group.visibleWhen.key]);
}
