# Pilot — Product Requirements Document

## Overview

**Product Name:** Pilot
**Tagline:** Your cockpit for AI-powered coding.
**Platform:** Desktop (macOS 12+, Windows 10+, Linux)
**Tech Stack:** Electron 40 + React 19 + TypeScript + `@mariozechner/pi-coding-agent` SDK
**Version:** 1.0 (MVP)
**License:** MIT

Pilot is a desktop application that provides a modern, productivity-focused GUI for the Pi Coding Agent. It gives developers a visual command center to interact with AI-assisted coding — managing conversations, reviewing diffs, executing agent tasks, and maintaining full project context — all from a native desktop experience.

---

## Problem Statement

Developers using AI coding agents today face a fragmented workflow. Terminal-based agents lack visual feedback. Web-based interfaces don't integrate with local filesystems. Copy-pasting code between a chat window and an editor kills flow state.

Pilot solves this by embedding the Pi Coding Agent into a purpose-built desktop shell that understands how developers actually work: keyboard-driven, context-aware, and zero-friction.

---

## Target Users

| Persona | Description |
|---|---|
| **Solo Developer** | Uses AI agents to accelerate personal projects. Wants fast iteration, minimal setup. |
| **Professional Developer** | Works on larger codebases. Needs diff review, file context, and session management. |
| **Technical Lead** | Uses the agent for code review, refactoring, and architecture discussions. Values traceability. |

---

## Goals & Success Metrics

### Goals

1. Deliver a fast, native-feeling desktop experience for the Pi Coding Agent.
2. Reduce context-switching between AI chat and code editing to near zero.
3. Make every core action achievable via keyboard.
4. Ship a stable MVP within 8 weeks.

### Success Metrics

| Metric | Target |
|---|---|
| Time from install to first agent interaction | < 2 minutes |
| Percentage of actions accessible via keyboard | 100% of core actions |
| App launch time (cold start) | < 3 seconds |
| Crash rate | < 0.1% of sessions |
| Daily active usage (beta users) | 5+ sessions/day average |

---

## Core Features (MVP)

### 1. Tab Bar

A browser-style tab system directly below the title bar for managing multiple chat sessions and projects simultaneously.

**Requirements:**

#### Tab Behavior
- Each tab represents one chat session with the agent.
- Tabs display the session title (auto-generated or user-set) and a close button on hover.
- Active tab is visually highlighted with the accent color.
- Drag-and-drop to reorder tabs within a group.
- Middle-click or `Cmd+W` / `Ctrl+W` to close a tab.
- `Cmd+T` / `Ctrl+T` to open a new tab in the current project.
- `Cmd+Shift+T` / `Ctrl+Shift+T` to reopen the last closed tab.
- Scroll horizontally when tabs overflow, with left/right arrow indicators.
- Tab tooltip on hover shows: session title, project name, and last active timestamp.

#### Project Grouping
- Tabs are grouped by project — each project gets a visually distinct group separated by a subtle divider or colored accent strip.
- Project group header shows the project name and folder icon, with a collapse/expand toggle.
- Clicking the project group header reveals a dropdown to: rename, open in Finder/Explorer, close all tabs in group, or add a new tab to the group.
- New tabs inherit the project context of the currently active group.
- Unassociated tabs (no project) are grouped under a "General" section.
- Color-coded project indicators — each project group gets a unique color dot on its tabs (auto-assigned or user-configurable).

#### Quick Switching
- `Cmd+1` through `Cmd+9` / `Ctrl+1` through `Ctrl+9` to jump to tab by position.
- `Cmd+Shift+]` / `Ctrl+Tab` to cycle to the next tab.
- `Cmd+Shift+[` / `Ctrl+Shift+Tab` to cycle to the previous tab.
- Command palette supports "Switch to tab..." with fuzzy search across all open tabs.
- `Cmd+Shift+N` / `Ctrl+Shift+N` to open a new tab with a different project (opens project picker).

#### State & Persistence
- All open tabs and their state are restored on app restart.
- Each tab maintains its own independent scroll position, message input draft, and panel configuration.
- Tabs that haven't been viewed in a while show an unread indicator if the agent has finished responding.
- Pinnable tabs — pin a tab to the left side so it can't be accidentally closed.

### 2. Agent Chat Interface

The primary interaction surface. A threaded conversation view powered by the Pi SDK's event stream.

**Requirements:**

- Markdown rendering with full syntax highlighting (all major languages).
- Inline code blocks with one-click copy, language detection, and line numbers.
- Streaming responses via SDK `session.subscribe()` — `text_delta` events render tokens in real-time.
- Thinking output display — when thinking is enabled, show `thinking_delta` events in a collapsible block.
- Tool execution visibility — `tool_execution_start/update/end` events shown inline as the agent works.
- Message editing — users can edit and resend previous messages.
- Conversation branching — edit a message mid-thread and fork via SDK's `session.fork()`.
- Steering — "interrupt" button sends `session.steer()` to redirect the agent mid-stream.
- Follow-up queueing — messages sent during streaming are queued via `session.followUp()`.
- File and image attachment support via drag-and-drop or paste (sent as `images` option to `session.prompt()`).
- Auto-scroll with smart pause — stops scrolling when the user scrolls up, resumes when they scroll to bottom.
- Model switcher in the chat header — cycle models via `session.cycleModel()` and thinking levels via `session.cycleThinkingLevel()`.

### 3. Inline Diff Review

Code changes proposed by the agent are displayed as inline diffs, not raw code blocks.

**Requirements:**

- Side-by-side and unified diff views (user toggle).
- Per-file diff display when the agent modifies multiple files.
- Accept / Reject / Edit action bar on each diff hunk.
- "Accept All" bulk action for multi-file changes.
- Syntax highlighting within diffs.
- Changes are staged locally — nothing is written to disk until the user explicitly accepts.

### 4. Project Context Panel

A right-side panel that gives the agent and the user shared awareness of the project.

**Requirements:**

- Live file tree of the current working directory.
- Click-to-preview any file (read-only viewer with syntax highlighting).
- Visual indicators on files the agent has modified or is referencing.
- Drag files from the tree into the chat to add them as context.
- `.pilotignore` support (like `.gitignore`) to exclude files from the agent's context.

### 5. Command Palette

A Raycast/VS Code-style command palette for fast navigation.

**Requirements:**

