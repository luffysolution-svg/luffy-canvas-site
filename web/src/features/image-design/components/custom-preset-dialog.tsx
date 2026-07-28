import { App, Button, Form, Input, InputNumber, Modal, Popconfirm, Select, Tabs } from "antd";
import { Copy, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { importCustomPlatformPresets } from "../persistence/preferences";
import { createCustomPlatformPreset, exportPlatformPresets } from "../registry/platform-presets";
import type { PlatformPreset } from "../types";

type PresetFormValues = {
    id: string;
    platform: string;
    platformLabel: string;
    contentType: string;
    label: string;
    description: string;
    aspectRatio: string;
    generationWidth: number;
    generationHeight: number;
    targetWidth: number;
    targetHeight: number;
    orientation: PlatformPreset["orientation"];
    quality: string;
    outputFormat: PlatformPreset["outputFormat"];
    safeTop: number;
    safeRight: number;
    safeBottom: number;
    safeLeft: number;
    safeDescription: string;
    subjectPosition: string;
    titlePosition: string;
    textDensity: PlatformPreset["textDensity"];
    maxTitleLines: number;
    edgeMargin: number;
    focalScale: number;
    promptFragments: string;
    negativeFragments: string;
    avoidZones: string;
};

export function CustomPresetDialog({
    open,
    preset,
    presets,
    onClose,
    onSave,
    onDelete,
    onImport,
}: {
    open: boolean;
    preset?: PlatformPreset;
    presets: PlatformPreset[];
    onClose: () => void;
    onSave: (preset: PlatformPreset) => void;
    onDelete: (id: string) => void;
    onImport: (presets: PlatformPreset[]) => void;
}) {
    const { message } = App.useApp();
    const [form] = Form.useForm<PresetFormValues>();
    const [json, setJson] = useState("");

    useEffect(() => {
        if (!open) return;
        form.setFieldsValue(formValues(preset));
        setJson("");
    }, [form, open, preset]);

    const save = (values: PresetFormValues) => {
        try {
            const next = createCustomPlatformPreset({
                id: values.id.trim(),
                platform: values.platform.trim(),
                platformLabel: values.platformLabel.trim(),
                contentType: values.contentType.trim(),
                label: values.label.trim(),
                description: values.description.trim(),
                aspectRatio: values.aspectRatio.trim(),
                generationSize: [values.generationWidth, values.generationHeight],
                targetPlatformSize: [values.targetWidth, values.targetHeight],
                orientation: values.orientation,
                quality: values.quality,
                outputFormat: values.outputFormat,
                safeArea: {
                    top: values.safeTop,
                    right: values.safeRight,
                    bottom: values.safeBottom,
                    left: values.safeLeft,
                    description: values.safeDescription.trim(),
                },
                avoidZones: parseAvoidZones(values.avoidZones),
                subjectPosition: values.subjectPosition.trim(),
                titlePosition: values.titlePosition.trim(),
                textDensity: values.textDensity,
                maxTitleLines: values.maxTitleLines,
                edgeMargin: values.edgeMargin,
                focalScale: values.focalScale,
                promptFragments: splitLines(values.promptFragments),
                negativeFragments: splitLines(values.negativeFragments),
            });
            onSave(next);
            message.success(preset ? "自定义预设已更新" : "自定义预设已保存");
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "自定义预设保存失败");
        }
    };

    const importJson = () => {
        try {
            const imported = importCustomPlatformPresets(json);
            onImport(imported);
            message.success(`已导入 ${imported.length} 个预设`);
            setJson("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "预设 JSON 无法导入");
        }
    };

    const copyExport = async () => {
        try {
            const value = exportPlatformPresets(presets);
            await navigator.clipboard.writeText(value);
            message.success("预设 JSON 已复制");
        } catch {
            message.error("预设 JSON 复制失败");
        }
    };

    return (
        <Modal title={preset ? "编辑自定义平台预设" : "自定义平台预设"} open={open} onCancel={onClose} footer={null} width={760} destroyOnHidden>
            <Tabs
                items={[
                    {
                        key: "edit",
                        label: preset ? "编辑" : "新建",
                        children: (
                            <Form form={form} layout="vertical" onFinish={save} className="pt-2">
                                <div className="grid gap-x-3 md:grid-cols-2">
                                    <Form.Item label="预设 id" name="id" rules={[{ required: true }, { pattern: /^[a-z0-9][a-z0-9-]*$/, message: "请使用小写字母、数字和连字符" }]}>
                                        <Input disabled={Boolean(preset)} />
                                    </Form.Item>
                                    <Form.Item label="内容类型 id" name="contentType" rules={[{ required: true }]}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="平台 id" name="platform" rules={[{ required: true }]}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="平台名称" name="platformLabel" rules={[{ required: true }]}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="预设名称" name="label" rules={[{ required: true }]}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="比例" name="aspectRatio" rules={[{ required: true }, { pattern: /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, message: "例如 16:9 或 2.35:1" }]}>
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="说明" name="description" className="md:col-span-2" rules={[{ required: true }]}>
                                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} />
                                    </Form.Item>
                                    <DimensionFields prefix="generation" label="生图尺寸" />
                                    <DimensionFields prefix="target" label="平台参考尺寸" />
                                    <Form.Item label="方向" name="orientation">
                                        <Select
                                            options={[
                                                { value: "landscape", label: "横向" },
                                                { value: "portrait", label: "竖向" },
                                                { value: "square", label: "方形" },
                                            ]}
                                        />
                                    </Form.Item>
                                    <Form.Item label="质量" name="quality">
                                        <Select options={["auto", "low", "medium", "high"].map((value) => ({ value, label: value }))} />
                                    </Form.Item>
                                    <Form.Item label="输出格式" name="outputFormat" extra="当前生图请求统一输出 PNG。">
                                        <Select options={[{ value: "png", label: "PNG" }]} />
                                    </Form.Item>
                                    <div className="grid grid-cols-4 gap-2 md:col-span-2">
                                        {[
                                            ["safeTop", "上"],
                                            ["safeRight", "右"],
                                            ["safeBottom", "下"],
                                            ["safeLeft", "左"],
                                        ].map(([name, label]) => (
                                            <Form.Item key={name} label={`安全区${label} %`} name={name}>
                                                <InputNumber min={0} max={45} className="w-full" />
                                            </Form.Item>
                                        ))}
                                    </div>
                                    <Form.Item label="安全区说明" name="safeDescription" className="md:col-span-2">
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="主体位置" name="subjectPosition">
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="标题位置" name="titlePosition">
                                        <Input />
                                    </Form.Item>
                                    <Form.Item label="文字密度" name="textDensity">
                                        <Select options={["none", "low", "medium", "high"].map((value) => ({ value, label: value }))} />
                                    </Form.Item>
                                    <Form.Item label="标题最大行数" name="maxTitleLines">
                                        <InputNumber min={0} max={8} className="w-full" />
                                    </Form.Item>
                                    <Form.Item label="边缘留白 %" name="edgeMargin">
                                        <InputNumber min={0} max={30} className="w-full" />
                                    </Form.Item>
                                    <Form.Item label="主体视觉占比（0–1）" name="focalScale">
                                        <InputNumber min={0.1} max={1} step={0.05} className="w-full" />
                                    </Form.Item>
                                    <Form.Item label="平台 Prompt 规则（每行一条）" name="promptFragments" className="md:col-span-2">
                                        <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />
                                    </Form.Item>
                                    <Form.Item label="禁止项（每行一条）" name="negativeFragments" className="md:col-span-2">
                                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
                                    </Form.Item>
                                    <Form.Item label="避让区（每行：名称, x%, y%, 宽%, 高%）" name="avoidZones" className="md:col-span-2">
                                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder={"右侧按钮区, 82, 16, 18, 64\n底部标题区, 0, 84, 100, 16"} />
                                    </Form.Item>
                                </div>
                                <div className="flex flex-wrap justify-between gap-2">
                                    {preset ? (
                                        <Popconfirm title="删除这个自定义预设？" onConfirm={() => onDelete(preset.id)}>
                                            <Button danger icon={<Trash2 className="size-3.5" />}>
                                                删除
                                            </Button>
                                        </Popconfirm>
                                    ) : (
                                        <span />
                                    )}
                                    <div className="flex gap-2">
                                        <Button onClick={onClose}>取消</Button>
                                        <Button type="primary" htmlType="submit">
                                            保存预设
                                        </Button>
                                    </div>
                                </div>
                            </Form>
                        ),
                    },
                    {
                        key: "transfer",
                        label: "导入 / 导出",
                        children: (
                            <div className="space-y-3 pt-2">
                                <Input.TextArea value={json} autoSize={{ minRows: 12, maxRows: 20 }} placeholder="粘贴导出的预设 JSON" aria-label="预设 JSON" onChange={(event) => setJson(event.target.value)} />
                                <div className="flex flex-wrap justify-between gap-2">
                                    <div className="text-xs text-stone-500 dark:text-stone-400">导入会按 id 覆盖同名自定义预设；内置预设不会被修改。</div>
                                    <div className="flex gap-2">
                                        <Button icon={<Copy className="size-3.5" />} disabled={!presets.length} onClick={() => void copyExport()}>
                                            复制导出 JSON
                                        </Button>
                                        <Button type="primary" icon={<Upload className="size-3.5" />} disabled={!json.trim()} onClick={importJson}>
                                            导入
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ),
                    },
                ]}
            />
        </Modal>
    );
}

