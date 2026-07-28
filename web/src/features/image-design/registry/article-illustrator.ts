import type { RegistryOption } from "../types";
import { defineOption } from "./option-utils";

type OptionRow = readonly [id: string, nameZh: string, nameEn: string, description: string, promptFragment: string, keywords: readonly string[]];

type ArticleMatrixRule = {
    preferred: readonly string[];
    incompatible: readonly string[];
};

type ArticleMatrixRules = Readonly<Record<string, ArticleMatrixRule>>;

const BAOYU_ARTICLE_MATRIX_SOURCE = "baoyu-skills@6b7a2e417500561a5ecdd0b168332f4142584617";

const ARTICLE_TYPE_STYLE_MATRIX: ArticleMatrixRules = {
    infographic: {
        preferred: ["sketch-notes", "vector-illustration", "notion", "minimal", "blueprint", "elegant", "editorial", "scientific"],
        incompatible: [],
    },
    scene: {
        preferred: ["warm", "watercolor", "screen-print"],
        incompatible: ["sketch-notes", "blueprint", "scientific"],
    },
    flowchart: {
        preferred: ["sketch-notes", "vector-illustration", "notion", "blueprint", "editorial"],
        incompatible: ["watercolor", "screen-print"],
    },
    comparison: {
        preferred: ["sketch-notes", "vector-illustration", "notion", "minimal", "elegant", "editorial"],
        incompatible: [],
    },
    framework: {
        preferred: ["sketch-notes", "vector-illustration", "notion", "minimal", "blueprint", "elegant", "scientific"],
        incompatible: ["watercolor"],
    },
    timeline: {
        preferred: ["notion", "watercolor", "elegant", "editorial"],
        incompatible: [],
    },
};

function transposeArticleMatrix(matrix: ArticleMatrixRules): ArticleMatrixRules {
    const transposed: Record<string, { preferred: string[]; incompatible: string[] }> = {};
    for (const [rowId, rule] of Object.entries(matrix)) {
        for (const peerId of rule.preferred) {
            (transposed[peerId] ||= { preferred: [], incompatible: [] }).preferred.push(rowId);
        }
        for (const peerId of rule.incompatible) {
            (transposed[peerId] ||= { preferred: [], incompatible: [] }).incompatible.push(rowId);
        }
    }
    return transposed;
}

const ARTICLE_STYLE_TYPE_MATRIX = transposeArticleMatrix(ARTICLE_TYPE_STYLE_MATRIX);

function withArticleMatrixCompatibility(options: RegistryOption[], ownAxis: "illustrationType" | "style", peerKey: "illustrationType" | "style", rules: ArticleMatrixRules): RegistryOption[] {
    return options.map((option) => {
        const rule = rules[option.id];
        if (!rule) {
            return {
                ...option,
                compatibility: {
                    notes: [`${BAOYU_ARTICLE_MATRIX_SOURCE} 的 Type×Style 矩阵未列出 ${ownAxis}=${option.id}；不推断兼容等级。`],
                },
            };
        }
        return {
            ...option,
            compatibility: {
                ...(rule.preferred.length ? { preferredWith: { [peerKey]: [...rule.preferred] } } : {}),
                ...(rule.incompatible.length ? { incompatibleWith: { [peerKey]: [...rule.incompatible] } } : {}),
                notes: [`${BAOYU_ARTICLE_MATRIX_SOURCE} Type×Style：✓✓ ${peerKey}=${rule.preferred.join(", ") || "无"}；✗ ${peerKey}=${rule.incompatible.join(", ") || "无"}；其余已列单元格为 ✓。`],
            },
        };
    });
}

function articleOptions(group: string, rows: readonly OptionRow[]): RegistryOption[] {
    return rows.map(([id, nameZh, nameEn, description, promptFragment, keywords]) =>
        defineOption({
            id,
            nameZh,
            nameEn,
            description,
            useCases: [description],
            promptFragment,
            negativeFragment: `避免生成与文章核心论点无关的装饰；不得改写数字、单位、日期、专名或指定标签。`,
            keywords: [...keywords],
            reason: `文章结构或语气信号适合${group}“${nameZh}”。`,
            compatibilityNotes: [`这是文章插图${group}选项；文章事实、用户显式选择和平台硬约束优先。`],
        }),
    );
}

