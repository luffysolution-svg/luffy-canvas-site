import type { RegistryOption } from "../types";
import { defineOption } from "./option-utils";

type OptionRow = readonly [id: string, nameZh: string, nameEn: string, description: string, promptFragment: string, keywords: readonly string[]];

const XHS_STYLE_LAYOUTS: Record<string, { preferred: string[]; incompatible?: string[] }> = {
    cute: { preferred: ["sparse", "balanced", "list"] },
    fresh: { preferred: ["sparse", "balanced", "flow"] },
    warm: { preferred: ["sparse", "balanced", "comparison"] },
    bold: { preferred: ["sparse", "list", "comparison", "quadrant"] },
    minimal: { preferred: ["sparse", "balanced", "dense"] },
    retro: { preferred: ["sparse", "balanced", "list"] },
    pop: { preferred: ["sparse", "balanced", "list", "comparison"] },
    notion: { preferred: ["sparse", "balanced", "dense", "list", "comparison", "flow", "mindmap", "quadrant"] },
    chalkboard: { preferred: ["sparse", "balanced", "dense", "list", "flow", "mindmap"] },
    "study-notes": { preferred: ["dense", "list", "mindmap"], incompatible: ["sparse"] },
    "screen-print": { preferred: ["sparse", "balanced", "comparison", "quadrant"], incompatible: ["dense", "mindmap"] },
    "sketch-notes": { preferred: ["balanced", "dense", "list", "flow", "mindmap"] },
};

function xhsOptions(group: string, rows: readonly OptionRow[]): RegistryOption[] {
    return rows.map(([id, nameZh, nameEn, description, promptFragment, keywords]) => {
        const styleCompatibility = group === "风格" ? XHS_STYLE_LAYOUTS[id] : undefined;
        return defineOption({
            id,
            nameZh,
            nameEn,
            description,
            useCases: [description],
            promptFragment,
            negativeFragment: `避免偏离“${nameZh}”的视觉目标；避免在移动端产生不可读小字。`,
            keywords: [...keywords],
            reason: `内容信号与小红书${group}“${nameZh}”相符。`,
            ...(styleCompatibility ? { preferredWith: { layout: styleCompatibility.preferred } } : {}),
            ...(styleCompatibility?.incompatible ? { incompatibleWith: { layout: styleCompatibility.incompatible } } : {}),
            compatibilityNotes: [`这是小红书${group}选项；平台安全区和用户显式选择优先。`],
        });
    });
}

function wrapper(id: "auto" | "custom" | "style-default", scope: string, description: string): RegistryOption {
    return defineOption({
        id,
        nameZh: id === "auto" ? "自动推荐" : id === "custom" ? "自定义" : "跟随风格",
        nameEn: id === "auto" ? "Auto" : id === "custom" ? "Custom" : "Style default",
        description,
        useCases: [`需要${scope}${id === "auto" ? "由内容分析推荐" : id === "custom" ? "使用用户输入" : "继承当前风格"}时`],
        promptFragment: id === "auto" ? `根据内容、卡片角色和平台约束推荐${scope}。` : id === "custom" ? `采用用户填写的自定义${scope}，并保持系列视觉圣经。` : `使用当前风格内建的${scope}，不追加覆盖。`,
        negativeFragment: `不得把“${id}”绘制成画面文字；不得覆盖用户显式选择。`,
        keywords: [id, scope],
        reason: `这是 Luffy 的${scope}选择包装项，不是上游原生枚举值。`,
        compatibilityNotes: ["包装项用于 UI 和推荐状态；与上游规范 ID 分开持久化。"],
    });
}

