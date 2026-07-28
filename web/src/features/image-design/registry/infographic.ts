import type { RegistryOption } from "../types";
import { defineOption } from "./option-utils";

type OptionRow = readonly [id: string, nameZh: string, nameEn: string, description: string, promptFragment: string, keywords: readonly string[]];

function infographicOptions(group: string, rows: readonly OptionRow[]): RegistryOption[] {
    return rows.map(([id, nameZh, nameEn, description, promptFragment, keywords]) =>
        defineOption({
            id,
            nameZh,
            nameEn,
            description,
            useCases: [description],
            promptFragment,
            negativeFragment: `避免偏离“${nameZh}”的${group}语义；不得删改数字、单位、日期、专名或原始顺序。`,
            keywords: [...keywords],
            reason: `信息结构或受众信号适合${group}“${nameZh}”。`,
            compatibilityNotes: [`这是信息图${group}选项；事实保真、平台硬约束和用户显式选择优先。`],
        }),
    );
}

function wrapper(id: "auto" | "custom", scope: string, description: string): RegistryOption {
    return defineOption({
        id,
        nameZh: id === "auto" ? "自动推荐" : "自定义",
        nameEn: id === "auto" ? "Auto" : "Custom",
        description,
        useCases: [`需要${scope}${id === "auto" ? "按结构自动匹配" : "采用用户自定义说明"}时`],
        promptFragment: id === "auto" ? `分析事实类型、关系和复杂度后推荐${scope}；不改变原始事实。` : `采用用户填写的自定义${scope}，同时保留事实保真和平台约束。`,
        negativeFragment: `不得把“${id}”绘制为画面文字；不得覆盖用户显式选择。`,
        keywords: [id, scope],
        reason: `这是 Luffy 的${scope}选择包装项，不是上游原生枚举值。`,
        compatibilityNotes: ["包装项用于 UI 和推荐状态；与上游规范 ID 分开保存。"],
    });
}

export const INFOGRAPHIC_LAYOUTS = infographicOptions("版式", [
    ["linear-progression", "线性推进", "Linear progression", "按单一路径展示步骤、阶段或时间推进。", "沿一条清楚路径依次布置节点，起点、方向、阶段和终点一目了然。", ["步骤", "阶段", "过程"]],
    ["binary-comparison", "二元对比", "Binary comparison", "对照两个对象、方案或前后状态。", "画面分成两个对齐区域，相同维度逐项对照，差异使用一致强调规则。", ["对比", "前后", "二选一"]],
    ["comparison-matrix", "比较矩阵", "Comparison matrix", "按多个维度比较多个对象。", "使用带行列标题的矩阵，单元格对齐且评估符号语义一致。", ["矩阵", "选型", "多维对比"]],
    ["hierarchical-layers", "层级分层", "Hierarchical layers", "呈现组织、优先级或由上到下的层级。", "按主次层级堆叠区域，父层与子层通过尺度、缩进和连接关系区分。", ["层级", "组织", "优先级"]],
    ["tree-branching", "树状分支", "Tree branching", "展示分类、决策或演化分支。", "从根节点向外分支，兄弟节点对齐，分支标签简短且连接线不交叉。", ["分类", "决策树", "分支"]],
    ["hub-spoke", "中心辐射", "Hub and spoke", "以核心主题连接多个同级概念。", "中心放置核心主题，外围节点等距分布并以径向关系线连接。", ["核心概念", "生态", "辐射"]],
    ["structural-breakdown", "结构拆解", "Structural breakdown", "拆解产品、系统或对象的组成部分。", "以主体结构为中心，用引线标注部件、职责和相互关系。", ["组成", "拆解", "部件"]],
    ["bento-grid", "便当网格", "Bento grid", "多个主题、功能点和混合信息的通用总览。", "使用不同尺寸的模块网格，设置一个主模块和若干支持模块，统一间距。", ["总览", "功能", "模块"]],
    ["iceberg", "冰山", "Iceberg", "呈现可见现象与隐藏原因或深层结构。", "用水面分隔显性信息和更大体量的隐性层，深度对应原因层级。", ["表象", "深层原因", "认知"]],
    ["bridge", "桥梁", "Bridge", "连接现状与目标，解释跨越障碍的方法。", "左右布置起点与目标，中间桥体承载阶段、能力或解决方案。", ["现状", "目标", "转型"]],
    ["funnel", "漏斗", "Funnel", "展示筛选、转化或逐步收敛。", "从宽到窄布置阶段，每层标注数量或规则，清楚表达流失与输出。", ["转化", "筛选", "收敛"]],
    ["isometric-map", "等距地图", "Isometric map", "呈现场景、空间系统或区域关系。", "使用等距视角组织地点、路线和功能区，空间层级清楚且标签不遮挡。", ["地图", "空间", "园区"]],
    ["dashboard", "仪表盘", "Dashboard", "集中展示关键指标、趋势和状态。", "使用主指标、趋势、比较和注释模块组成仪表盘，数字保持逐字准确。", ["指标", "数据", "状态"]],
    ["periodic-table", "周期表", "Periodic table", "按规则对大量同类项目分组编码。", "使用重复单元格与分组色，固定字段位置，并提供清楚图例。", ["分类", "目录", "元素"]],
    ["comic-strip", "漫画分格", "Comic strip", "用连续场景解释过程、案例或行为变化。", "使用顺序分格与简短说明，通过动作连续性推进信息。", ["案例", "过程", "情境"]],
    ["story-mountain", "故事山", "Story mountain", "展示起因、上升、高潮、下降与结局。", "沿山形曲线布置叙事节点，高度表达张力，阶段标签保持准确。", ["故事", "冲突", "叙事弧"]],
    ["jigsaw", "拼图", "Jigsaw", "表达多个互补部分共同组成整体。", "用相互咬合的拼图块表达模块，块形和颜色对应职责。", ["协作", "组成", "互补"]],
    ["venn-diagram", "维恩图", "Venn diagram", "展示集合之间的交集与独有部分。", "使用二至三个半透明集合区域，交集文字短而清楚，图例一致。", ["交集", "集合", "共同点"]],
    ["winding-roadmap", "蜿蜒路线图", "Winding roadmap", "展示长期路线、里程碑和阶段目标。", "沿蜿蜒路径布置里程碑，方向连续，阶段以颜色或地标区分。", ["路线图", "里程碑", "规划"]],
    ["circular-flow", "循环流程", "Circular flow", "展示反馈环、生命周期或反复迭代。", "节点围成闭环，箭头方向一致，并明确输入、反馈和重新开始位置。", ["循环", "迭代", "生命周期"]],
    ["dense-modules", "高密度模块", "Dense modules", "在单张长图中组织大量分组信息。", "使用多级模块、稳定网格与清楚导航，优先保证标题、事实、注释和图例可读。", ["高密度", "长图", "大全"]],
]);