function wrapper(id: "auto" | "custom" | "style-default", scope: string, description: string): RegistryOption {
    return defineOption({
        id,
        nameZh: id === "auto" ? "自动推荐" : id === "custom" ? "自定义" : "跟随风格",
        nameEn: id === "auto" ? "Auto" : id === "custom" ? "Custom" : "Style default",
        description,
        useCases: [`需要${scope}${id === "auto" ? "按文章分析推荐" : id === "custom" ? "采用用户输入" : "继承当前风格"}时`],
        promptFragment: id === "auto" ? `分析文章论点、数据和关系后推荐${scope}。` : id === "custom" ? `采用用户填写的自定义${scope}，同时保持文章事实和系列视觉一致。` : `从当前风格或预设继承${scope}，不额外覆盖。`,
        negativeFragment: `不得把“${id}”绘制成画面文字；不得覆盖用户显式选择。`,
        keywords: [id, scope],
        reason: `这是 Luffy 的${scope}选择包装项，不是上游原生枚举值。`,
        compatibilityNotes: ["包装项用于 UI 和推荐状态；与上游规范 ID 分开保存。"],
    });
}

export const ARTICLE_UPSTREAM_TYPES = withArticleMatrixCompatibility(
    articleOptions("类型", [
        ["infographic", "信息图", "Infographic", "准确呈现关键事实、数据和多点关系。", "把本节关键事实组织成自洽信息图；数字、单位和标签逐字准确。", ["数据", "事实", "报告"]],
        ["scene", "场景", "Scene", "把叙事或抽象内容放入具体可理解的语境。", "设计一个具体叙事瞬间，用人物、环境和动作帮助理解文章观点。", ["故事", "经历", "生活"]],
        ["flowchart", "流程图", "Flowchart", "解释步骤、因果、输入和输出。", "用简洁节点和方向箭头表达步骤与因果，起止和分支清楚。", ["流程", "步骤", "因果"]],
        ["comparison", "对比", "Comparison", "按相同维度并列差异、优缺点和取舍。", "使用对齐的左右或上下区域逐项对比，不混淆同一维度。", ["对比", "区别", "取舍"]],
        ["framework", "框架", "Framework", "展示概念、层级、模块和组成关系。", "用主模块、子模块和清楚连接关系呈现文章框架。", ["框架", "体系", "架构"]],
        ["timeline", "时间线", "Timeline", "展示历史、阶段和演变顺序。", "沿稳定时间轴布置准确日期与事件，阶段变化清楚。", ["历史", "演变", "时间"]],
    ]),
    "illustrationType",
    "style",
    ARTICLE_TYPE_STYLE_MATRIX,
);

export const ARTICLE_EXTENSION_TYPES = withArticleMatrixCompatibility(
    articleOptions("Luffy 扩展类型", [
        ["conceptual", "概念模型", "Conceptual", "将核心概念转成克制、可解释的视觉模型。", "用明确对象、空间关系或符号建立核心概念模型，避免空泛装饰。", ["概念", "抽象", "模型"]],
        ["metaphor", "视觉隐喻", "Metaphor", "用单一且易懂的象征辅助理解观点。", "使用一个受控视觉隐喻映射文章关系，并保留具体上下文提示。", ["隐喻", "观点", "哲思"]],
        ["data", "数据图解", "Data", "聚焦数字、单位、比例和趋势。", "准确绘制数据、单位、比较基线和趋势方向；视觉尺度不得误导。", ["数据", "数字", "趋势"]],
        ["decorative", "章节装饰", "Decorative", "用轻量插图调节章节节奏，不承担核心事实。", "使用与章节主题直接相关的轻量装饰插图，保持低文字量和充足留白。", ["章节", "装饰", "节奏"]],
    ]),
    "illustrationType",
    "style",
    ARTICLE_TYPE_STYLE_MATRIX,
);

export const ARTICLE_TYPES = [...ARTICLE_UPSTREAM_TYPES, ...ARTICLE_EXTENSION_TYPES];

export const ARTICLE_TYPE_ALIASES: Readonly<Record<string, string>> = {
    concept: "conceptual",
    flow: "flowchart",
};

