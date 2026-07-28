import type { AiConfig } from "@/stores/use-config-store";
import { requestImageQuestion, type AiTextMessage } from "./image";

export type ImagePromptOptimizationMode = "general" | "chinese" | "photography" | "poster";

export const IMAGE_PROMPT_OPTIMIZATION_MODES: Array<{
    value: ImagePromptOptimizationMode;
    label: string;
    description: string;
}> = [
    {
        value: "general",
        label: "通用增强",
        description: "补全主体、环境、构图、光线、色彩、材质与画面质量，适合大多数生图模型。",
    },
    {
        value: "chinese",
        label: "中文模型优化",
        description: "使用自然、具体的中文视觉语言，适合 Qwen、Seedream 等中文理解较强的模型。",
    },
    {
        value: "photography",
        label: "摄影写实",
        description: "强化镜头视角、景深、布光、材质和真实感，避免无意义的参数堆砌。",
    },
    {
        value: "poster",
        label: "海报与封面",
        description: "强化信息层级、视觉焦点、标题安全区和留白，降低乱码与拥挤风险。",
    },
];

export type OptimizeImagePromptOptions = {
    config: AiConfig;
    prompt: string;
    mode: ImagePromptOptimizationMode;
    requirements?: string;
    previousPrompt?: string;
    feedback?: string;
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
};

const BASE_SYSTEM_PROMPT = `你是生图提示词优化器。你的任务是把用户的原始描述改写为可直接提交给图像生成模型的高质量提示词。

必须遵守：
1. 只输出优化后的提示词正文，不输出标题、解释、Markdown、代码块或前后缀。
2. 保持原始创作意图，不添加与主题冲突的人物、品牌、文字、文化符号或叙事。
3. 逐字保留原文中的引号文字、数字、比例、尺寸、专有名词、变量占位符（如 {{variable}}）、必须项和禁止项。
4. 不声称已经生成图片，不编造参考图中不存在的细节。
5. 使用明确、可视化、可执行的描述；删除空泛赞美、重复词和互相冲突的要求。
6. 默认按主体、环境、构图、视角、光线、色彩、材质、风格、质量与负面约束组织，但不要机械输出字段名。
7. 输出语言跟随原始提示词；原文以中文为主时使用中文，以英文为主时使用英文。`;

const MODE_INSTRUCTIONS: Record<ImagePromptOptimizationMode, string> = {
    general: `采用通用生图优化策略：补足主体特征、动作或状态、空间关系、环境、构图、光线、色彩、材质、风格和画面完成度。优先使用自然语言，避免关键词无序堆叠。`,
    chinese: `采用中文模型优化策略：使用地道、具体、连贯的中文视觉描述，强调空间、层次、光影、色彩和材质。只有原始主题确实适合时才加入中式审美元素，不要强行国风化。`,
    photography: `采用摄影写实优化策略：明确拍摄对象、场景、机位、焦段感、景深、光源方向、曝光氛围、材质细节和真实色彩。相机参数仅在能改善画面时使用，避免伪专业参数堆砌。`,
    poster: `采用海报与封面优化策略：建立清晰视觉层级、单一主焦点、足够留白和标题安全区；原文包含准确文字时逐字保留，并要求模型为文字预留区域而不是生成乱码。兼顾缩略图可读性。`,
};

export function buildImagePromptOptimizationMessages(options: Omit<OptimizeImagePromptOptions, "config" | "signal" | "onDelta">): AiTextMessage[] {
    const prompt = options.prompt.trim();
    const requirements = options.requirements?.trim();
    const previousPrompt = options.previousPrompt?.trim();
    const feedback = options.feedback?.trim();
    const iteration = Boolean(previousPrompt && feedback);

    const userContent = iteration
        ? `请根据反馈继续优化提示词。\n\n原始提示词：\n${prompt}\n\n当前优化版本：\n${previousPrompt}\n\n本轮反馈：\n${feedback}${requirements ? `\n\n长期附加要求：\n${requirements}` : ""}`
        : `请优化以下生图提示词。\n\n原始提示词：\n${prompt}${requirements ? `\n\n附加要求：\n${requirements}` : ""}`;

    return [
        { role: "system", content: `${BASE_SYSTEM_PROMPT}\n\n本次模式：\n${MODE_INSTRUCTIONS[options.mode]}` },
        { role: "user", content: userContent },
    ];
}

export async function optimizeImagePrompt(options: OptimizeImagePromptOptions) {
    const textModel = options.config.textModel.trim();
    if (!textModel) throw new Error("请先配置文本模型");
    if (!options.prompt.trim()) throw new Error("请输入需要优化的提示词");

    const answer = await requestImageQuestion(
        { ...options.config, model: textModel },
        buildImagePromptOptimizationMessages(options),
        options.onDelta || (() => undefined),
        { signal: options.signal },
    );
    return normalizeOptimizedPrompt(answer);
}

export function normalizeOptimizedPrompt(value: string) {
    let result = value.trim();
    const fenced = result.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?```$/);
    if (fenced) result = fenced[1].trim();

    try {
        const parsed = JSON.parse(result) as Record<string, unknown>;
        const candidate = parsed.optimizedPrompt ?? parsed.prompt ?? parsed.content ?? parsed.result;
        if (typeof candidate === "string") result = candidate.trim();
    } catch {
        // The preferred response is plain text; non-JSON content needs no repair.
    }

    result = result.replace(/^(?:优化后的提示词|优化结果|提示词)\s*[:：]\s*/i, "").trim();
    if (!result) throw new Error("文本模型没有返回有效的优化结果");
    return result;
}