export const XHS_STYLES = xhsOptions("风格", [
    ["cute", "可爱", "Cute", "甜美、亲切且适合生活方式分享。", "使用圆润造型、可爱贴纸、柔和粉彩和友好表情，信息层级仍保持清楚。", ["美妆", "穿搭", "可爱"]],
    ["fresh", "清新", "Fresh", "自然、健康、留白充分的轻盈视觉。", "使用明亮背景、植物感色彩、清爽留白和轻量图标。", ["健康", "自然", "清新"]],
    ["warm", "温暖", "Warm", "个人故事、生活经验和情绪分享。", "使用暖色、柔和质感与亲近的生活叙事画面。", ["生活", "故事", "温暖"]],
    ["bold", "醒目", "Bold", "警示、必看清单和强对比观点。", "使用大字号、高对比色块、明确警示符号和果断层级。", ["警告", "必看", "醒目"]],
    ["minimal", "极简", "Minimal", "专业、严肃或高端内容。", "使用严格网格、大片留白、少量高质量元素和克制色彩。", ["专业", "商务", "极简"]],
    ["retro", "复古", "Retro", "怀旧、历史、榜单和旧时光内容。", "使用复古印刷色、做旧纸张和年代感排版。", ["怀旧", "历史", "复古"]],
    ["pop", "流行波普", "Pop", "趣味事实、热点和高能量内容。", "使用饱和撞色、漫画式强调符号和流行文化节奏。", ["趣味", "热点", "波普"]],
    ["notion", "Notion 知识卡", "Notion", "知识、效率工具和 SaaS 解释。", "使用黑白线稿、简洁图标、模块卡片与生产力文档式层级。", ["知识", "SaaS", "效率"]],
    ["chalkboard", "黑板课堂", "Chalkboard", "课程、教学与工作坊内容。", "使用黑板背景、粉笔线条、课堂图示和高可读标题。", ["教育", "课堂", "教学"]],
    ["study-notes", "学习笔记", "Study notes", "复习资料、重点整理和高密度笔记。", "使用荧光笔、便签、手写批注与清楚分区，呈现真实学习笔记感。", ["笔记", "复习", "学习"]],
    ["screen-print", "丝网海报", "Screen print", "电影、音乐、书单和观点海报。", "使用有限套色、粗颗粒网点、强几何构图和编辑海报语言。", ["电影", "海报", "观点"]],
    ["sketch-notes", "手绘知识笔记", "Sketch notes", "教程、流程与友好知识总结。", "使用奶油纸张、黑色手绘线、马卡龙色块、箭头和小图标组织知识。", ["手绘", "教程", "流程"]],
]);

export const XHS_LAYOUTS = xhsOptions("版式", [
    ["sparse", "稀疏", "Sparse", "封面、短句和单一观点。", "使用一个主焦点、极少文字和大片留白。", ["封面", "短句", "单点"]],
    ["balanced", "均衡", "Balanced", "通用内容卡和标准解释。", "使用主视觉、标题与二至四个内容块的均衡布局。", ["通用", "均衡", "内容卡"]],
    ["dense", "高密度", "Dense", "知识卡、速查表和多要点总结。", "使用紧凑模块网格，但保证标题、分组、正文和标注的层级。", ["知识卡", "速查", "高密度"]],
    ["list", "列表", "List", "清单、排行和步骤集合。", "使用清楚编号或项目符号，从上到下保持稳定阅读节奏。", ["清单", "排行", "列表"]],
    ["comparison", "对比", "Comparison", "前后对比、选型和差异说明。", "使用左右或上下并列区域，对齐相同维度并强调差异。", ["对比", "前后", "选型"]],
    ["flow", "流程", "Flow", "教程、路径和阶段推进。", "使用连续步骤、方向箭头和明确起止节点组织阅读。", ["教程", "流程", "步骤"]],
    ["mindmap", "思维导图", "Mind map", "概念地图和发散知识结构。", "使用中心主题与多级分支，分支颜色与线条语义一致。", ["概念图", "思维导图", "分支"]],
    ["quadrant", "四象限", "Quadrant", "SWOT、分类和二维矩阵。", "使用二乘二象限与清楚坐标或分类标签，四区权重均衡。", ["SWOT", "分类", "矩阵"]],
]);

export const XHS_PALETTES = xhsOptions("配色", [
    ["macaron", "马卡龙", "Macaron", "奶油底色与柔和教育色块。", "使用奶油白背景、黑色线条与马卡龙粉、黄、蓝、绿色块。", ["教育", "手绘", "柔和"]],
    ["warm", "暖色", "Warm", "生活、故事和亲切内容。", "使用米色、珊瑚橙、柔和红棕和温暖中性色。", ["生活", "故事", "暖色"]],
    ["neon", "霓虹", "Neon", "潮流、科技和高能量海报。", "使用深色或强对比底色与霓虹青、品红、紫色高亮。", ["潮流", "科技", "霓虹"]],
]);

