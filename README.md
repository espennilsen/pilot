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

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [Onboarding](#onboarding)
  - [Agent Chat](#agent-chat)
  - [Sandboxed File Operations & Diff Review](#sandboxed-file-operations--diff-review)
  - [Tabbed Sessions](#tabbed-sessions)
  - [Session History](#session-history-sidebar)
  - [Context Panel](#context-panel-right-side)
  - [Git Panel](#git-panel)
  - [Memory System](#memory-system)
  - [Subagents & Orchestrator Mode](#subagents--orchestrator-mode)
  - [Task Board](#task-board)
  - [Prompt Library](#prompt-library)
  - [Companion Access](#companion-access-ios--ipad--browser)
  - [Command Center](#command-center)
  - [Command Palette](#command-palette)
  - [Terminal](#terminal)
  - [Scratch Pad](#scratch-pad)
  - [Settings](#settings)
  - [Status Bar](#status-bar)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Tech Stack](#tech-stack)
- [License](#license)

---

## Overview

Pilot is an **Interactive Agentic Environment (IAE)** — a new class of tool where human and AI agent share a live, persistent workspace rather than exchanging messages in isolation. Unlike a plain chat interface, an IAE gives you full visibility into what the agent is doing, lets you intervene at any step, and keeps every file change, task, and decision traceable.

Pilot wraps the Pi Coding Agent SDK in a purpose-built Electron shell. The SDK runs in the main process and handles sessions, streaming, tool execution, auth, and persistence. The React renderer communicates with it over a fully typed IPC bridge — so every feature you see in the UI is backed by a real SDK call, not a mock.

The design philosophy is **keyboard-first, zero-friction**: every core action is reachable from the command palette, and the layout stays out of your way while the agent works.

---

## Features

### Onboarding
A guided 3-step welcome screen greets first-time users:

> **Config directory** is platform-dependent: `~/.config/.pilot/` (macOS/Linux), `%APPDATA%\.pilot\` (Windows). Documentation uses `<PILOT_DIR>` as shorthand.

1. **Connect Provider** — Add API keys or log in via OAuth for Anthropic (Claude), OpenAI (GPT), or Google (Gemini). Keys are stored locally in `<PILOT_DIR>/auth.json`.
2. **Tools** — Pick your preferred terminal and code editor from auto-detected options. Used when Pilot opens files or directories in external apps.
3. **Open Project** — Choose a working directory to give the agent file access.

---

### Agent Chat
The primary surface. Built on the Pi SDK's `session.subscribe()` event stream.

- **Streaming responses** rendered token by token with a blinking cursor.
- **Thinking** — collapsible block for `thinking_delta` events when extended thinking is enabled.
- **Tool call visibility** — every tool the agent invokes shows inline as a card with status (running / ✓ / ✗), file path or command, duration, and accept/reject controls.
- **Abort** — stop button ends streaming immediately.
- **Steer** — send a message *while* the agent is streaming to redirect it mid-turn (press `Enter` while streaming). A queued **steer** appears as an amber/⚡ chip above the input until the current turn hands off.
- **Follow-up** (`Alt+Enter`) — queue a message to send *after* the current turn finishes. Appears as a blue/🕐 chip above the input. Both steer and follow-up chips can be cancelled before delivery.
- **Auto-retry display** — if the SDK retries a failed request, an inline banner shows "Retrying (attempt N/M)… waiting Xs" directly in the chat thread.
- **Auto-rename tab** — when the first message is sent in a "New Chat" tab, the tab title auto-renames to the first 40 characters of that message.
- **Message history navigation** — press `↑` / `↓` in the empty input box to recall and cycle through previously sent messages for the current session.
- **Image attachments** — drag-and-drop, paste, or click the `+` button to attach images to any message.
- **Model picker** — searchable dropdown grouped by provider, accessible directly from the input toolbar. Supports fuzzy-filtering by name, ID, or provider.
- **Per-provider default model** — Settings → Auth & Models lets you pin a default model per provider; that model is pre-selected when you open a new session with that provider.
- **Thinking level** — cycle with `Shift+Tab` in the input field.
- **Smart auto-scroll** — follows new content but pauses when you scroll up; resumes when you return to the bottom.
- **Error display** — agent errors are rendered inline with styled error bubbles.
- **Slash commands** — type `/` in the input to open the slash command menu:
  - `/memory` — open the Memory panel
  - `/tasks` — jump to the Task Board
  - `/tasks board` / `/tasks create` / `/tasks ready` — task board sub-commands
  - `/spawn [role] [prompt]` — launch a subagent
  - `/orchestrate [description]` — enter orchestrator mode
  - Any template slug defined in the Prompt Library

---

### Sandboxed File Operations & Diff Review

The agent's file tools (`edit`, `write`, `bash`) are intercepted before anything reaches disk. In normal mode every proposed change is staged for review:

- Each tool call card shows **Accept / Always / Reject** buttons inline in the chat.
  - **Accept** — writes the change to disk immediately.
  - **Always** — auto-accepts all future calls of that tool type for the current session (toggleable per tool: `write`, `edit`, `bash`).
  - **Reject** — discards the change and informs the agent.
- The **Changes tab** in the right panel shows all pending and historical diffs with unified diff rendering. **Accept All** applies every pending change in one click.
- A history toggle reveals previously accepted/rejected diffs.
- Read-only tools (`read`, `grep`, `find`, `ls`) pass through the sandbox unchanged.

**Yolo Mode** (`⌘⇧Y`) bypasses staging and writes directly to disk. A 🟡 YOLO badge in the status bar indicates when it's active.

**Project Jail** restricts the agent to files within the project directory using intelligent path analysis that blocks bash commands referencing paths outside the project root. 🔒 / 🔓 in the status bar shows jail state. `allowedPaths` in `.pilot/settings.json` can whitelist extra directories outside the project root (useful for monorepos).

---

### Tabbed Sessions

Browser-style tabs, each representing an independent agent session:

- **Tab types**: `chat` (agent conversation), `file` (full code editor), `tasks` (task board), `docs` (documentation viewer)
- **Add / close / reopen** — `⌘T`, `⌘W`, `⌘⇧T`
- **Navigate** — `⌘⇧]` / `⌘⇧[` to cycle, `⌘1–9` to jump by position
- **Drag-and-drop** reordering
- **Pin** tabs to prevent accidental close
- **Project grouping** — tabs group by project with a unique color dot; group headers appear when multiple projects are open
- **Unread indicator** — badge when the agent finishes while the tab is backgrounded
- **Input draft persisted per-tab** — the unsent message in the chat input is saved and restored on restart, so in-progress prompts are never lost

---

### Session History (Sidebar)

The left sidebar lists all past sessions for the current project, sourced from the Pi SDK's `SessionManager`.

- **Sorted by last active**
- **Search** — filter sessions by title or content snippet
- **Pin** sessions to keep them at the top regardless of recency
- **Archive / unarchive** — archive old sessions to clean up the list without deleting them; archived sessions are hidden by default but accessible via a filter toggle
- **Delete** — permanently remove sessions you no longer need
- **Persistence** — all session management state (pins, archives, deletions) persists across app restarts
- Click any session to switch the active tab to it
- **Branch indicator** — shows the conversation tree depth when sessions have been forked
- **New chat** (`+` button or `⌘N`) starts a fresh session

---

### Context Panel (Right Side)

A resizable right panel with four tabs:

| Tab | Contents |
|---|---|
| **Files** | Live file tree of the project root. Click any file for a read-only syntax-highlighted preview. **Configurable visibility** — hide/show files using .gitignore-syntax patterns via **Settings → Files**. |
| **Git** | Full git panel (see below). |
| **Changes** | Staged diff queue for the active session with pending count badge. |
| **Agents** | Subagent monitor — lists all spawned subagents with role, status, elapsed time, token counts, modified files, result/error preview, and a per-agent abort button. |

---

### Git Panel

Powered by `simple-git`. Three sub-views:

**Status**
- Real-time file status: staged (green), unstaged (yellow), untracked
- Stage / unstage per file or all at once
- Inline diff preview for any changed file
- Branch list with upstream ahead/behind counts, create/switch/delete
- Commit message input with **Commit** action
- **Auto .gitignore** — when opening a git repository, Pilot prompts to add `.pilot/` to `.gitignore` if it's not already present, helping keep project metadata out of version control

**History**
- Scrollable commit log: short hash, author, relative date, message
- Click any commit to view its full diff
- Blame view toggle per file

**Stash**
- List of stashes with message, date, and originating branch
- Apply / pop / drop actions

Git panel gracefully degrades: shows actionable empty states if git isn't on PATH, the directory isn't a repo, or no project is open. **Initialize Git Repository** button appears for non-repo directories.

---

### Memory System

Two-tier persistent memory automatically builds context across all your sessions:

| Tier | Location | Purpose |
|---|---|---|
| **Global** | `<PILOT_DIR>/MEMORY.md` | Follows you across every project — preferences, coding style, personal notes |
| **Project** | `<project>/.pilot/MEMORY.md` | Git-trackable; the whole team shares the same project context |

**Auto-extraction** — after each agent turn the cheapest available model (Haiku / GPT-4o mini / Flash) distils new memories in the background. A 30-second debounce prevents redundant runs; each extraction times out after 10 seconds so it never blocks anything. Toggle auto-extraction on or off in Settings → Memory.

**Chat commands**
- `# remember <text>` — immediately persist a note to global memory
- `# forget <text>` — remove matching lines from memory
- `/memory` — open the Memory panel from chat

**Injection cap** — the combined content from both tiers is trimmed to 50 KB (oldest memories first) before being injected into the system prompt as structured context.

**Status bar** — 🧠 N shows the total memory item count. After a successful auto-extraction the icon briefly pulses as 🧠✨.

**Settings → Memory** — raw Markdown editor for each of the two tiers. Per-tier buttons: **Save**, **Clear**, **Reload**. The auto-extract toggle is also here.

---

### Subagents & Orchestrator Mode

Spawn parallel workers and coordinate complex multi-step work without leaving the chat:

#### Launching subagents

- **`/spawn [role] [prompt]`** — launch a subagent directly from the chat input
- **`/orchestrate [description]`** — switch to orchestrator mode: the agent receives a coordination-only system prompt, coordinates a Dev → QA loop, retries up to 3 times on failure, and escalates to the human if all retries are exhausted

#### Agent SDK tools

The agent itself can spawn subagents using built-in tools:

| Tool | Description |
|---|---|
| `pilot_subagent` | Spawn a single named subagent with a role and prompt |
| `pilot_subagent_parallel` | Spawn a pool of subagents that run concurrently |
| `pilot_subagent_status` | Query the live status of a running subagent |

#### Concurrency limits

- Up to **4 simultaneous** subagents running at once
- Up to **10 subagents** tracked per tab
- Each subagent times out after **5 minutes**

#### Parallel pools & conflict detection

`pilot_subagent_parallel` groups subagents and routes their file writes through a shared conflict detector. If two subagents try to modify the same file, the first writer wins and the second receives an error so it can adapt.

#### Agents tab (Context Panel)

The **Agents** tab in the right Context Panel provides a live dashboard of all subagents for the active session:

- Role, status (queued / running / done / failed / timed out), elapsed time, token usage
- List of files modified by each subagent
- Result preview (truncated) or error message on completion
- **Abort** button per running or queued subagent

#### Diffs

All file writes made by subagents flow through the same `SandboxedTools` → `StagedDiffManager` pipeline as the main agent, so their diffs appear in the parent session's **Changes** tab and obey the same Yolo Mode / auto-accept rules.

---

### Task Board

A built-in project management board, fully integrated with the agent:

#### Views
- **Kanban** — drag-and-drop columns by status
- **Table** — sortable columns for power users

#### Data model

| Field | Options |
|---|---|
| **Type** | `epic`, `task`, `bug`, `feature` |
| **Priority** | `P0` – `P4` |
| **Status** | `open`, `in_progress`, `review`, `done` |
| **Dependencies** | `blocks`, `blocked_by`, `related` — cycle detection prevents circular graphs |

Epics auto-complete when all child tasks reach `done`.

#### Filtering
Filter by status, priority, type, assignee, label, epic, or free-text search. Filters are composable and persist per-project.

#### Sidebar Tasks pane
A compact pane in the left sidebar shows **Ready tasks** (unblocked, open) and **Blocked tasks** with their blocking dependency. Includes an inline create form for quick capture.

#### Agent tools

The agent can read and write the task board using built-in tools:

| Tool | Description |
|---|---|
| `pilot_task_create` | Create a new task/epic/bug/feature |
| `pilot_task_update` | Update status, priority, assignee, or any field |
| `pilot_task_query` | Query tasks by filter criteria |
| `pilot_task_comment` | Add a comment to a task |

The full task board state is injected into the agent's system prompt as `<tasks>` XML so the agent always knows what's in scope.

#### Slash commands

| Command | Action |
|---|---|
| `/tasks` | Jump to the task board tab |
| `/tasks board` | Open the Kanban view |
| `/tasks create` | Open the inline create form |
| `/tasks ready` | Show ready (unblocked) tasks |

#### Storage

Tasks are stored in `<project>/.pilot/tasks/tasks.jsonl` — an append-only JSONL file. The file is watched with `chokidar` so the board updates instantly when another tool (or a teammate) writes to it.

---

### Prompt Library

Reusable message templates with variable substitution:

#### Templates
- Write a template with `{{variable}}` placeholders anywhere in the body
- Variable types are inferred automatically from the placeholder name and context:
  - **text** — single-line input
  - **multiline** — textarea
  - **select** — dropdown (defined in the template metadata)
- Assign a `/command` slug to any template for slash-command autocomplete in chat

#### Opening the library
- **`⌘/`** or the toolbar button → floating **PromptPicker** overlay
- Type to search by title, slug, or content
- Select a template → variable fill dialog appears → insert into chat input

#### Scopes & override
- **Global** templates live in `<PILOT_DIR>/prompts/`
- **Project** templates live in `<project>/.pilot/prompts/`
- Project templates override global ones when slugs collide

#### Starter prompts
A set of built-in starter prompts is seeded from `resources/prompts/` on first launch. Updates are applied version-by-version; if you have edited a starter prompt (detected by content hash) your edits are preserved.

#### Settings → Prompts
Full CRUD for all templates: set title, body, slash command slug, icon, color, and variable definitions. Changes are saved immediately to the appropriate scope directory.

---

### Companion Access (iOS / iPad / Browser)

Access Pilot from any device on your network — or remotely — without additional client software. The dedicated iOS/iPadOS companion app is available at [**Wingman**](https://github.com/espennilsen/wingman).

#### Setup
Enable in **Settings → Companion**. This starts an HTTPS + WebSocket server on the default port **18088**. The renderer UI itself is served over the companion connection, so the experience is identical to the desktop app.

#### Pairing
- **PIN** — a 6-digit code displayed in Settings, expires after 5 minutes
- **QR code** — scan from iOS/iPadOS camera app or any QR reader

#### Auto-discovery
Pilot advertises itself via **mDNS/Bonjour** (`_pilot-comp._tcp`) using `@homebridge/ciao`. Supported clients detect Pilot automatically on the local network with no manual IP entry required.

#### Responsive layout
The companion UI adapts to three breakpoints:

| Breakpoint | Width |
|---|---|
| Desktop | > 1024 px |
| Tablet | 768 – 1024 px |
| Mobile | < 768 px |

#### Remote access options

| Method | Notes |
|---|---|
| **Tailscale** | Run `tailscale cert` to get a real TLS cert; Pilot hot-swaps it without restart |
| **Cloudflare Tunnel** | No Cloudflare account required for basic tunnels |

#### Dev server tunneling
When a dev command's output contains a `localhost:…` URL, Pilot can automatically create a tunnel so the running dev server is also accessible from the companion device.

#### Device management
Settings → Companion lists all paired devices with last-seen timestamps. Revoke any device individually or revoke all at once.

#### TLS
A self-signed certificate is auto-generated on first enable and stored as `<PILOT_DIR>/companion-cert.pem` / `companion-key.pem`. Tailscale-issued certs are hot-swapped without restarting the companion server. Paired device session tokens are stored in `<PILOT_DIR>/companion-tokens.json`.

---

### Command Center

An optional developer sidebar section (toggle with `⌘⇧D` or Settings → Developer Mode):

- All commands come from **`.pilot/commands.json`** — there are no hardcoded built-in commands
- Each button has a status badge: idle · running (pulsing) · passed ✓ · failed ✗
- Output streams in real-time in a collapsible output panel
- **Stop** button for running processes; **Re-run** on completion
- The file is watched for live changes — edit `commands.json` and the sidebar updates instantly

```json
{
  "commands": [
    {
      "id": "dev-server",
      "label": "Start Dev Server",
      "command": "npm run dev",
      "icon": "Play",
      "cwd": "./",
      "env": {},
      "persistent": true
    },
    {
      "id": "test",
      "label": "Run Tests",
      "command": "pytest -v",
      "icon": "TestTube",
      "cwd": "./",
      "env": {},
      "persistent": false
    }
  ]
}
```

`persistent: true` keeps the process running (e.g. a dev server); `persistent: false` runs to completion (e.g. tests).

---

### Command Palette

`⌘K` opens a fuzzy-searchable overlay for every registered action: switch tabs, open settings, toggle panels, run dev commands, change project, and more. Keyboard-navigable with `↑` / `↓` and `Enter`.

---

### Terminal

A full PTY terminal embedded inside Pilot — toggle with `` ⌘` ``.

- Powered by **`node-pty`** (main process) + **`@xterm/xterm`** (renderer) with fit and web-links addons
- Multiple terminal tabs, auto-named from the shell binary (`zsh`, `zsh (2)`, …) with double-click rename
- Inherits the project directory as the working directory when a project is open
- Only shown when **Developer Mode** is active

---

### Scratch Pad

`⌘J` opens a floating, draggable, resizable mini-editor:

- Monospace textarea for notes, snippets, or draft prompts
- **Send to Agent** copies content to clipboard for pasting into chat
- Position and content persist across sessions

---

### Settings

A modal settings panel (`⌘,`) with ten sections:

| Section | Contents |
|---|---|
| **General** | Pi agent config directory, preferred terminal & editor |
| **Auth & Models** | Provider credentials (API keys, OAuth), per-provider default model |
| **Project** | Per-project sandbox settings (jail, `allowedPaths`, Yolo Mode) |
| **Companion** | Enable companion server, port, QR/PIN pairing, device management |
| **Memory** | Markdown editor for both memory tiers (global + project); auto-extract toggle |
| **Prompts** | Full CRUD for global and project-scoped prompt library templates |
| **Keybindings** | Rebind any global shortcut |
| **Extensions** | Install, enable/disable, or remove extensions (global & project-scoped) |
| **Skills** | Install, enable/disable, or remove skills (global & project-scoped) |
| **Developer** | Toggle Developer Mode, configure dev commands |

Extensions and skills are installed by importing `.zip` files via the UI or drag-and-drop. Global packages go to `<PILOT_DIR>/extensions/` or `<PILOT_DIR>/skills/`; project-scoped packages go to `<project>/.pilot/`.

---

### Status Bar

A compact one-line bar at the bottom of the window:

| Indicator | Meaning |
|---|---|
| ● Connected / Disconnected | At least one provider has valid auth |
| 🔒 Jailed / 🔓 Open | Project jail state |
| 🟡 YOLO | Yolo Mode is active |
| ⚡ Auto: write edit … | Per-tool auto-accept is on for the active session |
| 🧠 N | Total memory item count across both tiers; pulses as 🧠✨ after auto-extraction |
| Context bar | Color-coded mini progress bar showing context window usage %: green → yellow at 70% → red at 90% |
| $0.0000 | Running session cost in USD; hover for a breakdown of input / output / cache tokens |
| 🔀 `branch` ↑n ↓n | Current git branch and ahead/behind count |
| Model: `name` | Active model for the current tab |
| Thinking: `level` | Current thinking level |
| ⚡ Dev | Developer Mode is active |

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                      Renderer (React 19)                      │
│                                                               │
│  TabBar · TitleBar · Sidebar · MainLayout                     │
│  ChatView · ContextPanel · GitPanel                           │
│  TaskBoardView · DocsViewer · FileEditor                      │
│  AgentsPanel · PromptPicker                                   │
│  CommandPalette · ScratchPad · SettingsPanel · StatusBar      │
│                                                               │
│              Typed IPC via contextBridge                      │
├───────────────────────────────────────────────────────────────┤
│                      Main Process                             │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              Pi SDK Integration Layer                  │   │
│  │  PilotSessionManager                                   │   │
│  │  • createAgentSession / continueSession                │   │
│  │  • session.subscribe → IPC → renderer                  │   │
│  │  • AuthStorage · ModelRegistry                         │   │
│  │  • SessionManager · SettingsManager                    │   │
│  │  • DefaultResourceLoader (extensions/skills)           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │ Sandboxed    │  │ GitService │  │ DevCommandsService   │   │
│  │ Tools        │  │ simple-git │  │ child_process        │   │
│  │ pilot_edit   │  └────────────┘  └──────────────────────┘   │
│  │ pilot_write  │                                             │
│  │ pilot_bash   │  ┌────────────┐  ┌──────────────────────┐   │
│  └──────────────┘  │TaskManager │  │ SubagentManager      │   │
│                    │tasks.jsonl │  │ 4 concurrent workers │   │
│  ┌──────────────┐  └────────────┘  └──────────────────────┘   │
│  │MemoryManager │                                             │
│  │ 2-tier MD    │  ┌────────────┐  ┌──────────────────────┐   │
│  │ auto-extract │  │PromptLib   │  │ CompanionServer      │   │
│  └──────────────┘  │prompts/    │  │ HTTPS+WS, mDNS, TLS  │   │
│                    └────────────┘  └──────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ TerminalService — node-pty PTY management                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  IPC domains: agent · model · session · auth · settings       │
│  sandbox · git · project · shell · dev-commands               │
│  extensions · workspace · tasks · prompts                     │
│  companion · subagent · terminal · memory                     │
└───────────────────────────────────────────────────────────────┘
```

### Process Layout

| Layer | Role |
|---|---|
| **Renderer** | React UI. No Node access. All system calls go through `window.api` (contextBridge). |
| **Preload** | Exposes `window.api.invoke` and `window.api.on` with context isolation enabled. |
| **Main** | Hosts the Pi SDK, file system, git, spawned processes, and IPC handlers. |
| **Shared** | `shared/types.ts` — serializable TypeScript types. `shared/ipc.ts` — typed IPC channel constants. |

### Key Source Directories

```
electron/
  main/           # App entry, BrowserWindow, IPC registration
  preload/        # Context-isolated bridge (window.api)
  ipc/            # One file per domain: agent, auth, git, sandbox, tasks, …
  services/       # PilotSessionManager, GitService, DevCommandsService,
                  # ExtensionManager, SandboxedTools, StagedDiffManager,
                  # MemoryManager, TaskManager, SubagentManager,
                  # PromptLibrary, CompanionServer, TerminalService, …
shared/
  types.ts        # All IPC-safe types
  ipc.ts          # IPC channel name constants
src/
  components/     # React components, one folder per domain
  stores/         # Zustand stores (tab, chat, git, sandbox, ui, auth, …)
  hooks/          # useAgentSession, useKeyboardShortcut, useSandboxEvents, …
  lib/            # markdown renderer, diff utilities, syntax highlight, IPC client
```

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (dev tooling; Electron bundles its own Node runtime)
- **Git** on PATH (required for git panel features)
- API key or OAuth credentials for at least one supported AI provider
- **Linux only:** `build-essential`, `libx11-dev`, `libxkbfile-dev` (for native module compilation)

### Install

```bash
git clone https://github.com/your-username/Pilot.git
cd Pilot
npm install
```

### Run in development

```bash
npm run dev
```

Launches Electron with Vite HMR. DevTools open automatically in a detached window.

### Build for production

```bash
# Build for your current platform
npm run build:mac      # macOS — .dmg + .zip (arm64 & x64)
npm run build:win      # Windows — NSIS installer + portable + .zip
npm run build:linux    # Linux — AppImage + .deb + .tar.gz
```

Output lands in `release/`.

> **CI/CD:** Automated builds are triggered only on `v*` tags (e.g., `v1.0.0`). Push a version tag to trigger a release build across all platforms.

### Preview production build

```bash
npm run preview
```

---

## Configuration

### Global config directory

| Platform | Default location |
|---|---|
| macOS | `~/.config/.pilot/` |
| Windows | `%APPDATA%\.pilot\` |
| Linux | `$XDG_CONFIG_HOME/.pilot/` (default: `~/.config/.pilot/`) |

*Documentation uses `<PILOT_DIR>` as shorthand for this platform-specific path.*

| Path | Contents |
|---|---|
| `auth.json` | Provider credentials (API keys, OAuth tokens) |
| `models.json` | Model registry cache |
| `app-settings.json` | Terminal preference, editor CLI, developer mode, keybind overrides |
| `workspace.json` | Saved tab layout, panel sizes, and window bounds (auto-managed) |
| `sessions/` | Conversation history as `.jsonl` files (managed by Pi SDK) |
| `extensions/` | Globally installed extensions |
| `skills/` | Globally installed skills |
| `extension-registry.json` | Extension enabled/disabled state |
| `MEMORY.md` | Global memory |
| `prompts/` | Global prompt library templates |
| `companion-cert.pem` / `companion-key.pem` | TLS certificate (auto-generated on first enable) |
| `companion-tokens.json` | Paired device session tokens |

### Per-project config — `<project>/.pilot/`

| Path | Contents |
|---|---|
| `settings.json` | Jail enabled/disabled, `allowedPaths`, Yolo Mode |
| `commands.json` | Dev command buttons for the Command Center |
| `MEMORY.md` | Project memory (git-trackable) |
| `tasks/tasks.jsonl` | Task board — append-only JSONL (auto-managed) |
| `prompts/` | Project-scoped prompt templates (override global) |

> `.pilot/` is recommended in `.gitignore` by default — except `MEMORY.md` and `prompts/` if you want team sharing.

### Sandbox settings — `.pilot/settings.json`

```json
{
  "jail": {
    "enabled": true,
    "allowedPaths": []
  },
  "yoloMode": false
}
```

`allowedPaths` accepts absolute paths to directories outside the project root. Useful for monorepos where the agent needs to touch a shared `packages/` directory that lives above the current project root.

### Dev commands — `.pilot/commands.json`

```json
{
  "commands": [
    {
      "id": "dev-server",
      "label": "Start Dev Server",
      "command": "npm run dev",
      "icon": "Play",
      "cwd": "./",
      "env": { "PORT": "3000" },
      "persistent": true
    },
    {
      "id": "test",
      "label": "Run Tests",
      "command": "pytest -v",
      "icon": "TestTube",
      "cwd": "./",
      "env": {},
      "persistent": false
    }
  ]
}
```

`persistent: true` keeps the process running (e.g. a dev server); `persistent: false` runs to completion (e.g. tests, linters).

### Custom providers — `<PILOT_DIR>/app-settings.json`

Add any OpenAI-compatible API endpoint as a custom provider (file location is platform-specific as noted above):

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "api": "openai-completions",
      "models": [
        { "id": "llama3", "name": "Llama 3" }
      ]
    }
  }
}
```

`apiKey` values support `$ENV_VAR` references — Pilot expands them at runtime so you never have to paste secrets into config files.

---

## Keyboard Shortcuts

### Global

| Action | macOS | Windows / Linux |
|---|---|---|
| Command Palette | `⌘K` | `Ctrl+K` |
| New Tab | `⌘T` | `Ctrl+T` |
| Close Tab | `⌘W` | `Ctrl+W` |
| Reopen Closed Tab | `⌘⇧T` | `Ctrl+Shift+T` |
| Next Tab | `⌘⇧]` | `Ctrl+Tab` |
| Previous Tab | `⌘⇧[` | `Ctrl+Shift+Tab` |
| Jump to Tab 1–9 | `⌘1–9` | `Ctrl+1–9` |
| New Conversation | `⌘N` | `Ctrl+N` |
| New Project | `⌘⇧N` | `Ctrl+Shift+N` |
| Toggle Sidebar | `⌘B` | `Ctrl+B` |
| Toggle Context Panel | `⌘⇧B` | `Ctrl+Shift+B` |
| Toggle Terminal | `` ⌘` `` | `` Ctrl+` `` |
| Toggle Scratch Pad | `⌘J` | `Ctrl+J` |
| Toggle Focus Mode | `⌘⇧Enter` | `Ctrl+Shift+Enter` |
| Open Git Panel | `⌘G` | `Ctrl+G` |
| Open Memory Panel | `⌘⇧M` | `Ctrl+Shift+M` |
| Prompt Library | `⌘/` | `Ctrl+/` |
| Open Task Board | `⌘⇧K` | `Ctrl+Shift+K` |
| Toggle Yolo Mode | `⌘⇧Y` | `Ctrl+Shift+Y` |
| Toggle Developer Mode | `⌘⇧D` | `Ctrl+Shift+D` |
| Settings | `⌘,` | `Ctrl+,` |

### Chat Input

| Action | Key |
|---|---|
| Send message | `Enter` |
| Insert newline | `Shift+Enter` |
| Steer agent (while streaming) | `Enter` |
| Queue follow-up (while streaming) | `Alt+Enter` |
| Recall previous message | `↑` / `↓` (in empty input) |
| Open slash command menu | `/` (at start of input) |
| Cycle thinking level | `Shift+Tab` |

> **All global shortcuts are fully rebindable in Settings → Keybindings.**

---

## Tech Stack

| Concern | Choice |
|---|---|
| Desktop runtime | Electron 40 (Chromium 144, Node.js 24) |
| UI framework | React 19 |
| Language | TypeScript 5.7 (strict, project references) |
| AI agent SDK | `@mariozechner/pi-coding-agent ^0.54.1` |
| State management | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Syntax highlighting | highlight.js |
| Diff engine | `diff` (unified patch / structured patch) |
| Git | `simple-git` |
| PTY | `node-pty` |
| Terminal emulator | `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-web-links` |
| Companion server | `express` + `ws` |
| TLS cert generation | `node-forge` (pure JS — no OpenSSL CLI required) |
| ZIP extraction | `adm-zip` |
| mDNS / Bonjour | `@homebridge/ciao` |
| QR pairing | `qrcode` |
| File watching | `chokidar` |
| Frontmatter parsing | `gray-matter` |
| Icons | Lucide React |
| Date formatting | date-fns |
| Build | Vite 5 + electron-vite 2 |

---

## Contributing

TBD

---

## License

[MIT](LICENSE) © 2026 Espen Nilsen 
