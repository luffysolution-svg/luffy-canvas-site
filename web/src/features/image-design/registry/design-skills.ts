import type { DesignSkillDefinition, DesignSkillId, RegistryOption, SkillOptionGroup, SkillOptionValue } from "../types";
import { ARTICLE_DENSITIES, ARTICLE_PALETTE_OPTIONS, ARTICLE_PRESET_OPTIONS, ARTICLE_STYLE_OPTIONS, ARTICLE_TYPE_OPTIONS } from "./article-illustrator";
import {
    COMIC_ART_STYLE_OPTIONS,
    COMIC_ASPECT_RATIO_OPTIONS,
    COMIC_DIALOGUE_DENSITIES,
    COMIC_LAYOUT_OPTIONS,
    COMIC_NARRATION_DENSITIES,
    COMIC_PARTIAL_MODES,
    COMIC_PRESET_OPTIONS,
    COMIC_READING_DIRECTIONS,
    COMIC_TEXT_MODES,
    COMIC_TONE_OPTIONS,
} from "./comic";
import { COVER_ASPECT_RATIO_OPTIONS, COVER_FONT_OPTIONS, COVER_MOOD_OPTIONS, COVER_PALETTE_OPTIONS, COVER_PRESET_OPTIONS, COVER_RENDERING_OPTIONS, COVER_TEXT_MODE_OPTIONS, COVER_TYPE_OPTIONS } from "./cover-image";
import { DIAGRAM_RASTER_SEMANTIC_RULES, DIAGRAM_TYPE_OPTIONS } from "./diagram";
import { INFOGRAPHIC_ASPECT_RATIO_OPTIONS, INFOGRAPHIC_LAYOUT_OPTIONS, INFOGRAPHIC_STYLE_OPTIONS } from "./infographic";
import { findOption } from "./option-utils";
import { XHS_CANVAS_RATIO_OPTIONS, XHS_LAYOUT_OPTIONS, XHS_OUTLINE_STRATEGIES, XHS_PALETTE_OPTIONS, XHS_PRESET_OPTIONS, XHS_STYLE_OPTIONS } from "./xhs-images";

function selectGroup(key: string, label: string, description: string, defaultValue: string, options: RegistryOption[]): SkillOptionGroup {
    return { key, label, description, control: "select", defaultValue, options };
}

function customGroup(key: string, label: string, dependsOn: string): SkillOptionGroup {
    return {
        key,
        label,
        description: `仅当“${dependsOn}”选择自定义时使用；内容将作为结构化提示片段保存。`,
        control: "text",
        defaultValue: "",
        visibleWhen: { key: dependsOn, values: ["custom"] },
    };
}

export const NONE_DESIGN_SKILL: DesignSkillDefinition = {
    id: "none",
    label: "无设计 Skill",
    nameEn: "None",
    description: "只使用用户提示、平台约束和参考图，不追加专项设计规则。",
    useCases: ["自由生成", "已有完整提示词", "不需要专项结构规划"],
    supportsSeries: false,
    maxItems: 1,
    workflow: "single",
    optionGroups: [],
    contentStructureFragment: "",
    compositionFragment: "",
    lightingMaterialFragment: "",
    promptTemplateVersion: "luffy-none-1",
};

