# Memory

Pilot's memory system gives the agent persistent context that survives across sessions. It automatically learns from conversations and can be managed manually through chat commands or the settings UI.

---

## Two-Tier Storage

Memory is stored as Markdown files at two scopes:

> **Config directory** is platform-dependent: `~/.config/.pilot/` (macOS/Linux), `%APPDATA%\.pilot\` (Windows). Paths below use `<PILOT_DIR>` as shorthand.

| Scope | Location | Git-tracked | Purpose |
|-------|----------|-------------|---------|
| **Global** | `<PILOT_DIR>/MEMORY.md` | No | Preferences that apply everywhere (style, tools, conventions) |
| **Project** | `<project>/.pilot/MEMORY.md` | Yes | Project-specific context to share with the team |

### Memory File Format

Each file is plain Markdown with categories as headings:

```markdown
# Memory

## User Preferences
- Prefers TypeScript strict mode
- Uses pnpm, never npm
- Wants concise responses

## Technical Context
- API uses REST with JSON:API spec
- Auth is JWT-based with refresh tokens

## Decisions
- Chose Zustand over Redux for state management
- Using Tailwind CSS, no CSS modules

## Project Notes
- Deploys to Vercel via GitHub Actions
- Main branch is `main`, feature branches use `feat/` prefix
```

---

## How Memory Gets Injected

At session creation, both files are loaded, merged, and appended to the system prompt wrapped in `<memory>` tags:

```xml
<memory>
The following are memories from past interactions. Use these to inform your responses.
Do not mention these memories explicitly unless the user asks about them.

## Global Memory
- Prefers TypeScript strict mode
- Uses pnpm, never npm

## Project Memory
- API uses REST with JSON:API spec
- Working on the auth refactor this sprint
</memory>
```

If the combined memory exceeds **50 KB**, oldest entries (first bullet points) are trimmed until it fits.

---

## Auto-Extraction

When enabled, Pilot automatically extracts memories from conversations in the background.

### How It Works

1. Agent finishes responding to a user message
2. Debounce check — at least **30 seconds** must pass since the last extraction
3. Builds an extraction prompt containing the latest exchange and existing memories
4. Calls the **cheapest available model** (prefers haiku, gpt-4o-mini, or flash) with a **10-second timeout**
5. Parses the JSON response for new memories
6. Appends each memory to the appropriate file under its category
7. Emits a `MEMORY_UPDATED` event to show the 🧠✨ pulse in the status bar

### What Gets Extracted

The extraction prompt targets five types of information:

- **User preferences** — coding style, tools, frameworks, communication preferences
- **Technical decisions** — architecture choices, library selections, patterns adopted
- **Project facts** — deployment targets, API conventions, team practices
- **Corrections** — when the user corrects the agent, remember the right way
- **Explicit requests** — "always do X", "never do Y", "I prefer Z"

### What Gets Skipped

- One-time task details ("fix the bug on line 42")
- Information already in existing memories (duplicate check)
- Obvious facts ("user is writing code")

### Scope Assignment

Auto-extracted memories are saved as either `global` or `project` scope based on the extraction model's judgment. Manual `# remember` commands use keyword heuristics — phrases like "always", "never", "I prefer", "my style", or "all projects" route to global; everything else goes to project.

### Toggle

Auto-extraction can be toggled on/off in the Memory sidebar pane via the "Auto-extract" switch. Enabled by default.

---

## Manual Commands

### From Chat Input

| Command | Effect |
|---------|--------|
| `# remember <text>` | Saves `<text>` as a memory |
| `# forget <text>` | Fuzzy-matches and removes the first matching memory across all scopes |
| `# memory` or `/memory` | Opens the memory settings panel |

The chat input shows a hint banner (💾) when it detects a `#` or `/memory` prefix.

### Scope Inference for `# remember`

The `# remember` command infers scope from keywords in the text:

- Contains "always", "never", "I prefer", "I like", "my style", or "all projects" → **global**
- Everything else → **project**

### Forget Behavior

`# forget <text>` does a case-insensitive substring search across both memory files (global and project) and removes the first matching bullet point.

---

## Memory Settings Panel

Accessible via the Memory pane in the sidebar, the `/memory` slash command, or clicking the 🧠 indicator in the status bar.

### Features