- Trigger via `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux).
- Searchable list of all actions: new chat, switch project, open settings, toggle panels, search history.
- Recent actions shown by default.
- Fuzzy matching on action names.
- Extensible — new commands can be registered by plugins (future).

### 6. Session & History Management

Persistent conversation history powered by the Pi SDK's `SessionManager`. Pilot adds a visual layer on top of the SDK's tree-structured `.jsonl` session files.

**Requirements:**

- Session list in sidebar pulled from `SessionManager.list()`, sorted by last active.
- Search across all conversations via SDK session metadata (first message, message count).
- Pin / archive sessions (stored in Pilot's local metadata, not in SDK session files).
- Session branching — the SDK supports tree-structured conversations with `fork()` and `navigateTree()`. Pilot exposes this as a visual branch selector.
- Conversation forking — click any message to fork the conversation from that point.
- Session labels — visual markers via SDK's `appendLabelChange()` for significant moments.
- Continue recent — resume the most recent session via `SessionManager.continueRecent()`.
- Export conversation as Markdown.

### 7. Integrated Terminal

A built-in terminal for running commands without leaving the app.

**Requirements:**

- Full PTY terminal emulator (xterm.js).
- Tabbed terminal sessions.
- Agent can execute commands in the terminal (with user approval).
- Terminal output is capturable as context for the agent.
- Toggle visibility with a keyboard shortcut (`Cmd+\`` / `` Ctrl+` ``).

### 8. Scratch Pad

A floating mini-editor for composing complex prompts.

**Requirements:**

- Resizable floating window within the app.
- Markdown support with preview toggle.
- "Send to Agent" button that transfers content to the chat input.
- Persists across sessions (auto-saved).
- Supports code snippets with syntax highlighting.

### 10. Developer Mode (Command Center)

An opt-in developer mode (toggled in Settings) that exposes a command center in the left sidebar for quick access to common development tasks. Commands are fully configurable per project.

**Requirements:**

#### Activation
- Toggle in Settings → General → "Developer Mode" (off by default).
- When enabled, a new "Command Center" section appears in the left sidebar below the session history.
- Collapsible section with a ⚡ icon header.
- Visual indicator in the status bar when Developer Mode is active.

#### Default Commands
Three built-in command buttons ship out of the box, pre-configured with sensible defaults:

| Command | Default | Icon |
|---|---|---|
| **Start Dev Server** | `npm run dev` | ▶️ |
| **Run Tests** | `npm test` | 🧪 |
| **Lint** | `npm run lint` | 🔍 |

- Each button shows a status badge: idle (gray), running (pulsing green), passed (green check), failed (red x).
- Clicking a command runs it in a dedicated terminal instance (not the main integrated terminal).
- Output streams in real-time into a collapsible output panel below the button.
- Stop button appears on running commands to kill the process.
- Re-run button for quick retry after failure.
- Click the status badge to expand/collapse the last output.

#### Per-Project Configuration
- Commands are configured via a `.pilot/commands.json` file in the project root, or through the UI.
- Each project can override the default commands or add custom ones.
- UI-based editor accessible via a ⚙️ icon on the Command Center header.

```json
// .pilot/commands.json
{
  "commands": [
    {
      "id": "dev-server",
      "label": "Start Dev Server",
      "command": "npm run dev",
      "icon": "play",
      "cwd": "./",
      "env": { "PORT": "3000" },
      "persistent": true
    },
    {
      "id": "test",
      "label": "Run Tests",
      "command": "pytest -v",
      "icon": "test-tube",
      "cwd": "./",
      "env": {},
      "persistent": false
    },
    {
      "id": "lint",
      "label": "Lint",
      "command": "ruff check .",
      "icon": "search",
      "cwd": "./",
      "env": {},
      "persistent": false
    },
    {
      "id": "build",
      "label": "Build",
      "command": "npm run build",
      "icon": "package",
      "cwd": "./",
      "env": { "NODE_ENV": "production" },
      "persistent": false
    }
  ]
}
```

#### Configuration Fields

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for the command. |
| `label` | `string` | Display name shown on the button. |
| `command` | `string` | Shell command to execute. |
| `icon` | `string` | Lucide icon name for the button. |
| `cwd` | `string` | Working directory relative to project root. Default: `./`. |
| `env` | `object` | Additional environment variables to inject. |
| `persistent` | `boolean` | If `true`, command keeps running (e.g., dev server). If `false`, runs to completion (e.g., tests, lint). |

#### Custom Commands
- Users can add unlimited custom commands beyond the three defaults.
- Add via the UI editor or by editing `.pilot/commands.json` directly (file is watched for changes).
- Commands can be reordered via drag-and-drop in the sidebar.
- Maximum of 10 commands visible at once — overflow accessible via "Show more" expander.

#### Agent Integration
- Agent can read command output as context (e.g., "fix the lint errors" pulls in the latest lint output automatically).
- Agent can suggest running commands after making changes (e.g., "I've updated the component — want me to run tests?").
- Failed command output can be sent to the agent with one click: "Ask Agent to Fix" button appears on failed runs.

#### Keyboard Shortcuts (Developer Mode)

| Action | macOS | Windows/Linux |
|---|---|---|
| Toggle Command Center | `Cmd+Shift+D` | `Ctrl+Shift+D` |
| Run Dev Server | `Cmd+Shift+1` | `Ctrl+Shift+1` |
| Run Tests | `Cmd+Shift+2` | `Ctrl+Shift+2` |
| Run Lint | `Cmd+Shift+3` | `Ctrl+Shift+3` |

### 11. Git Integration Panel

A dedicated git panel that provides full visibility into repository status, branches, and diffs — eliminating the need to switch to a terminal or external git client.

**Requirements:**

#### Status View
- Real-time git status showing staged, unstaged, and untracked files.
- File status indicators: modified (M), added (A), deleted (D), renamed (R), untracked (?).
- One-click stage / unstage per file or "Stage All" / "Unstage All" bulk actions.
- Inline diff preview — click any changed file to see its diff without leaving the panel.
- Commit message input with conventional commit prefix suggestions (feat, fix, chore, etc.).
- Commit button with optional "Commit & Push" shortcut.
- Visual indicator when working tree is dirty vs clean.

#### Branch Management
- Current branch displayed prominently in the status bar and panel header.
- Branch list with search/filter, sorted by most recent activity.
- Create / switch / delete branches from the UI.
- Visual upstream tracking status — ahead/behind commit count per branch.
- Branch comparison — select two branches and view their diff summary.
- Merge and rebase actions with conflict resolution UI.
- Pull / Push / Fetch buttons with progress indicators.

#### Diff Viewer
- Full file diff viewer reusing the same diff engine as the agent diff review (consistency).
- Three diff modes: unified, side-by-side, and inline word-level diff.
- Diff navigation — jump between hunks with `↑` / `↓` or `[` / `]`.
- Blame view — toggle git blame annotations on any file.
- Diff against any ref: HEAD, branch, tag, or specific commit hash.
- Stash support — view, apply, pop, and drop stashes from the UI.

#### Commit History
- Scrollable commit log with graph visualization (branch/merge lines).
- Each commit shows: hash (short), author, relative timestamp, and message.
- Click a commit to view its full diff.
- Cherry-pick and revert actions on individual commits.
- Filter history by author, date range, or file path.
- Search commit messages (full-text).

#### Agent-Git Integration
- Agent can read git status and history as context for its responses.
- Agent-proposed changes show as a "virtual branch" before being accepted.
- "Commit Agent Changes" action — auto-generates a commit message summarizing what the agent did.
- Agent can suggest branch names based on the task being worked on.
- Conflict resolution assistance — if a merge conflict occurs, the agent can be asked to resolve it.

#### Keyboard Shortcuts (Git)

| Action | macOS | Windows/Linux |
|---|---|---|
| Open Git Panel | `Cmd+G` | `Ctrl+G` |
| Stage File | `Cmd+Shift+S` | `Ctrl+Shift+S` |
| Commit | `Cmd+Shift+C` | `Ctrl+Shift+C` |
| Pull | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Push | `Cmd+Shift+U` | `Ctrl+Shift+U` |
| Toggle Blame | `Cmd+Shift+G` | `Ctrl+Shift+G` |

### 12. Sandboxed File Operations & Yolo Mode

Pilot intercepts the SDK's built-in file tools to provide a safety layer between the agent and the filesystem. All file operations go through Pilot's sandbox, which enforces project boundaries and stages changes for review.

**Requirements:**

#### Tool Interception
- Pilot does NOT pass the SDK's default `editTool`, `writeTool`, or `bashTool` to `createAgentSession()`.
- Instead, Pilot registers custom tools (via `customTools`) that wrap the SDK equivalents:
  - `pilot_edit` — wraps `editTool`, captures the proposed diff before writing.
  - `pilot_write` — wraps `writeTool`, captures new file content before creating.
  - `pilot_bash` — wraps `bashTool`, executes normally but logs commands.
  - `readTool`, `grepTool`, `findTool`, `lsTool` — passed through unchanged (read-only).
- All write operations are staged in memory. Nothing touches disk until the user explicitly accepts via the diff review UI.
- The agent sees the custom tools as the standard tools (same name/schema in the system prompt) — it doesn't know it's sandboxed.

```typescript
// electron/services/sandboxed-tools.ts