export const COVER_IMAGE_SKILL: DesignSkillDefinition = {
    id: "cover-image",
    label: "封面图",
    nameEn: "Cover image",
    description: "以类型、预设、配色、渲染、文字量、强度和字体组合生成高辨识度封面。",
    useCases: ["公众号封面", "视频缩略图", "文章头图", "活动海报"],
    supportsSeries: false,
    maxItems: 1,
    workflow: "single",
    optionGroups: [
        selectGroup("preset", "风格预设", "预设展开为配色与渲染；显式维度选择优先。", "auto", COVER_PRESET_OPTIONS),
        customGroup("customPreset", "自定义风格预设", "preset"),
        selectGroup("type", "封面类型", "决定封面的叙事和构图骨架。", "auto", COVER_TYPE_OPTIONS),
        customGroup("customType", "自定义封面类型", "type"),
        selectGroup("palette", "配色", "显式配色可覆盖预设携带的配色。", "auto", COVER_PALETTE_OPTIONS),
        customGroup("customPalette", "自定义配色", "palette"),
        selectGroup("rendering", "渲染", "显式渲染可覆盖预设携带的渲染。", "auto", COVER_RENDERING_OPTIONS),
        customGroup("customRendering", "自定义渲染", "rendering"),
        selectGroup("textMode", "画面文字", "只使用用户提供的准确文字，不自动发明标题。", "auto", COVER_TEXT_MODE_OPTIONS),
        selectGroup("mood", "视觉强度", "控制画面的克制、平衡或冲击程度。", "auto", COVER_MOOD_OPTIONS),
        selectGroup("font", "字体气质", "控制标题字形气质；不改变实际文字。", "auto", COVER_FONT_OPTIONS),
        selectGroup("aspectRatio", "画幅", "自动时优先跟随平台预设。", "auto", COVER_ASPECT_RATIO_OPTIONS),
        customGroup("customAspectRatio", "自定义画幅", "aspectRatio"),
    ],
    contentStructureFragment: "准确提取标题、摘要、关键词和受众；标题只能使用用户提供的原文，不补写副标题。",
    compositionFragment: "封面保留约 40%–60% 可呼吸空间，以单一焦点建立清楚层级；人物使用简化插画而非无关写实肖像。",
    lightingMaterialFragment: "光线、材质和颗粒服从所选渲染与配色；缩略图尺寸下仍保持主体和标题可辨。",
    promptTemplateVersion: "baoyu-cover-image-1.117.5",
};

export const XHS_IMAGES_SKILL: DesignSkillDefinition = {
    id: "xhs-images",
    label: "小红书系列图",
    nameEn: "XHS image series",
    description: "把内容规划为封面、正文卡和收束卡组成的统一小红书系列。",
    useCases: ["小红书图文笔记", "知识卡系列", "产品测评", "教程清单"],
    supportsSeries: true,
    maxItems: 10,
    workflow: "series",
    optionGroups: [
        selectGroup("preset", "系列预设", "预设展开为风格、版式和可选配色。", "auto", XHS_PRESET_OPTIONS),
        customGroup("customPreset", "自定义系列预设", "preset"),
        selectGroup("style", "风格", "十二种上游风格；显式选择优先于预设。", "auto", XHS_STYLE_OPTIONS),
        customGroup("customStyle", "自定义风格", "style"),
        selectGroup("layout", "版式", "按卡片角色可在系列中变化，但网格、字体和装饰语言保持一致。", "auto", XHS_LAYOUT_OPTIONS),
        customGroup("customLayout", "自定义版式", "layout"),
        selectGroup("palette", "配色", "跟随风格时不追加覆盖；显式配色优先。", "style-default", XHS_PALETTE_OPTIONS),
        customGroup("customPalette", "自定义配色", "palette"),
        selectGroup("outlineStrategy", "大纲策略", "故事驱动、信息密集或视觉优先三种结构化方案。", "information-dense", XHS_OUTLINE_STRATEGIES),
        selectGroup("aspectRatio", "画幅", "自动时优先跟随小红书平台预设。", "auto", XHS_CANVAS_RATIO_OPTIONS),
        customGroup("customAspectRatio", "自定义画幅", "aspectRatio"),
        {
            key: "count",
            label: "图片数量",
            description: "系列共 1–10 张；多张时通常包含封面和收束卡。",
            control: "number",
            defaultValue: 5,
            min: 1,
            max: 10,
            step: 1,
        },
        {
            key: "anchorChain",
            label: "系列锚点",
            description: "首图成功后仅把首图作为后续图片的系列锚点，保持风格一致。",
            control: "switch",
            defaultValue: true,
        },
    ],
    contentStructureFragment: "先确定系列学习目标，再拆成封面、单主题正文卡和总结/行动卡；每张只承担一个核心价值。",
    compositionFragment: "首图建立视觉圣经；后续卡保持相同字体层级、边距、色板、笔触、图标和角色，只改变当前内容。",
    lightingMaterialFragment: "图片一可使用已验证的用户参考图；图片二及以后优先只使用图片一作为系列锚点，并用文字重复风格与配色特征。",
    promptTemplateVersion: "baoyu-xhs-images-2.0.1",
};

