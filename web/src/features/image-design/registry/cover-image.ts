import type { RegistryOption } from "../types";
import { defineOption } from "./option-utils";

type OptionRow = readonly [id: string, nameZh: string, nameEn: string, description: string, promptFragment: string, keywords: readonly string[]];

type MatrixRule = {
    preferred: readonly string[];
    incompatible: readonly string[];
};

type MatrixRules = Readonly<Record<string, MatrixRule>>;

type MatrixBinding = {
    label: string;
    ownAxis: string;
    peerKey: string;
    rules: MatrixRules;
};

const BAOYU_COVER_MATRIX_SOURCE = "baoyu-skills@6b7a2e417500561a5ecdd0b168332f4142584617";

const COVER_PALETTE_RENDERING_MATRIX: MatrixRules = {
    warm: { preferred: ["flat-vector", "hand-drawn"], incompatible: [] },
    elegant: { preferred: ["hand-drawn", "digital"], incompatible: ["pixel", "chalk"] },
    cool: { preferred: ["flat-vector", "digital"], incompatible: ["painterly"] },
    dark: { preferred: ["digital", "chalk", "screen-print"], incompatible: [] },
    earth: { preferred: ["hand-drawn", "painterly"], incompatible: ["pixel", "chalk"] },
    vivid: { preferred: ["flat-vector", "pixel", "screen-print"], incompatible: [] },
    pastel: { preferred: ["flat-vector", "hand-drawn", "painterly"], incompatible: ["pixel", "chalk", "screen-print"] },
    mono: { preferred: ["flat-vector", "digital", "screen-print"], incompatible: ["painterly"] },
    retro: { preferred: ["flat-vector", "hand-drawn", "digital", "screen-print"], incompatible: ["chalk"] },
    duotone: { preferred: ["screen-print"], incompatible: ["hand-drawn", "painterly", "pixel", "chalk"] },
};

const COVER_TYPE_RENDERING_MATRIX: MatrixRules = {
    hero: { preferred: ["hand-drawn", "painterly", "digital", "screen-print"], incompatible: [] },
    conceptual: { preferred: ["flat-vector", "digital"], incompatible: ["painterly"] },
    typography: { preferred: ["flat-vector", "digital", "screen-print"], incompatible: [] },
    metaphor: { preferred: ["hand-drawn", "painterly", "screen-print"], incompatible: ["pixel"] },
    scene: { preferred: ["painterly"], incompatible: ["flat-vector", "chalk"] },
    minimal: { preferred: ["flat-vector", "digital", "screen-print"], incompatible: ["pixel", "chalk"] },
};

const COVER_TYPE_TEXT_MATRIX: MatrixRules = {
    hero: { preferred: ["title-only", "title-subtitle"], incompatible: [] },
    conceptual: { preferred: ["none", "title-only"], incompatible: [] },
    typography: { preferred: ["title-subtitle", "text-rich"], incompatible: ["none"] },
    metaphor: { preferred: ["none"], incompatible: ["text-rich"] },
    scene: { preferred: ["none"], incompatible: ["text-rich"] },
    minimal: { preferred: ["none", "title-only"], incompatible: ["text-rich"] },
};

const COVER_TYPE_MOOD_MATRIX: MatrixRules = {
    hero: { preferred: ["balanced", "bold"], incompatible: [] },
    conceptual: { preferred: ["subtle", "balanced"], incompatible: [] },
    typography: { preferred: ["balanced", "bold"], incompatible: [] },
    metaphor: { preferred: ["subtle", "balanced"], incompatible: [] },
    scene: { preferred: ["subtle", "balanced"], incompatible: [] },
    minimal: { preferred: ["subtle", "balanced"], incompatible: ["bold"] },
};

const COVER_FONT_RENDERING_MATRIX: MatrixRules = {
    clean: { preferred: ["flat-vector", "digital"], incompatible: ["hand-drawn", "painterly", "chalk"] },
    handwritten: { preferred: ["hand-drawn", "painterly", "chalk"], incompatible: ["pixel", "screen-print"] },
    serif: { preferred: ["digital"], incompatible: ["hand-drawn", "pixel", "chalk"] },
    display: { preferred: ["flat-vector", "digital", "pixel", "screen-print"], incompatible: [] },
};