import {
  createEditTool,
  createWriteTool,
  createBashTool,
  createReadTool,
  createGrepTool,
  createFindTool,
  createLsTool,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";

export function createSandboxedTools(
  cwd: string,
  options: { jailEnabled: boolean; yoloMode: boolean }
): ToolDefinition[] {
  const realEdit = createEditTool(cwd);
  const realWrite = createWriteTool(cwd);
  const realBash = createBashTool(cwd);

  const pilotEdit: ToolDefinition = {
    ...realEdit,
    execute: async (toolCallId, params, onUpdate, ctx, signal) => {
      // Jail check: reject if path escapes project root
      if (options.jailEnabled && !isWithinProject(cwd, params.path)) {
        return {
          content: [{ type: "text", text: `Error: Path ${params.path} is outside the project directory.` }],
          details: {},
        };
      }

      if (options.yoloMode) {
        // Yolo: execute immediately, no staging
        return realEdit.execute(toolCallId, params, onUpdate, ctx, signal);
      }

      // Normal: stage the diff for review
      const diff = computeDiff(params.path, params);
      emitStagedDiff(toolCallId, diff);
      return {
        content: [{ type: "text", text: `Edit staged for review: ${params.path}` }],
        details: {},
      };
    },
  };

  // Similar wrappers for pilotWrite and pilotBash...
  return [pilotEdit, pilotWrite, pilotBash, createReadTool(cwd), createGrepTool(cwd), createFindTool(cwd), createLsTool(cwd)];
}
```

#### Project Jail (Sandbox)
- When enabled, the agent can only read and write files within the project directory.
- Any file operation targeting a path outside `cwd` is blocked and returns an error to the agent.
- Symlinks that resolve outside the project are also blocked.
- Configurable per project in `.pilot/settings.json`:

```json
// .pilot/settings.json
{
  "jail": {
    "enabled": true,
    "allowedPaths": [
      "<PILOT_DIR>/"
    ]
  }
}
```

- `enabled` — `true` by default for new projects. Can be disabled for monorepos or projects that need access to external files.
- `allowedPaths` — optional whitelist of additional directories the agent may access outside the project root.
- Jail status shown in the status bar: 🔒 (jailed) or 🔓 (unrestricted).
- Bash commands are also jail-checked — Pilot parses the command for file path arguments and blocks those outside the project. Commands that can't be statically analyzed show a confirmation prompt.

#### Yolo Mode
- When enabled, all file operations bypass the staging/review workflow and are written directly to disk.
- Toggle in Settings → Project → "Yolo Mode" with a clear warning: *"Changes will be applied immediately without review. Use with caution."*
- Also toggleable via command palette: "Toggle Yolo Mode".
- Also toggleable via keyboard shortcut.
- Status bar indicator: 🟡 YOLO when active.
- Yolo Mode and Jail are independent — you can have Yolo + Jail (fast writes but restricted to project) or Yolo + No Jail (full unrestricted access).
- Per-project setting in `.pilot/settings.json`:

```json
{
  "yoloMode": false
}
```

#### Staged Changes Workflow (Normal Mode)
1. Agent proposes a file edit → `pilot_edit` captures the diff.
2. Diff appears in the chat inline and in the Context Panel's "Changes Queue".
3. User reviews and clicks Accept / Reject / Edit on each diff.
4. On Accept → Pilot calls the real SDK `editTool.execute()` to write to disk.
5. On Reject → diff is discarded, agent is informed.
6. "Accept All" applies all pending diffs in order.

#### Keyboard Shortcuts (Sandbox)

| Action | macOS | Windows/Linux |
|---|---|---|
| Toggle Yolo Mode | `Cmd+Shift+Y` | `Ctrl+Shift+Y` |

### 13. Extension & Skill Import

Users can install extensions and skills by importing `.zip` files through the Pilot UI. Imported packages are extracted to the appropriate directories and made available to the SDK's `DefaultResourceLoader`.

**Requirements:**

#### Import Flow
- Import via: Settings → Extensions/Skills → "Import .zip", or drag-and-drop a `.zip` onto the app window.
- Pilot validates the zip structure before extracting:
  - **Extension zip**: Must contain at least one `.ts` or `.js` file at the root or in an `extension/` directory.
  - **Skill zip**: Must contain a `SKILL.md` file at the root or in a `skill/` directory.
- User chooses install scope:
  - **Global** — extracted to `<PILOT_DIR>/extensions/` or `<PILOT_DIR>/skills/`. Available to all projects.
  - **Project** — extracted to `<cwd>/.pilot/extensions/` or `<cwd>/.pilot/skills/`. Available only in that project.
- After extraction, Pilot calls `loader.reload()` to pick up the new extension/skill without restarting.

#### Extension Manager UI
- Settings → Extensions panel shows all installed extensions:
  - Name, description, source (global / project / built-in), status (active / disabled / error).
  - Toggle switch to enable/disable per extension.
  - Delete button to remove (with confirmation).
  - "Open folder" link to the extension's directory.
- Settings → Skills panel shows all installed skills with the same layout.

#### Zip Structure

```
# Extension zip
my-extension.zip
├── extension.ts          # Entry point
├── package.json          # Optional: name, version, description
└── README.md             # Optional: shown in extension manager

# Skill zip
my-skill.zip
├── SKILL.md              # Required: skill instructions
├── package.json          # Optional: name, version, description
└── templates/            # Optional: supporting files
    └── component.tsx
```

#### Security
- Imported extensions execute with the same permissions as the SDK — full filesystem and process access (subject to jail if enabled).
- Pilot shows a warning on import: *"Extensions can execute code on your machine. Only install extensions from sources you trust."*
- Extensions from zips are not auto-updated — user must re-import to update.

#### Storage

```
<PILOT_DIR>/
├── extensions/              # Global extensions
│   ├── my-extension/
│   │   ├── extension.ts
│   │   └── package.json
│   └── another-ext/
├── skills/                  # Global skills
│   ├── my-skill/
│   │   └── SKILL.md
│   └── another-skill/
└── extension-registry.json  # Tracks installed extensions, versions, enabled state
```

---

## UI / UX Specification

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Title Bar (custom frameless)                    ─ □ ✕     │
├─────────────────────────────────────────────────────────────┤
│ 🟦 my-app  │ Chat 1 │ Chat 2 │ 🟩 api-server │ Chat 1 │ + │
├────────┬────────────────────────────────┬───────────────────┤
│        │                                │ [Files] [Git] [◉] │
│  Side  │     Agent Chat Interface       │───────────────────│
│  bar   │                                │                   │
│        │  [user message]                │  📁 File Tree     │
│ ────── │  [agent response + diff]       │  — or —           │
│ History│  [user message]                │  🔀 Git Status    │
│ ────── │  [agent response]              │  📊 Branch: main  │
│ Pinned │                                │  ✏️ Staged (2)     │
│ ────── │                                │  📝 Unstaged (3)  │
│ ⚡ Cmds │                                │  💬 Commit...     │
│  ▶ Dev │                                │                   │
│  🧪 Test│                                │                   │
│  🔍 Lint│                                │                   │
│ ────── │                                │                   │
│  ⚙️    ├────────────────────────────────┤                   │
│        │  💬 Message Input              │                   │
├────────┴────────────────────────────────┴───────────────────┤
│  ● Connected │ 🔒 Jailed │ 🔀 main ↑0 ↓2 │ Model: pi-1 │ Tokens: 1.2k │
└─────────────────────────────────────────────────────────────┘
```

### Design Tokens

| Token | Value |
|---|---|
| `--bg-base` | `#1a1b1e` |
| `--bg-surface` | `#24262a` |
| `--bg-elevated` | `#2c2e33` |
| `--text-primary` | `#e0e0e0` |
| `--text-secondary` | `#8b8d91` |
| `--accent` | `#4fc3f7` |
| `--success` | `#66bb6a` |
| `--error` | `#ef5350` |
| `--warning` | `#ffa726` |
| `--border` | `#333539` |
| `--font-ui` | `Inter, Geist, system-ui` |
| `--font-mono` | `JetBrains Mono, Fira Code, monospace` |
| `--radius-sm` | `4px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `12px` |

### Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|---|---|---|
| Command Palette | `Cmd+K` | `Ctrl+K` |
| New Tab (same project) | `Cmd+T` | `Ctrl+T` |
| New Tab (new project) | `Cmd+Shift+N` | `Ctrl+Shift+N` |
| Close Tab | `Cmd+W` | `Ctrl+W` |
| Reopen Closed Tab | `Cmd+Shift+T` | `Ctrl+Shift+T` |
| Next Tab | `Cmd+Shift+]` | `Ctrl+Tab` |
| Previous Tab | `Cmd+Shift+[` | `Ctrl+Shift+Tab` |
| Jump to Tab 1–9 | `Cmd+1–9` | `Ctrl+1–9` |
| New Conversation | `Cmd+N` | `Ctrl+N` |
| Send Message | `Cmd+Enter` | `Ctrl+Enter` |
| Toggle Sidebar | `Cmd+B` | `Ctrl+B` |
| Toggle Context Panel | `Cmd+Shift+B` | `Ctrl+Shift+B` |
| Toggle Terminal | `` Cmd+` `` | `` Ctrl+` `` |
| Search History | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Focus Mode | `Cmd+Shift+Enter` | `Ctrl+Shift+Enter` |
| Accept Diff | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Reject Diff | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| Scratch Pad | `Cmd+J` | `Ctrl+J` |
| Git Panel | `Cmd+G` | `Ctrl+G` |
| Stage File | `Cmd+Shift+S` | `Ctrl+Shift+S` |
| Commit | `Cmd+Shift+C` | `Ctrl+Shift+C` |
| Pull | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Push | `Cmd+Shift+U` | `Ctrl+Shift+U` |
| Toggle Blame | `Cmd+Shift+G` | `Ctrl+Shift+G` |
| Toggle Command Center | `Cmd+Shift+D` | `Ctrl+Shift+D` |
| Run Dev Server | `Cmd+Shift+1` | `Ctrl+Shift+1` |
| Run Tests | `Cmd+Shift+2` | `Ctrl+Shift+2` |
| Run Lint | `Cmd+Shift+3` | `Ctrl+Shift+3` |
| Toggle Yolo Mode | `Cmd+Shift+Y` | `Ctrl+Shift+Y` |

---

## Technical Architecture

### High-Level Architecture

The main process imports the Pi Coding Agent SDK (`@mariozechner/pi-coding-agent`) directly. The SDK handles agent sessions, LLM communication, tool execution, auth, and session persistence. The renderer communicates with the main process via typed IPC, which proxies to the SDK.

```
┌─────────────────────────────────────┐
│          Renderer (React)           │
│  ┌─────────┬──────────┬──────────┐  │
│  │  Chat   │  Diff    │ Context  │  │
│  │  View   │  Viewer  │  Panel   │  │
│  └────┬────┴────┬─────┴────┬─────┘  │
│       │    IPC Bridge      │        │
├───────┴─────────┴──────────┴────────┤
│          Main Process               │
│  ┌──────────────────────────────┐   │
│  │   Pi SDK Integration Layer   │   │
│  │  ┌────────┬────────┬──────┐  │   │
│  │  │ Agent  │Session │ Auth │  │   │
│  │  │Session │Manager │Store │  │   │
│  │  └────────┴────────┴──────┘  │   │
│  │  ┌────────┬────────┬──────┐  │   │
│  │  │Resource│Settings│Model │  │   │
│  │  │ Loader │Manager │Regis.│  │   │
│  │  └────────┴────────┴──────┘  │   │
│  └──────────────────────────────┘   │
│  ┌──────────┬───────────┬────────┐  │
│  │  File    │   Git     │  Dev   │  │
│  │  Watcher │  Service  │  Cmds  │  │
│  └──────────┴───────────┴────────┘  │
│       │           │          │      │
│  Local FS      simple-git  Spawned  │
│                            Procs    │
└─────────────────────────────────────┘
```

### Pi SDK Integration

The SDK (`@mariozechner/pi-coding-agent`) replaces the need for a custom agent client, session database, and auth system. Pilot acts as a GUI shell around the SDK's core capabilities.

| SDK Component | Replaces | Role in Pilot |
|---|---|---|
| `createAgentSession()` | Custom agent client | Creates and manages agent lifecycle |
| `session.subscribe()` | WebSocket/SSE streaming | Real-time event streaming to renderer via IPC |
| `session.prompt()` / `steer()` / `followUp()` | Custom message sending | Message handling with streaming-aware queueing |
| `SessionManager` | SQLite conversation store | Session persistence via `.jsonl` files with tree branching. Stored in `<PILOT_DIR>/sessions/`. |
| `AuthStorage` | Custom keychain integration | API key, OAuth, and env var credential management. Stored in `<PILOT_DIR>/auth.json`. |
| `ModelRegistry` | Hardcoded model list | Model discovery, cycling, and availability checking |
| `SettingsManager` | Custom settings file | Global + per-project settings with merge |
| `DefaultResourceLoader` | Manual config loading | Extensions, skills, prompts, themes, context files |
| Built-in tools (`codingTools`) | N/A | Pilot wraps these in sandboxed tools (`pilot_edit`, `pilot_write`, `pilot_bash`) to stage changes for review and enforce project jail |
| Custom tools API | N/A | Pilot registers sandboxed tools and can add project-specific tools |
| Extension system / `createEventBus()` | N/A | Plugin architecture — users import extensions as `.zip` files |

### SDK Session Lifecycle in Pilot

```typescript
// Main process: pi-session-manager.ts

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createEventBus,
  type AgentSession,
  type AgentSessionEvent,
  type PromptOptions,
} from "@mariozechner/pi-coding-agent";
import { createSandboxedTools } from "./sandboxed-tools";
import { loadProjectSettings } from "./project-settings";

