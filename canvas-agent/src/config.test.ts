import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { AuthManager, hashToken } from "./auth.js";
import { clearRuntimeConfig, loadConfig, loadRuntimeConfig, saveConfig, writeRuntimeConfig, type ConfigPaths } from "./config.js";

test("migrates only non-sensitive legacy settings and keeps the old file", (t) => {
    const paths = tempConfigPaths(t);
    const workspacePath = path.join(path.dirname(paths.dir), "legacy-workspace");
    writeJson(paths.legacyFile, {
        url: "http://localhost:18444",
        token: "legacy-connect-token",
        origins: ["https://canvas.example/", "not-an-origin"],
        workspace: { workspacePath, activeThreadId: "thread-1", pinnedThreadIds: ["thread-2"] },
    });
    const logs: string[] = [];

    const config = loadConfig(true, paths, (message) => logs.push(message));
    const persisted = readJson(paths.file);

    assert.equal(config.url, "http://127.0.0.1:18444");
    assert.deepEqual(config.origins, ["https://canvas.example"]);
    assert.deepEqual(config.workspace, {
        workspacePath,
        activeSessionIds: { codex: "thread-1" },
        pinnedSessionIds: { codex: ["thread-2"] },
    });
    assert.equal(config.legacyTokenHash, hashToken("legacy-connect-token"));
    assert.equal(new AuthManager({ legacyTokenHash: config.legacyTokenHash }).isLegacyToken("legacy-connect-token"), true);
    assert.equal("token" in persisted, false);
    assert.equal("legacyTokenHash" in persisted, false);
    assert.equal(fs.existsSync(paths.legacyFile), true);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].includes("legacy-connect-token"), false);

    const secondLogs: string[] = [];
    const second = loadConfig(true, paths, (message) => secondLogs.push(message));
    assert.equal(second.agentId, config.agentId);
    assert.equal(second.legacyTokenHash, config.legacyTokenHash);
    assert.deepEqual(secondLogs, []);
});

test("new config wins while the legacy token remains memory-only for compatibility", (t) => {
    const paths = tempConfigPaths(t);
    writeJson(paths.file, { url: "http://127.0.0.1:19001", agentId: "agent-current", origins: ["http://localhost:3000"], token: "new-file-secret" });
    writeJson(paths.legacyFile, { url: "http://127.0.0.1:19002", token: "legacy-secret", origins: ["https://legacy.example"] });

    const config = loadConfig(false, paths);
    assert.equal(config.url, "http://127.0.0.1:19001");
    assert.equal(config.agentId, "agent-current");
    assert.deepEqual(config.origins, ["http://localhost:3000"]);
    assert.equal(new AuthManager({ legacyTokenHash: config.legacyTokenHash }).isLegacyToken("legacy-secret"), true);

    saveConfig(config, paths);
    const persistedText = fs.readFileSync(paths.file, "utf8");
    assert.equal(persistedText.includes("legacy-secret"), false);
    assert.equal(persistedText.includes("new-file-secret"), false);
    assert.equal(persistedText.includes("legacyTokenHash"), false);
});

test("repairs and persists a current config missing its agent id", (t) => {
    const paths = tempConfigPaths(t);
    writeJson(paths.file, { url: "http://127.0.0.1:19100", origins: [] });

    const config = loadConfig(true, paths);
    const persisted = readJson(paths.file);

    assert.match(config.agentId, /^[0-9a-f-]{36}$/i);
    assert.equal(persisted.agentId, config.agentId);
});

test("does not overwrite a malformed current config", (t) => {
    const paths = tempConfigPaths(t);
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.file, "{not-json");

    assert.throws(() => loadConfig(true, paths), /config is invalid/);
    assert.equal(fs.readFileSync(paths.file, "utf8"), "{not-json");
});

test("runtime credential is short-lived, private, and separate from agent.json", (t) => {
    const paths = tempConfigPaths(t);
    const runtime = { url: "http://127.0.0.1:17371", agentId: "agent-1", sessionToken: "runtime-secret", expiresAt: 2_000 };
    saveConfig({ url: runtime.url, agentId: runtime.agentId, origins: [], legacyTokenHash: hashToken("legacy") }, paths);

    writeRuntimeConfig(runtime, paths);
    assert.deepEqual(loadRuntimeConfig(paths, 1_999), runtime);
    assert.equal(fs.readFileSync(paths.runtimeFile, "utf8").includes("runtime-secret"), true);
    assert.equal(fs.readFileSync(paths.file, "utf8").includes("runtime-secret"), false);
    assert.equal(fs.readFileSync(paths.file, "utf8").includes("legacyTokenHash"), false);
    if (process.platform !== "win32") assert.equal(fs.statSync(paths.runtimeFile).mode & 0o777, 0o600);

    assert.equal(loadRuntimeConfig(paths, 2_000), null);
    assert.equal(fs.existsSync(paths.runtimeFile), false);
    clearRuntimeConfig(paths);
});

test("runtime cleanup only removes credentials owned by the current Agent instance", (t) => {
    const paths = tempConfigPaths(t);
    const first = { url: "http://127.0.0.1:17371", agentId: "agent-1", sessionToken: "runtime-first", expiresAt: 3_000 };
    const second = { url: "http://127.0.0.1:17371", agentId: "agent-2", sessionToken: "runtime-second", expiresAt: 3_000 };

    writeRuntimeConfig(first, paths);
    writeRuntimeConfig(second, paths);

    assert.equal(clearRuntimeConfig(paths, first), false);
    assert.deepEqual(loadRuntimeConfig(paths, 2_000), second);
    assert.equal(clearRuntimeConfig(paths, second), true);
    assert.equal(fs.existsSync(paths.runtimeFile), false);
});

function tempConfigPaths(t: TestContext): ConfigPaths {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "luffy-canvas-config-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, ".luffy-canvas");
    return {
        dir,
        file: path.join(dir, "agent.json"),
        runtimeFile: path.join(dir, "runtime.json"),
        legacyFile: path.join(root, ".infinite-canvas", "canvas-agent.json"),
    };
}

function writeJson(file: string, value: unknown) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
}

function readJson(file: string) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}
