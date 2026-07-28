import type { RegistryOption } from "../types";
import { defineOption } from "./option-utils";

type OptionRow = readonly [id: string, nameZh: string, nameEn: string, description: string, promptFragment: string, keywords: readonly string[]];

const ART_TONE_COMPATIBILITY: Record<string, { preferred: string[]; incompatible: string[] }> = {
    "ligne-claire": { preferred: ["neutral", "warm"], incompatible: ["romantic", "action"] },
    manga: { preferred: ["neutral", "romantic", "energetic", "action"], incompatible: ["vintage"] },
    realistic: { preferred: ["neutral", "warm", "dramatic", "vintage"], incompatible: ["romantic", "energetic"] },
    "ink-brush": { preferred: ["neutral", "dramatic", "action", "vintage"], incompatible: ["romantic", "energetic"] },
    chalk: { preferred: ["neutral", "warm", "energetic"], incompatible: ["dramatic", "action", "romantic"] },
    minimalist: { preferred: ["neutral"], incompatible: ["dramatic", "vintage", "romantic", "action"] },
};

function comicOptions(group: string, rows: readonly OptionRow[]): RegistryOption[] {
    return rows.map(([id, nameZh, nameEn, description, promptFragment, keywords]) => {
        const artCompatibility = group === "画风" ? ART_TONE_COMPATIBILITY[id] : undefined;
        return defineOption({
            id,
            nameZh,
            nameEn,
            description,
            useCases: [description],
            promptFragment,
            negativeFragment: `避免偏离“${nameZh}”的${group}目标；同一故事中的人物身份、服装、道具和空间连续性不得漂移。`,
            keywords: [...keywords],
            reason: `故事类型或情绪信号适合${group}“${nameZh}”。`,
            ...(artCompatibility ? { preferredWith: { tone: artCompatibility.preferred }, incompatibleWith: { tone: artCompatibility.incompatible } } : {}),
            compatibilityNotes: [`这是漫画${group}选项；不推荐组合只提示风险，不禁止用户显式选择。`],
        });
    });
}

function wrapper(id: "auto" | "custom" | "none", scope: string, description: string): RegistryOption {
    return defineOption({
        id,
        nameZh: id === "auto" ? "自动推荐" : id === "custom" ? "自定义" : "不套用预设",
        nameEn: id === "auto" ? "Auto" : id === "custom" ? "Custom" : "No preset",
        description,
        useCases: [`需要${scope}${id === "auto" ? "按故事分析推荐" : id === "custom" ? "采用用户输入" : "分别选择各设计维度"}时`],
        promptFragment: id === "auto" ? `根据题材、年代、情绪和篇幅推荐${scope}。` : id === "custom" ? `采用用户填写的自定义${scope}，并锁定角色与场景视觉圣经。` : "不套用整体漫画预设，分别遵循用户选择的画风、基调和分格版式。",
        negativeFragment: `不得把“${id}”绘制成画面文字；不得覆盖用户显式选择。`,
        keywords: [id, scope],
        reason: `这是 Luffy 的${scope}选择包装项，不是上游原生枚举值。`,
        compatibilityNotes: ["包装项用于 UI 和推荐状态；与上游规范 ID 分开保存。"],
    });
}

export const COMIC_ART_STYLES = comicOptions("画风", [
    ["ligne-claire", "清线漫画", "Ligne claire", "清楚均匀轮廓、平涂色块和易读叙事。", "使用清晰等粗轮廓、平整色块、简化阴影和稳定角色比例。", ["传记", "个人故事", "清线"]],
    ["manga", "日式漫画", "Manga", "富有表情和动作节奏的漫画语言。", "使用漫画式分镜、表情与速度线，角色造型原创且全篇一致。", ["教程", "情感", "漫画"]],
    ["realistic", "写实漫画", "Realistic", "具有真实空间、光线和人物比例的叙事插画。", "使用可信人体、环境透视和电影光线，但保持漫画画面统一。", ["历史", "生活", "写实"]],
    ["ink-brush", "水墨笔刷", "Ink brush", "笔墨张力、留白和东方动作感。", "使用墨色干湿、书写性笔触、留白与动态构图。", ["武侠", "古风", "动作"]],
    ["chalk", "粉笔漫画", "Chalk", "课堂、教育和手绘板书质感。", "使用黑板或纸面粉笔线条、简化角色和清楚教学标注。", ["课堂", "教学", "粉笔"]],
    ["minimalist", "极简漫画", "Minimalist", "简化人物、有限色彩和强节奏的短篇表达。", "使用极简线条人物、黑白主调与单一强调色，动作轮廓清楚。", ["四格", "寓言", "短篇"]],
]);

