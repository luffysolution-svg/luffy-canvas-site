import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredEntry = process.env.LUFFY_CANVAS_AGENT_ENTRY?.trim();
const entry = configuredEntry || path.resolve(pluginDir, "..", "..", "canvas-agent", "dist", "index.js");

if (!existsSync(entry)) {
    console.error("Luffy Canvas Agent is not built. Run `npm ci && npm run build` in canvas-agent, or set LUFFY_CANVAS_AGENT_ENTRY to its dist/index.js.");
    process.exit(1);
}

process.argv.splice(2, 0, "mcp");
await import(pathToFileURL(entry).href);