export const INFOGRAPHIC_STYLES = infographicOptions("风格", [
    ["craft-handmade", "手工纸艺", "Craft handmade", "温暖手绘、纸张与剪贴质感的默认风格。", "使用奶油纸张、手绘轮廓、剪纸层次和轻微手工不规则感，所有元素保持插画化。", ["手工", "温暖", "默认"]],
    ["claymation", "黏土动画", "Claymation", "柔软三维黏土模型与友好玩具感。", "使用手捏黏土体积、柔和棚拍光和轻微指纹质感，保持统一比例。", ["黏土", "亲子", "三维"]],
    ["kawaii", "卡哇伊", "Kawaii", "圆润可爱角色和明快粉彩。", "使用圆角造型、可爱表情、粉彩色块和轻量贴纸装饰。", ["可爱", "亲子", "粉彩"]],
    ["storybook-watercolor", "绘本水彩", "Storybook watercolor", "柔和透明水彩与绘本叙事。", "使用透明水彩晕染、纸张留白和温柔绘本角色。", ["绘本", "水彩", "故事"]],
    ["chalkboard", "黑板粉笔", "Chalkboard", "课堂说明与手绘粉笔线条。", "使用深色黑板、粉笔纹理、课堂箭头和高对比标签。", ["教学", "课堂", "粉笔"]],
    ["cyberpunk-neon", "赛博霓虹", "Cyberpunk neon", "深色科技界面与霓虹高光。", "使用暗底、青紫霓虹、发光线路和未来科技层级，但标签保持可读。", ["科技", "未来", "霓虹"]],
    ["bold-graphic", "大胆图形", "Bold graphic", "高对比几何、强标题和清楚图标。", "使用大色块、粗线条和强几何分区，控制颜色数量。", ["醒目", "活动", "图形"]],
    ["aged-academia", "复古学院", "Aged academia", "旧纸、档案和学术注释感。", "使用泛黄纸张、墨线、档案标签和克制的学术排版。", ["历史", "学术", "档案"]],
    ["corporate-memphis", "企业孟菲斯", "Corporate Memphis", "现代企业插画与友好抽象人物。", "使用扁平企业插画、柔和几何背景和简化人物，保持专业。", ["企业", "团队", "产品"]],
    ["technical-schematic", "技术示意图", "Technical schematic", "精确线条、标注和工程图层级。", "使用深色或浅色工程底、单线图标、尺寸式标注与清楚连接关系。", ["工程", "架构", "技术"]],
    ["origami", "折纸", "Origami", "几何折面与纸材结构。", "使用折纸形态、清楚折痕和受控阴影，以纸材构成图标和主体。", ["折纸", "几何", "创意"]],
    ["pixel-art", "像素艺术", "Pixel art", "有限色板和像素网格。", "使用一致像素尺寸、有限色板和无平滑边缘的图标。", ["游戏", "复古", "像素"]],
    ["ui-wireframe", "界面线框", "UI wireframe", "产品流程和界面结构的低保真线框感。", "使用灰阶线框、占位模块、控件符号和清楚注释，不伪装成真实可点击界面。", ["产品", "界面", "原型"]],
    ["subway-map", "地铁线路图", "Subway map", "用彩色线路和站点表达复杂路径。", "使用固定角度线路、圆形站点、换乘节点和清楚线路图例。", ["路径", "系统", "路线"]],
    ["ikea-manual", "宜家说明书", "IKEA manual", "无障碍步骤图与极简装配说明。", "使用单色线稿、编号步骤、简化人物和明确动作箭头。", ["装配", "步骤", "说明书"]],
    ["knolling", "平铺整理", "Knolling", "物件俯拍式规整陈列与分类。", "以九十度俯视、等距排列和统一阴影组织对象，标签靠近对应物。", ["物品", "清单", "拆解"]],
    ["lego-brick", "积木", "Lego brick", "用彩色积木模块表达结构与组合。", "使用统一积木颗粒、连接点和模块色，强调可组合关系。", ["模块", "系统", "积木"]],
    ["pop-laboratory", "波普实验室", "Pop laboratory", "高密度科学图标与波普撞色。", "使用明快撞色、实验器材图标和模块化科学注释。", ["科学", "实验", "波普"]],
    ["morandi-journal", "莫兰迪手账", "Morandi journal", "低饱和拼贴、手账与温柔高密度信息。", "使用莫兰迪色、纸片拼贴、手写标注和统一手账网格。", ["手账", "低饱和", "长图"]],
    ["retro-pop-grid", "复古波普网格", "Retro pop grid", "复古印刷色和强模块网格。", "使用复古撞色、粗边框、半调纹理和规整信息模块。", ["复古", "网格", "高密度"]],
    ["hand-drawn-edu", "手绘教育", "Hand-drawn education", "奶油纸、黑色手绘线和马卡龙知识块。", "使用友好手绘图标、清楚箭头、奶油底与马卡龙强调色。", ["教育", "科普", "手绘"]],
    ["retro-popup-pop", "复古弹出波普", "Retro popup pop", "立体弹出纸艺与复古波普冲击。", "使用弹出式纸层、复古套色和夸张重点模块，保持信息边界清楚。", ["海报", "波普", "立体"]],
]);