export const ARTICLE_STYLES = withArticleMatrixCompatibility(
    articleOptions("风格", [
        ["vector-illustration", "矢量插画", "Vector illustration", "统一黑色轮廓、复古柔色和几何简化。", "使用扁平几何、统一黑色轮廓、奶油背景和有限复古柔色；无渐变和写实照片。", ["科普", "教程", "矢量"]],
        ["notion", "Notion 风", "Notion", "黑白线稿、简洁图标和文档式知识层级。", "使用单色线稿、简洁图标、模块卡片和大量留白。", ["知识", "SaaS", "文档"]],
        ["elegant", "优雅编辑", "Elegant", "克制配色、衬线气质与精致编辑布局。", "使用低饱和色、细线、衬线标题和高质量留白。", ["商务", "历史", "高端"]],
        ["warm", "温暖插画", "Warm", "亲近、叙事和人文主题的暖色插画。", "使用暖色、柔和光线和简化人物场景，保持真诚而不煽情。", ["故事", "成长", "生活"]],
        ["minimal", "极简", "Minimal", "少量元素与精确空间关系。", "只保留必要形状、标签和关系，大面积留白。", ["极简", "观点", "专业"]],
        ["blueprint", "技术蓝图", "Blueprint", "冷色工程线条、网格和技术标注。", "使用蓝图网格、单线模块、精确箭头和冷色层级。", ["技术", "系统", "架构"]],
        ["watercolor", "水彩", "Watercolor", "透明笔触、纸张质感和柔和生活叙事。", "使用透明水彩晕染、纸张留白和柔和自然色。", ["旅行", "生活", "自然"]],
        ["editorial", "编辑插画", "Editorial", "杂志式概念构图和观点表达。", "使用清楚编辑层级、受控象征和现代杂志配色。", ["评论", "新闻", "数据"]],
        ["scientific", "科学图解", "Scientific", "严谨、清楚且适合研究与实验结果。", "使用科学示意图、精确标注、统一图例和克制颜色。", ["研究", "实验", "论文"]],
        ["chalkboard", "黑板粉笔", "Chalkboard", "课堂、教学和手写推导。", "使用深色黑板、粉笔线条、公式式注释和清楚步骤。", ["教育", "课堂", "推导"]],
        ["fantasy-animation", "奇幻动画", "Fantasy animation", "梦幻绘画、动画角色和叙事场景。", "使用柔和动画造型、梦幻光线和绘画背景。", ["故事", "奇幻", "儿童"]],
        ["flat", "扁平", "Flat", "简洁色块、现代图标和低视觉噪声。", "使用扁平色块、简化图标和无多余质感的现代构图。", ["产品", "说明", "现代"]],
        ["flat-doodle", "扁平涂鸦", "Flat doodle", "轻松扁平图形与涂鸦细节。", "使用扁平形状、随性线条和少量涂鸦强调。", ["轻松", "创意", "社交"]],
        ["intuition-machine", "直觉机器", "Intuition machine", "复古设备、概念接口和系统隐喻。", "使用模块化机器、仪表、连线和受控复古科技色。", ["系统", "机制", "概念"]],
        ["nature", "自然手绘", "Nature", "大地色、植物和有机线条。", "使用自然纸色、植物形态、手绘轮廓和有机留白。", ["自然", "环保", "健康"]],
        ["pixel-art", "像素艺术", "Pixel art", "有限色板和复古游戏图形。", "使用统一像素网格、硬边与有限色板。", ["游戏", "复古", "技术"]],
        ["playful", "活泼", "Playful", "友好角色、粉彩和轻松图标。", "使用圆润角色、粉彩色块和活泼但有节制的装饰。", ["亲子", "分享", "入门"]],
        ["retro", "复古数字", "Retro", "年代色彩和现代结构结合。", "使用复古色板、印刷细节和清楚现代信息结构。", ["历史", "文化", "怀旧"]],
        ["sketch", "草图", "Sketch", "快速线稿和概念探索感。", "使用松弛铅笔线、构思箭头和纸张痕迹，仍保持标签可读。", ["构思", "概念", "手稿"]],
        ["screen-print", "丝网印刷", "Screen print", "观点、文化和电影式海报语言。", "使用有限套色、粗颗粒半调和强几何焦点。", ["评论", "海报", "电影"]],
        ["sketch-notes", "手绘知识笔记", "Sketch notes", "奶油纸、黑线和马卡龙知识块。", "使用手绘标题、箭头、图标和马卡龙分区，结构优先。", ["教育", "流程", "总结"]],
        ["ink-notes", "墨线笔记", "Ink notes", "单色墨线、专业批注和结构化视觉笔记。", "使用黑墨线、灰阶层次、简短批注和精确框架关系。", ["专业", "方法", "对比"]],
        ["vintage", "复古手绘", "Vintage", "旧纸、手工线条和历史质感。", "使用做旧纸张、复古墨色和手绘历史细节。", ["历史", "档案", "怀旧"]],
    ]),
    "style",
    "illustrationType",
    ARTICLE_STYLE_TYPE_MATRIX,
);

