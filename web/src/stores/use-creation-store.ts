import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { safeParseCreationProject } from "@/lib/creation/creation-schema";
import { localForageStorage } from "@/lib/localforage-storage";
import { resolveImageUrl } from "@/services/image-storage";
import type { CreationGeneratedImage, CreationProject } from "@/types/creation";

type ProjectUpdate = Partial<CreationProject> | ((project: CreationProject) => CreationProject);

type CreationStore = {
    hydrated: boolean;
    storageError?: string;
    projects: CreationProject[];
    activeProjectId: string | null;
    createProject: (name?: string) => string;
    setActiveProject: (id: string | null) => void;
    updateProject: (id: string, update: ProjectUpdate) => void;
    deleteProject: (id: string) => void;
    saveDraft: (id: string) => void;
    markCanvasInserted: (creationProjectId: string, canvasProjectId: string, nodeId: string, imageId: string) => void;
};

type PersistedCreationState = Pick<CreationStore, "projects" | "activeProjectId"> & { storageError?: string };

const CREATION_STORE_KEY = "infinite-canvas:creation_store";
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { name: string; value: StorageValue<CreationStore> } | null = null;

const creationStorage: PersistStorage<CreationStore> = {
    getItem: async (name) => {
        const raw = await localForageStorage.getItem(name);
        if (!raw) return null;
        try {
            const stored = JSON.parse(raw) as StorageValue<PersistedCreationState>;
            const values = Array.isArray(stored.state?.projects) ? stored.state.projects : [];
            const parsed: CreationProject[] = [];
            let rejected = 0;
            for (const value of values) {
                const result = safeParseCreationProject(value);
                if (result.success) parsed.push(await hydrateProjectImages(result.data));
                else rejected += 1;
            }
            const activeProjectId = parsed.some((project) => project.id === stored.state?.activeProjectId) ? stored.state.activeProjectId || null : parsed[0]?.id || null;
            return {
                ...stored,
                state: {
                    projects: parsed,
                    activeProjectId,
                    storageError: rejected ? `${rejected} 个本地创作任务数据不完整，已停止恢复` : undefined,
                },
            } as StorageValue<CreationStore>;
        } catch {
            return {
                state: { projects: [], activeProjectId: null, storageError: "本地创作历史解析失败，未加载损坏数据" },
                version: 0,
            } as unknown as StorageValue<CreationStore>;
        }
    },
    setItem: (name, value) => {
        pendingSave = { name, value };
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            void flushCreationStorePersistence();
        }, 300);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCreationStore = create<CreationStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            activeProjectId: null,
            createProject: (name = "未命名创作") => {
                const id = nanoid();
                const now = new Date().toISOString();
                const project: CreationProject = {
                    id,
                    name: name.trim() || "未命名创作",
                    mode: "social",
                    platformPresetId: "xiaohongshu-post",
                    scene: "知识卡",
                    additionalRequirements: "",
                    sourceContent: "",
                    status: "draft",
                    lastStableStatus: "draft",
                    briefVersions: [],
                    promptVersions: [],
                    candidates: [],
                    generatedImages: [],
                    reviews: [],
                    canvasInsertions: [],
                    createdAt: now,
                    updatedAt: now,
                };
                set((state) => ({ projects: [project, ...state.projects], activeProjectId: id, storageError: undefined }));
                return id;
            },
            setActiveProject: (activeProjectId) => set({ activeProjectId }),
            updateProject: (id, update) =>
                set((state) => ({
                    projects: state.projects.map((project) => {
                        if (project.id !== id) return project;
                        const next = typeof update === "function" ? update(project) : { ...project, ...update };
                        return { ...next, id: project.id, createdAt: project.createdAt, updatedAt: new Date().toISOString() };
                    }),
                })),
            deleteProject: (id) => {
                set((state) => {
                    const projects = state.projects.filter((project) => project.id !== id);
                    return { projects, activeProjectId: state.activeProjectId === id ? projects[0]?.id || null : state.activeProjectId };
                });
                window.setTimeout(async () => {
                    const { useAssetStore } = await import("@/stores/use-asset-store");
                    useAssetStore.getState().cleanupImages({ creationProjects: get().projects });
                }, 0);
            },
            saveDraft: (id) => {
                get().updateProject(id, (project) => project);
                void flushCreationStorePersistence();
            },
            markCanvasInserted: (creationProjectId, canvasProjectId, nodeId, imageId) =>
                set((state) => ({
                    projects: state.projects.map((project) => {
                        if (project.id !== creationProjectId) return project;
                        if (project.canvasInsertions?.some((item) => item.projectId === canvasProjectId && item.nodeId === nodeId)) return project;
                        const insertedImage = project.generatedImages.find((image) => image.id === imageId);
                        if (!insertedImage) return project;
                        const isCardPage = Boolean(insertedImage.metadata?.cardOutput);
                        return {
                            ...project,
                            ...(isCardPage ? {} : { status: "inserted_to_canvas" as const, lastStableStatus: "inserted_to_canvas" as const }),
                            error: undefined,
                            canvasInsertions: [...(project.canvasInsertions || []), { id: nanoid(), projectId: canvasProjectId, nodeId, imageId, insertedAt: new Date().toISOString() }],
                            updatedAt: new Date().toISOString(),
                        };
                    }),
                })),
        }),
        {
            name: CREATION_STORE_KEY,
            storage: creationStorage,
            partialize: (state) =>
                ({
                    projects: state.projects.map(serializeProject),
                    activeProjectId: state.activeProjectId,
                }) as StorageValue<CreationStore>["state"],
            onRehydrateStorage: () => (state) => {
                useCreationStore.setState({ hydrated: true, storageError: state?.storageError });
            },
        },
    ),
);