export const COMIC_TONES = comicOptions("基调", [
    ["neutral", "中性", "Neutral", "清楚、平衡且适合解释与传记。", "情绪保持中性清楚，以动作和信息推进。", ["通用", "解释", "传记"]],
    ["warm", "温暖", "Warm", "亲近、成长和人际关系。", "使用温暖光线与真诚表情，避免煽情。", ["成长", "导师", "故事"]],
    ["dramatic", "戏剧", "Dramatic", "冲突、突破和高张力转折。", "使用强明暗、动态镜头和清楚冲突焦点。", ["冲突", "突破", "戏剧"]],
    ["romantic", "浪漫", "Romantic", "爱情、青春和情感故事。", "使用柔和光线、细腻眼神和克制装饰元素。", ["爱情", "青春", "浪漫"]],
    ["energetic", "活力", "Energetic", "快节奏、喜剧和积极行动。", "使用明快节奏、夸张动作和高能量构图。", ["活力", "喜剧", "行动"]],
    ["vintage", "怀旧", "Vintage", "年代、历史和经典叙事。", "使用受控做旧色、时代光线与符合年代的场景细节。", ["历史", "年代", "怀旧"]],
    ["action", "动作", "Action", "战斗、追逐和身体运动。", "使用强方向线、清楚动作剪影和连续空间关系。", ["战斗", "追逐", "动作"]],
]);

export const COMIC_LAYOUTS = comicOptions("版式", [
    ["standard", "标准分格", "Standard", "每页四至六格的通用漫画阅读。", "每页四至六格，按 Z 形从左到右、从上到下阅读，格距稳定。", ["通用", "叙事", "4-6格"]],
    ["cinematic", "电影分格", "Cinematic", "每页二至四个宽幅镜头。", "每页二至四个宽幅镜头，以水平扫视和镜头尺度变化建立电影节奏。", ["电影", "历史", "宽幅"]],
    ["dense", "密集九宫格", "Dense", "每页六至九格的高信息密度解释。", "每页六至九格，以三乘三为基础，保持气泡和动作仍可读。", ["教程", "高密度", "九宫格"]],
    ["splash", "跨页大画面", "Splash", "一至两个大画面配少量小格，突出高潮。", "使用一至两个主画面并配二至三个小格，主画面承担转折或动作高潮。", ["高潮", "动作", "冲击"]],
    ["mixed", "混合分格", "Mixed", "三至七个不规则分格的传记或长篇节奏。", "每页三至七格，混合宽窄与大小，但阅读顺序必须明确。", ["传记", "长篇", "变化"]],
    ["webtoon", "条漫", "Webtoon", "三至五格单列纵向阅读。", "每页三至五格单列垂直排布，以间距控制停顿和揭示。", ["教程", "移动端", "条漫"]],
    ["four-panel", "四格", "Four panel", "严格四格、起承转合的单页短篇。", "严格使用四格二乘二 Z 形阅读：起、承、转、合各占一格，画幅优先 4:3。", ["四格", "寓言", "短篇"]],
]);

export const COMIC_ASPECT_RATIOS = comicOptions("画幅", [
    ["3:4", "竖版 3:4", "Portrait 3:4", "上游默认的竖版漫画页。", "页面构图适配 3:4 竖画幅，外边距和格距一致。", ["竖版", "默认"]],
    ["4:3", "横版 4:3", "Landscape 4:3", "四格或横向教学漫画。", "页面构图适配 4:3 横画幅，四格时使用二乘二结构。", ["四格", "横版"]],
    ["16:9", "宽银幕 16:9", "Widescreen 16:9", "电影式单页或宽幅故事板。", "页面构图适配 16:9 宽画幅，使用水平镜头推进。", ["电影", "宽幅"]],
]);