const PILOT_HOME = path.join(os.homedir(), ".config", ".pilot");
const PILOT_SESSIONS_DIR = path.join(PILOT_HOME, "sessions");
const PILOT_AUTH_FILE = path.join(PILOT_HOME, "auth.json");
const PILOT_MODELS_FILE = path.join(PILOT_HOME, "models.json");

export class PilotSessionManager {
  private sessions = new Map<string, AgentSession>(); // tabId -> session
  private authStorage = AuthStorage.create(PILOT_AUTH_FILE);
  private modelRegistry = new ModelRegistry(this.authStorage, PILOT_MODELS_FILE);
  private eventBus = createEventBus();

  async createSession(tabId: string, projectPath: string) {
    const projectSettings = loadProjectSettings(projectPath);
    const settingsManager = SettingsManager.create(projectPath);

    const loader = new DefaultResourceLoader({
      cwd: projectPath,
      settingsManager,
      eventBus: this.eventBus,
      // Include <PILOT_DIR>/extensions/ and <PILOT_DIR>/skills/
      additionalExtensionPaths: getGlobalExtensionPaths(),
    });
    await loader.reload();

    // Create sandboxed tools based on project settings
    const tools = createSandboxedTools(projectPath, {
      jailEnabled: projectSettings.jail?.enabled ?? true,
      yoloMode: projectSettings.yoloMode ?? false,
      allowedPaths: projectSettings.jail?.allowedPaths ?? [],
    });

    const { session } = await createAgentSession({
      cwd: projectPath,
      sessionManager: SessionManager.create(projectPath, PILOT_SESSIONS_DIR),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      settingsManager,
      resourceLoader: loader,
      tools,  // Sandboxed tools replace SDK defaults
    });

    // Bridge SDK events to renderer via IPC
    session.subscribe((event) => {
      this.forwardEventToRenderer(tabId, event);
    });

    this.sessions.set(tabId, session);
    return session;
  }