function transposeMatrix(matrix: MatrixRules): MatrixRules {
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

const COVER_RENDERING_PALETTE_MATRIX = transposeMatrix(COVER_PALETTE_RENDERING_MATRIX);
const COVER_RENDERING_TYPE_MATRIX = transposeMatrix(COVER_TYPE_RENDERING_MATRIX);
const COVER_TEXT_TYPE_MATRIX = transposeMatrix(COVER_TYPE_TEXT_MATRIX);
const COVER_MOOD_TYPE_MATRIX = transposeMatrix(COVER_TYPE_MOOD_MATRIX);
const COVER_RENDERING_FONT_MATRIX = transposeMatrix(COVER_FONT_RENDERING_MATRIX);

function withMatrixCompatibility(options: RegistryOption[], bindings: MatrixBinding[]): RegistryOption[] {
    return options.map((option) => {
        const preferredWith: Record<string, string[]> = {};
        const incompatibleWith: Record<string, string[]> = {};
        const notes: string[] = [];

        for (const binding of bindings) {
            const rule = binding.rules[option.id];
            if (!rule) {
                notes.push(`${BAOYU_COVER_MATRIX_SOURCE} 的 ${binding.label} 未列出 ${binding.ownAxis}=${option.id}；不推断兼容等级。`);
                continue;
            }
            if (rule.preferred.length) preferredWith[binding.peerKey] = [...rule.preferred];
            if (rule.incompatible.length) incompatibleWith[binding.peerKey] = [...rule.incompatible];
            notes.push(`${BAOYU_COVER_MATRIX_SOURCE} ${binding.label}：✓✓ ${binding.peerKey}=${rule.preferred.join(", ") || "无"}；✗ ${binding.peerKey}=${rule.incompatible.join(", ") || "无"}；其余已列单元格为 ✓。`);
        }

        return {
            ...option,
            compatibility: {
                ...(Object.keys(preferredWith).length ? { preferredWith } : {}),
                ...(Object.keys(incompatibleWith).length ? { incompatibleWith } : {}),
                notes,
            },
        };
    });
}

function coverOptions(group: string, rows: readonly OptionRow[]): RegistryOption[] {
    return rows.map(([id, nameZh, nameEn, description, promptFragment, keywords]) =>
        defineOption({
            id,
            nameZh,
            nameEn,
            description,
            useCases: [description],
            promptFragment,
            negativeFragment: `避免偏离“${nameZh}”的视觉目标，避免无关装饰和信息噪声。`,
            keywords: [...keywords],
            reason: `内容信号与${group}“${nameZh}”相符。`,
            compatibilityNotes: [`这是封面${group}选项；显式选择优先于预设、偏好和自动推荐。`],
        }),
    );
}

function wrapper(id: "auto" | "custom" | "style-default", scope: string, description: string): RegistryOption {
    return defineOption({
        id,
        nameZh: id === "auto" ? "自动推荐" : id === "custom" ? "自定义" : "跟随风格",
        nameEn: id === "auto" ? "Auto" : id === "custom" ? "Custom" : "Style default",
        description,
        useCases: [`需要${scope}${id === "auto" ? "由内容分析推荐" : id === "custom" ? "使用用户输入" : "继承当前风格预设"}时`],
        promptFragment: id === "auto" ? `根据主题、受众和平台约束推荐${scope}。` : id === "custom" ? `采用用户填写的自定义${scope}，并保持平台硬约束。` : `从当前风格预设继承${scope}，不额外覆盖。`,
        negativeFragment: `不得把“${id}”作为画面文字；不得覆盖用户显式选择和平台硬约束。`,
        keywords: [id, scope],
        reason: `这是 Luffy 的${scope}选择包装项，不是 baoyu-skills 的原生枚举值。`,
        compatibilityNotes: ["包装项只控制选择策略；保存和推荐时应与上游规范选项区分。"],
    });
}

export const COVER_TYPES = withMatrixCompatibility(
    coverOptions("类型", [
        ["hero", "主视觉", "Hero", "以单一主体和强焦点建立第一印象。", "使用主视觉封面：一个主角或产品占据视觉中心，标题与主体形成明确主次。", ["产品", "发布", "主视觉"]],
        ["conceptual", "概念解释", "Conceptual", "把技术、系统或抽象主题转成清楚的视觉模型。", "使用概念型封面：以结构、关系和符号解释核心概念，避免写实堆砌。", ["技术", "系统", "概念"]],
        ["typography", "字体主导", "Typography", "让标题、观点或短句成为主要视觉。", "使用字体主导封面：文字承担构图主体，字形、尺度与留白形成节奏。", ["观点", "引言", "文字"]],
        ["metaphor", "视觉隐喻", "Metaphor", "用克制而易懂的象征表达哲思、成长或转变。", "使用视觉隐喻封面：一个清楚的象征物承载抽象观点，不使用陈词滥调。", ["哲思", "成长", "转变"]],
        ["scene", "场景叙事", "Scene", "通过具体人物、地点或事件建立故事感。", "使用场景型封面：以一个可读的叙事瞬间呈现人物、环境和情绪。", ["故事", "旅行", "生活"]],
        ["minimal", "极简", "Minimal", "用少量元素、大片留白和精确层级表达主题。", "使用极简封面：保留一个核心符号与充足留白，排除不必要的背景元素。", ["极简", "禅意", "简单"]],
    ]),
    [
        { label: "Type×Rendering", ownAxis: "type", peerKey: "rendering", rules: COVER_TYPE_RENDERING_MATRIX },
        { label: "Type×Text", ownAxis: "type", peerKey: "textMode", rules: COVER_TYPE_TEXT_MATRIX },
        { label: "Type×Mood", ownAxis: "type", peerKey: "mood", rules: COVER_TYPE_MOOD_MATRIX },
    ],
);

export const COVER_PALETTES = withMatrixCompatibility(
    coverOptions("配色", [
        ["warm", "暖色", "Warm", "亲切、叙事与人文感的暖色体系。", "采用温暖的橙、米、珊瑚与柔和棕色，保持舒适对比。", ["故事", "人文", "温暖"]],
        ["elegant", "优雅", "Elegant", "克制、精致并适合商业或高端主题。", "采用低饱和深色、象牙白与少量金属感强调色，保持精致秩序。", ["商务", "高端", "优雅"]],
        ["cool", "冷色", "Cool", "清晰、理性且具有科技感。", "采用蓝、青、冷灰色层次，保持高可读性与技术气质。", ["科技", "理性", "数据"]],
        ["dark", "暗色", "Dark", "电影感、沉浸感和强烈明暗关系。", "采用深色背景与有限高亮，建立聚焦而不压黑细节。", ["电影", "氛围", "暗色"]],
        ["earth", "大地色", "Earth", "自然、可持续与有机材料感。", "采用土褐、苔绿、沙色和自然白，呈现有机而可信的质感。", ["自然", "环保", "有机"]],
        ["vivid", "鲜艳", "Vivid", "发布、游戏和活动所需的高能量对比。", "采用高饱和主色与清楚互补色，保持焦点鲜明而不杂乱。", ["发布", "游戏", "活动"]],
        ["pastel", "粉彩", "Pastel", "柔和、梦幻、亲子或轻松内容。", "采用低饱和粉彩色块和柔和明度层级，保持轻盈。", ["梦幻", "儿童", "柔和"]],
        ["mono", "单色", "Monochrome", "极简、严肃或强调形状与排版。", "采用单色或近单色层级，通过明度和线条区分信息。", ["极简", "严肃", "单色"]],
        ["retro", "复古", "Retro", "历史、怀旧和复古印刷语境。", "采用做旧红、芥末黄、墨绿和纸张色，形成受控的怀旧感。", ["历史", "怀旧", "复古"]],
        ["duotone", "双色调", "Duotone", "海报、电影或强概念主题的双色表达。", "采用一组高辨识双色调，以明暗和叠印关系塑造戏剧焦点。", ["海报", "电影", "双色"]],
        ["macaron", "马卡龙", "Macaron", "教育、教程和友好知识表达。", "采用奶油底色与柔和马卡龙色块，黑色线条保证可读性。", ["教育", "教程", "知识"]],
    ]),
    [{ label: "Palette×Rendering", ownAxis: "palette", peerKey: "rendering", rules: COVER_PALETTE_RENDERING_MATRIX }],
);

export const COVER_RENDERINGS = withMatrixCompatibility(
    coverOptions("渲染", [
        ["flat-vector", "扁平矢量", "Flat vector", "几何简化、清楚轮廓和现代图形表达。", "以扁平几何形、统一轮廓和有限阴影渲染，避免照片质感。", ["现代", "清爽", "矢量"]],
        ["hand-drawn", "手绘", "Hand drawn", "自然线条和亲切的人工作品感。", "以略带不规则的手绘线条、纸张触感和简化插画渲染。", ["手绘", "草图", "教育"]],
        ["painterly", "绘画", "Painterly", "艺术、梦境和富有笔触的图像。", "以可见笔触、柔和色彩过渡和绘画层次渲染。", ["艺术", "梦幻", "绘画"]],
        ["digital", "数字插画", "Digital", "精确、现代并适合数据或 SaaS 主题。", "以干净数字插画、清楚光影和精确边缘渲染。", ["数据", "SaaS", "数字"]],
        ["pixel", "像素", "Pixel art", "游戏、复古电子与低分辨率美学。", "以清晰像素网格、有限色板和像素级轮廓渲染。", ["游戏", "像素", "复古"]],
        ["chalk", "粉笔", "Chalk", "课堂、教学和黑板笔记感。", "以黑板底、粉笔线条和可擦写纹理渲染，文字保持清楚。", ["课堂", "教学", "粉笔"]],
        ["screen-print", "丝网印刷", "Screen print", "海报、电影和音乐活动的印刷质感。", "以有限套色、粗颗粒网点和丝网印刷叠色渲染。", ["海报", "电影", "演出"]],
    ]),
    [
        { label: "Palette×Rendering", ownAxis: "rendering", peerKey: "palette", rules: COVER_RENDERING_PALETTE_MATRIX },
        { label: "Type×Rendering", ownAxis: "rendering", peerKey: "type", rules: COVER_RENDERING_TYPE_MATRIX },
        { label: "Font×Rendering", ownAxis: "rendering", peerKey: "font", rules: COVER_RENDERING_FONT_MATRIX },
    ],
);

export const COVER_TEXT_MODES = withMatrixCompatibility(
    coverOptions("文字量", [
        ["none", "无文字", "No text", "只保留视觉内容，不在画面中生成文字。", "画面不出现标题、副标题、标签或装饰性字母。", ["纯视觉", "无文字"]],
        ["title-only", "仅标题", "Title only", "只准确呈现主标题。", "只绘制用户提供的主标题，保持短、醒目且逐字准确。", ["文章", "封面", "标题"]],
        ["title-subtitle", "标题与副标题", "Title and subtitle", "用两级文字建立主题和补充信息。", "准确绘制主标题与副标题，形成明确两级层次。", ["系列", "教程", "副标题"]],
        ["text-rich", "丰富文字", "Text rich", "承载公告、功能点或较多结构化短文本。", "绘制标题及少量结构化短标签，保证移动端可读并避免段落堆叠。", ["公告", "功能", "信息"]],
    ]),
    [{ label: "Type×Text", ownAxis: "textMode", peerKey: "type", rules: COVER_TEXT_TYPE_MATRIX }],
);

export const COVER_MOODS = withMatrixCompatibility(
    coverOptions("视觉强度", [
        ["subtle", "克制", "Subtle", "低视觉噪声、专业而含蓄。", "整体视觉强度克制，使用柔和对比、细节和留白。", ["专业", "克制"]],
        ["balanced", "平衡", "Balanced", "在吸引力和信息清晰度之间保持平衡。", "整体视觉强度平衡，焦点明确但不过度夸张。", ["通用", "教育", "平衡"]],
        ["bold", "强烈", "Bold", "适合发布、活动和需要高冲击力的主题。", "整体视觉强度大胆，以大尺度、高对比和果断构图建立冲击力。", ["发布", "活动", "强烈"]],
    ]),
    [{ label: "Type×Mood", ownAxis: "mood", peerKey: "type", rules: COVER_MOOD_TYPE_MATRIX }],
);

export const COVER_FONTS = withMatrixCompatibility(
    coverOptions("字体气质", [
        ["clean", "简洁无衬线", "Clean", "现代、技术和通用内容的高可读字体气质。", "标题使用简洁无衬线字形，笔画清楚、字距稳定。", ["技术", "现代", "清晰"]],
        ["handwritten", "手写", "Handwritten", "个人化、亲切和手作主题。", "标题使用自然手写字形，保持可读且不过度潦草。", ["个人", "亲切", "手作"]],
        ["serif", "衬线", "Serif", "学术、文化和高端主题。", "标题使用有节制的衬线字形，建立权威与编辑感。", ["学术", "文化", "高端"]],
        ["display", "展示字体", "Display", "公告、活动和需要强辨识度的短标题。", "标题使用具有个性的展示字形，但保持字面准确和缩略图可读。", ["公告", "活动", "醒目"]],
    ]),
    [{ label: "Font×Rendering", ownAxis: "font", peerKey: "rendering", rules: COVER_FONT_RENDERING_MATRIX }],
);

export const COVER_ASPECT_RATIOS = coverOptions("画幅", [
    ["16:9", "横版 16:9", "Landscape 16:9", "通用横版封面和视频缩略图。", "构图适配 16:9 横画幅，关键内容留在平台安全区。", ["横版", "视频"]],
    ["2.35:1", "超宽 2.35:1", "Ultrawide 2.35:1", "公众号头条等超宽封面。", "构图适配 2.35:1 超宽画幅，主体和文字集中在中央安全区。", ["超宽", "公众号"]],
    ["4:3", "横版 4:3", "Landscape 4:3", "传统演示、文章和横向图卡。", "构图适配 4:3 横画幅，保持稳定层级。", ["横版", "文章"]],
    ["3:2", "横版 3:2", "Landscape 3:2", "摄影感或编辑型横图。", "构图适配 3:2 横画幅，以三分法组织焦点。", ["摄影", "编辑"]],
    ["1:1", "方形 1:1", "Square 1:1", "社交图卡和次条封面。", "构图适配 1:1 方画幅，中心焦点在缩略图中仍清楚。", ["方形", "社交"]],
    ["3:4", "竖版 3:4", "Portrait 3:4", "移动端笔记和竖向封面。", "构图适配 3:4 竖画幅，标题和主体保持移动端可读。", ["竖版", "移动端"]],
]);

type CoverPresetRow = readonly [id: string, palette: string, rendering: string, nameZh: string, description: string, keywords: readonly string[]];

const COVER_PRESET_ROWS: readonly CoverPresetRow[] = [
    ["elegant", "elegant", "hand-drawn", "优雅手绘", "优雅配色与精致手绘的编辑型封面。", ["优雅", "文化", "高端"]],
    ["blueprint", "cool", "digital", "蓝图", "冷色数字插画形成技术蓝图感。", ["技术", "架构", "蓝图"]],
    ["chalkboard", "dark", "chalk", "黑板", "暗色黑板与粉笔渲染的教学封面。", ["课堂", "教学", "黑板"]],
    ["dark-atmospheric", "dark", "digital", "暗黑氛围", "深色数字绘制和克制高光的沉浸氛围。", ["电影", "悬疑", "氛围"]],
    ["editorial-infographic", "cool", "digital", "编辑信息图", "冷色数字信息图与杂志式层级。", ["编辑", "数据", "报告"]],
    ["fantasy-animation", "pastel", "painterly", "奇幻动画", "粉彩绘画质感与梦幻动画叙事。", ["奇幻", "儿童", "故事"]],
    ["flat-doodle", "pastel", "flat-vector", "扁平涂鸦", "粉彩扁平图形与轻松涂鸦元素。", ["轻松", "创意", "涂鸦"]],
    ["intuition-machine", "retro", "digital", "直觉机器", "复古数字设备、界面符号与概念关系。", ["系统", "机器", "复古科技"]],
    ["minimal", "mono", "flat-vector", "极简", "单色扁平几何和大片留白。", ["极简", "现代", "克制"]],
    ["nature", "earth", "hand-drawn", "自然", "大地色手绘与有机自然元素。", ["自然", "环保", "植物"]],
    ["notion", "mono", "digital", "Notion 风", "单色数字线稿和清楚知识卡片层级。", ["知识", "SaaS", "简洁"]],
    ["pixel-art", "vivid", "pixel", "像素艺术", "鲜艳有限色板与清晰像素图形。", ["游戏", "像素", "复古"]],
    ["playful", "pastel", "hand-drawn", "活泼手绘", "粉彩手绘和轻松友好的角色或图标。", ["亲子", "活泼", "分享"]],
    ["retro", "retro", "digital", "数字复古", "复古色板与现代数字构成结合。", ["历史", "怀旧", "文化"]],
    ["sketch-notes", "warm", "hand-drawn", "手绘笔记", "暖色纸张、黑色线条和知识笔记结构。", ["笔记", "教育", "知识"]],
    ["vector-illustration", "retro", "flat-vector", "复古矢量", "复古柔色、统一黑色轮廓和几何矢量。", ["科普", "矢量", "插画"]],
    ["vintage", "retro", "hand-drawn", "复古手绘", "做旧色彩和手工绘制的怀旧封面。", ["历史", "旧物", "怀旧"]],
    ["warm", "warm", "hand-drawn", "暖色手绘", "亲切暖色和自然线条的通用叙事封面。", ["故事", "成长", "生活"]],
    ["warm-flat", "warm", "flat-vector", "暖色扁平", "暖色几何图形与干净现代构图。", ["产品", "团队", "友好"]],
    ["hand-drawn-edu", "macaron", "hand-drawn", "手绘教育", "马卡龙色块与黑色手绘线条的教育视觉。", ["教育", "教程", "科普"]],
    ["watercolor", "earth", "painterly", "水彩", "大地色透明水彩与柔和纸张纹理。", ["旅行", "自然", "生活"]],
    ["poster-art", "retro", "screen-print", "复古海报", "复古套色和丝网印刷颗粒的海报视觉。", ["海报", "演出", "文化"]],
    ["mondo", "mono", "screen-print", "Mondo 海报", "单色或近单色的高概念丝网印刷海报。", ["电影", "收藏海报", "概念"]],
    ["art-deco", "elegant", "screen-print", "装饰艺术", "优雅套色、几何边框和装饰艺术秩序。", ["高端", "建筑", "装饰艺术"]],
    ["propaganda", "vivid", "screen-print", "宣传画", "鲜艳高对比、强角度与粗颗粒印刷语言。", ["活动", "号召", "强视觉"]],
    ["cinematic", "duotone", "screen-print", "电影海报", "双色调丝网印刷与电影式光影焦点。", ["电影", "叙事", "海报"]],
];

export const COVER_PRESETS: RegistryOption[] = COVER_PRESET_ROWS.map(([id, palette, rendering, nameZh, description, keywords]) =>
    defineOption({
        id,
        nameZh,
        nameEn: id,
        description,
        useCases: [description],
        promptFragment: `采用“${nameZh}”预设：以 ${palette} 配色和 ${rendering} 渲染为起点；用户显式配色或渲染可分别覆盖。`,
        negativeFragment: `避免混入与“${nameZh}”无关的渲染语言，避免用预设覆盖用户显式选择。`,
        keywords: [...keywords],
        reason: `主题适合“${nameZh}”预设。`,
        preferredWith: { palette: [palette], rendering: [rendering] },
        compatibilityNotes: ["预设展开为配色和渲染；显式维度选择的优先级更高。"],
    }),
);

export const COVER_TYPE_OPTIONS = [wrapper("auto", "封面类型", "由内容信号推荐六种上游类型之一。"), ...COVER_TYPES, wrapper("custom", "封面类型", "使用用户填写的类型和构图说明。")];
export const COVER_PALETTE_OPTIONS = [wrapper("auto", "配色", "由内容与平台推荐上游配色。"), wrapper("style-default", "配色", "使用当前风格预设携带的配色。"), ...COVER_PALETTES, wrapper("custom", "配色", "使用用户填写的色值或色彩语言。")];
export const COVER_RENDERING_OPTIONS = [wrapper("auto", "渲染", "由内容信号推荐上游渲染方式。"), ...COVER_RENDERINGS, wrapper("custom", "渲染", "使用用户填写的渲染语言。")];
export const COVER_PRESET_OPTIONS = [wrapper("auto", "风格预设", "由内容信号推荐上游风格预设，未命中时保持维度自动。"), ...COVER_PRESETS, wrapper("custom", "风格预设", "使用用户填写的整体风格说明。")];
export const COVER_TEXT_MODE_OPTIONS = [wrapper("auto", "文字量", "按内容用途推荐文字量。"), ...COVER_TEXT_MODES];
export const COVER_MOOD_OPTIONS = [wrapper("auto", "视觉强度", "按受众和发布语境推荐强度。"), ...COVER_MOODS];
export const COVER_FONT_OPTIONS = [wrapper("auto", "字体气质", "按主题和文案推荐字体气质。"), ...COVER_FONTS];
export const COVER_ASPECT_RATIO_OPTIONS = [wrapper("auto", "画幅", "优先采用平台预设画幅，平台未指定时再推荐。"), ...COVER_ASPECT_RATIOS, wrapper("custom", "画幅", "采用用户自定义的平台画幅。")];