export const XHS_OUTLINE_STRATEGIES = xhsOptions("大纲策略", [
    ["story-driven", "故事驱动", "Story driven", "以钩子、冲突、推进和收束串联卡片。", "系列按故事弧推进：首图建立钩子，中段逐步揭示，末图收束或行动引导。", ["故事", "经历", "转变"]],
    ["information-dense", "信息密集", "Information dense", "以分类、要点和证据提高知识承载量。", "系列按知识模块拆分，每张只承担一个信息主题，并保留精确事实。", ["知识", "清单", "教程"]],
    ["visual-first", "视觉优先", "Visual first", "先设计强视觉节奏，再用最少文字支撑。", "系列以强画面和版式变化推进，文字短而准确，保持统一视觉圣经。", ["视觉", "灵感", "展示"]],
]);

export const XHS_CANVAS_RATIOS = xhsOptions("画幅", [
    ["portrait-3-4", "竖版 3:4", "Portrait 3:4", "小红书图文笔记的主流竖版画幅。", "构图适配 3:4 竖画幅，底部保留平台信息区。", ["竖版", "图文"]],
    ["square", "方形 1:1", "Square 1:1", "引用、单点知识与产品图卡。", "构图适配 1:1 方画幅，中心信息在缩略图中清楚。", ["方形", "图卡"]],
    ["portrait-2-3", "竖版 2:3", "Portrait 2:3", "更修长的竖向内容卡。", "构图适配 2:3 竖画幅，保持从上到下的阅读路径。", ["竖版", "长卡"]],
]);

type XhsPresetRow = readonly [id: string, style: string, layout: string, palette: string | undefined, nameZh: string, description: string, keywords: readonly string[]];

const XHS_PRESET_ROWS: readonly XhsPresetRow[] = [
    ["knowledge-card", "notion", "dense", undefined, "知识卡", "Notion 风高密度知识卡。", ["知识", "速查"]],
    ["checklist", "notion", "list", undefined, "检查清单", "Notion 风清楚列表。", ["清单", "步骤"]],
    ["concept-map", "notion", "mindmap", undefined, "概念地图", "Notion 风思维导图。", ["概念", "导图"]],
    ["swot", "notion", "quadrant", undefined, "SWOT", "Notion 风四象限分析。", ["SWOT", "分析"]],
    ["tutorial", "chalkboard", "flow", undefined, "课堂教程", "黑板风步骤流程。", ["教程", "课堂"]],
    ["classroom", "chalkboard", "balanced", undefined, "课堂讲义", "黑板风均衡讲义。", ["课堂", "讲义"]],
    ["study-guide", "study-notes", "dense", undefined, "学习指南", "高密度学习笔记。", ["复习", "学习"]],
    ["hand-drawn-edu", "sketch-notes", "flow", "macaron", "手绘教育流程", "马卡龙手绘教程与流程。", ["教育", "教程"]],
    ["sketch-card", "sketch-notes", "dense", "macaron", "手绘知识卡", "马卡龙手绘高密度知识卡。", ["手绘", "知识卡"]],
    ["sketch-summary", "sketch-notes", "balanced", "macaron", "手绘总结", "马卡龙手绘均衡总结卡。", ["手绘", "总结"]],
    ["cute-share", "cute", "balanced", undefined, "可爱分享", "可爱均衡的通用生活分享；也是无明显信号时的回退。", ["分享", "生活"]],
    ["girly", "cute", "sparse", undefined, "甜美少女", "稀疏甜美封面。", ["美妆", "穿搭"]],
    ["cozy-story", "warm", "balanced", undefined, "温馨故事", "暖色均衡的个人故事。", ["故事", "生活"]],
    ["product-review", "fresh", "comparison", undefined, "产品测评", "清新并列的产品对比。", ["测评", "对比"]],
    ["nature-flow", "fresh", "flow", undefined, "自然流程", "清新自然的步骤或成长路径。", ["自然", "流程"]],
    ["warning", "bold", "list", undefined, "醒目警示", "高对比必看清单。", ["警告", "必看"]],
    ["versus", "bold", "comparison", undefined, "强对比", "高冲击左右对比。", ["对比", "选择"]],
    ["clean-quote", "minimal", "sparse", undefined, "极简金句", "大片留白与单句观点。", ["金句", "极简"]],
    ["pro-summary", "minimal", "balanced", undefined, "专业总结", "克制均衡的专业总结。", ["专业", "总结"]],
    ["retro-ranking", "retro", "list", undefined, "复古排行", "复古印刷感榜单。", ["排行", "复古"]],
    ["throwback", "retro", "balanced", undefined, "怀旧回顾", "复古均衡的历史回顾。", ["怀旧", "历史"]],
    ["pop-facts", "pop", "list", undefined, "波普趣闻", "波普撞色的趣味事实列表。", ["趣闻", "事实"]],
    ["hype", "pop", "sparse", undefined, "热点冲击", "稀疏高能量热点封面。", ["热点", "宣传"]],
    ["poster", "screen-print", "sparse", undefined, "丝网海报", "单一焦点的丝网印刷海报。", ["海报", "电影"]],
    ["editorial", "screen-print", "balanced", undefined, "编辑海报", "均衡的观点和文化评论海报。", ["评论", "编辑"]],
    ["cinematic", "screen-print", "comparison", undefined, "电影对照", "双色调电影式对照构图。", ["电影", "对照"]],
];