function DimensionFields({ prefix, label }: { prefix: "generation" | "target"; label: string }) {
    return (
        <div className="grid grid-cols-2 gap-2">
            <Form.Item label={`${label}宽`} name={`${prefix}Width`} rules={[{ required: true, message: `请输入${label}宽度` }]}>
                <InputNumber min={64} max={8192} className="w-full" />
            </Form.Item>
            <Form.Item label={`${label}高`} name={`${prefix}Height`} rules={[{ required: true, message: `请输入${label}高度` }]}>
                <InputNumber min={64} max={8192} className="w-full" />
            </Form.Item>
        </div>
    );
}

function formValues(preset?: PlatformPreset): PresetFormValues {
    return {
        id: preset?.id || "",
        platform: preset?.platform || "custom",
        platformLabel: preset?.platformLabel || "自定义",
        contentType: preset?.contentType || "custom",
        label: preset?.label || "",
        description: preset?.description || "",
        aspectRatio: preset?.aspectRatio || "1:1",
        generationWidth: preset?.generationSize.width ?? 1024,
        generationHeight: preset?.generationSize.height ?? 1024,
        targetWidth: preset?.targetPlatformSize.width ?? 1024,
        targetHeight: preset?.targetPlatformSize.height ?? 1024,
        orientation: preset?.orientation || "square",
        quality: preset?.quality || "high",
        outputFormat: preset?.outputFormat || "png",
        safeTop: preset?.safeArea.top ?? 8,
        safeRight: preset?.safeArea.right ?? 8,
        safeBottom: preset?.safeArea.bottom ?? 8,
        safeLeft: preset?.safeArea.left ?? 8,
        safeDescription: preset?.safeArea.description || "关键主体和文字保持在安全边距以内。",
        subjectPosition: preset?.subjectPosition || "中央",
        titlePosition: preset?.titlePosition || "中央安全区",
        textDensity: preset?.textDensity || "low",
        maxTitleLines: preset?.maxTitleLines ?? 2,
        edgeMargin: preset?.edgeMargin ?? 8,
        focalScale: preset?.focalScale ?? 0.7,
        promptFragments: preset?.promptFragments.join("\n") || "",
        negativeFragments: preset?.negativeFragments.join("\n") || "",
        avoidZones: preset?.avoidZones.map((zone) => `${zone.label}, ${zone.x}, ${zone.y}, ${zone.width}, ${zone.height}`).join("\n") || "",
    };
}

function splitLines(value: string) {
    return value
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseAvoidZones(value: string): Array<{ id: string; label: string; x: number; y: number; width: number; height: number }> {
    return splitLines(value).map((line, index) => {
        const [label, rawX, rawY, rawWidth, rawHeight, ...rest] = line.split(",").map((part) => part.trim());
        const values = [rawX, rawY, rawWidth, rawHeight].map(Number);
        if (rest.length || !label || values.some((item) => !Number.isFinite(item) || item < 0 || item > 100) || values[2] <= 0 || values[3] <= 0 || values[0] + values[2] > 100 || values[1] + values[3] > 100) {
            throw new Error(`第 ${index + 1} 行避让区格式无效，请使用“名称, x, y, 宽, 高”且数值为 0–100。`);
        }
        return {
            id: `custom-zone-${index + 1}`,
            label,
            x: values[0],
            y: values[1],
            width: values[2],
            height: values[3],
        };
    });
}
