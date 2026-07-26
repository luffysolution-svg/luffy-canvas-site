import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { hashToken, normalizeOrigin } from "./auth.js";

export const DEFAULT_PORT = 17371;
export const PACKAGE_NAME = process.env.LUFFY_CANVAS_AGENT_PACKAGE?.trim() || "@luffysolution/canvas-agent";
export const CONFIG_DIR = path.join(os.homedir(), ".luffy-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "agent.json");
export const RUNTIME_FILE = path.join(CONFIG_DIR, "runtime.json");
export const LEGACY_CONFIG_FILE = path.join(os.homedir(), ".infinite-canvas", "canvas-agent.json");
export const VERSION = readPackageVersion();
export const AGENT_PROMPT =
    "你正在帮助用户操作 Luffy Canvas 网站。切换网站页面用 site_navigate，可跳 / (首页)、/canvas (我的画布)、/canvas/:id (指定画布)、/image、/video、/prompts、/assets、/config。需要改动画布时优先使用已配置的 luffy-canvas MCP 工具：先 canvas_get_state 读取当前画布，再根据任务使用 canvas_create_text_node、canvas_generate_text、canvas_generate_image、canvas_generate_video、canvas_generate_audio、canvas_create_generation_flow、canvas_create_config_node、canvas_run_generation、canvas_update_node、canvas_connect_nodes 等通用工具；复杂批量改动再用 canvas_apply_ops，删除连线可用 delete_connections。本轮若有用户上传的图片附件，会同时给出 attachmentId；用户要求把附件放入画布或作为生成参考图时，必须先用 canvas_create_attachment_nodes 创建真实图片节点，再把返回的节点 ID 传给 canvas_create_generation_flow.referenceNodeIds，不要创建空图片占位节点。若当前不在画布页，画布工具会报错，需先用 site_navigate 打开画布。想了解或打开用户已有画布，用 canvas_list_projects 获取画布清单和 id，再用 site_navigate 跳 /canvas/:id 打开。生图工作台可用 workbench_image_get_config 看可选项、workbench_image_generate 填提示词并生成；视频创作台对应 workbench_video_get_config 与 workbench_video_generate；用 prompts_search 分页搜索提示词库；用 assets_list 查看「我的素材」、assets_add 新增文本或图片素材。需要生成内容时直接调用对应生成工具，不要绑定特定业务场景。不要模拟鼠标点击，不要要求用户手动复制 JSON。";

export type AgentProviderId = "codex" | "claude-code";
export type SiteWorkspaceConfig = {
    workspacePath: string;
    activeSessionIds?: Partial<Record<AgentProviderId, string>>;
    pinnedSessionIds?: Partial<Record<AgentProviderId, string[]>>;
};
export type CanvasAgentConfig = {
    url: string;
    agentId: string;
    origins?: string[];
    workspace?: SiteWorkspaceConfig;
    legacyTokenHash?: string;
};
export type AgentRuntimeConfig = {
    url: string;
    agentId: string;
    sessionToken: string;
    expiresAt: number;
};
export type ConfigPaths = {
    dir: string;
    file: string;
    runtimeFile: string;
    legacyFile: string;
};

export const DEFAULT_CONFIG_PATHS: ConfigPaths = {
    dir: CONFIG_DIR,
    file: CONFIG_FILE,
    runtimeFile: RUNTIME_FILE,
    legacyFile: LEGACY_CONFIG_FILE,
};

export function loadConfig(create = false, paths: ConfigPaths = DEFAULT_CONFIG_PATHS, log: (message: string) => void = console.error): CanvasAgentConfig {
    const currentExists = fs.existsSync(paths.file);
    const current = readJson(paths.file);
    if (currentExists && !current) throw new Error(`Luffy Canvas Agent config is invalid: ${paths.file}`);
    const legacy = readJson(paths.legacyFile);
    const config = current ? normalizeConfig(current) : legacy ? migrateLegacyConfig(legacy) : defaultConfig();
    const legacyToken = stringValue(legacy?.token);
    const result = legacyToken ? { ...config, legacyTokenHash: hashToken(legacyToken) } : config;
    const shouldSave = create && (!current || !stringValue(current.agentId));
    if (shouldSave) saveConfig(result, paths);
    if (shouldSave && !current && legacy) log(`Luffy Canvas Agent migrated non-sensitive settings to ${paths.file}; the legacy directory was kept.`);
    return result;
}

export function saveConfig(config: CanvasAgentConfig, paths: ConfigPaths = DEFAULT_CONFIG_PATHS) {
    writePrivateJson(paths.file, persistedConfig(config));
}

export function writeRuntimeConfig(runtime: AgentRuntimeConfig, paths: ConfigPaths = DEFAULT_CONFIG_PATHS) {
    if (!runtime.sessionToken || !Number.isFinite(runtime.expiresAt)) throw new Error("Invalid runtime credential");
    writePrivateJson(paths.runtimeFile, runtime);
}

export function loadRuntimeConfig(paths: ConfigPaths = DEFAULT_CONFIG_PATHS, now = Date.now()): AgentRuntimeConfig | null {
    const value = readJson(paths.runtimeFile);
    if (!value || typeof value.url !== "string" || typeof value.agentId !== "string" || typeof value.sessionToken !== "string" || typeof value.expiresAt !== "number") return null;
    if (now >= value.expiresAt) {
        clearRuntimeConfig(paths, { agentId: value.agentId, sessionToken: value.sessionToken });
        return null;
    }
    return { url: safeLocalUrl(value.url), agentId: value.agentId, sessionToken: value.sessionToken, expiresAt: value.expiresAt };
}

export function clearRuntimeConfig(paths: ConfigPaths = DEFAULT_CONFIG_PATHS, expected?: Pick<AgentRuntimeConfig, "agentId" | "sessionToken">) {
    if (expected) {
        const current = readJson(paths.runtimeFile);
        if (stringValue(current?.agentId) !== expected.agentId || stringValue(current?.sessionToken) !== expected.sessionToken) return false;
    }
    try {
        fs.unlinkSync(paths.runtimeFile);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        return false;
    }
}

export function ensureSiteWorkspace(config: CanvasAgentConfig, paths: ConfigPaths = DEFAULT_CONFIG_PATHS) {
    const current = config.workspace;
    if (current?.workspacePath) {
        const workspacePath = resolveWorkspacePath(current.workspacePath);
        fs.mkdirSync(workspacePath, { recursive: true });
        return { ...current, workspacePath };
    }
    const workspacePath = path.join(paths.dir, "agent-workspaces", "site");
    config.workspace = { workspacePath, activeSessionIds: {} };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config, paths);
    return config.workspace;
}