  async continueSession(tabId: string, projectPath: string) {
    const projectSettings = loadProjectSettings(projectPath);
    const tools = createSandboxedTools(projectPath, {
      jailEnabled: projectSettings.jail?.enabled ?? true,
      yoloMode: projectSettings.yoloMode ?? false,
      allowedPaths: projectSettings.jail?.allowedPaths ?? [],
    });

    const { session, modelFallbackMessage } = await createAgentSession({
      cwd: projectPath,
      sessionManager: SessionManager.continueRecent(projectPath, PILOT_SESSIONS_DIR),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      tools,
    });

    session.subscribe((event) => {
      this.forwardEventToRenderer(tabId, event);
    });

    this.sessions.set(tabId, session);
    return { session, modelFallbackMessage };
  }

  async prompt(tabId: string, text: string, images?: any[]) {
    const session = this.sessions.get(tabId);
    if (!session) throw new Error("No session for tab");

    if (session.isStreaming) {
      await session.followUp(text);
    } else {
      await session.prompt(text, images ? { images } : undefined);
    }
  }

  async steer(tabId: string, text: string) {
    const session = this.sessions.get(tabId);
    await session?.steer(text);
  }

  async abort(tabId: string) {
    const session = this.sessions.get(tabId);
    await session?.abort();
  }

  async listSessions(projectPath: string) {
    return SessionManager.list(projectPath);
  }

  async switchModel(tabId: string) {
    const session = this.sessions.get(tabId);
    return session?.cycleModel();
  }

  async cycleThinking(tabId: string) {
    const session = this.sessions.get(tabId);
    return session?.cycleThinkingLevel();
  }

  getAvailableModels() {
    return this.modelRegistry.getAvailable();
  }

  dispose(tabId: string) {
    const session = this.sessions.get(tabId);
    session?.dispose();
    this.sessions.delete(tabId);
  }

  private forwardEventToRenderer(tabId: string, event: AgentSessionEvent) {
    BrowserWindow.getAllWindows()[0]?.webContents.send(
      'agent:event', { tabId, event }
    );
  }
}
```

### Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Electron 40 | Cross-platform, filesystem access, mature ecosystem. Chromium 144 + Node.js 24.11.1. |
| UI Library | React 19 | Component model fits panel-based layout. Large ecosystem. |
| Language | TypeScript (strict) | Type safety across main/renderer processes. |
| Agent Integration | `@mariozechner/pi-coding-agent` SDK | Native TypeScript SDK in main process. Handles sessions, streaming, tools, auth, persistence. |
| State Management | Zustand | Lightweight, minimal boilerplate, good DevTools. |
| Styling | Tailwind CSS | Utility-first, fast iteration, consistent design tokens. |
| Diff Rendering | `react-diff-viewer-continued` | Battle-tested, supports side-by-side and unified views. |
| Syntax Highlighting | Shiki | VS Code's highlighter. Accurate, themeable, fast. |
| Terminal | xterm.js | Industry standard for web-based terminal emulation. |
| Session Persistence | SDK `SessionManager` (`.jsonl` files) | Handled by SDK. Stored in `<PILOT_DIR>/sessions/`. Tree-structured with branching. |
| Auth & Credentials | SDK `AuthStorage` | API keys, OAuth, env vars. Stored in `<PILOT_DIR>/auth.json`. Priority-based resolution. |
| Model Management | SDK `ModelRegistry` | Discovery, availability checking, model cycling. |
| Settings | SDK `SettingsManager` | Global + per-project merge with async persistence. |
| Code Editor (Scratch Pad) | CodeMirror 6 | Lightweight, extensible, modern architecture. |
| Git Operations | `simple-git` | Lightweight Node.js wrapper around git CLI. No native deps. |
| Git Graph | Custom canvas renderer | Commit graph lines rendered on `<canvas>` for performance. |
| Build Tool | Vite + electron-vite | Fast HMR, clean config, first-class Electron support. |
| Packaging | electron-builder | Handles code signing, auto-update, multi-platform builds. |

### Electron 40 Constraints & Breaking Changes

Pilot targets **Electron 40.0.0** (Chromium 144, Node.js 24.11.1, V8 14.4). All code must comply with the following breaking changes and constraints. Refer to `docs/electron.md` for detailed Electron API documentation and usage examples. For the latest upstream docs, see https://www.electronjs.org/docs/latest/.

#### Platform Requirements
- **macOS**: 12 (Monterey) or later required. macOS 11 (Big Sur) support was removed in Electron 38.
- **Windows**: Windows 10 or later required. Windows 7/8/8.1 support was removed in Electron 23.
- **Linux**: Native Wayland by default. `--ozone-platform` defaults to `auto` (Electron 38+). XWayland available via `--ozone-platform=x11`.
- **Node.js**: Electron 40 embeds Node.js 24.11.1. Native addons must be built against this ABI.
- **C++**: Native modules require C++20 (`--std=c++20`), not C++17.

#### Clipboard API — Deprecated in Renderer (Electron 40)
Do NOT use `clipboard` API directly in the renderer process. Use preload + `contextBridge`:

```typescript
// ❌ WRONG — deprecated in Electron 40
import { clipboard } from 'electron';
clipboard.readText();

// ✅ CORRECT — use preload + contextBridge
// preload.ts
const { contextBridge, clipboard } = require('electron');
contextBridge.exposeInMainWorld('clipboard', {
  readText: () => clipboard.readText(),
  writeText: (text: string) => clipboard.writeText(text),
});
```

#### BrowserView — Removed, Use WebContentsView
`BrowserView` is deprecated (Electron 30+). Use `WebContentsView` for any embedded web content:

```typescript
// ❌ WRONG — deprecated
const view = new BrowserView();
win.setBrowserView(view);

// ✅ CORRECT
const { WebContentsView } = require('electron');
const view = new WebContentsView();
win.contentView.addChildView(view);
```

#### Window Button Position API
`setTrafficLightPosition()` / `getTrafficLightPosition()` removed (Electron 28). Use:

```typescript
// ❌ WRONG — removed
win.setTrafficLightPosition({ x: 10, y: 10 });

// ✅ CORRECT
win.setWindowButtonPosition({ x: 10, y: 10 });
win.setWindowButtonPosition(null); // reset to default
```

#### Navigation API
Navigation methods on `webContents` are deprecated (Electron 32). Use `navigationHistory`:

```typescript
// ❌ WRONG — deprecated
win.webContents.goBack();
win.webContents.canGoForward();

// ✅ CORRECT
win.webContents.navigationHistory.goBack();
win.webContents.navigationHistory.canGoForward();
```

#### Protocol Registration
`protocol.register*Protocol` and `protocol.intercept*Protocol` are deprecated (Electron 25). Use `protocol.handle`:

```typescript
// ❌ WRONG — deprecated
protocol.registerFileProtocol('pilot', (request, callback) => {
  callback({ filePath: '/path/to/file' });
});

// ✅ CORRECT
protocol.handle('pilot', (request) => {
  return net.fetch('file:///path/to/file');
});
```

#### IPC Serialization
IPC uses Structured Clone Algorithm. Cannot send functions, DOM objects, or non-serializable types over IPC. All IPC payloads must be plain serializable objects.

#### Preload Scripts
Preload scripts can use dynamic ESM `import()` in non-context-isolated mode (new in Electron 40). However, Pilot uses context isolation (`contextIsolation: true`) by default for security, so preloads should use `contextBridge.exposeInMainWorld()`.

#### Renderer Sandbox
Renderers without `nodeIntegration: true` are sandboxed by default (Electron 20+). Pilot keeps the sandbox enabled — all Node.js access goes through the preload script and `contextBridge`.

#### Extension API Changes (Electron 36+)
`session.loadExtension`, `session.removeExtension`, etc. have moved to `session.extensions`:

```typescript
// Use session.extensions for Chrome extension management
// (Not directly relevant to Pilot, but noted for completeness)
```

#### Linux: GTK 4 Default on GNOME (Electron 36+)
GTK 4 is now the default when running GNOME. If users encounter GTK version conflicts, they can use `--gtk-version=3`.

#### `window.open` Popups Always Resizable (Electron 39)
`window.open` now always creates resizable popups per WHATWG spec. Override via `setWindowOpenHandler` if needed.

#### desktopCapturer on macOS (Electron 39+)
`NSAudioCaptureUsageDescription` must be in `Info.plist` for `desktopCapturer` to capture audio. Not directly needed for Pilot MVP but relevant for future screen-sharing features.

### IPC Communication

The renderer communicates with the main process via typed IPC channels. Agent-related channels proxy to the Pi SDK's `AgentSession` in the main process. The SDK handles streaming, queueing, and persistence — IPC just bridges the process boundary.

```typescript
// Shared types (shared/ipc.ts)
interface IPCChannels {
  // === Agent (proxied to Pi SDK AgentSession) ===
  'agent:create-session': (tabId: string, projectPath: string) => void;
  'agent:continue-session': (tabId: string, projectPath: string) => { modelFallbackMessage?: string };
  'agent:prompt': (tabId: string, text: string, images?: ImageContent[]) => void;
  'agent:steer': (tabId: string, text: string) => void;
  'agent:follow-up': (tabId: string, text: string) => void;
  'agent:abort': (tabId: string) => void;
  'agent:dispose': (tabId: string) => void;
  'agent:event': (payload: { tabId: string; event: AgentSessionEvent }) => void; // Main → Renderer