- **Two-tab editor** — switch between Global and Project scopes
- **Monospace text area** — edit the raw Markdown directly
- **Save** — writes changes to disk
- **Clear** — resets the file to `# Memory\n`
- **Reload** — re-reads from disk (discards unsaved edits)
- **Auto-extract toggle** — enable/disable background extraction
- **Open in Tab** — open the memory file in the editor

### Scope Descriptions (shown in UI)

| Tab | Description |
|-----|-------------|
| Global | Applies to all projects and sessions (`<PILOT_DIR>/MEMORY.md`) |
| Project | Shared project memory, can be checked into git (`.pilot/MEMORY.md`) |

---

## Status Bar Indicator

The `MemoryIndicator` component renders in the status bar:

- **🧠 N** — shows total memory count (global + project)
- **🧠✨** — pulses for 3 seconds after auto-extraction saves new memories
- **Click** — opens the memory settings panel
- **Tooltip** — shows breakdown: "12 memories (5 global, 7 project)"

---

## Architecture

### Data Flow

```
Chat Input (# remember / # forget / /memory)
    ↕ IPC: MEMORY_HANDLE_COMMAND
Main Process (MemoryManager)
    ↕ fs read/write
Markdown files (2 scopes)
```

```
Agent Response (after completion)
    → PiSessionManager.extractMemoriesInBackground()
    → MemoryManager.buildExtractionPrompt()
    → Cheap model API call (haiku / gpt-4o-mini / flash)
    → MemoryManager.processExtractionResult()
    → IPC: MEMORY_UPDATED → Renderer (🧠✨ pulse)
```

```
Memory Pane (Sidebar / Settings)
    ↕ IPC: MEMORY_GET_FILES / MEMORY_SAVE_FILE / MEMORY_CLEAR
Main Process (MemoryManager)
    ↕ fs read/write
Markdown files
```

### Key Files

| File | Role |
|------|------|
| `electron/services/memory-manager.ts` | Core logic — extraction, storage, context injection |
| `electron/ipc/memory.ts` | IPC handlers (8 channels) |
| `electron/services/pi-session-manager.ts` | Integration — injects memory at session start, triggers extraction |
| `src/stores/memory-store.ts` | Zustand store for React state |
| `src/components/memory/MemoryPanel.tsx` | Settings UI (editor, tabs, auto-extract toggle) |
| `src/components/sidebar/SidebarMemoryPane.tsx` | Sidebar memory pane |
| `src/components/chat/MessageInput.tsx` | Detects `# remember` / `# forget` commands, shows hint banner |
| `shared/ipc.ts` | IPC channel constants |
| `shared/types.ts` | `MemoryFiles`, `MemoryCommandResult` interfaces |

### IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `MEMORY_GET` | renderer → main | Load merged memory context (with `<memory>` tags) |
| `MEMORY_GET_FILES` | renderer → main | Load raw files for the editor |
| `MEMORY_SAVE_FILE` | renderer → main | Write a memory file by scope |
| `MEMORY_CLEAR` | renderer → main | Reset a file to empty |
| `MEMORY_GET_COUNT` | renderer → main | Get bullet-point counts per scope |
| `MEMORY_HANDLE_COMMAND` | renderer → main | Process `# remember` / `# forget` / `/memory` |
| `MEMORY_GET_PATHS` | renderer → main | Get resolved file paths for each scope |
| `MEMORY_SET_ENABLED` | renderer → main | Enable/disable memory system |
| `MEMORY_UPDATED` | main → renderer | Notify UI after auto-extraction |
| `MEMORY_SHOW_PANEL` | main → renderer | Open the memory settings panel |

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_MEMORY_INJECT_SIZE` | 50 KB | Max combined memory injected into system prompt |
| `EXTRACTION_DEBOUNCE_MS` | 30,000 ms | Minimum interval between auto-extractions |
| Extraction timeout | 10,000 ms | API call timeout for extraction model |
| Extraction `max_tokens` | 500 | Max response tokens for extraction |
| Notification auto-clear | 3,000 ms | How long the 🧠✨ pulse shows |

---

## Tips

- **Team conventions** go in project memory (`.pilot/MEMORY.md`) — commit it to git
- **Personal preferences** go in global memory — they follow you across all projects
- **Review regularly** — open the memory panel and prune stale entries
- Auto-extraction is cheap (uses haiku-class models with 500 max tokens) but can be turned off if you prefer full manual control