export const ARTICLE_PALETTES = articleOptions("配色", [
    ["macaron", "马卡龙", "Macaron", "友好教育插图的奶油与柔和色块。", "使用奶油白背景、黑色线条和马卡龙粉、黄、蓝、绿色块。", ["教育", "手绘", "柔和"]],
    ["warm", "暖色", "Warm", "故事、品牌和亲近知识表达。", "使用米色、珊瑚橙、红棕和温暖中性色。", ["故事", "品牌", "温暖"]],
    ["neon", "霓虹", "Neon", "未来科技和高能量重点。", "使用暗底和霓虹青、品红、紫色高亮，保证标签对比。", ["科技", "未来", "高能量"]],
    ["mono-ink", "单色墨线", "Mono ink", "专业手绘笔记和严谨比较。", "使用黑墨、灰阶和纸张底色，以线重和留白区分层级。", ["专业", "笔记", "墨线"]],
]);

export const ARTICLE_DENSITIES = articleOptions("插图密度", [
    ["minimal", "精简（1–2 张）", "Minimal (1–2)", "只为最难解释的核心段落配置插图。", "全篇选择一至两处最高信息价值位置生成插图。", ["短文", "精简", "核心"]],
    ["balanced", "均衡（3–5 张）", "Balanced (3–5)", "覆盖主要论点并保持阅读节奏。", "全篇规划三至五张插图，分布在关键章节之间。", ["通用", "均衡", "文章"]],
    ["per-section", "每节至少一张", "Per section", "为每个真实章节至少规划一张插图；上游推荐值。", "逐节分析并为每个章节至少规划一张有信息价值的插图。", ["长文", "章节", "推荐"]],
    ["rich", "丰富（6 张以上）", "Rich (6+)", "高视觉密度教程、报告或长篇内容。", "全篇规划六张以上插图，但每张只承担一个清楚目的。", ["长文", "教程", "丰富"]],
]);

type ArticlePresetRow = readonly [id: string, type: string, style: string, palette: string | undefined, nameZh: string, description: string, keywords: readonly string[]];