  // === Model (proxied to Pi SDK ModelRegistry) ===
  'model:get-available': () => Model[];
  'model:set': (tabId: string, provider: string, modelId: string) => void;
  'model:cycle': (tabId: string) => ModelCycleResult | undefined;
  'model:cycle-thinking': (tabId: string) => ThinkingLevel | undefined;

  // === Sessions (proxied to Pi SDK SessionManager) ===
  'session:list': (projectPath: string) => SessionInfo[];
  'session:list-all': () => SessionInfo[];
  'session:new': (tabId: string, projectPath: string) => void;
  'session:switch': (tabId: string, sessionPath: string) => void;
  'session:fork': (tabId: string, entryId: string) => { selectedText: string; cancelled: boolean };

  // === Settings (proxied to Pi SDK SettingsManager) ===
  'settings:get': (projectPath?: string) => Settings;
  'settings:update': (overrides: Partial<Settings>) => void;

  // === Auth (proxied to Pi SDK AuthStorage) ===
  'auth:get-providers': () => ProviderAuthStatus[];
  'auth:set-runtime-key': (provider: string, key: string) => void;

  // === Project (Pilot-managed) ===
  'project:set-directory': (path: string) => void;
  'project:file-tree': () => FileNode[];
  'project:read-file': (path: string) => string;

  // === Tabs (Pilot-managed) ===
  'tabs:save-state': (tabs: TabState[]) => void;
  'tabs:restore-state': () => TabState[];

  // === Git (Pilot-managed via simple-git) ===
  'git:status': () => GitStatus;
  'git:branches': () => GitBranch[];
  'git:checkout': (branch: string) => void;
  'git:create-branch': (name: string, from?: string) => void;
  'git:stage': (paths: string[]) => void;
  'git:unstage': (paths: string[]) => void;
  'git:commit': (message: string) => void;
  'git:push': (remote?: string, branch?: string) => void;
  'git:pull': (remote?: string, branch?: string) => void;
  'git:diff': (ref1?: string, ref2?: string) => FileDiff[];
  'git:log': (options?: GitLogOptions) => GitCommit[];
  'git:blame': (filePath: string) => BlameLine[];
  'git:stash-list': () => GitStash[];
  'git:stash-apply': (stashId: string) => void;

  // === Dev Commands (Pilot-managed) ===
  'dev:load-config': (projectPath: string) => DevCommand[];
  'dev:save-config': (projectPath: string, commands: DevCommand[]) => void;
  'dev:run-command': (commandId: string) => void;
  'dev:stop-command': (commandId: string) => void;
  'dev:command-output': (commandId: string, chunk: string) => void;       // Main → Renderer
  'dev:command-status': (commandId: string, state: DevCommandState) => void; // Main → Renderer

  // === Sandbox (Pilot-managed) ===
  'sandbox:get-settings': (projectPath: string) => ProjectSandboxSettings;
  'sandbox:update-settings': (projectPath: string, settings: Partial<ProjectSandboxSettings>) => void;
  'sandbox:toggle-yolo': (tabId: string) => boolean;      // Returns new state
  'sandbox:staged-diff': (tabId: string, diff: StagedDiff) => void;     // Main → Renderer
  'sandbox:accept-diff': (tabId: string, diffId: string) => void;       // Triggers real write
  'sandbox:reject-diff': (tabId: string, diffId: string) => void;
  'sandbox:accept-all': (tabId: string) => void;

  // === Extensions & Skills (Pilot-managed) ===
  'extensions:list': () => InstalledExtension[];
  'extensions:import-zip': (zipPath: string, scope: 'global' | 'project', projectPath?: string) => ImportResult;
  'extensions:toggle': (extensionId: string, enabled: boolean) => void;
  'extensions:remove': (extensionId: string) => void;
  'skills:list': () => InstalledSkill[];
  'skills:import-zip': (zipPath: string, scope: 'global' | 'project', projectPath?: string) => ImportResult;
  'skills:remove': (skillId: string) => void;
}
```

---

## Data Models

### Conversation & Messages

Conversations and messages are managed natively by the Pi SDK's `SessionManager`. Sessions are stored as `.jsonl` files with a tree structure supporting branching and forking. Pilot does not maintain a separate conversation database.

```typescript
// These types come from the SDK — listed here for reference
// import { AgentMessage, AgentSessionEvent } from "@mariozechner/pi-coding-agent"

// Pilot adds lightweight metadata on top of SDK sessions
interface SessionMetadata {
  sessionPath: string;           // Path to .jsonl file (from SDK)
  projectPath: string;           // Associated project directory
  isPinned: boolean;             // Pilot-specific
  isArchived: boolean;           // Pilot-specific
  customTitle: string | null;    // User override (SDK auto-generates from first message)
}
```

### TabState

```typescript
interface TabState {
  id: string;                    // UUID
  conversationId: string;        // Links to a Conversation
  projectPath: string | null;    // Project this tab belongs to
  projectColor: string;          // Color dot for project group
  isPinned: boolean;
  order: number;                 // Position in tab bar
  scrollPosition: number;        // Saved scroll offset
  inputDraft: string;            // Unsent message text
  panelConfig: {
    sidebarVisible: boolean;
    contextPanelVisible: boolean;
    contextPanelTab: 'files' | 'git';
  };
  lastActiveAt: Date;
  hasUnread: boolean;            // Agent finished while tab inactive
}

interface TabGroup {
  projectPath: string | null;    // null = "General" group
  projectName: string;
  color: string;                 // Auto-assigned or user-set
  isCollapsed: boolean;
  tabs: TabState[];
}
```

### Diff (Pilot UI Layer)

The SDK provides raw tool execution events including file edits. Pilot extracts these into a UI-friendly diff structure for the Accept/Reject workflow.

```typescript
interface Diff {
  id: string;
  tabId: string;
  filePath: string;
  originalContent: string;
  proposedContent: string;
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
  hunks: DiffHunk[];
  acceptedAt: Date | null;
  // Link back to SDK event that produced this diff
  sourceToolCallId: string;
}
```

### GitStatus

```typescript
interface GitStatus {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  isClean: boolean;
}

interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied';
  oldPath?: string;         // For renames
}
```

### GitBranch

```typescript
interface GitBranch {
  name: string;
  current: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitHash: string;
  lastCommitDate: Date;
  lastCommitMessage: string;
}
```

### GitCommit

```typescript
interface GitCommit {
  hash: string;
  hashShort: string;
  author: string;
  authorEmail: string;
  date: Date;
  message: string;
  parents: string[];        // Parent commit hashes (for graph rendering)
  refs: string[];           // Branch/tag names pointing to this commit
}