export function updateSiteWorkspace(config: CanvasAgentConfig, patch: Partial<SiteWorkspaceConfig>, paths: ConfigPaths = DEFAULT_CONFIG_PATHS) {
    const current = ensureSiteWorkspace(config, paths);
    const workspacePath = patch.workspacePath ? resolveWorkspacePath(patch.workspacePath) : current.workspacePath;
    config.workspace = {
        ...current,
        ...patch,
        workspacePath,
        activeSessionIds: { ...(current.activeSessionIds || {}), ...(patch.activeSessionIds || {}) },
        pinnedSessionIds: { ...(current.pinnedSessionIds || {}), ...(patch.pinnedSessionIds || {}) },
    };
    fs.mkdirSync(workspacePath, { recursive: true });
    saveConfig(config, paths);
    return config.workspace;
}

function defaultConfig(): CanvasAgentConfig {
    return {
        url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`,
        agentId: crypto.randomUUID(),
        origins: [],
    };
}

function migrateLegacyConfig(value: Record<string, unknown>): CanvasAgentConfig {
    const workspace = recordValue(value.workspace);
    const activeThreadId = stringValue(workspace?.activeThreadId);
    const pinnedThreadIds = stringArray(workspace?.pinnedThreadIds);
    const workspacePath = stringValue(workspace?.workspacePath);
    return {
        url: safeLocalUrl(stringValue(value.url)),
        agentId: crypto.randomUUID(),
        origins: normalizeOrigins(value.origins),
        ...(workspacePath
            ? {
                  workspace: {
                      workspacePath,
                      activeSessionIds: activeThreadId ? { codex: activeThreadId } : {},
                      pinnedSessionIds: pinnedThreadIds.length ? { codex: pinnedThreadIds } : {},
                  },
              }
            : {}),
    };
}

function normalizeConfig(value: Record<string, unknown>): CanvasAgentConfig {
    const workspace = recordValue(value.workspace);
    const activeSessionIds = recordValue(workspace?.activeSessionIds);
    const pinnedSessionIds = recordValue(workspace?.pinnedSessionIds);
    const normalizedWorkspace = stringValue(workspace?.workspacePath)
        ? {
              workspacePath: stringValue(workspace?.workspacePath),
              activeSessionIds: {
                  ...(stringValue(activeSessionIds?.codex) ? { codex: stringValue(activeSessionIds?.codex) } : {}),
                  ...(stringValue(activeSessionIds?.["claude-code"]) ? { "claude-code": stringValue(activeSessionIds?.["claude-code"]) } : {}),
              },
              pinnedSessionIds: {
                  ...(stringArray(pinnedSessionIds?.codex).length ? { codex: stringArray(pinnedSessionIds?.codex) } : {}),
                  ...(stringArray(pinnedSessionIds?.["claude-code"]).length ? { "claude-code": stringArray(pinnedSessionIds?.["claude-code"]) } : {}),
              },
          }
        : undefined;
    return {
        url: safeLocalUrl(stringValue(value.url)),
        agentId: stringValue(value.agentId) || crypto.randomUUID(),
        origins: normalizeOrigins(value.origins),
        ...(normalizedWorkspace ? { workspace: normalizedWorkspace } : {}),
    };
}

function persistedConfig(config: CanvasAgentConfig): CanvasAgentConfig {
    return {
        url: safeLocalUrl(config.url),
        agentId: config.agentId || crypto.randomUUID(),
        origins: normalizeOrigins(config.origins),
        ...(config.workspace ? { workspace: config.workspace } : {}),
    };
}

function safeLocalUrl(value: string) {
    try {
        const url = new URL(value);
        const port = Number(url.port) || DEFAULT_PORT;
        return `http://127.0.0.1:${port}`;
    } catch {
        return `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`;
    }
}

function resolveWorkspacePath(value: string) {
    if (value === "~") return os.homedir();
    if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
    return path.resolve(value);
}

function readJson(file: string): Record<string, unknown> | null {
    try {
        const value = JSON.parse(fs.readFileSync(file, "utf8"));
        return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

function writePrivateJson(file: string, value: unknown) {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
        fs.chmodSync(dir, 0o700);
    } catch {}
    const temporaryFile = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
        fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
        fs.renameSync(temporaryFile, file);
        try {
            fs.chmodSync(file, 0o600);
        } catch {}
    } finally {
        try {
            fs.unlinkSync(temporaryFile);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }
}

function recordValue(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function normalizeOrigins(value: unknown) {
    return [...new Set(stringArray(value).map(normalizeOrigin).filter(Boolean))];
}

function readPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
        return pkg.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}