export const COMIC_READING_DIRECTIONS = comicOptions("阅读方向", [
    ["left-to-right", "从左到右", "Left to right", "中文横排和通用国际阅读顺序。", "所有分格、气泡和动作视线从左到右、从上到下推进。", ["中文", "通用", "左到右"]],
    ["right-to-left", "从右到左", "Right to left", "需要日式漫画阅读顺序的作品。", "所有分格、气泡和动作视线从右到左、从上到下推进。", ["日式", "右到左"]],
    ["top-to-bottom", "从上到下", "Top to bottom", "条漫和移动端单列阅读。", "所有分格按单列从上到下推进，以留白控制停顿。", ["条漫", "移动端", "纵向"]],
]);

export const COMIC_TEXT_MODES = comicOptions("文字模式", [
    ["with-text", "包含文字", "With text", "在画面中准确呈现必要对话和旁白。", "绘制精简对话气泡和旁白框；所有指定文字逐字准确。", ["对话", "旁白", "文字"]],
    ["no-text", "无文字", "No text", "只用画面、动作和表情叙事。", "画面不得出现对话、旁白、气泡、标题或装饰性字母。", ["无字", "纯画面"]],
]);

export const COMIC_DIALOGUE_DENSITIES = comicOptions("对话密度", [
    ["low", "少", "Low", "每格零至一句，突出动作和表情。", "对话极少，每格最多一句短句，并为画面留足空间。", ["动作", "少对话"]],
    ["medium", "适中", "Medium", "对话与动作平衡的通用密度。", "每格使用一至两个简短气泡，按阅读顺序摆放。", ["通用", "平衡"]],
    ["high", "多", "High", "解释、辩论或教学所需的较多对话。", "允许较多短气泡，但不得遮挡人物、动作或关键道具。", ["教学", "辩论", "多对话"]],
]);

export const COMIC_NARRATION_DENSITIES = comicOptions("旁白密度", [
    ["low", "少", "Low", "只在转场或必要背景处使用旁白。", "旁白极少，仅用于时间、地点或不可见背景信息。", ["动作", "少旁白"]],
    ["medium", "适中", "Medium", "用简短旁白连接场景和时间。", "每页使用少量短旁白框，避免复述画面。", ["通用", "转场"]],
    ["high", "多", "High", "传记、历史或内心叙事需要较多旁白。", "允许较多旁白，但拆成短句并保持分格节奏与可读性。", ["传记", "历史", "内心"]],
]);

export const COMIC_PARTIAL_MODES = comicOptions("局部工作流", [
    ["storyboard-only", "仅分镜", "Storyboard only", "只规划故事、页面与分格，不生成画面。", "输出完整结构化分镜和视觉圣经，停在图像生成之前。", ["分镜", "规划"]],
    ["prompts-only", "仅提示词", "Prompts only", "在已有分镜上生成逐页提示词，不生成画面。", "为每页生成可复现提示快照，保持角色和场景连续。", ["提示词", "规划"]],
    ["images-only", "仅生成图片", "Images only", "使用已有分镜和提示快照生成画面。", "严格使用已有分镜、角色表和提示快照生成图片。", ["图片", "已有分镜"]],
    ["regenerate", "重生成选中页", "Regenerate", "只重生成失败或用户选中的页面。", "使用同一提示快照重生成选中页，保留所有已成功页面。", ["重试", "选中页"]],
]);

type ComicPresetRow = readonly [id: string, art: string, tone: string, layout: string, nameZh: string, description: string, specialRule: string, keywords: readonly string[]];

