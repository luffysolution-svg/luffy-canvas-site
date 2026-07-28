import type { RegistryCompatibility, RegistryOption, RegistryRecommendationRule } from "../types";

type OptionDefinition<Id extends string> = {
    id: Id;
    nameZh: string;
    nameEn: string;
    description: string;
    useCases: string[];
    promptFragment: string;
    negativeFragment?: string;
    keywords?: string[];
    reason?: string;
    priority?: number;
    preferredWith?: Record<string, string[]>;
    incompatibleWith?: Record<string, string[]>;
    compatibilityNotes?: string[];
};

export function defineOption<Id extends string>(definition: OptionDefinition<Id>): RegistryOption<Id> {
    const recommendation: RegistryRecommendationRule = {
        keywords: definition.keywords || [],
        reason: definition.reason || definition.description,
        ...(definition.priority === undefined ? {} : { priority: definition.priority }),
    };
    const compatibility: RegistryCompatibility = {
        ...(definition.preferredWith ? { preferredWith: definition.preferredWith } : {}),
        ...(definition.incompatibleWith ? { incompatibleWith: definition.incompatibleWith } : {}),
        notes: definition.compatibilityNotes || ["可与同一设计 Skill 的其他选项组合；平台强约束始终优先。"],
    };

    return {
        id: definition.id,
        nameZh: definition.nameZh,
        nameEn: definition.nameEn,
        description: definition.description,
        useCases: definition.useCases,
        promptFragment: definition.promptFragment,
        negativeFragment: definition.negativeFragment || "",
        recommendation,
        compatibility,
    };
}

export function optionMap(options: RegistryOption[]) {
    return new Map(options.map((option) => [option.id, option]));
}

export function findOption(options: RegistryOption[] | undefined, id: unknown) {
    if (!options || typeof id !== "string") return undefined;
    return options.find((option) => option.id === id);
}