export const INFOGRAPHIC_SKILL: DesignSkillDefinition = {
    id: "infographic",
    label: "信息图",
    nameEn: "Infographic",
    description: "把事实、数据和关系结构化为单张或拆分后的高可读信息图。",
    useCases: ["数据报告", "知识长图", "结构总览", "流程与比较"],
    supportsSeries: true,
    maxItems: 10,
    workflow: "structured",
    optionGroups: [
        selectGroup("layout", "信息版式", "二十一种上游信息结构；自动时先匹配数据关系。", "auto", INFOGRAPHIC_LAYOUT_OPTIONS),
        customGroup("customLayout", "自定义版式", "layout"),
        selectGroup("style", "视觉风格", "二十二种上游视觉风格；自动时结合语气和受众。", "auto", INFOGRAPHIC_STYLE_OPTIONS),
        customGroup("customStyle", "自定义风格", "style"),
        selectGroup("aspectRatio", "画幅", "自动时优先使用平台画幅；内容过载时建议拆分而非删减事实。", "auto", INFOGRAPHIC_ASPECT_RATIO_OPTIONS),
        customGroup("customAspectRatio", "自定义画幅", "aspectRatio"),
        {
            key: "highDensity",
            label: "高密度模式",
            description: "使用更多模块承载信息，但仍保持四级文字层次和可读间距。",
            control: "switch",
            defaultValue: false,
        },
        {
            key: "dataFidelity",
            label: "事实保真",
            description: "锁定数字、单位、日期、专名、引用和列表顺序，不允许模型改写。",
            control: "switch",
            defaultValue: true,
        },
        {
            key: "splitModules",
            label: "按模块拆图",
            description: "内容过载时把结构化模块分别生成，保留每一项事实并沿用统一视觉圣经。",
            control: "switch",
            defaultValue: false,
        },
    ],
    contentStructureFragment: "先提取一至三个学习目标和结构化事实；数字、引用、名称、日期、术语和列表顺序逐字保留。内容超载时拆图，不擅自压缩或删除事实。",
    compositionFragment: "版式先于装饰：标题、分组、事实、注释和图例形成稳定层级，阅读路径连续且模块边界清楚。",
    lightingMaterialFragment: "风格和材质只服务信息层级；不得让写实背景、装饰纹理或角色遮挡数据和标签。",
    promptTemplateVersion: "baoyu-infographic-1.117.4",
};

