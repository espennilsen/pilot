

# Pilot

**An Integrated Agentic Environment (IAE) for AI-powered coding.**

A native desktop environment for the [Pi Coding Agent](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) — chat with an AI agent, review diffs before they touch disk, manage git, run dev commands, coordinate subagents, and track tasks, all from one keyboard-driven app.





> [!WARNING]
> **Pilot is in early development.** The app runs on **macOS**, **Windows**, and **Linux**.
>
> **[Nightly builds](https://github.com/espennilsen/pilot/releases/tag/nightly)** are available for all platforms — use at your own risk. These are unstable, unsigned builds generated automatically from the latest `main` branch.

---

## Features

- **Agent Chat** — streaming responses, tool call visibility, thinking blocks, steer/follow-up, image attachments, slash commands, and AI follow-up suggestion chips
- **File Editor** — syntax-highlighted code editor with line numbers, in-file **find & replace** (string and regex), and dirty-state revert
- **Sandboxed File Operations** — all edits staged for review before touching disk, with accept/reject per change and Yolo mode override
- **Tabbed Sessions** — independent agent sessions with drag-and-drop, pinning, project grouping, and draft persistence
- **Git Integration** — status, staging, commits, branches, blame, stash, **interactive rebase UI**, **submodule management**, and AI-assisted conflict resolution — all inline
- **Memory System** — two-tier persistent memory (global + project) with auto-extraction and agent tools for reading/writing
- **Subagents** — spawn parallel workers, orchestrate multi-step work, with live monitoring in the Agents panel
- **Task Board** — kanban/table views with epics, dependencies, priorities, and full agent tool access
- **Prompt Library** — reusable templates with variables and slash-command triggers
- **Web Tabs** — browse documentation, preview local HTML, or monitor dashboards inside the app
- **Artifacts & Live Preview** — render HTML/CSS/JS artifacts the agent produces in a dedicated preview pane
- **Web Search** — agent can search the web via Brave Search API and cite sources inline
- **MCP Servers** — connect external tools via Model Context Protocol (stdio, SSE, Streamable HTTP)
- **Desktop** — Docker-based virtual display the agent can control — browser testing, GUI automation, and visual verification with 18 tools (mouse, keyboard, screenshot, clipboard, browser)
- **Custom Themes** — create, edit, and import color themes (dark, light, or fully custom)
- **Scratch Pad** — quick persistent notepad for drafting messages or saving snippets
- **Command Palette** — fuzzy-searchable `⌘K` overlay for every action
- **Terminal** — embedded PTY terminal with tabs
- **Companion Access** — access Pilot from iOS/iPad/browser via HTTPS + WebSocket with PIN/QR pairing
- **Extensions & Skills** — install and manage Pi SDK extensions and skills

See [docs/](docs/INDEX.md) for full documentation.

---

## Getting Started

### Prerequisites

- **Node.js** 22+ (dev tooling; Electron bundles its own runtime)
- **Git** on PATH
- API key or OAuth credentials for at least one AI provider (Anthropic, OpenAI, Google)
- **Ollama** (local models) — optional, typically keyless; only needed for local model usage
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


| Platform | Location                                                 |
| -------- | -------------------------------------------------------- |
| macOS    | `~/.config/pilot/`                                       |
| Windows  | `%APPDATA%\pilot\`                                       |
| Linux    | `$XDG_CONFIG_HOME/pilot/` (default `~/.config/pilot/`)    |


Key files: `auth.json` (credentials), `app-settings.json` (preferences), `MEMORY.md` (global memory), `sessions/` (conversation history), `extensions/`, `skills/`, `prompts/`.

### Per-project — `<project>/.pilot/`

Key files: `settings.json` (jail, yolo mode), `commands.json` (dev commands), `MEMORY.md` (project memory), `tasks/tasks.jsonl` (task board), `prompts/` (project templates).

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for full details.

---

## Documentation

Full documentation lives in `[docs/](docs/INDEX.md)`:

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