export const INFOGRAPHIC_ASPECT_RATIOS = infographicOptions("画幅", [
    ["landscape", "横版 16:9", "Landscape 16:9", "演示、横向总览和文章配图。", "构图适配 16:9 横画幅，关键标签远离边缘。", ["横版", "总览"]],
    ["portrait", "竖版 9:16", "Portrait 9:16", "长图、移动端阅读和高密度模块。", "构图适配 9:16 竖画幅，建立自上而下的导航层级。", ["竖版", "长图"]],
    ["square", "方形 1:1", "Square 1:1", "社交卡片和紧凑总览。", "构图适配 1:1 方画幅，以中心或模块网格组织信息。", ["方形", "社交"]],
]);

export const INFOGRAPHIC_SHORTCUTS = infographicOptions("快捷模式", [
    [
        "high-density-info",
        "高密度信息大图",
        "High-density info",
        "将大量信息组织为竖版高密度模块长图。",
        "优先使用 dense-modules 版式和竖画幅，在 morandi-journal、pop-laboratory、retro-pop-grid、retro-popup-pop 中推荐风格。",
        ["高密度信息大图", "high-density-info"],
    ],
    ["infographic", "通用信息图", "Infographic", "以清楚留白和简单图标生成通用信息图。", "优先使用 bento-grid、craft-handmade 和横画幅，保持干净留白与简单图标。", ["信息图", "infographic"]],
]);

export type InfographicShortcutValues = {
    layout: string;
    style: string;
    aspectRatio: string;
    highDensity: boolean;
};

export function resolveInfographicShortcut(content: string): InfographicShortcutValues | undefined {
    const normalized = content.toLowerCase();
    if (/\bhigh-density-info\b/.test(normalized)) {
        return { layout: "dense-modules", style: "morandi-journal", aspectRatio: "portrait", highDensity: true };
    }
    if (/\binfographic\b/.test(normalized)) {
        return { layout: "bento-grid", style: "craft-handmade", aspectRatio: "landscape", highDensity: false };
    }
    return undefined;
}

export const INFOGRAPHIC_LAYOUT_OPTIONS = [wrapper("auto", "版式", "根据数据结构推荐二十一种上游版式；无明显信号时使用 bento-grid。"), ...INFOGRAPHIC_LAYOUTS, wrapper("custom", "版式", "使用用户填写的自定义信息结构和版式。")];
export const INFOGRAPHIC_STYLE_OPTIONS = [wrapper("auto", "风格", "根据语气、受众和版式推荐二十二种上游风格；无明显信号时使用 craft-handmade。"), ...INFOGRAPHIC_STYLES, wrapper("custom", "风格", "使用用户填写的自定义视觉风格。")];
export const INFOGRAPHIC_ASPECT_RATIO_OPTIONS = [wrapper("auto", "画幅", "优先采用平台预设，平台未指定时按内容结构推荐。"), ...INFOGRAPHIC_ASPECT_RATIOS, wrapper("custom", "画幅", "采用用户自定义的平台画幅。")];