export const ARTICLE_ILLUSTRATOR_SKILL: DesignSkillDefinition = {
    id: "article-illustrator",
    label: "文章插图",
    nameEn: "Article illustrator",
    description: "逐节分析文章，为难以只靠文字表达的论点规划统一插图。",
    useCases: ["公众号长文", "教程", "技术文章", "数据报告", "叙事随笔"],
    supportsSeries: true,
    maxItems: 10,
    workflow: "article",
    optionGroups: [
        selectGroup("preset", "插图预设", "预设展开为类型、风格和可选配色；无强信号时推荐 hand-drawn-edu。", "auto", ARTICLE_PRESET_OPTIONS),
        customGroup("customPreset", "自定义插图预设", "preset"),
        selectGroup("illustrationType", "偏好类型", "包含六种上游类型与概念、隐喻、数据、装饰四种 Luffy 扩展。", "auto", ARTICLE_TYPE_OPTIONS),
        customGroup("customIllustrationType", "自定义插图类型", "illustrationType"),
        selectGroup("style", "统一风格", "整篇插图保持相同线条、图标、人物和材质语言。", "auto", ARTICLE_STYLE_OPTIONS),
        customGroup("customStyle", "自定义风格", "style"),
        selectGroup("palette", "统一配色", "跟随风格时使用预设或风格内建配色。", "style-default", ARTICLE_PALETTE_OPTIONS),
        customGroup("customPalette", "自定义配色", "palette"),
        selectGroup("density", "插图密度", "按文章长度和章节结构决定插图分布。", "per-section", ARTICLE_DENSITIES),
        {
            key: "count",
            label: "目标数量",
            description: "生成 1–10 张；未手动调整时由插图密度与章节数决定，手动调整后固定采用该数量。",
            control: "number",
            defaultValue: 4,
            min: 1,
            max: 10,
            step: 1,
        },
    ],
    contentStructureFragment: "先分析全文主题、语气、受众和章节；每张插图记录位置、目的、视觉描述、类型和必须保留的文字或事实。",
    compositionFragment: "先确定信息关系和版式，再加入文章中的具体标签、数据与语境；每张图自洽，不用泛化装饰替代核心论点。",
    lightingMaterialFragment: "整篇保持统一线条、光线、图标、人物与色板；画面简洁留白，避免复杂背景和无关写实人物。",
    promptTemplateVersion: "baoyu-article-illustrator-1.117.4",
};

export const COMIC_SKILL: DesignSkillDefinition = {
    id: "comic",
    label: "漫画 / 分镜",
    nameEn: "Comic",
    description: "将故事拆成页面和分格，并以角色视觉圣经保证跨页连续性。",
    useCases: ["教程漫画", "人物故事", "四格", "武侠", "概念故事"],
    supportsSeries: true,
    maxItems: 10,
    workflow: "storyboard",
    optionGroups: [
        selectGroup("preset", "漫画预设", "预设展开为画风、基调、版式和特殊叙事规则。", "auto", COMIC_PRESET_OPTIONS),
        customGroup("customPreset", "自定义漫画预设", "preset"),
        selectGroup("artStyle", "画风", "六种上游画风；不推荐组合只提示风险。", "auto", COMIC_ART_STYLE_OPTIONS),
        customGroup("customArtStyle", "自定义画风", "artStyle"),
        selectGroup("tone", "基调", "七种上游情绪基调。", "auto", COMIC_TONE_OPTIONS),
        customGroup("customTone", "自定义基调", "tone"),
        selectGroup("layout", "分格版式", "七种上游版式，包含各自推荐每页格数和阅读节奏。", "auto", COMIC_LAYOUT_OPTIONS),
        customGroup("customLayout", "自定义分格版式", "layout"),
        selectGroup("aspectRatio", "页面画幅", "自动时优先平台，未指定时使用上游默认 3:4。", "auto", COMIC_ASPECT_RATIO_OPTIONS),
        customGroup("customAspectRatio", "自定义页面画幅", "aspectRatio"),
        selectGroup("readingDirection", "阅读方向", "Luffy 扩展：显式控制分格、气泡和动作视线顺序。", "left-to-right", COMIC_READING_DIRECTIONS),
        {
            key: "pageCount",
            label: "页数",
            description: "生成 1–10 页；四格预设固定单页，除非另外规划封面。",
            control: "number",
            defaultValue: 1,
            min: 1,
            max: 10,
            step: 1,
        },
        {
            key: "panelCount",
            label: "总格数",
            description: "整个故事的独立分镜数量；应结合页数和版式的每页格数。",
            control: "number",
            defaultValue: 4,
            min: 1,
            max: 40,
            step: 1,
        },
        selectGroup("textMode", "文字模式", "选择包含准确对话/旁白，或完全无文字。", "with-text", COMIC_TEXT_MODES),
        {
            ...selectGroup("dialogueDensity", "对话密度", "Luffy 扩展：控制每格气泡数量。", "medium", COMIC_DIALOGUE_DENSITIES),
            visibleWhen: { key: "textMode", values: ["with-text"] },
        },
        {
            ...selectGroup("narrationDensity", "旁白密度", "Luffy 扩展：控制每页旁白框数量。", "medium", COMIC_NARRATION_DENSITIES),
            visibleWhen: { key: "textMode", values: ["with-text"] },
        },
        {
            key: "characters",
            label: "角色视觉设定",
            description: "可填写角色姓名、脸型、发型、服装、体型和标志物；留空时从故事提取并在首格锁定。",
            control: "textarea",
            defaultValue: "",
        },
        {
            key: "setting",
            label: "场景视觉设定",
            description: "可填写地点、时间、天气、空间方位和关键道具；留空时从故事提取并在首格锁定。",
            control: "textarea",
            defaultValue: "",
        },
        selectGroup("partialMode", "执行范围", "支持只做分镜、只做提示词、只生成图片或重生成选中页。", "images-only", COMIC_PARTIAL_MODES),
    ],
    contentStructureFragment: "先固定角色脸型、发型、服装、体型、标志物和场景方位，再按故事弧拆成页面与独立分镜；每格只推进一个动作、信息或情绪。",
    compositionFragment: "阅读方向、格距、镜头尺度和气泡顺序必须明确；角色、服装、道具状态、光线方向和空间连续性跨格保持一致。",
    lightingMaterialFragment: "多页或重复角色先建立角色视觉圣经；重试只处理失败或选中页，并复用同一提示快照，保留成功页面。",
    promptTemplateVersion: "baoyu-comic-1.117.4",
};

