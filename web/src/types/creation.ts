import type { ImageGenerationStatus } from "./image";

export type CreationMode = "social" | "research";

export type SocialPlatform = "wechat" | "xiaohongshu" | "x" | "bilibili" | "douyin";

export type CreationStatus = "draft" | "analyzing" | "brief_ready" | "brief_approved" | "generating_prompts" | "prompts_ready" | "prompt_approved" | "generating_images" | "awaiting_image_review" | "image_approved" | "inserted_to_canvas" | "failed";

export type CreationStableStatus = Exclude<CreationStatus, "analyzing" | "generating_prompts" | "generating_images" | "failed">;
export type CreationRetryStatus = "analyzing" | "generating_prompts" | "generating_images";
export type CreationStep = 1 | 2 | 3 | 4 | 5 | 6;
export type CreationCandidateStatus = ImageGenerationStatus | "idle";

export type CreationCardLayout = "cover" | "editorial" | "split" | "quote";

export type CreationCardReviewStatus = "pending" | "approved" | "changes_requested" | "rejected";

export type CreationPromptStyle =
    | "general-natural-language"
    | "chinese-image-model"
    | "social-media-cover"
    | "xiaohongshu-knowledge-card"
    | "wechat-cover"
    | "bilibili-cover"
    | "douyin-vertical-cover"
    | "photography"
    | "minimalist"
    | "graphic-summary"
    | "scientific-mechanism"
    | "scientific-workflow";

export type CreativeBrief = {
    id: string;
    mode: "social";
    platform: SocialPlatform;
    scene: string;
    purpose: string;
    audience: string;
    coreMessage: string;
    title: string;
    subtitle?: string;
    visualSubject: string;
    composition: string;
    visualStyle: string;
    colorPalette: string[];
    aspectRatio: string;
    width: number;
    height: number;
    onImageText: string[];
    requiredElements: string[];
    forbiddenElements: string[];
    sourceContent: string;
    analysisReasoning?: string;
};

export type BriefVersion = {
    id: string;
    brief: CreativeBrief;
    createdAt: string;
    source: "model" | "manual";
    parentId?: string;
    approvedAt?: string;
};

export type PromptHardConstraints = {
    platform: SocialPlatform;
    width: number;
    height: number;
    aspectRatio: string;
    subject?: string;
    subjectCount?: number;
    subjectPosition?: string;
    requiredElements: string[];
    forbiddenElements: string[];
    requiredTexts: string[];
    colorPalette: string[];
    referenceImageRequirements: string[];
    safeAreaRequirements: string[];
    outputFormat?: string;
};

export type PromptVersion = {
    id: string;
    label: string;
    content: string;
    rawContent?: string;
    reasoning: string;
    style: CreationPromptStyle;
    kind: "original" | "optimized" | "manual" | "restored";
    sourceBriefVersionId: string;
    parentId?: string;
    hardConstraints: PromptHardConstraints;
    createdAt: string;
};

export type CreationErrorStage = "text_model" | "image_model" | "network" | "parse" | "storage" | "unknown";

export type CreationError = {
    id: string;
    stage: CreationErrorStage;
    message: string;
    retryStatus?: CreationRetryStatus;
    candidateId?: string;
    details?: string;
    createdAt: string;
};

export type CreationCardGeneration = {
    id: string;
    batchId: string;
    styleId: string;
    pageRevision: number;
    promptVersionId: string;
    platformPresetId: string;
    modelConfigId: string;
    providerId?: string;
    modelId?: string;
    referencePageId?: string;
    referenceImageId?: string;
    quality: string;
    background: string;
    status: CreationCandidateStatus;
    imageId?: string;
    error?: CreationError;
    createdAt: string;
    updatedAt: string;
};

export type CreationCardPage = {
    id: string;
    title: string;
    body: string;
    layout: CreationCardLayout;
    revision: number;
    generatedRevision?: number;
    status: CreationCandidateStatus;
    reviewStatus: CreationCardReviewStatus;
    imageId?: string;
    imageHistoryIds: string[];
    error?: CreationError;
    generation?: CreationCardGeneration;
    createdAt: string;
    updatedAt: string;
};

export type CreationCardDeck = {
    id: string;
    platformPresetIds: string[];
    activePlatformPresetId: string;
    styleId: string;
    stylePrompt: string;
    modelConfigId: string;
    quality: string;
    background: string;
    styleAnchorPageId?: string;
    styleAnchorImageId?: string;
    pages: CreationCardPage[];
    createdAt: string;
    updatedAt: string;
};

export type CreationImageIssue = "text_error" | "composition_error" | "subject_error" | "style_mismatch" | "safe_area_conflict" | "scientific_error" | "unsupported_inference" | "other";

export type CreationImageFeedback = {
    id: string;
    issue: CreationImageIssue;
    note?: string;
    createdAt: string;
};

export type CreationGeneratedImage = {
    id: string;
    url?: string;
    remoteUrl?: string;
    dataUrl?: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType: string;
    providerId: string;
    modelId: string;
    modelConfigId: string;
    promptVersionId: string;
    createdAt: string;
    metadata?: Record<string, unknown>;
    persistenceError?: string;
};

export type ImageCandidate = {
    id: string;
    index: number;
    promptVersionId: string;
    modelConfigId: string;
    size: string;
    quality: string;
    background: string;
    status: CreationCandidateStatus;
    imageId?: string;
    image?: CreationGeneratedImage;
    error?: CreationError;
    feedback: CreationImageFeedback[];
    referenceImageId?: string;
};

export type CreationReviewRecord = {
    id: string;
    gate: "brief" | "prompt" | "image";
    action: "approved" | "changes_requested" | "rejected" | "issue_reported";
    targetId: string;
    comment?: string;
    createdAt: string;
};

export type CanvasInsertionRecord = {
    id: string;
    projectId: string;
    nodeId: string;
    imageId: string;
    insertedAt: string;
};

export type CreationProject = {
    id: string;
    name: string;
    mode: "social";
    platformPresetId: string;
    scene: string;
    additionalRequirements: string;
    sourceContent: string;
    status: CreationStatus;
    lastStableStatus: CreationStableStatus;
    briefVersions: BriefVersion[];
    selectedBriefVersionId?: string;
    promptVersions: PromptVersion[];
    selectedPromptVersionId?: string;
    candidates: ImageCandidate[];
    generatedImages: CreationGeneratedImage[];
    selectedImageId?: string;
    referenceImageId?: string;
    reviews: CreationReviewRecord[];
    error?: CreationError;
    cardDeck?: CreationCardDeck;
    canvasInsertions?: CanvasInsertionRecord[];
    createdAt: string;
    updatedAt: string;
};
