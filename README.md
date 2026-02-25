<p align="center">
  <img src="resources/icon.png" alt="Pilot" width="120" />
</p>

<h1 align="center">Pilot</h1>

<p align="center"><strong>Your cockpit for AI-powered coding.</strong></p>

<p align="center">
  A native desktop GUI for the <a href="https://www.npmjs.com/package/@mariozechner/pi-coding-agent">Pi Coding Agent</a> — chat with an AI agent, review diffs before they touch disk, manage git, run dev commands, coordinate subagents, and track tasks, all from one keyboard-driven app.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-40-47848F?logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-22c55e" />
</p>

> [!WARNING]
> **Pilot is in early development.** The app runs on **macOS**, **Windows**, and **Linux**.
>
> [**Nightly builds**](https://github.com/espennilsen/pilot/releases/tag/nightly) are available for all platforms — use at your own risk. These are unstable, unsigned builds generated automatically from the latest `main` branch.

---

## Features

- **Agent Chat** — streaming responses, tool call visibility, thinking blocks, steer/follow-up, image attachments, slash commands
- **Sandboxed File Operations** — all edits staged for review before touching disk, with accept/reject per change and Yolo mode override
- **Tabbed Sessions** — independent agent sessions with drag-and-drop, pinning, project grouping, and draft persistence
- **Git Integration** — status, staging, commits, branches, blame, stash — all inline
- **Memory System** — two-tier persistent memory (global + project) with auto-extraction and agent tools for reading/writing
- **Subagents** — spawn parallel workers, orchestrate multi-step work, with live monitoring in the Agents panel
- **Task Board** — kanban/table views with epics, dependencies, priorities, and full agent tool access
- **Prompt Library** — reusable templates with variables and slash-command triggers
- **Companion Access** — access Pilot from iOS/iPad/browser via HTTPS + WebSocket with PIN/QR pairing
- **Command Palette** — fuzzy-searchable `⌘K` overlay for every action
- **Terminal** — embedded PTY terminal with tabs
- **Extensions & Skills** — install and manage Pi SDK extensions and skills

See [docs/](docs/INDEX.md) for full documentation.

---

## Getting Started

### Prerequisites

- **Node.js** 22+ (dev tooling; Electron bundles its own runtime)
- **Git** on PATH
- API key or OAuth credentials for at least one AI provider (Anthropic, OpenAI, or Google)
- **Linux only:** `build-essential`, `libx11-dev`, `libxkbfile-dev`

### Install & Run

```bash
git clone https://github.com/espennilsen/pilot.git
cd pilot
npm install
npm run dev
```

This launches Electron with Vite HMR. DevTools open automatically.

### Build from Source

```bash
# macOS — .dmg + .zip (arm64 & x64)
npm run build:mac

# Windows — NSIS installer + portable + .zip
npm run build:win

# Linux — AppImage + .deb + .tar.gz
npm run build:linux
```

Output goes to `release/`. Each platform must be built on its native OS (native modules like `node-pty` require it).

### Preview Production Build

```bash
npm run preview
```

---

## Configuration

### Global — `<PILOT_DIR>/`

| Platform | Location |
|---|---|
| macOS | `~/.config/.pilot/` |
| Windows | `%APPDATA%\.pilot\` |
| Linux | `$XDG_CONFIG_HOME/.pilot/` (default `~/.config/.pilot/`) |

Key files: `auth.json` (credentials), `app-settings.json` (preferences), `MEMORY.md` (global memory), `sessions/` (conversation history), `extensions/`, `skills/`, `prompts/`.

### Per-project — `<project>/.pilot/`

Key files: `settings.json` (jail, yolo mode), `commands.json` (dev commands), `MEMORY.md` (project memory), `tasks/tasks.jsonl` (task board), `prompts/` (project templates).

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for full details.

---

## Keyboard Shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| Command Palette | `⌘K` | `Ctrl+K` |
| New Tab / Conversation | `⌘T` / `⌘N` | `Ctrl+T` / `Ctrl+N` |
| Close Tab | `⌘W` | `Ctrl+W` |
| Next / Previous Tab | `⌘⇧]` / `⌘⇧[` | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Toggle Sidebar | `⌘B` | `Ctrl+B` |
| Toggle Terminal | `` ⌘` `` | `` Ctrl+` `` |
| Prompt Library | `⌘/` | `Ctrl+/` |
| Toggle Yolo Mode | `⌘⇧Y` | `Ctrl+Shift+Y` |
| Settings | `⌘,` | `Ctrl+,` |

All shortcuts are rebindable in Settings → Keybindings.

---

## Architecture

```
Renderer (React 19)          ← No Node access, all calls via window.api
    ↕ Typed IPC (contextBridge)
Main Process (Electron)      ← Pi SDK, file system, git, PTY, IPC handlers
    ↕
Pi Coding Agent SDK          ← Sessions, streaming, tools, auth, persistence
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full breakdown.

---

## Documentation

Full documentation lives in [`docs/`](docs/INDEX.md):

- [Overview](docs/OVERVIEW.md) — what Pilot is
- [Architecture](docs/ARCHITECTURE.md) — how components connect
- [Structure](docs/STRUCTURE.md) — where things live
- [Configuration](docs/CONFIGURATION.md) — all settings and config files
- [Patterns](docs/PATTERNS.md) — conventions to follow
- [Glossary](docs/GLOSSARY.md) — domain terminology

---

## Tech Stack

Electron 40 · React 19 · TypeScript 5.7 · Zustand 5 · Tailwind CSS 4 · Pi Coding Agent SDK · simple-git · node-pty · xterm.js · highlight.js · Vite + electron-vite

---

## License

[MIT](LICENSE) © 2026 Espen Nilsen