const COMIC_PRESET_ROWS: readonly ComicPresetRow[] = [
    ["ohmsha", "manga", "neutral", "webtoon", "技术教学漫画", "教程、编程和初学者解释。", "用原创导师、学习者和工具角色，以视觉隐喻、装置揭示和动作教学推进；避免连续谈话头像。", ["教程", "编程", "技术"]],
    ["wuxia", "ink-brush", "action", "splash", "武侠", "武侠、仙侠和剑术故事。", "使用气劲、兵器运动轨迹、山水留白和强动作高潮。", ["武侠", "仙侠", "剑术"]],
    ["shoujo", "manga", "romantic", "standard", "少女漫画", "爱情、校园和情感戏剧。", "强调眼神、情绪节拍和克制花饰，保持原创角色。", ["爱情", "校园", "情感"]],
    ["concept-story", "manga", "warm", "standard", "概念故事", "心理、成长、管理和软技能。", "建立贯穿全篇的原创视觉符号、成长弧，并平衡对话与行动。", ["心理", "成长", "管理"]],
    ["four-panel", "minimalist", "neutral", "four-panel", "极简四格", "寓言、短洞察和商业小故事。", "严格起承转合四格，黑白为主配单一强调色，使用原创简化角色。", ["寓言", "四格", "洞察"]],
];

export const COMIC_PRESETS: RegistryOption[] = COMIC_PRESET_ROWS.map(([id, art, tone, layout, nameZh, description, specialRule, keywords]) =>
    defineOption({
        id,
        nameZh,
        nameEn: id,
        description,
        useCases: [description],
        promptFragment: `采用“${nameZh}”预设：${art} 画风、${tone} 基调、${layout} 版式。${specialRule}`,
        negativeFragment: "避免预设覆盖用户显式画风、基调或版式；不得复制第三方受保护角色或品牌造型。",
        keywords: [...keywords],
        reason: `故事信号适合“${nameZh}”预设。`,
        preferredWith: { artStyle: [art], tone: [tone], layout: [layout] },
        compatibilityNotes: ["预设展开为画风、基调、版式和特殊叙事规则；用户显式维度优先。"],
    }),
);

export const COMIC_LAYOUT_PANEL_RULES: Readonly<Record<string, { min: number; max: number; reading: string }>> = {
    standard: { min: 4, max: 6, reading: "left-to-right" },
    cinematic: { min: 2, max: 4, reading: "left-to-right" },
    dense: { min: 6, max: 9, reading: "left-to-right" },
    splash: { min: 3, max: 5, reading: "left-to-right" },
    mixed: { min: 3, max: 7, reading: "left-to-right" },
    webtoon: { min: 3, max: 5, reading: "top-to-bottom" },
    "four-panel": { min: 4, max: 4, reading: "left-to-right" },
};

export const COMIC_ART_STYLE_OPTIONS = [wrapper("auto", "画风", "按题材和年代推荐六种上游画风；回退 ligne-claire。"), ...COMIC_ART_STYLES, wrapper("custom", "画风", "使用用户填写的自定义画风。")];
export const COMIC_TONE_OPTIONS = [wrapper("auto", "基调", "按冲突和情绪推荐七种上游基调；回退 neutral。"), ...COMIC_TONES, wrapper("custom", "基调", "使用用户填写的自定义情绪基调。")];
export const COMIC_LAYOUT_OPTIONS = [wrapper("auto", "版式", "按题材、篇幅和平台推荐七种上游版式；回退 standard。"), ...COMIC_LAYOUTS, wrapper("custom", "版式", "使用用户填写的自定义分格规则。")];
export const COMIC_PRESET_OPTIONS = [
    wrapper("auto", "预设", "按题材信号推荐五种上游预设；未命中时分别推荐画风、基调和版式。"),
    wrapper("none", "预设", "不套用整体预设，分别使用画风、基调与版式选项。"),
    ...COMIC_PRESETS,
    wrapper("custom", "预设", "使用用户填写的整体漫画预设。"),
];
export const COMIC_ASPECT_RATIO_OPTIONS = [wrapper("auto", "画幅", "优先跟随平台；无平台约束时使用 3:4。"), ...COMIC_ASPECT_RATIOS, wrapper("custom", "画幅", "使用用户自定义平台画幅。")];
