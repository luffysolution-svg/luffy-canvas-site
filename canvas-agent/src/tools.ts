import { toolInputSchemas, toolNames, type ToolName } from "./schemas.js";
import type { CanvasNode, CanvasSnapshot } from "./types.js";

export function isToolName(name: unknown): name is ToolName {
    return typeof name === "string" && toolNames.includes(name as ToolName);
}

export function parseToolInput(name: ToolName, input: unknown) {
    return toolInputSchemas[name].parse(input ?? {});
}

export function compactCanvasState(state: CanvasSnapshot | null) {
    if (!state) throw new Error("当前没有已连接画布");
    return {
        projectId: truncate(state.projectId, 200),
        title: truncate(state.title, 200),
        nodes: (Array.isArray(state.nodes) ? state.nodes : [])
            .filter(isRecord)
            .slice(0, 500)
            .map((node) => compactNode(node as CanvasNode)),
        connections: (Array.isArray(state.connections) ? state.connections : [])
            .filter(isRecord)
            .slice(0, 1000)
            .map((connection) => ({ id: truncate(connection.id, 200), fromNodeId: truncate(connection.fromNodeId, 200), toNodeId: truncate(connection.toNodeId, 200) })),
        selectedNodeIds: (Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : [])
            .filter((id): id is string => typeof id === "string")
            .slice(0, 500)
            .map((id) => truncate(id, 200)),
        viewport: state.viewport ? { x: finiteNumber(state.viewport.x), y: finiteNumber(state.viewport.y), k: finiteNumber(state.viewport.k, 1) } : undefined,
    };
}

export function compactNode(node: CanvasNode) {
    return {
        id: truncate(node.id, 200),
        type: truncate(node.type, 100),
        title: truncate(node.title, 200),
        position: { x: finiteNumber(node.position?.x), y: finiteNumber(node.position?.y) },
        width: finiteNumber(node.width),
        height: finiteNumber(node.height),
        metadata: compactMetadata(node.type, node.metadata),
    };
}

export function compactCanvasMutationResult(result: unknown) {
    if (!result || typeof result !== "object" || Array.isArray(result)) return { ok: true };
    const value = result as Record<string, unknown>;
    if (Array.isArray(value.nodes) || Array.isArray(value.connections) || "projectId" in value || "viewport" in value) {
        return compactCanvasState(value as CanvasSnapshot);
    }
    return { ok: value.ok !== false };
}

export function nextCanvasX(state: CanvasSnapshot | null) {
    const nodes = state?.nodes || [];
    return nodes.length ? Math.max(...nodes.map((node) => node.position.x + node.width)) + 80 : 0;
}

const SAFE_METADATA_FIELDS = new Set([
    "content",
    "status",
    "fontSize",
    "generationMode",
    "composerContent",
    "prompt",
    "model",
    "size",
    "quality",
    "count",
    "seconds",
    "vquality",
    "generateAudio",
    "watermark",
    "audioVoice",
    "audioFormat",
    "audioSpeed",
    "audioInstructions",
    "freeResize",
]);

function compactMetadata(nodeType: unknown, metadata: Record<string, unknown> | undefined) {
    const allowsTextContent = nodeType === "text";
    return {
        ...Object.fromEntries(
            Object.entries(metadata || {})
                .filter(([key, value]) => SAFE_METADATA_FIELDS.has(key) && (key !== "content" || (allowsTextContent && typeof value === "string")))
                .map(([key, value]) => [key, compactValue(value)]),
        ),
        ...(!allowsTextContent && typeof metadata?.content === "string" && metadata.content ? { contentAvailable: true } : {}),
    };
}

function compactValue(value: unknown): unknown {
    if (typeof value === "string") return truncate(value, 2000);
    if (Array.isArray(value)) return value.slice(0, 50).map(compactValue);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .slice(0, 50)
                .map(([key, item]) => [key, compactValue(item)]),
        );
    return value;
}

function truncate(value: unknown, length: number) {
    if (typeof value !== "string") return value;
    return value.length > length ? `${value.slice(0, length)}…` : value;
}

function finiteNumber(value: unknown, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
