import type { CreationProject, CreationRetryStatus, CreationStableStatus, CreationStatus, CreationStep, ImageCandidate } from "@/types/creation";

export type CreationTransitionEventType = "NEXT" | "BACK" | "CANCEL" | "FAIL" | "RETRY";
export type CreationTransitionEvent = CreationTransitionEventType | { type: Exclude<CreationTransitionEventType, "RETRY"> } | { type: "RETRY"; target: CreationRetryStatus };

const nextStatus: Partial<Record<CreationStatus, CreationStatus>> = {
    draft: "analyzing",
    analyzing: "brief_ready",
    brief_ready: "brief_approved",
    brief_approved: "generating_prompts",
    generating_prompts: "prompts_ready",
    prompts_ready: "prompt_approved",
    prompt_approved: "generating_images",
    generating_images: "awaiting_image_review",
    awaiting_image_review: "image_approved",
    image_approved: "inserted_to_canvas",
};

const previousStatus: Partial<Record<CreationStatus, CreationStatus>> = {
    analyzing: "draft",
    brief_ready: "draft",
    brief_approved: "brief_ready",
    generating_prompts: "brief_ready",
    prompts_ready: "brief_ready",
    prompt_approved: "prompts_ready",
    generating_images: "prompts_ready",
    awaiting_image_review: "prompts_ready",
    image_approved: "awaiting_image_review",
    inserted_to_canvas: "image_approved",
};

const stepByStatus: Record<Exclude<CreationStatus, "failed">, CreationStep> = {
    draft: 1,
    analyzing: 2,
    brief_ready: 2,
    brief_approved: 2,
    generating_prompts: 3,
    prompts_ready: 3,
    prompt_approved: 3,
    generating_images: 4,
    awaiting_image_review: 5,
    image_approved: 5,
    inserted_to_canvas: 6,
};

const retryStatuses = new Set<CreationRetryStatus>(["analyzing", "generating_prompts", "generating_images"]);
const stableProgress: Partial<Record<CreationStableStatus, number>> = {
    draft: 0,
    brief_ready: 2,
    brief_approved: 3,
    prompts_ready: 5,
    prompt_approved: 6,
    awaiting_image_review: 8,
    image_approved: 9,
};
const retryPrerequisite: Record<CreationRetryStatus, number> = {
    analyzing: 0,
    generating_prompts: 3,
    generating_images: 6,
};

export class CreationTransitionError extends Error {
    constructor(
        readonly status: CreationStatus,
        readonly event: CreationTransitionEventType,
        message = `状态 ${status} 不允许执行 ${event}`,
    ) {
        super(message);
        this.name = "CreationTransitionError";
    }
}

export function transitionCreationStatus(status: CreationStatus, event: CreationTransitionEvent): CreationStatus {
    const type = typeof event === "string" ? event : event.type;
    if (type === "NEXT") return requireTransition(status, type, nextStatus[status]);
    if (type === "BACK") return requireTransition(status, type, previousStatus[status]);
    if (type === "CANCEL") {
        if (status === "inserted_to_canvas") throw new CreationTransitionError(status, type, "已插入画布的任务不能通过取消回退画布变更");
        return "draft";
    }
    if (type === "FAIL") {
        if (status === "inserted_to_canvas") throw new CreationTransitionError(status, type);
        return "failed";
    }
    const target = typeof event === "object" && event.type === "RETRY" ? event.target : undefined;
    if (!target || !retryStatuses.has(target)) throw new CreationTransitionError(status, type, "重试必须指定 analyzing、generating_prompts 或 generating_images");
    if (status === "inserted_to_canvas") throw new CreationTransitionError(status, type, "已插入画布的任务不能直接重跑生成步骤，请先返回审核视图");
    if (status !== "failed") {
        if (!isStableCreationStatus(status)) throw new CreationTransitionError(status, type, "请先取消当前执行，再从稳定审核状态重新运行");
        const progress = stableProgress[status];
        if (progress === undefined || progress < retryPrerequisite[target]) throw new CreationTransitionError(status, type, `当前状态缺少重新运行 ${target} 所需的前置数据`);
    }
    return target;
}

export function currentStepForStatus(status: CreationStatus, retryStatus?: CreationRetryStatus): CreationStep {
    if (status === "failed") return retryStatus ? stepByStatus[retryStatus] : 1;
    return stepByStatus[status];
}

export function stableStatusAfterTransition(status: CreationStatus, previous: CreationStableStatus): CreationStableStatus {
    return isStableCreationStatus(status) ? status : previous;
}

export function isStableCreationStatus(status: CreationStatus): status is CreationStableStatus {
    return status !== "analyzing" && status !== "generating_prompts" && status !== "generating_images" && status !== "failed";
}

export function reconcileCandidateSelection(project: CreationProject, candidates: ImageCandidate[]): CreationProject {
    const selectedStillExists = project.selectedImageId && candidates.some((candidate) => (candidate.imageId || candidate.image?.id) === project.selectedImageId);
    if (!project.selectedImageId || selectedStillExists) return { ...project, candidates };
    return {
        ...project,
        candidates,
        selectedImageId: undefined,
        status: project.status === "image_approved" ? "awaiting_image_review" : project.status,
        lastStableStatus: project.lastStableStatus === "image_approved" ? "awaiting_image_review" : project.lastStableStatus,
    };
}

function requireTransition(status: CreationStatus, event: CreationTransitionEventType, target?: CreationStatus) {
    if (!target) throw new CreationTransitionError(status, event);
    return target;
}