interface GitLogOptions {
  maxCount?: number;
  branch?: string;
  author?: string;
  since?: Date;
  until?: Date;
  filePath?: string;
  searchQuery?: string;
}
```

### BlameLine

```typescript
interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  date: Date;
  content: string;
}
```

### GitStash

```typescript
interface GitStash {
  index: number;
  message: string;
  date: Date;
  branch: string;           // Branch the stash was created on
}
```

### DevCommand

```typescript
interface DevCommand {
  id: string;
  label: string;
  command: string;
  icon: string;              // Lucide icon name
  cwd: string;               // Relative to project root
  env: Record<string, string>;
  persistent: boolean;       // Long-running (dev server) vs run-to-completion (tests)
}

interface DevCommandState {
  commandId: string;
  status: 'idle' | 'running' | 'passed' | 'failed';
  pid: number | null;
  output: string;            // Captured stdout + stderr
  exitCode: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

interface ProjectDevConfig {
  projectPath: string;
  commands: DevCommand[];
}
```

### ProjectSandboxSettings

```typescript
interface ProjectSandboxSettings {
  jail: {
    enabled: boolean;            // Default: true
    allowedPaths: string[];      // Extra paths outside project root
  };
  yoloMode: boolean;             // Default: false
}

interface StagedDiff {
  id: string;
  tabId: string;
  toolCallId: string;            // SDK tool call that produced this
  filePath: string;
  operation: 'edit' | 'create' | 'delete';
  originalContent: string | null; // null for new files
  proposedContent: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}
```

### InstalledExtension

```typescript
interface InstalledExtension {
  id: string;                    // Derived from directory name
  name: string;                  // From package.json or directory name
  description: string;
  version: string;
  scope: 'global' | 'project' | 'built-in';
  path: string;                  // Filesystem path to extension directory
  enabled: boolean;
  hasErrors: boolean;
  errorMessage?: string;
}

interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  scope: 'global' | 'project' | 'built-in';
  path: string;
  skillMdPath: string;           // Path to SKILL.md
}