async function hydrateProjectImages(project: CreationProject) {
    const generatedImages = await Promise.all(project.generatedImages.map(hydrateGeneratedImage));
    const imageById = new Map(generatedImages.map((image) => [image.id, image]));
    return {
        ...project,
        generatedImages,
        cardDeck: project.cardDeck
            ? {
                  ...project.cardDeck,
                  pages: project.cardDeck.pages.map((page) =>
                      page.status === "queued" || page.status === "generating" || page.status === "downloading"
                          ? {
                                ...page,
                                status: page.imageId ? ("stored" as const) : ("idle" as const),
                                generation: page.generation ? { ...page.generation, status: page.imageId ? ("stored" as const) : ("idle" as const) } : page.generation,
                            }
                          : page,
                  ),
              }
            : undefined,
        candidates: project.candidates.map((candidate) => ({
            ...candidate,
            image: candidate.imageId ? imageById.get(candidate.imageId) || candidate.image : candidate.image,
        })),
    };
}

async function hydrateGeneratedImage(image: CreationGeneratedImage) {
    if (!image.storageKey) return image;
    const url = await resolveImageUrl(image.storageKey, image.remoteUrl || image.url || "");
    return url ? { ...image, url, dataUrl: undefined } : image;
}

function serializeProject(project: CreationProject): CreationProject {
    const generatedImages = project.generatedImages.map(serializeGeneratedImage);
    const imageById = new Map(generatedImages.map((image) => [image.id, image]));
    return {
        ...project,
        generatedImages,
        candidates: project.candidates.map((candidate) => ({
            ...candidate,
            image: candidate.imageId ? imageById.get(candidate.imageId) || (candidate.image ? serializeGeneratedImage(candidate.image) : undefined) : candidate.image ? serializeGeneratedImage(candidate.image) : undefined,
        })),
    };
}

function serializeGeneratedImage(image: CreationGeneratedImage): CreationGeneratedImage {
    const { dataUrl: _dataUrl, url, ...rest } = image;
    if (image.storageKey) return rest;
    const durableUrl = image.remoteUrl || (url && !url.startsWith("blob:") && !url.startsWith("data:") ? url : undefined);
    return durableUrl ? { ...rest, url: durableUrl } : rest;
}

export async function flushCreationStorePersistence() {
    const current = pendingSave;
    if (!current) return;
    pendingSave = null;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    await localForageStorage.setItem(current.name, JSON.stringify(current.value));
}
