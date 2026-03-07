# Pilot

> Last updated: 2026-03-06

Pilot is an **Electron 40 + React 19 + TypeScript** desktop application that wraps the `@mariozechner/pi-coding-agent` SDK in a full GUI shell. Users chat with an AI coding agent, review file diffs before they touch disk, manage git (including interactive rebase and AI-assisted conflict resolution), run dev commands, control a Docker-based virtual desktop, connect MCP servers for external tools, and access the session remotely via a companion mobile/web client — all from one keyboard-driven app.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Electron 40 |
| UI Framework | React 19 |
| Language | TypeScript 5.x (strict mode) |
| Build System | Vite 7 + electron-vite 5 |
| State Management | Zustand 5 |
| Styling | Tailwind CSS 4 |
| AI Agent SDK | `@mariozechner/pi-coding-agent` |
| MCP Client | `@modelcontextprotocol/sdk` |
| Git Operations | `simple-git` |
| Terminal Emulation | `node-pty` + `@xterm/xterm` |
| Docker Integration | `dockerode` |
| Companion Server | Express 5 + WebSocket (`ws`) |
| Local Discovery | `@homebridge/ciao` (mDNS/Bonjour) |
| TLS | `node-forge` (self-signed certificates) |
| File Watching | `chokidar` |
| File Tree Filtering | `ignore` (gitignore-syntax) |
| Testing | Vitest |

## Architecture Style

Pilot is a **desktop monolith** that strictly follows Electron's three-process model: a Node.js **main process** that owns all business logic, a thin **preload bridge**, and a **renderer** (React + Zustand) that has zero Node.js access. All cross-process calls use typed IPC channels defined in `shared/ipc.ts`. The app is designed to also run its renderer in a remote browser ("companion mode") via a WebSocket proxy, so the same React UI works on both Electron and mobile.

## Key Concepts

- **Tab**: A persistent UI unit. Each tab owns exactly one AI agent session. Multiple tabs can be open simultaneously across one or more projects. Tabs can also hold web views or desktop displays.
- **Session**: An AI conversation managed by the Pi SDK. Persisted as a `.jsonl` file under `<PILOT_DIR>/sessions/`. Sessions can be continued, forked, archived, pinned, or deleted.
- **StagedDiff**: When the agent wants to write a file, the change is held in memory as a `StagedDiff` and shown to the user for review before anything touches disk. Accepting applies the diff; rejecting discards it.
- **Project Jail**: All agent file operations are validated against the open project root. Paths that escape the root are blocked. Configurable allowed-paths exceptions exist in `.pilot/settings.json`.
- **Yolo Mode**: Per-project bypass of the staged-diff review flow. Writes go directly to disk. Opt-in only.
- **Memory**: A two-tier Markdown system (`<PILOT_DIR>/MEMORY.md` for global, `<project>/.pilot/MEMORY.md` for project) that is injected into every agent system prompt. The agent has tools (`pilot_memory_read`, `pilot_memory_write`, `pilot_memory_search`, `pilot_memory_delete`) to manage memory.
- **Companion**: An HTTPS + WebSocket server embedded in the app that lets phones or remote browsers mirror the full Pilot UI.
- **Extension / Skill**: SDK-level plugins that add tools or system-prompt fragments to the agent. Managed from `<PILOT_DIR>/extensions/` and `<PILOT_DIR>/skills/`.
- **Dev Commands**: Project-specific shell commands (npm run dev, etc.) with output streamed to a panel inside Pilot.
- **Desktop**: A Docker-based virtual display (Xvfb + Fluxbox + noVNC) that the agent can control via `pilot_desktop_*` tools for GUI automation, browser testing, and screenshots.
- **MCP Server**: Model Context Protocol server connections that expose external tools to the agent. Supports stdio, SSE, and Streamable HTTP transports.
- **Theme**: Configurable colour theme (`dark`, `light`, `system`) stored in app settings.

## Entry Points

| Entry Point | File | Purpose |
|------------|------|---------|
| Main Process | `electron/main/index.ts` | App bootstrap — creates BrowserWindow, initialises all services, registers all IPC handlers |
| Preload | `electron/preload/index.ts` | Exposes `window.api` (`invoke`, `on`, `send`) to the renderer via `contextBridge` |
| Renderer Root | `src/app.tsx` | React root — keyboard shortcuts, tab↔project sync, lifecycle hooks |
| Companion UI Bundle | `vite.companion.mjs` | Separate Vite build that produces the browser-loadable companion UI |

## Config Directories (Runtime)

| Platform | `<PILOT_DIR>` |
|----------|---------------|
| macOS | `~/.config/pilot/` |
| Windows | `%APPDATA%\pilot\` |
| Linux | `$XDG_CONFIG_HOME/pilot/` (default: `~/.config/pilot/`) |

## Changes Log

- 2026-03-06: Updated for Desktop, MCP, interactive rebase, memory tools, editor tools, web tabs, theme support
- 2026-02-24: Initial documentation generated