interface ImportResult {
  success: boolean;
  id: string;
  name: string;
  type: 'extension' | 'skill';
  scope: 'global' | 'project';
  error?: string;
}
```

---

## MVP Scope & Phasing

### Phase 1 — Foundation (Weeks 1–2)

- [x] Electron 40 + React 19 + TypeScript project scaffolding with electron-vite. (Done)
- [x] Custom frameless window with traffic light controls. (Done)
- [x] Tab bar with project-grouped tabs, drag-to-reorder, and state persistence. (Done)
- [x] Three-panel layout shell (sidebar, chat, context panel). (Done)
- [x] Design system: tokens, typography, dark theme. (Done)
- [x] Command palette (basic implementation). (Done)

### Phase 2 — Core Chat + SDK Integration (Weeks 3–4)

- [x] Pi SDK integration layer (`PilotSessionManager`) in main process. (Done)
- [x] `AuthStorage` and `ModelRegistry` setup with onboarding flow for API keys. (Done)
- [x] Sandboxed tools layer — `pilot_edit`, `pilot_write`, `pilot_bash` wrapping SDK tools. (Done)
- [x] Project jail — block file operations outside project root (enabled by default). (Done)
- [x] `.pilot/settings.json` reader for jail and yolo mode config. (Done)
- [x] Agent chat interface with streaming via `session.subscribe()` events. (Done)
- [x] Markdown rendering with syntax-highlighted code blocks. (Done)
- [x] Message input with `Cmd+Enter` send, multiline support, and image paste. (Done)
- [x] Steering (interrupt) and follow-up queueing during streaming. (Done)
- [x] Model switcher and thinking level toggle in chat header. (Done)
- [x] Basic error handling, auto-retry display, and reconnection logic. (Done)

### Phase 3 — Code Intelligence & Git (Weeks 5–6)

- [x] Staged diff review UI — Accept / Reject / Edit workflow for sandboxed changes. (Done)
- [x] Inline diff rendering (unified + side-by-side) for staged diffs. (Done)
- [x] "Accept All" bulk action for multi-file changes. (Done)
- [x] Yolo Mode toggle (settings, command palette, keyboard shortcut, status bar indicator). (Done)
- [x] Project file tree with click-to-preview. (Done)
- [x] Drag-to-attach files as context. (Done)
- [x] Changes queue in context panel. (Done)
- [x] Git service integration (`simple-git` wrapper). (Done)
- [x] Git detection — warn per project if git not found on `$PATH`, gracefully hide git features. (Done)
- [x] Git status panel — staged, unstaged, untracked files. (Done)
- [x] Stage / unstage / discard changes from the UI. (Done)
- [x] Branch list with create / switch / delete. (Done)
- [x] Commit message input with commit and push actions. (Done)
- [x] Current branch + ahead/behind indicator in status bar. (Done)

### Phase 4 — Productivity & Git Advanced (Weeks 7–8)

- [x] Session history sidebar via `SessionManager.list()` with search. (Done)
- [x] Pin / archive sessions (Pilot metadata layer). (Done)
- [x] Session branching UI — fork and navigateTree visualization. (Done)
- [x] Integrated terminal (xterm.js). (Done — placeholder, xterm.js integration deferred)
- [x] Scratch pad. (Done)
- [x] Focus mode. (Done)
- [x] Keyboard shortcut system (all shortcuts wired). (Done)
- [x] Status bar. (Done)
- [x] Developer Mode toggle in Settings. (Done)
- [x] Command Center sidebar section with default commands (dev server, tests, lint). (Done)
- [x] Per-project `.pilot/commands.json` configuration with file watcher. (Done)
- [x] Command Editor UI for adding/editing/reordering commands. (Done)
- [x] Streaming command output with status badges. (Done)
- [x] "Ask Agent to Fix" integration for failed command output. (Done)
- [x] Git commit history log with graph visualization. (Done)
- [x] Git blame view. (Done)
- [x] Git diff against any ref (branch, tag, commit hash). (Done)
- [x] Stash management (list, apply, pop, drop). (Done)
- [x] Agent-git integration — auto-generated commit messages for agent changes. (Done)
- [x] Merge conflict resolution UI with agent assistance. (Done)
- [x] Extension & skill zip import (drag-and-drop + settings UI). (Done)
- [x] Extension Manager panel (list, toggle, remove installed extensions). (Done)
- [x] Skill Manager panel (list, remove installed skills). (Done)
- [x] Config directory initialization and cross-platform path handling. (Done)

---

## Post-MVP Roadmap

| Feature | Description | Priority |
|---|---|---|
| **Auto-update** | Seamless OTA updates via electron-updater. | High |
| **Light Theme** | Full light mode with proper token overrides. | High |
| **Extension Marketplace** | Browse and install extensions/skills from a community registry (beyond zip import). | Medium |
| **Multi-Agent** | Support for multiple AI agent backends (not just Pi). | Medium |
| **Git Interactive Rebase** | Visual interactive rebase editor within the app. | Medium |
| **Git Submodule Support** | Manage and navigate submodules from the git panel. | Low |
| **Collaborative Sessions** | Share a session link for pair-programming with AI. | Low |
| **Voice Input** | Local AI speech-to-text for hands-free prompting. Requires on-device STT models (e.g., Whisper.cpp, MLX Whisper on Apple Silicon, or ONNX runtime). Feature is only enabled when a compatible local model is detected. Supports real-time streaming transcription, code-aware vocabulary (recognizes programming terms, symbols, and dictation commands like "new line", "open bracket"), and a push-to-talk or voice-activity-detection trigger. Gracefully hidden from the UI on systems without local STT capability. Cloud transcription (e.g., Deepgram, AssemblyAI) available as an opt-in setting for users who prefer it — disabled by default, clearly labeled in Settings with a privacy notice explaining that audio will be sent to a third-party service. | Low |
| **Custom Themes** | User-created themes with a theme editor. | Low |

---

## Non-Functional Requirements

| Requirement | Specification |
|---|---|
| **Compatibility** | Electron 40 (Chromium 144, Node.js 24.11.1). macOS 12+, Windows 10+, Linux (Wayland-native, X11 fallback). |
| **Performance** | App cold start < 3s. Chat input latency < 50ms. Smooth 60fps scrolling. |
| **Memory** | Idle memory usage < 200MB. Active session < 500MB. |
| **Storage** | SDK session files (`.jsonl`) should handle 10,000+ sessions without degradation in listing/search. |
| **Security** | API keys managed by SDK `AuthStorage` (supports `auth.json`, env vars, runtime overrides). OS keychain via `keytar` as supplementary fallback. All agent communication over TLS. Project jail enabled by default — agent cannot read/write outside project root. |
| **Accessibility** | Full keyboard navigation. Screen reader compatible. Respects OS reduced motion settings. |
| **Offline** | App launches and shows history offline. Agent features gracefully degrade with a clear "offline" indicator. |
| **Updates** | Auto-update with rollback support. User can defer updates. |

---

## File Structure

```
pilot/
├── electron/
│   ├── main.ts                  # Main process entry
│   ├── preload.ts               # Preload scripts
│   ├── ipc/                     # IPC handlers
│   │   ├── agent.ts             # Proxies to PilotSessionManager
│   │   ├── auth.ts              # Proxies to SDK AuthStorage
│   │   ├── dev-commands.ts
│   │   ├── extensions.ts        # Extension & skill import/management
│   │   ├── git.ts
│   │   ├── model.ts             # Proxies to SDK ModelRegistry
│   │   ├── project.ts
│   │   ├── sandbox.ts           # Staged diffs, jail settings, yolo toggle
│   │   ├── session.ts           # Proxies to SDK SessionManager
│   │   ├── settings.ts          # Proxies to SDK SettingsManager
│   │   └── terminal.ts
│   ├── services/
│   │   ├── pi-session-manager.ts # SDK integration layer (see architecture)
│   │   ├── sandboxed-tools.ts   # Custom tools wrapping SDK edit/write/bash
│   │   ├── staged-diffs.ts      # In-memory diff staging and accept/reject
│   │   ├── extension-manager.ts # Zip import, validation, registry
│   │   ├── project-settings.ts  # .pilot/settings.json reader
│   │   ├── dev-commands.ts      # Process spawning and .pilot/commands.json
│   │   ├── file-watcher.ts      # FS watcher for project
│   │   ├── git-service.ts       # Git operations via simple-git
│   │   ├── session-metadata.ts  # Pilot-specific metadata (pins, archives)
│   │   └── keychain.ts          # Fallback secure storage (supplements SDK AuthStorage)
│   └── utils/
├── src/
│   ├── app.tsx                  # React app entry
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatView.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   └── StreamingText.tsx
│   │   ├── diff/
│   │   │   ├── DiffViewer.tsx
│   │   │   ├── DiffHunk.tsx
│   │   │   └── DiffActions.tsx
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── SessionList.tsx
│   │   │   └── SessionItem.tsx
│   │   ├── context/
│   │   │   ├── ContextPanel.tsx
│   │   │   ├── FileTree.tsx
│   │   │   ├── FilePreview.tsx
│   │   │   └── ChangesQueue.tsx
│   │   ├── git/
│   │   │   ├── GitPanel.tsx         # Main git panel container
│   │   │   ├── GitStatus.tsx        # Staged/unstaged/untracked files
│   │   │   ├── GitBranches.tsx      # Branch list and management
│   │   │   ├── GitDiffView.tsx      # File diff viewer
│   │   │   ├── GitCommitLog.tsx     # Commit history with graph
│   │   │   ├── GitCommitGraph.tsx   # Canvas-based branch graph
│   │   │   ├── GitCommitInput.tsx   # Commit message + actions
│   │   │   ├── GitBlame.tsx         # Blame annotations overlay
│   │   │   ├── GitStash.tsx         # Stash management
│   │   │   └── GitConflict.tsx      # Merge conflict resolution UI
│   │   ├── command-center/
│   │   │   ├── CommandCenter.tsx    # Sidebar command center container
│   │   │   ├── CommandButton.tsx    # Individual command with status
│   │   │   ├── CommandOutput.tsx    # Streaming output panel
│   │   │   └── CommandEditor.tsx    # UI for editing .pilot/commands.json
│   │   ├── sandbox/
│   │   │   ├── StagedDiffQueue.tsx  # List of pending diffs in context panel
│   │   │   ├── StagedDiffItem.tsx   # Individual staged diff with accept/reject
│   │   │   ├── YoloIndicator.tsx    # Status bar yolo mode indicator
│   │   │   └── JailIndicator.tsx    # Status bar jail indicator
│   │   ├── extensions/
│   │   │   ├── ExtensionManager.tsx # Settings panel for extensions
│   │   │   ├── SkillManager.tsx     # Settings panel for skills
│   │   │   ├── ExtensionItem.tsx    # Individual extension row
│   │   │   └── ZipImporter.tsx      # Drag-and-drop zip import UI
│   │   ├── terminal/
│   │   │   └── Terminal.tsx
│   │   ├── command-palette/
│   │   │   └── CommandPalette.tsx
│   │   ├── scratch-pad/
│   │   │   └── ScratchPad.tsx
│   │   ├── status-bar/
│   │   │   └── StatusBar.tsx
│   │   ├── shared/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Tooltip.tsx
│   │       └── Icon.tsx
│   │   ├── tab-bar/
│   │   │   ├── TabBar.tsx           # Tab bar container
│   │   │   ├── Tab.tsx              # Individual tab component
│   │   │   ├── TabGroup.tsx         # Project group wrapper
│   │   │   └── TabGroupHeader.tsx   # Project group label + actions
│   ├── stores/
│   │   ├── chat-store.ts
│   │   ├── dev-command-store.ts
│   │   ├── extension-store.ts
│   │   ├── git-store.ts
│   │   ├── project-store.ts
│   │   ├── sandbox-store.ts
│   │   ├── session-store.ts
│   │   ├── tab-store.ts
│   │   └── ui-store.ts
│   ├── hooks/
│   │   ├── useKeyboardShortcut.ts
│   │   ├── useAgentSession.ts   # Subscribes to SDK events via IPC
│   │   ├── useGit.ts
│   │   ├── useModel.ts          # Model switching and thinking level
│   │   └── useSession.ts
│   ├── styles/
│   │   └── globals.css
│   └── lib/
│       ├── ipc-client.ts        # Typed IPC calls from renderer
│       └── utils.ts
├── shared/
│   ├── types.ts                 # Pilot-specific types (TabState, GitStatus, etc.)
│   └── ipc.ts                   # IPC channel definitions (references SDK types)
├── resources/
│   ├── icon.icns                # macOS icon
│   ├── icon.ico                 # Windows icon
│   └── icon.png                 # Linux icon
├── electron-vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .pilot/                      # Per-project Pilot config (user decides to gitignore or not)
│   ├── commands.json            # Developer mode command definitions
│   ├── settings.json            # Jail, yolo mode, project-specific settings
│   ├── extensions/              # Project-scoped extensions
│   └── skills/                  # Project-scoped skills
└── README.md
```

### Pilot Home Directory

> **Platform-specific locations:**
> - **macOS:** `~/.config/.pilot/`
> - **Windows:** `%APPDATA%\.pilot\`
> - **Linux:** `$XDG_CONFIG_HOME/.pilot/` (default: `~/.config/.pilot/`)

```
<PILOT_DIR>/
├── config.json                  # App-level settings (window size, theme, developer mode toggle)
├── auth.json                    # API keys and OAuth tokens (via SDK AuthStorage)
├── models.json                  # Custom model definitions (via SDK ModelRegistry)
├── sessions/                    # All session .jsonl files (via SDK SessionManager)
│   └── <project-hash>/         # Grouped by project
├── metadata.json                # Session pins, archives, custom titles
├── extensions/                  # Global extensions
│   └── <extension-name>/
├── skills/                      # Global skills
│   └── <skill-name>/
└── extension-registry.json      # Tracks installed extensions, versions, enabled state
```