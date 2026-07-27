import type { CreationCardGeneration, CreationGeneratedImage, CreationProject } from "@/types/creation";
import type { ReferenceImage } from "@/types/image";

export type CreationCardGenerationOutcome = {
    pageId: string;
    generation: CreationCardGeneration;
    image?: CreationGeneratedImage;
    error?: CreationCardGeneration["error"];
};

export function applyCreationCardGenerationOutcomes(project: CreationProject, outcomes: CreationCardGenerationOutcome[]): CreationProject {
    const deck = project.cardDeck;
    if (!deck || !outcomes.length) return project;
    const outcomeByPageId = new Map(outcomes.map((outcome) => [outcome.pageId, outcome]));
    const generatedImages = [...project.generatedImages];

    for (const outcome of outcomes) {
        if (outcome.image && !generatedImages.some((image) => image.id === outcome.image!.id)) generatedImages.push(outcome.image);
    }

    const pages = deck.pages.map((page) => {
        const outcome = outcomeByPageId.get(page.id);
        if (!outcome) return page;
        if (!outcome.image) {
            return {
                ...page,
                status: outcome.generation.status,
                reviewStatus: "changes_requested" as const,
                error: outcome.error || outcome.generation.error,
                generation: outcome.generation,
                updatedAt: outcome.generation.updatedAt,
            };
        }
        return {
            ...page,
            status: outcome.generation.status,
            reviewStatus: "pending" as const,
            imageId: outcome.image.id,
            imageHistoryIds: uniqueStrings([...page.imageHistoryIds, outcome.image.id]),
            generatedRevision: outcome.generation.pageRevision,
            error: undefined,
            generation: { ...outcome.generation, imageId: outcome.image.id, providerId: outcome.image.providerId, modelId: outcome.image.modelId },
            updatedAt: outcome.generation.updatedAt,
        };
    });
    const firstSuccess = outcomes.find((outcome) => outcome.image);
    const updatedAt = outcomes.at(-1)?.generation.updatedAt || deck.updatedAt;
    return {
        ...project,
        generatedImages,
        cardDeck: {
            ...deck,
            pages,
            styleAnchorPageId: deck.styleAnchorPageId || firstSuccess?.pageId,
            styleAnchorImageId: deck.styleAnchorImageId || firstSuccess?.image?.id,
            updatedAt,
        },
        updatedAt,
    };
}

export function creationCardStyleReference(project: CreationProject) {
    const deck = project.cardDeck;
    if (!deck) return undefined;
    const anchorImage = project.generatedImages.find((image) => image.id === deck.styleAnchorImageId);
    const anchorPage = deck.pages.find((page) => page.id === deck.styleAnchorPageId);
    if (anchorImage) return { page: anchorPage, image: anchorImage, reference: generatedImageReference(anchorImage) };
    for (const page of deck.pages) {
        const image = project.generatedImages.find((item) => item.id === page.imageId);
        if (image) return { page, image, reference: generatedImageReference(image) };
    }
    return undefined;
}

export function generatedImageReference(image: CreationGeneratedImage): ReferenceImage {
    return {
        id: image.id,
        name: `${image.id}.${image.mimeType.includes("jpeg") ? "jpg" : "png"}`,
        type: image.mimeType,
        dataUrl: image.dataUrl || image.url || image.remoteUrl || "",
        url: image.remoteUrl || image.url,
        storageKey: image.storageKey,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
    };
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}