const ARTICLE_PRESET_ROWS: readonly ArticlePresetRow[] = [
    ["tech-explainer", "infographic", "blueprint", undefined, "技术解释", "API、指标和技术深读。", ["技术", "API"]],
    ["system-design", "framework", "blueprint", undefined, "系统设计", "系统架构和方法框架。", ["架构", "系统"]],
    ["architecture", "framework", "vector-illustration", undefined, "模块架构", "组件关系和模块结构。", ["组件", "模块"]],
    ["science-paper", "infographic", "scientific", undefined, "科研论文", "研究发现、实验和学术结果。", ["研究", "实验"]],
    ["knowledge-base", "infographic", "vector-illustration", undefined, "知识库", "概念解释和通用教程。", ["知识", "科普"]],
    ["saas-guide", "infographic", "notion", undefined, "SaaS 指南", "产品指南和工具演示。", ["SaaS", "产品"]],
    ["tutorial", "flowchart", "vector-illustration", undefined, "步骤教程", "设置指南和逐步操作。", ["教程", "步骤"]],
    ["process-flow", "flowchart", "notion", undefined, "流程说明", "工作流和上手路径。", ["流程", "入门"]],
    ["warm-knowledge", "infographic", "vector-illustration", "warm", "暖色知识", "产品、团队和品牌知识卡。", ["品牌", "团队"]],
    ["edu-visual", "infographic", "vector-illustration", "macaron", "教育视觉", "知识总结和概念解释。", ["教育", "总结"]],
    ["hand-drawn-edu", "infographic", "sketch-notes", "macaron", "手绘教育", "通用默认的友好教育信息图。", ["通用", "教育"]],
    ["hand-drawn-edu-flow", "flowchart", "sketch-notes", "macaron", "手绘教育流程", "暖色手绘的步骤与工作流。", ["教程", "流程"]],
    ["hand-drawn-edu-compare", "comparison", "sketch-notes", "macaron", "手绘教育对比", "暖色手绘的并列比较。", ["教育", "对比"]],
    ["ink-notes-compare", "comparison", "ink-notes", "mono-ink", "墨线对比", "前后、传统与新方法等专业对比。", ["观点", "对比"]],
    ["ink-notes-flow", "flowchart", "ink-notes", "mono-ink", "墨线流程", "专业流程和技术走查。", ["专业", "流程"]],
    ["ink-notes-framework", "framework", "ink-notes", "mono-ink", "墨线框架", "系统隐喻、架构和方法论。", ["框架", "方法"]],
    ["data-report", "infographic", "editorial", undefined, "数据报告", "数据新闻、指标和报告。", ["数据", "报告"]],
    ["versus", "comparison", "vector-illustration", undefined, "方案对决", "技术选型和框架比较。", ["对比", "选型"]],
    ["business-compare", "comparison", "elegant", undefined, "商务比较", "产品评估和战略方案。", ["商务", "评估"]],
    ["storytelling", "scene", "warm", undefined, "故事叙事", "个人随笔、反思和成长故事。", ["故事", "成长"]],
    ["lifestyle", "scene", "watercolor", undefined, "生活方式", "旅行、健康和创意生活。", ["旅行", "生活"]],
    ["history", "timeline", "elegant", undefined, "历史时间线", "历史总览和里程碑。", ["历史", "里程碑"]],
    ["evolution", "timeline", "warm", undefined, "成长演变", "进步、成长和阶段变化。", ["演变", "成长"]],
    ["opinion-piece", "scene", "screen-print", undefined, "观点文章", "评论、批判和社论。", ["观点", "评论"]],
    ["editorial-poster", "comparison", "screen-print", undefined, "编辑对照海报", "辩论和对立观点。", ["辩论", "观点"]],
    ["cinematic", "scene", "screen-print", undefined, "电影叙事", "戏剧故事和文化随笔。", ["电影", "文化"]],
];

export const ARTICLE_PRESETS: RegistryOption[] = ARTICLE_PRESET_ROWS.map(([id, type, style, palette, nameZh, description, keywords]) =>
    defineOption({
        id,
        nameZh,
        nameEn: id,
        description,
        useCases: [description],
        promptFragment: `采用“${nameZh}”预设：${type} 类型、${style} 风格${palette ? `、${palette} 配色` : ""}；显式维度可覆盖。`,
        negativeFragment: "避免预设覆盖用户显式类型、风格或配色；避免为每段生成无信息价值的装饰图。",
        keywords: [...keywords],
        reason: `文章内容适合“${nameZh}”预设。`,
        preferredWith: { illustrationType: [type], style: [style], ...(palette ? { palette: [palette] } : {}) },
        compatibilityNotes: ["预设展开为插图类型、风格和可选配色；用户显式维度优先。"],
    }),
);

export const ARTICLE_STYLE_ALIASES: Readonly<Record<string, string>> = {
    "hand-drawn": "sketch-notes",
    vector: "vector-illustration",
    "minimal-flat": "notion",
    "sci-fi": "blueprint",
    editorial: "editorial",
    poster: "screen-print",
};

export const ARTICLE_TYPE_OPTIONS = [wrapper("auto", "插图类型", "逐节分析后从上游类型和 Luffy 扩展类型中推荐。"), ...ARTICLE_TYPES, wrapper("custom", "插图类型", "使用用户填写的自定义信息结构。")];
export const ARTICLE_STYLE_OPTIONS = [wrapper("auto", "风格", "按文章语气、受众和插图类型推荐上游风格。"), ...ARTICLE_STYLES, wrapper("custom", "风格", "使用用户填写的自定义视觉风格。")];
export const ARTICLE_PALETTE_OPTIONS = [wrapper("style-default", "配色", "使用当前风格或预设携带的配色。"), wrapper("auto", "配色", "按文章语气和风格推荐显式配色。"), ...ARTICLE_PALETTES, wrapper("custom", "配色", "使用用户填写的自定义配色。")];
export const ARTICLE_PRESET_OPTIONS = [wrapper("auto", "预设", "按文章信号推荐预设；无明显信号时使用 hand-drawn-edu。"), ...ARTICLE_PRESETS, wrapper("custom", "预设", "使用用户填写的整体预设说明。")];
