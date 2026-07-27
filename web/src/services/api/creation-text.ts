import type { AiConfig } from "@/stores/use-config-store";
import { buildCreativeBriefRequestPrompt, buildPromptVersionsRequestPrompt, CREATIVE_BRIEF_SYSTEM_PROMPT, PROMPT_OPTIMIZATION_SYSTEM_PROMPT } from "@/lib/creation/prompt-templates";
import type { CreationPromptStyle, CreativeBrief, PromptHardConstraints, SocialPlatform } from "@/types/creation";
import { requestImageQuestion, type AiTextMessage } from "./image";

export type CreationTextRequestOptions = {
    config: AiConfig;
    messages: AiTextMessage[];
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
};

export type AnalyzeCreationContentOptions = Omit<CreationTextRequestOptions, "messages"> & {
    sourceContent: string;
    platform: SocialPlatform;
    width: number;
    height: number;
    aspectRatio: string;
    scene?: string;
    additionalRequirements?: string;
};

export type GenerateCreationPromptVersionsOptions = Omit<CreationTextRequestOptions, "messages"> & {
    brief: CreativeBrief;
    originalPrompt: string;
    versionCount?: number;
    styles?: CreationPromptStyle[];
    hardConstraints?: PromptHardConstraints;
    feedback?: string[];
};

export const CREATION_ANALYSIS_SYSTEM_PROMPT = CREATIVE_BRIEF_SYSTEM_PROMPT;
export const CREATION_PROMPT_SYSTEM_PROMPT = PROMPT_OPTIMIZATION_SYSTEM_PROMPT;

/** Call the configured text model while explicitly avoiding the image-model fallback in AiConfig.model. */
export async function requestCreationText({ config, messages, signal, onDelta }: CreationTextRequestOptions) {
    const textModel = config.textModel.trim();
    if (!textModel) throw new Error("请先配置文本模型");
    return requestImageQuestion({ ...config, model: textModel }, messages, onDelta || (() => undefined), { signal });
}

/** Return the model's raw response; creation schemas own JSON repair and validation. */
export function analyzeCreationContent(options: AnalyzeCreationContentOptions) {
    const { sourceContent, platform, width, height, aspectRatio, scene = "", additionalRequirements = "", ...requestOptions } = options;
    const context = [scene ? `指定场景：${scene}` : "", additionalRequirements ? `补充要求：${additionalRequirements}` : ""].filter(Boolean).join("\n");
    return requestCreationText({
        ...requestOptions,
        messages: [
            { role: "system", content: CREATION_ANALYSIS_SYSTEM_PROMPT },
            {
                role: "user",
                content: `${buildCreativeBriefRequestPrompt(sourceContent, { platform, width, height, aspectRatio })}${context ? `\n\n${context}` : ""}`,
            },
        ],
    });
}

/** Return the model's raw response; prompt-version schemas own JSON repair and validation. */
export function generateCreationPromptVersions(options: GenerateCreationPromptVersionsOptions) {
    const { brief, originalPrompt, versionCount = 3, styles = [], hardConstraints, feedback = [], ...requestOptions } = options;
    const boundedCount = Math.max(1, Math.min(6, Math.floor(versionCount) || 3));
    const selectedStyles = (styles.length ? styles : (["general-natural-language", "chinese-image-model", "social-media-cover"] satisfies CreationPromptStyle[])).slice(0, boundedCount);
    const context = [hardConstraints ? `硬约束摘要：${JSON.stringify(hardConstraints)}` : "", feedback.length ? `上一轮审核反馈：${feedback.join("；")}` : ""].filter(Boolean).join("\n");
    return requestCreationText({
        ...requestOptions,
        messages: [
            { role: "system", content: CREATION_PROMPT_SYSTEM_PROMPT },
            {
                role: "user",
                content: `${buildPromptVersionsRequestPrompt(brief, originalPrompt, selectedStyles)}${context ? `\n\n${context}` : ""}`,
            },
        ],
    });
}