export const XHS_PRESETS: RegistryOption[] = XHS_PRESET_ROWS.map(([id, style, layout, palette, nameZh, description, keywords]) =>
    defineOption({
        id,
        nameZh,
        nameEn: id,
        description,
        useCases: [description],
        promptFragment: `采用“${nameZh}”预设：${style} 风格、${layout} 版式${palette ? `、${palette} 配色` : "，配色使用该风格默认值"}；显式维度可覆盖。`,
        negativeFragment: `避免用预设覆盖用户显式风格、版式或配色；避免系列卡片视觉漂移。`,
        keywords: [...keywords],
        reason: `内容结构适合“${nameZh}”预设。`,
        preferredWith: { style: [style], layout: [layout], ...(palette ? { palette: [palette] } : {}) },
        compatibilityNotes: ["预设展开为风格、版式与可选配色；用户显式维度优先。"],
    }),
);

type TokenRow = readonly [id: string, nameZh: string];

function tokenOptions(group: string, rows: readonly TokenRow[]): RegistryOption[] {
    return rows.map(([id, nameZh]) =>
        defineOption({
            id,
            nameZh,
            nameEn: id,
            description: `小红书视觉元素：${nameZh}。`,
            useCases: [`需要${nameZh}作为${group}时`],
            promptFragment: `${group}使用“${nameZh}”，服务当前信息层级并保持系列一致。`,
            negativeFragment: `避免${group}喧宾夺主、遮挡正文或破坏移动端可读性。`,
            keywords: [id, nameZh],
            reason: `用户或视觉规划需要${group}“${nameZh}”。`,
            compatibilityNotes: [`${group}属于可选细节，不得覆盖风格、版式和平台安全区。`],
        }),
    );
}

