import { modelMatchesCapability, type AiConfig } from "@/stores/use-config-store";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";

import { designSkillById } from "../registry/design-skills";
import { BUILTIN_PLATFORM_PRESETS } from "../registry/platform-presets";
import type { ImageDesignRecommendation } from "../types";
import { recommendImageDesign, type RecommendationInput } from "./local-recommender";
import { normalizeAiRecommendation } from "./normalize-recommendation";

export type AiRecommendationOptions = {
    config: AiConfig;
    input: RecommendationInput;
    signal?: AbortSignal;
};

export async function recommendImageDesignWithAi(options: AiRecommendationOptions): Promise<ImageDesignRecommendation> {
    const fallback = recommendImageDesign(options.input);
    const textModel = options.config.textModel.trim();
    if (!textModel || !modelMatchesCapability(options.config, textModel, "text")) return { ...fallback, source: "fallback", warnings: ["未配置可用文本模型，已使用本地推荐。"] };
    try {
        const answer = await requestImageQuestion({ ...options.config, model: textModel, systemPrompt: "" }, buildRecommendationMessages(options.input), () => undefined, { signal: options.signal });
        return normalizeAiRecommendation(answer, fallback, options.input);
    } catch (error) {
        if (options.signal?.aborted) throw error;
        return {
            ...fallback,
            source: "fallback",
            warnings: [`智能推荐失败，已使用本地推荐：${error instanceof Error ? error.message : "未知错误"}`],
        };
    }
}

export function buildRecommendationMessages(input: RecommendationInput): AiTextMessage[] {
    const skills = ["none", "cover-image", "xhs-images", "infographic", "article-illustrator", "comic", "diagram"]
        .map((id) => {
            const skill = designSkillById(id as Parameters<typeof designSkillById>[0]);
            const groups = skill.optionGroups.map((group) => `${group.key}=[${(group.options || []).map((option) => option.id).join(",")}]`).join("; ");
            return `${skill.id}: ${groups}`;
        })
        .join("\n");
    const presets = BUILTIN_PLATFORM_PRESETS.map((preset) => `${preset.id}(${preset.platformLabel}/${preset.label})`).join(", ");
    const system = `你是图片创作参数推荐器。只输出一个 JSON 对象，不输出 Markdown、解释或思维过程。
只能使用注册表中的 skillId、platformPresetId 和 option id，不得创造新 id。
用户明确选择的参数必须原样保留；平台预设是强约束，不能被 Skill 参数覆盖。
reasoning 仅给每项一句简短、可展示的推荐依据，不输出私有推理过程。

可用 Skill 与选项：
${skills}

可用平台预设：
${presets}

输出结构：
{"skillId":"cover-image","platformPresetId":"wechat-headline-cover","options":{},"reasoning":{},"confidence":0.0}`;
    const user = `内容：\n${input.content}

当前 Skill：${input.skillId || "未选择"}
当前平台预设：${input.platformPresetId || "未选择"}
平台：${input.platformId || "未指定"}
内容类型：${input.contentType || "未指定"}
用户明确参数：${JSON.stringify(input.explicitOptions || {})}
保存偏好：${JSON.stringify(input.savedOptions || {})}
参考图摘要：${input.referenceSummary || "无"}`;
    const capabilities = `当前图片模型能力：${JSON.stringify(
        input.modelCapabilities || {
            provider: "unknown",
            apiFormat: "unknown",
            model: "unknown",
            supportsReferenceImages: undefined,
            maxReferenceImages: undefined,
            maxCount: 15,
        },
    )}`;
    return [
        { role: "system", content: system },
        { role: "user", content: `${user}\n${capabilities}` },
    ];
}
