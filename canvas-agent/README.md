# Luffy Canvas Agent

`@luffysolution/canvas-agent` is the local Agent and MCP bridge for [Luffy Canvas](https://luffy-canvas-site.vercel.app/). It connects a browser canvas on your machine to Codex, Claude Code, and any standard stdio MCP client.

The service listens on `127.0.0.1` only. Browser access uses a one-time pairing code and short-lived, Origin-bound session credentials.

## Install and start

Run the published Luffy Canvas release:

```bash
npx -y @luffysolution/canvas-agent@0.2.0
```

To develop the current repository instead, run `npm ci` and `npm run build` in `canvas-agent`, then start `node dist/index.js`.

The terminal prints:

- the loopback URL;
- a non-secret Agent ID;
- a one-time pairing code that expires after five minutes.

Open Luffy Canvas, choose **本地 Agent**, enter the loopback URL and pairing code, then connect. Session credentials stay in browser `sessionStorage`; they are never placed in a URL.

Configuration is stored in:

```text
~/.luffy-canvas/agent.json
```

On first start, non-sensitive settings are migrated from `~/.infinite-canvas/canvas-agent.json`. The old directory is kept and its permanent token is not copied into the new config.

## MCP

The MCP server uses the official Model Context Protocol SDK and is named `luffy-canvas`.

Add it to Codex:

```bash
codex mcp add luffy-canvas -- \
  npx -y @luffysolution/canvas-agent@0.2.0 mcp --profile editor
```

Or run it for any stdio MCP client:

```bash
npx -y @luffysolution/canvas-agent@0.2.0 mcp --profile editor
```

The local HTTP Agent must be running and paired with an open Luffy Canvas page before canvas tools can complete.

### Permission profiles

| Profile     | Access                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `readonly`  | Navigation, canvas state and selection, exports, status, config lookups, prompts, and asset listing |
| `editor`    | `readonly` plus canvas editing; generation operations and `autoRun` are rejected                    |
| `generator` | `readonly` plus text, image, video, audio, and workbench generation                                 |
| `assets`    | Asset listing/addition and attachment-node creation                                                 |
| `full`      | Every Luffy Canvas MCP tool                                                                         |

`editor` is the default. It can also be selected with:

```bash
LUFFY_CANVAS_MCP_PROFILE=editor npx -y @luffysolution/canvas-agent@0.2.0 mcp
```

## Agent providers

The browser uses the provider-neutral API under `/agent`:

- `GET /agent/providers`
- `GET /agent/sessions?provider=codex`
- `POST /agent/sessions`
- `GET /agent/sessions/:sessionId?provider=codex`
- `POST /agent/sessions/:sessionId/turn`
- `POST /agent/sessions/:sessionId/interrupt`
- `DELETE /agent/sessions/:sessionId`

Included adapters:

- **Codex** — native app-server sessions, history, attachments, streaming, usage, interruption, and MCP injection.
- **Claude Code** — CLI availability detection, native session IDs/resume, streaming JSON, interruption, and an allowlist limited to `mcp__luffy-canvas__*`. It runs with `--bare`, disables built-in tools, and loads only the explicit MCP config; authentication must therefore work without OAuth/keychain. Claude Code does not advertise history, deletion, or attachment capabilities that its CLI cannot expose reliably.

The former `/agent/codex/*` and `/agent/claude/*` routes remain for one compatibility version and return deprecation headers.

## Security model

- The server binds only to `127.0.0.1`.
- Pairing codes are one-use and expire quickly.
- Browser credentials are short-lived and bound to the exact HTTP(S) Origin used during pairing.
- Credentials are sent in `Authorization: Bearer ...`, never in query parameters.
- New credentials are not logged or stored in `localStorage`.
- Session credentials can be revoked with `POST /auth/revoke`.
- The transient MCP runtime credential is kept separately in a private `runtime.json`, expires automatically, and is removed when the Agent stops.
- Read operations do not require canvas confirmation. Write, generation, asset, and batch operations default to confirmation in the web UI.

Legacy permanent-token authentication is accepted for one compatibility version only when it matches the old config and its Origin was already trusted. Every such response includes a deprecation warning.

## Development

```bash
npm ci
npm test
npm run build
```

## License and attribution

This package is part of Luffy Canvas and is distributed under GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). Luffy Canvas is based on Infinite Canvas by basketikun; see `NOTICE` and `LICENSE` for attribution and license terms.