export const XHS_GRIDS = tokenOptions("网格", [
    ["single", "单区"],
    ["dual", "双区"],
    ["triptych", "三联"],
    ["quad", "四格"],
    ["six-grid", "六格"],
    ["nine-grid", "九宫格"],
]);
export const XHS_CUTOUTS = tokenOptions("抠图效果", [
    ["none", "无抠图"],
    ["clean", "干净抠图"],
    ["soft", "柔边抠图"],
    ["stylized", "风格化抠图"],
    ["silhouette", "剪影"],
]);
export const XHS_STROKES = tokenOptions("描边", [
    ["none", "无描边"],
    ["white-solid", "白色实线"],
    ["colored-solid", "彩色实线"],
    ["dashed", "虚线"],
    ["double", "双线"],
    ["glow", "发光描边"],
    ["shadow", "阴影描边"],
]);
export const XHS_FILTERS = tokenOptions("图像滤镜", [
    ["none", "无滤镜"],
    ["clear-glow", "清透发光"],
    ["film-grain", "胶片颗粒"],
    ["cream-skin", "奶油肤色"],
    ["japanese-magazine", "日系杂志"],
    ["high-saturation", "高饱和"],
    ["muted-tones", "低饱和"],
    ["warm-tone", "暖调"],
    ["cool-tone", "冷调"],
    ["halftone", "半调网点"],
    ["print-grain", "印刷颗粒"],
    ["natural-photo", "自然照片"],
]);
export const XHS_TEXT_DECORATIONS = tokenOptions("装饰文字", [
    ["none", "无装饰"],
    ["gradient", "渐变字"],
    ["stroke-text", "描边字"],
    ["shadow-3d", "立体阴影字"],
    ["highlight", "高亮字"],
    ["neon", "霓虹字"],
    ["handwritten", "手写字"],
    ["bubble", "气泡字"],
    ["brush", "笔刷字"],
]);
export const XHS_TAGS = tokenOptions("标签", [
    ["none", "无标签"],
    ["black-white", "黑底白字"],
    ["white-black", "白底黑字"],
    ["bubble", "气泡标签"],
    ["pointer", "指针标签"],
    ["ribbon", "丝带标签"],
    ["stamp", "印章标签"],
    ["pill", "胶囊标签"],
]);
export const XHS_DIRECTIONS = tokenOptions("阅读方向", [
    ["horizontal", "水平"],
    ["vertical", "垂直"],
    ["curved", "曲线"],
    ["diagonal", "对角"],
]);
export const XHS_TEXT_EFFECTS = tokenOptions("文字效果", [
    ["shadow", "阴影"],
    ["outline", "轮廓"],
    ["glow", "发光"],
    ["underline-wavy", "波浪下划线"],
    ["strikethrough", "删除线"],
]);
export const XHS_EMPHASIS_MARKS = tokenOptions("强调标记", [
    ["red-arrow", "红箭头"],
    ["circle-mark", "圈画"],
    ["underline", "下划线"],
    ["star-burst", "星芒"],
    ["checkmark", "对勾"],
    ["cross-mark", "叉号"],
    ["exclamation", "感叹号"],
    ["question", "问号"],
    ["numbering", "编号"],
    ["bracket", "括号"],
]);
export const XHS_BACKGROUNDS = tokenOptions("背景", [
    ["solid-saturated", "高饱和纯色"],
    ["solid-pastel", "粉彩纯色"],
    ["gradient-linear", "线性渐变"],
    ["gradient-radial", "径向渐变"],
    ["frosted-glass", "磨砂玻璃"],
    ["paper-texture", "纸张纹理"],
    ["fabric-texture", "织物纹理"],
    ["chalkboard", "黑板"],
    ["grid", "网格"],
    ["dots", "圆点"],
]);
export const XHS_DOODLES = tokenOptions("涂鸦", [
    ["hand-drawn-lines", "手绘线"],
    ["stars-sparkles", "星星闪光"],
    ["flowers", "花朵"],
    ["hearts", "爱心"],
    ["clouds", "云朵"],
    ["arrows-curvy", "弯曲箭头"],
    ["squiggles", "波浪线"],
    ["confetti", "彩纸"],
    ["leaves", "叶片"],
    ["bubbles", "泡泡"],
]);
export const XHS_FRAMES = tokenOptions("边框", [
    ["polaroid", "拍立得"],
    ["film-strip", "胶片"],
    ["phone-screenshot", "手机截图"],
    ["torn-paper", "撕纸"],
    ["rounded-rect", "圆角矩形"],
    ["decorative", "装饰边框"],
    ["tape-corners", "胶带角"],
    ["stamp-border", "邮票齿孔"],
]);
export const XHS_DIVIDERS = tokenOptions("分隔线", [
    ["line-simple", "简线"],
    ["line-dashed", "虚线"],
    ["line-wavy", "波浪线"],
    ["dots-row", "点列"],
    ["ornamental", "花饰"],
]);
export const XHS_STICKERS = tokenOptions("贴纸", [
    ["badge-new", "新品徽章"],
    ["badge-hot", "热门徽章"],
    ["badge-sale", "促销徽章"],
    ["seal-quality", "品质印章"],
    ["ribbon-award", "奖项丝带"],
    ["tag-price", "价格标签"],
]);

export const XHS_STYLE_OPTIONS = [wrapper("auto", "风格", "按内容信号从十二种上游风格中推荐；无明显信号时回退 cute-share 预设。"), ...XHS_STYLES, wrapper("custom", "风格", "使用用户填写的自定义风格说明。")];
export const XHS_LAYOUT_OPTIONS = [wrapper("auto", "版式", "按卡片角色和内容结构推荐上游版式。"), ...XHS_LAYOUTS, wrapper("custom", "版式", "使用用户填写的自定义版式说明。")];
export const XHS_PALETTE_OPTIONS = [wrapper("style-default", "配色", "不覆盖风格内建配色；sketch-notes 默认使用 macaron。"), wrapper("auto", "配色", "按风格和内容推荐显式配色。"), ...XHS_PALETTES, wrapper("custom", "配色", "使用用户填写的自定义配色。")];
export const XHS_PRESET_OPTIONS = [wrapper("auto", "预设", "按内容信号推荐预设；无信号时使用 cute-share。"), ...XHS_PRESETS, wrapper("custom", "预设", "使用用户填写的整体预设说明。")];
export const XHS_CANVAS_RATIO_OPTIONS = [wrapper("auto", "画幅", "优先跟随平台预设。"), ...XHS_CANVAS_RATIOS, wrapper("custom", "画幅", "使用自定义平台画幅。")];