export const DIAGRAM_SKILL: DesignSkillDefinition = {
    id: "diagram",
    label: "技术关系图",
    nameEn: "Technical diagram",
    description: "把系统、流程、层级、时序和网络关系转成可读的位图技术关系图。",
    useCases: ["系统架构", "流程", "技术栈", "科研示意", "因果与网络"],
    supportsSeries: false,
    maxItems: 1,
    workflow: "structured",
    optionGroups: [selectGroup("diagramType", "关系图类型", "包含九种上游语义类型与九种 Luffy 常用扩展。", "auto", DIAGRAM_TYPE_OPTIONS), customGroup("customDiagramType", "自定义关系图类型", "diagramType")],
    contentStructureFragment: "提取实体、层级、顺序、输入输出、状态、数据与关系；节点标签保持短而准确，不丢失关键术语。",
    compositionFragment: [DIAGRAM_RASTER_SEMANTIC_RULES.hierarchy, DIAGRAM_RASTER_SEMANTIC_RULES.connectors, DIAGRAM_RASTER_SEMANTIC_RULES.labels, DIAGRAM_RASTER_SEMANTIC_RULES.output].join("；"),
    lightingMaterialFragment: DIAGRAM_RASTER_SEMANTIC_RULES.background,
    promptTemplateVersion: "baoyu-diagram-raster-1.117.3",
};

export const DESIGN_SKILLS: DesignSkillDefinition[] = [NONE_DESIGN_SKILL, COVER_IMAGE_SKILL, XHS_IMAGES_SKILL, INFOGRAPHIC_SKILL, ARTICLE_ILLUSTRATOR_SKILL, COMIC_SKILL, DIAGRAM_SKILL];

export function designSkillById(id: DesignSkillId | string): DesignSkillDefinition {
    return DESIGN_SKILLS.find((skill) => skill.id === id) || NONE_DESIGN_SKILL;
}

export function defaultSkillOptions(id: DesignSkillId | string): Record<string, SkillOptionValue> {
    return Object.fromEntries(designSkillById(id).optionGroups.map((group) => [group.key, group.defaultValue]));
}

export function skillOptionById(skillId: DesignSkillId | string, key: string, id: unknown): RegistryOption | undefined {
    const group = designSkillById(skillId).optionGroups.find((candidate) => candidate.key === key);
    return findOption(group?.options, id);
}
