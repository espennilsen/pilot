# Pilot Main Process Services Reference

Complete reference documentation for all services in `electron/services/`. Each service runs in the Electron main process and provides core functionality to the application.

> **Config directory** is platform-dependent: `~/.config/.pilot/` (macOS/Linux), `%APPDATA%\.pilot\` (Windows). Paths below use `<PILOT_DIR>` as shorthand.

---

## Service Overview

| Service | File | Primary Responsibility |
|---------|------|----------------------|
| **PilotSessionManager** | `pi-session-manager.ts` | Manages Pi SDK agent sessions per tab |
| **SandboxedTools** | `sandboxed-tools.ts` | Wraps SDK file tools with diff staging and jail enforcement |
| **StagedDiffManager** | `staged-diffs.ts` | In-memory store of pending file diffs awaiting user approval |
| **GitService** | `git-service.ts` | Git operations via simple-git (status, branches, commits, etc.) |
| **MemoryManager** | `memory-manager.ts` | Two-tier memory system (global/project) |
| **DevCommandsService** | `dev-commands.ts` | Spawns and manages dev command child processes (npm run dev, etc.) |
| **TerminalService** | `terminal-service.ts` | PTY management via node-pty for integrated terminals |
| **ExtensionManager** | `extension-manager.ts` | Lists, enables/disables, imports, and removes extensions and skills |
| **WorkspaceStateService** | `workspace-state.ts` | Persists and restores tab layout + UI state |
| **SessionMetadata** | `session-metadata.ts` | Persists per-session metadata (isPinned, isArchived) |
| **TaskManager** | `task-manager.ts` | Kanban-style task board with dependencies, epics, and agent integration |
| **SubagentManager** | `subagent-manager.ts` | Parallel subagent orchestration with file conflict detection |
| **CompanionServer** | `companion-server.ts` | HTTPS + WebSocket server for remote companion apps |
| **CompanionAuth** | `companion-auth.ts` | PIN/QR pairing and session token management for companions |
| **CompanionDiscovery** | `companion-discovery.ts` | mDNS/Bonjour service advertisement for LAN discovery |
| **CompanionIPCBridge** | `companion-ipc-bridge.ts` | Maps WebSocket messages to IPC handlers for companion apps |
| **CompanionTLS** | `companion-tls.ts` | Self-signed TLS certificate generation with dynamic SAN |
| **AppSettings** | `app-settings.ts` | App-level settings (terminal app, editor CLI, developer mode, etc.) |
| **PilotPaths** | `pilot-paths.ts` | Centralized path resolution for all config files |
| **ProjectSettings** | `project-settings.ts` | Per-project sandbox settings (jail, yolo mode, allowed paths) |

---

## Core Session Management

### PilotSessionManager

**File:** `electron/services/pi-session-manager.ts`

**Responsibility:**  
Owns one Pi SDK `AgentSession` per tab. Creates, continues, and disposes sessions. Forwards all agent events (streaming, tool calls, turns) to the renderer. Manages model cycling, thinking level, and memory extraction.

**Constructor:**
```typescript
constructor()
```
No parameters. Initializes auth storage, model registry, staged diffs, memory manager, task manager, and subagent manager.

**Key Properties:**
- `stagedDiffs: StagedDiffManager` — Shared diff staging for all tabs
- `memoryManager: MemoryManager` — Two-tier memory system (global + project)
- `taskManager: TaskManager` — Task board integration
- `subagentManager: SubagentManager` — Parallel subagent orchestration

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `createSession` | `(tabId: string, projectPath: string) => Promise<void>` | Create a new session for a tab, continuing most recent session in project |
| `openSession` | `(tabId: string, sessionPath: string, projectPath: string) => Promise<void>` | Open a specific session file in a tab |
| `prompt` | `(tabId: string, text: string, images?: ImageContent[]) => Promise<void>` | Send a user message to the agent. Auto-queues memory extraction. |
| `steer` | `(tabId: string, text: string) => Promise<void>` | Send a steering message while agent is streaming |
| `abort` | `(tabId: string) => Promise<void>` | Abort the currently running agent turn |
| `cycleModel` | `(tabId: string) => Promise<void>` | Cycle to the next available model |
| `cycleThinkingLevel` | `(tabId: string) => Promise<void>` | Cycle through thinking levels (off/low/high) |
| `fork` | `(tabId: string, entryId: string) => Promise<void>` | Fork the session at a specific entry point |
| `getSession` | `(tabId: string) => AgentSession \| undefined` | Get the raw SDK session object for a tab |
| `getSlashCommands` | `(tabId: string) => Array<{name, description, source}>` | Get all available slash commands (templates, skills, extensions, built-ins) |
| `getSessionPath` | `(tabId: string) => string \| undefined` | Get the file path of the session file |
| `getSessionHistory` | `(tabId: string) => Array<{role, content, timestamp, thinkingContent?}>` | Get displayable chat history from a session |
| `listSessions` | `(projectPath: string) => Promise<SessionMetadata[]>` | List all sessions for a specific project |
| `listAllSessions` | `(projectPaths?: string[]) => Promise<SessionMetadata[]>` | List all sessions across known projects |
| `handlePossibleMemoryCommand` | `(tabId: string, message: string, projectPath: string) => Promise<MemoryCommandResult \| null>` | Handle `#remember` or `/memory` commands |
| `handlePossibleTaskCommand` | `(tabId: string, message: string, projectPath: string) => TaskCommandResult \| null` | Handle `/tasks`, `/tasks ready`, `/tasks create` commands |
| `dispose` | `(tabId: string) => void` | Dispose a session and clean up resources |
| `disposeAll` | `() => void` | Dispose all sessions |
| `getAuthStorage` | `() => AuthStorage` | Get the SDK auth storage instance |
| `getModelRegistry` | `() => ModelRegistry` | Get the SDK model registry instance |

**Key Implementation Notes:**
- Session directory encoding uses `+` as path separator (replaces legacy `-` encoding that broke hyphenated project names)
- Memory extraction runs automatically after agent responses using a cheap model (haiku/mini)
- Memory extraction is debounced (30s) and never blocks the main conversation
- Task integration injects task summary into system prompt when tasks are enabled
- Subagent cleanup is handled automatically when disposing tabs
- All events are forwarded to both BrowserWindow and companion clients

---

## Sandboxed Tools & Diff Staging

### SandboxedTools

**File:** `electron/services/sandboxed-tools.ts`

**Responsibility:**  
Wraps SDK file tools (`edit`, `write`, `bash`) to intercept write operations. Stages diffs for user review instead of applying them immediately. Enforces project jail (path validation). Handles bash command approval flow.

**Key Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `createSandboxedTools` | `(cwd: string, options: SandboxOptions) => {tools, readOnlyTools}` | Creates wrapped tool definitions for edit/write/bash + read-only tools |
| `resolveBashApproval` | `(diffId: string, approved: boolean) => void` | Resolve a pending bash approval (called when user accepts/rejects) |

**SandboxOptions Interface:**
```typescript
interface SandboxOptions {
  jailEnabled: boolean;
  yoloMode: boolean;
  allowedPaths: string[];
  onStagedDiff: (diff: StagedDiff) => void;
  tabId: string;
}
```

**Key Implementation Notes:**
- Edit/write diffs are staged immediately with unified diff computed via `structuredPatch` from `diff` package
- Bash commands stage a pending approval request and block until user accepts/rejects
- Yolo mode bypasses all staging and executes tools immediately
- Jail enforcement uses `relative()` + `isAbsolute()` to detect path escapes
- Bash jail enforcement uses `findEscapingPaths()` — extracts path-like tokens from bash commands using regex, expands environment variables (`$HOME`, `$TMPDIR`, `~`), and checks each against `isWithinProject()` + system path allowlist. Blocks commands referencing paths outside the project when jail is enabled.
- Read-only tools (`read`, `grep`, `find`, `ls`) pass through unchanged
- Handles `~` expansion for allowed paths
- Generates unified diffs with 3 lines of context

---

### StagedDiffManager

**File:** `electron/services/staged-diffs.ts`

**Responsibility:**  
In-memory store of pending file diffs per tab. Each diff tracks operation type (create/edit/bash), original content, proposed content, status (pending/accepted/rejected), and timestamps.

**Constructor:**
```typescript
constructor()
```
No parameters. Initializes empty diff store.

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `addDiff` | `(diff: StagedDiff) => void` | Add a new diff to the store |
| `getDiffs` | `(tabId: string) => StagedDiff[]` | Get all diffs for a tab |
| `getDiff` | `(tabId: string, diffId: string) => StagedDiff \| undefined` | Get a specific diff by ID |
| `updateStatus` | `(tabId: string, diffId: string, status: 'pending'\|'accepted'\|'rejected') => void` | Update diff status |
| `getPending` | `(tabId: string) => StagedDiff[]` | Get all pending diffs for a tab |
| `clearTab` | `(tabId: string) => void` | Clear all diffs for a tab |
| `clearAll` | `() => void` | Clear all diffs across all tabs |

**StagedDiff Type:**
```typescript
interface StagedDiff {
  id: string;                    // UUID
  tabId: string;                 // Parent tab
  toolCallId: string;            // Agent tool call ID
  filePath: string;              // Absolute path to file
  operation: 'create' | 'edit' | 'bash';
  originalContent: string | null; // null for create
  proposedContent: string;       // For bash: the command string
  unifiedDiff?: string;          // Unified diff output (edit/write only)
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;             // Unix timestamp
}
```

**Key Implementation Notes:**
- All state is in-memory — no persistence
- Diffs are keyed by tabId → each tab has an independent queue
- Status updates are in-place mutations (safe since no renderer references)
- Bash diffs use `filePath` to store the command string
- Unified diffs are pre-computed by `SandboxedTools` during staging

---

## Version Control

### GitService

**File:** `electron/services/git-service.ts`

**Responsibility:**  
Thin wrapper around `simple-git`. One instance per project path. Provides high-level git operations (status, branches, log, blame, staging, commits, push/pull, stashes).

**Constructor:**
```typescript
constructor(cwd: string)
```
Creates a `simple-git` instance rooted at `cwd`.

**Static Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `isGitAvailable` | `() => boolean` | Check if `git` is available on PATH |

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `isRepo` | `() => Promise<boolean>` | Check if cwd is a git repository |
| `initRepo` | `() => Promise<void>` | Initialize a new git repository |
| `getStatus` | `() => Promise<GitStatus>` | Get working tree status (staged, unstaged, untracked, branch, upstream) |
| `getBranches` | `() => Promise<GitBranch[]>` | List all branches with commit info, upstream tracking, and ahead/behind counts |
| `checkout` | `(branch: string) => Promise<void>` | Check out a branch |
| `createBranch` | `(name: string, from?: string) => Promise<void>` | Create a new branch |
| `stage` | `(paths: string[]) => Promise<void>` | Stage files for commit |
| `unstage` | `(paths: string[]) => Promise<void>` | Unstage files |
| `commit` | `(message: string) => Promise<void>` | Commit staged changes |
| `push` | `(remote?: string, branch?: string) => Promise<void>` | Push to remote (defaults to current branch) |
| `pull` | `(remote?: string, branch?: string) => Promise<void>` | Pull from remote |
| `getDiff` | `(ref1?: string, ref2?: string) => Promise<string>` | Get diff as text (working tree if no refs) |
| `getLog` | `(options?: GitLogOptions) => Promise<GitCommit[]>` | Get commit history with optional filters |
| `getBlame` | `(filePath: string) => Promise<BlameLine[]>` | Get blame info for a file (parsed from porcelain format) |
| `getStashList` | `() => Promise<GitStash[]>` | List all stashes |
| `stashApply` | `(stashId: string) => Promise<void>` | Apply a stash |

**Key Types:**
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

interface GitBranch {
  name: string;
  current: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitHash: string;
  lastCommitDate: number;
  lastCommitMessage: string;
}

interface GitCommit {
  hash: string;
  hashShort: string;
  author: string;
  authorEmail: string;
  date: number;
  message: string;
  parents: string[];
  refs: string[];
}

interface BlameLine {
  lineNumber: number;
  commitHash: string;
  author: string;
  date: number;
  content: string;
}
```

**Key Implementation Notes:**
- Branches are sorted by commit date (most recent first)
- Blame parsing uses `--porcelain` format for reliability
- Upstream tracking and ahead/behind counts require separate git calls per branch
- File change status inference uses multiple `StatusResult` arrays (created, deleted, renamed)
- All methods throw on git errors — caller should catch

---

## Memory System

### MemoryManager

**File:** `electron/services/memory-manager.ts`

**Responsibility:**  
Manages two-tier Markdown memory files (global, project). Builds system prompt injection from both tiers. Auto-extracts memories from conversations using a cheap model. Handles manual `#remember` and `/memory` commands.

**Constructor:**
```typescript
constructor()
```
No parameters. Uses hardcoded Pilot app directory paths.

**Key Properties:**
- `enabled: boolean` — Read-only flag (controlled via `setEnabled()`)

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `setEnabled` | `(enabled: boolean) => void` | Enable/disable memory system |
| `getMemoryContext` | `(projectPath: string) => Promise<string>` | Load and merge both memory tiers into a single context string for system prompt injection |
| `getMemoryFiles` | `(projectPath: string) => Promise<MemoryFiles>` | Get raw memory file contents for UI editor |
| `saveMemoryFile` | `(scope: 'global'\|'project', projectPath: string, content: string) => Promise<void>` | Save a memory file |
| `clearMemoryFile` | `(scope: 'global'\|'project', projectPath: string) => Promise<void>` | Clear a memory file (reset to empty) |
| `handleManualMemory` | `(message: string, projectPath: string) => Promise<{action, text}>` | Handle `#remember X` or `#forget X` or `/memory` commands |
| `buildExtractionPrompt` | `(userMessage: string, agentResponse: string, existingMemories: string) => string` | Build the prompt for auto-extraction (sent to cheap model) |
| `shouldSkipExtraction` | `() => boolean` | Check if extraction should be skipped (debounce check) |
| `markExtractionRun` | `() => void` | Mark extraction as having just run (for debounce) |
| `processExtractionResult` | `(resultJson: string, projectPath: string) => Promise<MemoryExtractionResult>` | Parse and save extracted memories from model response |
| `appendMemory` | `(text: string, scope: 'global'\|'project', projectPath: string, category?: string) => Promise<void>` | Append a memory entry (manual or extracted) |
| `removeMemory` | `(text: string, projectPath: string) => Promise<boolean>` | Remove a memory by fuzzy text match |
| `getMemoryCount` | `(projectPath: string) => Promise<{global, project, total}>` | Count memory entries across both files |
| `getMemoryPaths` | `(projectPath: string) => {global, project}` | Get file paths for both memory tiers |

**Memory File Paths:**
- **Global:** `<PILOT_DIR>/MEMORY.md`
- **Project:** `<project>/.pilot/MEMORY.md` (can be git-tracked)

**Key Implementation Notes:**
- Memory context is truncated to 50KB max before injection (keeps most recent entries)
- Extraction is debounced (30s) and runs in background (never blocks)
- Extraction uses cheapest available model (haiku/mini/flash) with 10s timeout
- Scope inference looks for keywords: "always", "never", "I prefer" → global
- Memory files use Markdown with `## Category` headings and bullet lists
- Duplicate detection checks if text already exists before appending
- Memory count badge in UI is computed by counting bullet points (`- ` prefix)

---

## Dev Commands & Terminals

### DevCommandsService

**File:** `electron/services/dev-commands.ts`

**Responsibility:**  
Spawns and kills child processes for dev commands (npm run dev, npm test, etc.). Streams stdout/stderr to renderer. Detects server URLs in output. Manages command buttons configuration per project.

**Constructor:**
```typescript
constructor()
```
No parameters. Requires `setProject()` call before use.

**Key Properties:**
- `onServerUrlDetected: (commandId: string, url: string) => void | null` — Callback when URL detected
- `onCommandStopped: (commandId: string) => void | null` — Callback when command stops (for tunnel cleanup)

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `setProject` | `(projectPath: string) => void` | Set the current project path and start file watcher on `.pilot/commands.json` |
| `loadConfig` | `() => DevCommand[]` | Load command buttons config from `.pilot/commands.json` or use defaults |
| `saveConfig` | `(commands: DevCommand[]) => void` | Save command buttons config to `.pilot/commands.json` |
| `runCommand` | `(commandId: string) => DevCommandState` | Spawn a command and start streaming output. Kills existing process if already running. |
| `stopCommand` | `(commandId: string) => void` | Stop a running command |
| `getState` | `(commandId: string) => DevCommandState` | Get current state of a command (status, output, PID, detected URL) |
| `dispose` | `() => void` | Stop all commands and clean up file watchers |

**Default Commands:**
```typescript
[
  { id: 'dev-server', label: 'Start Dev Server', command: 'npm run dev', icon: 'Play', cwd: './', env: {}, persistent: true },
  { id: 'test', label: 'Run Tests', command: 'npm test', icon: 'TestTube', cwd: './', env: {}, persistent: false },
  { id: 'lint', label: 'Lint', command: 'npx eslint .', icon: 'Search', cwd: './', env: {}, persistent: false },
]
```

**URL Detection Regex:**
```javascript
/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\/?/
```
Matches common dev server output from Vite, Next.js, CRA, Angular, Nuxt, Express, etc.

**Key Implementation Notes:**
- Commands spawn with `shell: true` for npm/npx/pipe support
- Output streaming is real-time via `proc.stdout.on('data')` and `proc.stderr.on('data')`
- URL detection normalizes `0.0.0.0` and `127.0.0.1` to `localhost`
- First detected URL is stored in state, subsequent URLs are ignored
- File watcher auto-reloads config when `.pilot/commands.json` changes
- Lint command is auto-disabled if eslint is not installed (checks node_modules and PATH)
- All events are forwarded to both BrowserWindow and companion clients

---

### TerminalService

**File:** `electron/services/terminal-service.ts`

**Responsibility:**  
PTY (pseudo-terminal) management via `node-pty`. Creates, disposes, and manages I/O for integrated terminals per tab. Streams terminal data to renderer.

**Constructor:**
```typescript
constructor(mainWindow: BrowserWindow)
```
Requires main window reference to send IPC events.

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `(id: string, cwd: string, shell?: string) => void` | Create a new terminal instance. Auto-disposes existing terminal with same ID. |
| `write` | `(id: string, data: string) => void` | Write data to terminal (user input) |
| `resize` | `(id: string, cols: number, rows: number) => void` | Resize terminal PTY |
| `close` | `(id: string) => void` | Kill PTY and dispose terminal |
| `disposeAll` | `() => void` | Dispose all terminals |

**Default Shell Resolution:**
- **Windows:** `powershell.exe`
- **macOS/Linux:** `$SHELL` environment variable or `/bin/zsh`

**Key Implementation Notes:**
- PTY output is forwarded via `IPC.TERMINAL_OUTPUT` with `{ id, data }` payload
- Terminal exit events send exit code and signal via `IPC.TERMINAL_EXITED`
- `~` expansion is handled for cwd (converts `~/` to home directory)
- Terminal spawn options: `xterm-256color`, 80x24 default size
- PTY exit handler sends a friendly colored message to renderer before cleanup
- All events are forwarded to both BrowserWindow and companion clients

---

## Extensions & Skills

### ExtensionManager

**File:** `electron/services/extension-manager.ts`

**Responsibility:**  
Lists, enables/disables, imports, and removes extensions and skills. Scans both global (`<PILOT_DIR>/extensions/`, `<PILOT_DIR>/skills/`) and project-local (`<project>/.pilot/extensions/`, `<project>/.pilot/skills/`) directories. Manages enable/disable registry.

**Constructor:**
```typescript
constructor()
```
No parameters. Initializes registry if missing.

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `setProject` | `(projectPath: string) => void` | Set the current project path (enables scanning project-local extensions/skills) |
| `listExtensions` | `() => InstalledExtension[]` | List all installed extensions (global + project) with enabled/disabled state |
| `toggleExtension` | `(extensionId: string) => boolean` | Toggle extension enabled/disabled state. Returns true if successful. |
| `removeExtension` | `(extensionId: string) => boolean` | Delete an extension from disk and remove from registry |
| `importExtensionZip` | `(zipPath: string, scope: 'global'\|'project') => ImportResult` | Extract a ZIP archive to the extensions directory. Auto-detects GitHub ZIP subdirectory structure. |
| `listSkills` | `() => InstalledSkill[]` | List all installed skills (global + project) with enabled/disabled state |
| `toggleSkill` | `(skillId: string) => boolean` | Toggle skill enabled/disabled state. Returns true if successful. |
| `removeSkill` | `(skillId: string) => boolean` | Delete a skill from disk and remove from registry |
| `importSkillZip` | `(zipPath: string, scope: 'global'\|'project') => ImportResult` | Extract a ZIP archive to the skills directory |

**Extension Structure:**
- Must contain `package.json` at root
- Enabled/disabled state is persisted in `<PILOT_DIR>/extension-registry.json`

**Skill Structure:**
- Must contain `SKILL.md` at root
- Description extracted from first `# Heading` in SKILL.md
- Enabled/disabled state is persisted in `<PILOT_DIR>/extension-registry.json` (skills array)

**Key Implementation Notes:**
- ZIP extraction uses system `unzip` command (macOS/Linux standard)
- GitHub ZIP archives often have a single subdirectory — auto-detected and flattened
- Import returns `{ success, id, name, type, scope, error? }`
- Extension errors (missing package.json, parse errors) are tagged with `hasErrors: true`
- Registry format: `{ extensions: [...], skills: [...], lastUpdated: timestamp }`
- Skill toggle support — `toggleSkill()` method persists enabled/disabled state in registry; `scanSkillsDir()` reads from registry to determine which skills are active
- Project-local extensions/skills are only visible when `setProject()` has been called

---

## Workspace & Settings

### WorkspaceStateService

**File:** `electron/services/workspace-state.ts`

**Responsibility:**  
Saves and restores tab layout + UI state to `<PILOT_DIR>/workspace.json`. Includes tabs, active tab, sidebar/panel visibility, window bounds, and project paths.

**Constructor:**
```typescript
constructor()
```
No parameters.

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `save` | `(state: WorkspaceState) => Promise<void>` | Save workspace state to disk |
| `load` | `() => Promise<WorkspaceState \| null>` | Load workspace state from disk. Returns null if file doesn't exist. |

**WorkspaceState Type:**
```typescript
interface WorkspaceState {
  tabs: SavedTabState[];
  activeTabId: string;
  closedTabs: SavedTabState[];
  ui: SavedUIState;
  lastSaved: number;
}

interface SavedTabState {
  id: string;
  projectPath: string | null;
  sessionPath: string | null;
  label: string;
}

interface SavedUIState {
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
  terminalVisible: boolean;
  windowBounds?: { x: number; y: number; width: number; height: number };
}
```

**Key Implementation Notes:**
- Save is non-blocking — errors are logged but don't throw
- Load returns null on any error (missing file, invalid JSON)
- File is written atomically (full rewrite on each save)
- Renderer debounces saves (500ms) to avoid excessive disk writes

---

### SessionMetadata

**File:** `electron/services/session-metadata.ts`

**Responsibility:**  
Persists per-session metadata (isPinned, isArchived) to `<PILOT_DIR>/session-metadata.json`. Used by `PilotSessionManager.listSessions` and `PilotSessionManager.listAllSessions` to enrich session listings, and by IPC handlers for `SESSION_UPDATE_META` and `SESSION_DELETE`.

**Key Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `getSessionMeta` | `(sessionPath: string) => SessionMeta \| null` | Get metadata for a specific session. Returns null if not found. |
| `updateSessionMeta` | `(sessionPath: string, updates: Partial<SessionMeta>) => SessionMeta` | Update metadata for a session. Creates entry if missing. |
| `getAllSessionMeta` | `() => Record<string, SessionMeta>` | Get all session metadata. Returns map of sessionPath → metadata. |
| `removeSessionMeta` | `(sessionPath: string) => void` | Remove metadata for a session (called when session is deleted). |

**SessionMeta Type:**
```typescript
interface SessionMeta {
  isPinned: boolean;
  isArchived: boolean;
  lastModified?: number;  // Unix timestamp
}
```

**Key Implementation Notes:**
- Metadata is stored as a JSON object with sessionPath as keys
- File is written atomically on each update (full rewrite)
- Read operations use in-memory cache, updated on write
- Metadata survives session deletion until explicitly removed via `removeSessionMeta()`
- Used by session sidebar to display pinned/archived badges and filter sessions
- Session paths are normalized before use as keys to ensure consistency across platforms

---

### AppSettings

**File:** `electron/services/app-settings.ts`

**Responsibility:**  
Reads and writes app-level settings to `<PILOT_DIR>/app-settings.json`. Includes Pi agent directory, terminal app, editor CLI, onboarding state, developer mode, keybind overrides, and companion server config.

**Key Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `loadAppSettings` | `() => PilotAppSettings` | Load settings from disk or return defaults. Uses singleton cache. |
| `saveAppSettings` | `(settings: Partial<PilotAppSettings>) => PilotAppSettings` | Merge partial updates with current settings and persist to disk |
| `getAppSettings` | `() => PilotAppSettings` | Alias for `loadAppSettings()` |
| `getPiAgentDir` | `() => string` | Get the effective Pi agent directory with `~` expansion |

**PilotAppSettings Type:**
```typescript
interface PilotAppSettings {
  piAgentDir: string;               // Default: <PILOT_DIR>
  terminalApp: string | null;       // e.g., "iTerm.app"
  editorCli: string | null;         // e.g., "code"
  onboardingComplete: boolean;
  developerMode: boolean;
  keybindOverrides: Record<string, string>;
  companionPort?: number;           // Default: 18088
  companionProtocol?: 'http' | 'https'; // Default: 'https'
}
```

**Key Implementation Notes:**
- Settings are cached in-memory after first load
- `~` expansion is handled by `getPiAgentDir()` helper
- Missing file or invalid JSON falls back to hardcoded defaults
- Save updates both cache and disk file
- All settings are optional except `piAgentDir`

---

### PilotPaths

**File:** `electron/services/pilot-paths.ts`

**Responsibility:**  
Centralized path resolution for all Pilot config files. No class — just exports constants and helpers.

**Key Exports:**

| Export | Type | Value |
|--------|------|-------|
| `PILOT_APP_DIR` | `string` | `<PILOT_DIR>` (platform-dependent) |
| `PILOT_APP_SETTINGS_FILE` | `string` | `<PILOT_DIR>/app-settings.json` |
| `PILOT_WORKSPACE_FILE` | `string` | `<PILOT_DIR>/workspace.json` |
| `PILOT_AUTH_FILE` | `string` | `<PILOT_DIR>/auth.json` |
| `PILOT_MODELS_FILE` | `string` | `<PILOT_DIR>/models.json` |
| `PILOT_EXTENSIONS_DIR` | `string` | `<PILOT_DIR>/extensions` |
| `PILOT_SKILLS_DIR` | `string` | `<PILOT_DIR>/skills` |
| `PILOT_EXTENSION_REGISTRY_FILE` | `string` | `<PILOT_DIR>/extension-registry.json` |
| `PILOT_PROMPTS_DIR` | `string` | `<PILOT_DIR>/prompts` |
| `DEFAULT_PI_AGENT_DIR` | `string` | `<PILOT_DIR>` (platform-dependent) |
| `ensurePilotAppDirs` | `() => void` | Create all Pilot directories if missing |

**Key Implementation Notes:**
- All paths are resolved at import time (no runtime config)
- `ensurePilotAppDirs()` should be called during app initialization
- Pi agent directory can be overridden via app settings (see `AppSettings`)

---

### ProjectSettings

**File:** `electron/services/project-settings.ts`

**Responsibility:**  
Loads per-project sandbox settings from `<project>/.pilot/settings.json`. Includes jail enabled/disabled, allowed paths outside jail, and yolo mode.

**Key Function:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `loadProjectSettings` | `(projectPath: string) => ProjectSandboxSettings` | Load settings or return defaults if file missing |

**ProjectSandboxSettings Type:**
```typescript
interface ProjectSandboxSettings {
  jail: {
    enabled: boolean;          // Default: true
    allowedPaths: string[];    // Paths outside project that agent can access
  };
  yoloMode: boolean;           // Default: false
}
```

**Key Implementation Notes:**
- Missing file returns defaults (jail enabled, yolo off, no allowed paths)
- Invalid JSON falls back to defaults
- Settings are not cached — loaded fresh on each call
- Yolo mode overrides jail and bypasses all diff staging

---

## File System Utilities

### buildFileTree (project.ts)

**File:** `electron/ipc/project.ts`

**Responsibility:**  
Builds a hierarchical file tree for project file browsing. Filters files based on user-configurable ignore patterns.

**Key Implementation Notes:**
- Uses the `ignore` npm package to handle gitignore-style patterns
- `hiddenPaths` are loaded from app settings (`app-settings.json`) and applied globally
- Default patterns include common directories like `node_modules/`, `.git/`, `dist/`, `.DS_Store`, etc.
- Supports all gitignore syntax: globs, negation (`!`), directory-only patterns (`dir/`), etc.
- Replaces the previous hardcoded `IGNORED` Set with dynamic, user-configurable filtering
- Tree is built recursively with depth limits to prevent infinite loops
- Files are sorted alphabetically within each directory level

---

## Task Management

### TaskManager

**File:** `electron/services/task-manager.ts`

**Responsibility:**  
Kanban-style task board with dependencies, epics, priorities, labels, and agent integration. Persists tasks to `.pilot/tasks/tasks.jsonl` (append-only JSONL for performance, compacted on delete). Provides ready/blocked task queries, epic progress tracking, and dependency validation.

**Constructor:**
```typescript
constructor()
```
No parameters.

**Key Properties:**
- `enabled: boolean` — Read-only flag (controlled via `setEnabled()`)
- `onBoardChanged: (projectPath: string) => void | null` — Callback when task board changes

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `setEnabled` | `(enabled: boolean) => void` | Enable/disable task system |
| `generateId` | `() => string` | Generate a new task ID (`pt-<hex>`) |
| `generateCommentId` | `() => string` | Generate a new comment ID (`cm-<hex>`) |
| `loadBoard` | `(projectPath: string) => TaskBoard` | Load task board from disk (or create empty). Starts file watcher. |
| `createTask` | `(projectPath: string, input: TaskCreateInput) => Task` | Create a new task and append to JSONL |
| `updateTask` | `(projectPath: string, taskId: string, updates: TaskUpdateInput) => Task` | Update a task and append to JSONL |
| `addComment` | `(projectPath: string, taskId: string, text: string, author: 'human'\|'agent') => Comment` | Add a comment to a task |
| `deleteTask` | `(projectPath: string, taskId: string) => boolean` | Delete a task and compact JSONL file |
| `queryTasks` | `(projectPath: string, filter: TaskFilter) => Task[]` | Query tasks with filters (status, priority, type, labels, assignee, parentId, search) |
| `getReadyTasks` | `(projectPath: string) => Task[]` | Get all ready tasks (open + all blockers done) sorted by priority |
| `getDependencyChain` | `(projectPath: string, taskId: string) => DependencyChain` | Get blockers and dependents for a task |
| `getEpicProgress` | `(projectPath: string, epicId: string) => EpicProgress` | Get epic completion stats |
| `getAgentTaskSummary` | `(projectPath: string) => string` | Build task summary for agent system prompt injection |
| `dispose` | `(projectPath?: string) => void` | Dispose board and stop file watcher. If no projectPath, disposes all. |

**Task Type:**
```typescript
interface Task {
  id: string;                    // pt-<hex>
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'review' | 'done';
  priority: 0 | 1 | 2 | 3 | 4;   // 0=Critical, 4=Low
  type: 'epic' | 'task' | 'bug' | 'feature';
  parentId: string | null;       // Epic ID if this is a subtask
  dependencies: Dependency[];
  labels: string[];
  assignee: 'human' | 'agent' | null;
  estimateMinutes: number | null;
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp
  closedAt: string | null;       // ISO timestamp
  createdBy: 'human' | 'agent';
  comments: Comment[];
}

interface Dependency {
  type: 'blocks' | 'blocked_by' | 'related';
  taskId: string;
}
```

**Key Implementation Notes:**
- Tasks are persisted as JSONL (one task per line)
- Deduplication on load (last occurrence wins for each task ID)
- File watcher reloads board on external changes (debounced 100ms)
- Ready tasks: status=open AND all blocked_by dependencies are done
- Blocked tasks: status=open|in_progress AND at least one blocked_by dependency is NOT done
- Circular dependency validation on create/update
- Epic auto-completion when all child tasks are done
- Agent summary includes: IN PROGRESS, IN REVIEW, READY, BLOCKED, DONE (count only)
- Task deletion compacts file (full rewrite) to reclaim space

---

## Subagent Orchestration

### SubagentManager

**File:** `electron/services/subagent-manager.ts`

**Responsibility:**  
Parallel subagent orchestration with file conflict detection. Spawns subagents as separate SDK sessions (in-memory, non-persistent). Manages queue, concurrency limits, per-tab limits, timeouts, and pooled execution. Tracks file modifications and blocks conflicting writes within a pool.

**Constructor:**
```typescript
constructor(parentSessionManager: PilotSessionManager)
```
Requires parent session manager for auth/model access and staged diff integration.

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `spawn` | `(parentTabId: string, projectPath: string, options: SubagentSpawnOptions) => Promise<string>` | Spawn a single subagent. Returns subagent ID. |
| `spawnPool` | `(parentTabId: string, projectPath: string, tasks: SubagentPoolTask[]) => Promise<string>` | Spawn a parallel pool of subagents. Returns pool ID. |
| `awaitResult` | `(subId: string) => Promise<SubagentResult>` | Await completion of a subagent (blocking) |
| `awaitPool` | `(poolId: string) => Promise<SubagentPoolResult>` | Await completion of all subagents in a pool (blocking) |
| `getResult` | `(subId: string) => SubagentResult \| null` | Get subagent result (non-blocking) |
| `abort` | `(subId: string) => Promise<void>` | Abort a running or queued subagent |
| `abortPool` | `(poolId: string) => Promise<void>` | Abort all subagents in a pool |
| `getStatus` | `(parentTabId: string) => SubagentRecord[]` | Get all subagents for a parent tab |
| `cleanup` | `(parentTabId: string) => void` | Clean up all subagents for a parent tab |
| `cleanupAll` | `() => void` | Clean up all subagents across all tabs |
| `hasActiveSubagents` | `(parentTabId: string) => boolean` | Check if any subagents are running or queued for a tab |

**SubagentSpawnOptions:**
```typescript
interface SubagentSpawnOptions {
  role: string;                  // e.g., "Code Reviewer", "Test Writer"
  prompt: string;                // Task description
  model?: string;                // Override model (optional)
  maxTurns?: number;             // Default: 20
  readOnly?: boolean;            // If true, no write/edit/bash tools (default: false)
  systemPrompt?: string;         // Override system prompt (optional)
  allowedPaths?: string[];       // Override jail allowed paths (optional)
}
```

**SubagentRecord:**
```typescript
interface SubagentRecord {
  id: string;                    // sub-<hex>
  parentTabId: string;
  poolId: string | null;         // pool-<hex> if part of a pool
  status: 'queued' | 'running' | 'completed' | 'failed' | 'aborted';
  role: string;
  prompt: string;
  result: string | null;
  error: string | null;
  modifiedFiles: string[];       // Absolute paths
  createdAt: number;             // Unix timestamp
  completedAt: number | null;    // Unix timestamp
  tokenUsage: { input: number; output: number };
}
```

**Concurrency Limits:**
- **Per Tab:** 10 subagents max
- **Global Concurrent:** 4 subagents running at once
- **Timeout:** 5 minutes per subagent

**Key Implementation Notes:**
- Subagents use in-memory sessions (no persistence to JSONL)
- File conflict detection: first subagent to touch a file in a pool "owns" it
- Subsequent subagents in the same pool that try to modify the same file get an error
- Subagents inject system prompt: "You are a subagent with role X. Do not spawn subagents."
- Queue is FIFO — dequeues automatically when running count drops below concurrency limit
- Subagent diffs are staged in parent tab's diff manager
- Subagent events are forwarded to parent tab via `IPC.SUBAGENT_EVENT`
- Pool progress events via `IPC.SUBAGENT_POOL_PROGRESS`
- Subagent sessions are disposed 1 second after completion (allows event delivery)

---

## Companion Remote Access

### CompanionServer

**File:** `electron/services/companion-server.ts`

**Responsibility:**  
HTTPS + WebSocket server for Pilot Companion remote access. Serves the React renderer as a web app. Provides WebSocket IPC bridge for real-time communication with companion devices. Self-signed TLS for secure connections over LAN.

**Constructor:**
```typescript
constructor(config: CompanionServerConfig)
```

**CompanionServerConfig:**
```typescript
interface CompanionServerConfig {
  port?: number;                 // Default: 18088
  reactBundlePath?: string;      // Path to built renderer (default: ../renderer)
  protocol?: 'http' | 'https';   // Default: 'https'
  tlsCert?: Buffer;              // Required for https
  tlsKey?: Buffer;               // Required for https
  ipcBridge: CompanionIPCBridge;
  auth: CompanionAuth;
}
```

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `start` | `() => Promise<void>` | Start HTTPS and WebSocket servers |
| `stop` | `() => Promise<void>` | Stop servers and disconnect all clients |
| `broadcast` | `(channel: string, payload: unknown) => void` | Forward an IPC event to all connected clients |
| `updateTlsCerts` | `(cert: Buffer, key: Buffer) => void` | Hot-swap TLS certs without restarting (uses `setSecureContext`) |
| `running` | `boolean` | Check if server is running |
| `port` | `number` | Get configured port |
| `connectedClients` | `number` | Get number of connected clients |
| `protocol` | `'http' \| 'https'` | Get current protocol |

**Routes:**
- `GET /api/companion-mode` → `{ companion: true }`
- `GET /api/companion-config` → WebSocket connection details
- `POST /api/companion-pair` → PIN/QR pairing endpoint
- `GET /*` → Serve React bundle (SPA fallback)

**WebSocket Auth Flow:**
1. Client connects to WebSocket
2. Client must send `{ type: 'auth', token: '<session-token>' }` within 5 seconds
3. Server validates token via `CompanionAuth`
4. On success: `{ type: 'auth_ok' }` → client is registered with IPC bridge
5. On failure: `{ type: 'auth_error', reason: '...' }` → connection closed

**Key Implementation Notes:**
- Listens on `0.0.0.0` (all interfaces) for LAN access
- SPA fallback serves `index.html` for all non-API routes
- Renderer detects companion mode by checking `window.api` existence (no preload in browser)
- WebSocket messages are routed to `CompanionIPCBridge`
- Server forwards all main process events to WebSocket clients via `broadcast()`
- TLS cert hot-swap enables Tailscale cert updates without restart

---

### CompanionAuth

**File:** `electron/services/companion-auth.ts`

**Responsibility:**  
PIN/QR pairing and session token management for companion devices. Generates 6-digit PINs or QR tokens for initial pairing. Issues long-lived session tokens after successful pairing. Validates session tokens for WebSocket authentication.

**Constructor:**
```typescript
constructor(configDir: string)
```
Requires config directory for token persistence.

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `init` | `() => Promise<void>` | Load persisted tokens from disk. Call once during app startup. |
| `generatePIN` | `() => string` | Generate a random 6-digit PIN for pairing. Expires in 5 minutes. |
| `generateQRPayload` | `(serverHost: string, serverPort: number) => QRPayload` | Generate QR code payload with server URL and token. Expires in 5 minutes. |
| `pair` | `(credential: string, deviceName: string) => Promise<string \| null>` | Pair a device using PIN or QR token. Returns session token on success. |
| `validateToken` | `(token: string) => Promise<AuthToken \| null>` | Validate a session token. Updates lastSeen timestamp. |
| `getDevices` | `() => DeviceInfo[]` | Get list of all paired devices |
| `revokeDevice` | `(sessionId: string) => Promise<void>` | Revoke all tokens for a device session |
| `getActivePairing` | `() => PairingSession \| null` | Get active pairing session info (for UI) |
| `clearActivePairing` | `() => void` | Clear active pairing session |

**Key Types:**
```typescript
interface AuthToken {
  sessionId: string;             // UUID
  token: string;                 // 96 hex chars
  deviceName: string;            // User-friendly name
  createdAt: number;             // Unix timestamp
  lastSeen: number;              // Unix timestamp
}

interface QRPayload {
  type: 'pilot-companion';
  version: 1;
  host: string;                  // e.g., "192.168.1.100"
  port: number;                  // e.g., 18088
  token: string;                 // 64 hex chars
}
```

**Key Implementation Notes:**
- PIN is 6 random digits (100000-999999)
- QR token is 32 random bytes (64 hex chars)
- Session token is 48 random bytes (96 hex chars)
- Only one active pairing at a time (new pairing replaces old)
- Pairing expires after 5 minutes
- Tokens are persisted to `companion-tokens.json` as array
- Token validation updates lastSeen for activity tracking

---

### CompanionDiscovery

**File:** `electron/services/companion-discovery.ts`

**Responsibility:**  
mDNS/Bonjour service advertisement for Pilot Companion. Advertises the WebSocket server via multicast DNS so mobile/remote clients can discover it automatically on the local network. Uses `@homebridge/ciao` if available, falls back to `dns-sd` CLI on macOS.

**Constructor:**
```typescript
constructor()
```
No parameters.

**Static Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `getComputerName` | `() => Promise<string>` | Get computer's display name (macOS: scutil, else: hostname) |

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `start` | `(port: number, instanceName: string) => Promise<void>` | Start mDNS advertisement |
| `stop` | `() => Promise<void>` | Stop mDNS advertisement |
| `isAdvertising` | `() => boolean` | Check if service is currently advertising |

**Service Type:**
- **Bare:** `pilot-comp` (for ciao)
- **Full:** `_pilot-comp._tcp` (for dns-sd CLI)

**TXT Records:**
```typescript
{ version: '1', app: 'pilot' }
```

**Key Implementation Notes:**
- Prefers `@homebridge/ciao` (cross-platform, pure JS)
- Falls back to macOS `dns-sd` CLI if ciao not installed
- No mDNS support on other platforms without ciao
- Computer name resolution uses `scutil --get ComputerName` on macOS
- dns-sd process spawned with args: `-R <Name> <Type> local <Port> <TXT>`
- Process stdout/stderr logged for debugging

---

### CompanionIPCBridge

**File:** `electron/services/companion-ipc-bridge.ts`

**Responsibility:**  
Maps WebSocket messages from companion apps to IPC handlers. Auto-syncs all `ipcMain.handle()` handlers into a registry. Routes incoming `{ type: 'ipc' }` messages to registered handlers. Forwards main process events to all connected WebSocket clients.

**Constructor:**
```typescript
constructor()
```
No parameters.

**Key Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `syncAllHandlers` | `() => void` | Auto-register all ipcMain handlers. Call ONCE after all IPC setup. |
| `registerSendHandler` | `(channel: string, handler: (...args) => void) => void` | Register a fire-and-forget handler (ipcMain.on) |

**Public Methods:**

| Method | Signature | Description |
|--------|-----------|-------------|
| `attachClient` | `(ws: WebSocket, sessionId: string) => void` | Attach a WebSocket client. Listens for IPC messages and routes to handlers. |
| `detachClient` | `(sessionId: string) => void` | Detach and close a WebSocket client |
| `forwardEvent` | `(channel: string, payload: unknown) => void` | Forward an IPC event to all connected clients (like win.webContents.send) |
| `connectedClients` | `number` | Get number of connected clients |
| `getConnectedSessions` | `() => string[]` | Get all connected session IDs |
| `isSessionConnected` | `(sessionId: string) => boolean` | Check if a session is connected |
| `shutdown` | `() => void` | Disconnect all clients and clear registry |

**Singleton Export:**
```typescript
export const companionBridge = new CompanionIPCBridge();
```

**Message Types:**
```typescript
interface IPCInvokeMessage {
  type: 'ipc';
  id: string;                    // Request ID
  channel: string;               // IPC channel name
  args: any[];                   // Handler arguments
}

interface IPCResponseMessage {
  type: 'ipc-response';
  id: string;                    // Request ID
  result?: any;                  // Handler result
  error?: string;                // Error message
}

interface IPCEventMessage {
  type: 'event';
  channel: string;               // Event channel name
  payload: any;                  // Event payload
}
```

**Blocklist (Desktop-Only Channels):**
```typescript
[
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:is-maximized',
  'shell:open-external',
  'shell:reveal-in-finder',
  'shell:open-in-terminal',
  'shell:open-in-editor',
  'project:open-dialog',
]
```

**Key Implementation Notes:**
- `syncAllHandlers()` accesses Electron's internal `ipcMain._invokeHandlers` Map
- Handlers are wrapped to accept `null` event (companion calls don't have Electron event)
- Fire-and-forget handlers return empty ack so companion's `invoke()` resolves
- Unknown channels return error response to prevent hanging
- Dead connections are cleaned up automatically on message send failure
- Events are broadcast to all clients (no per-client filtering)

---

### CompanionTLS

**File:** `electron/services/companion-tls.ts`

**Responsibility:**  
Self-signed TLS certificate generation with dynamic Subject Alternative Names (SAN). Generates cert+key pairs using OpenSSL. Includes localhost + all current LAN IPv4 addresses in SAN. Auto-regenerates if network interfaces change.

**Key Functions:**

| Function | Signature | Description |
|----------|-----------|-------------|
| `ensureTLSCert` | `(configDir: string) => Promise<{cert, key}>` | Ensure cert exists. Regenerates if IPs changed. |
| `regenerateTLSCert` | `(configDir: string) => Promise<{cert, key}>` | Force-regenerate cert (e.g., after network change) |

**Certificate Details:**
- **Subject:** `CN=Pilot Companion`
- **SAN:** `localhost`, `127.0.0.1`, `0.0.0.0`, all LAN IPs
- **Validity:** 3650 days (10 years)
- **Key:** RSA 2048-bit

**OpenSSL Commands:**
```bash
openssl genrsa 2048
openssl req -new -x509 -key /dev/stdin -out /dev/stdout -days 3650 -config <config>
```

**Key Implementation Notes:**
- OpenSSL config is written to temp file in `/tmp/` and deleted after generation
- LAN IPs collected via `os.networkInterfaces()` (excludes internal interfaces)
- Cert coverage check uses `openssl x509 -ext subjectAltName` to parse SAN
- If any current IP is missing from existing cert, regenerates
- Throws if OpenSSL is not available on PATH
- Cert and key written to `companion-cert.pem` and `companion-key.pem`

---

## Usage Patterns

### Starting a Session

```typescript
// In main process
const sessionManager = new PilotSessionManager();
await sessionManager.createSession('tab-123', '/Users/espen/Dev/project');

// Send a message
await sessionManager.prompt('tab-123', 'Create a new React component');

// Abort
await sessionManager.abort('tab-123');

// Clean up
sessionManager.dispose('tab-123');
```

### Staging & Applying Diffs

```typescript
// Diffs are staged automatically by SandboxedTools
// Accept a diff in main process (via IPC handler):
const diff = sessionManager.stagedDiffs.getDiff(tabId, diffId);
if (diff) {
  // Apply the diff
  if (diff.operation === 'bash') {
    // Execute bash command
    const { resolveBashApproval } = require('./sandboxed-tools');
    resolveBashApproval(diffId, true);
  } else {
    // Write file
    await fs.writeFile(diff.filePath, diff.proposedContent, 'utf-8');
  }
  
  // Update status
  sessionManager.stagedDiffs.updateStatus(tabId, diffId, 'accepted');
}
```

### Memory Management

```typescript
// In main process
const memoryManager = new MemoryManager();

// Manual memory
const result = await memoryManager.handleManualMemory(
  '#remember I prefer TypeScript with strict mode',
  '/Users/espen/Dev/project'
);

// Load memory context for system prompt
const memoryContext = await memoryManager.getMemoryContext('/Users/espen/Dev/project');
// Pass to SDK's appendSystemPrompt

// Auto-extraction happens automatically in PilotSessionManager
```

### Task Board

```typescript
// In main process
const taskManager = new TaskManager();
const board = taskManager.loadBoard('/Users/espen/Dev/project');

// Create a task
const task = taskManager.createTask('/Users/espen/Dev/project', {
  title: 'Add login form',
  type: 'feature',
  priority: 1,
  assignee: 'agent'
});

// Query ready tasks
const ready = taskManager.getReadyTasks('/Users/espen/Dev/project');

// Get agent summary
const summary = taskManager.getAgentTaskSummary('/Users/espen/Dev/project');
// Inject into system prompt
```

### Companion Server

```typescript
// In main process
const { CompanionServer } = require('./services/companion-server');
const { CompanionAuth } = require('./services/companion-auth');
const { companionBridge, syncAllHandlers } = require('./services/companion-ipc-bridge');
const { ensureTLSCert } = require('./services/companion-tls');

// Setup
const auth = new CompanionAuth(PILOT_APP_DIR);
await auth.init();

const { cert, key } = await ensureTLSCert(PILOT_APP_DIR);

const server = new CompanionServer({
  port: 18088,
  protocol: 'https',
  tlsCert: cert,
  tlsKey: key,
  ipcBridge: companionBridge,
  auth,
});

// After all IPC handlers are registered
syncAllHandlers();

// Start
await server.start();

// Generate pairing PIN
const pin = auth.generatePIN(); // Show in UI
```

---

## Testing & Debugging

### Enable Developer Mode

Set `developerMode: true` in `<PILOT_DIR>/app-settings.json` to:
- Show IPC traffic in DevTools console
- Enable subagent debugging panel
- Show memory extraction logs
- Enable task board debug panel

### Inspect Session Files

```bash
# List all sessions for a project
ls -1 <PILOT_DIR>/sessions/--Users+espen+Dev+PiLot--/

# View a session file (JSONL)
cat <PILOT_DIR>/sessions/--Users+espen+Dev+PiLot--/2025-02-23T16-30-45-789Z.jsonl | jq
```

### Inspect Memory Files

```bash
# Global memory
cat <PILOT_DIR>/MEMORY.md

# Project-shared memory
cat ~/Dev/project/.pilot/MEMORY.md
```

### Inspect Task Board

```bash
# View tasks JSONL
cat ~/Dev/project/.pilot/tasks/tasks.jsonl | jq -s
```

---

## Error Handling

All services follow these conventions:

1. **Constructor errors** are thrown (missing dependencies, initialization failures)
2. **Method errors** are thrown for invalid arguments or precondition failures
3. **Async I/O errors** are thrown (file read/write, git commands)
4. **IPC handlers** should catch service errors and return structured error responses
5. **Background tasks** (memory extraction, file watchers) log errors but don't throw
6. **Cleanup methods** (`dispose`, `stop`) swallow errors and log warnings

**Example IPC Error Handling:**
```typescript
ipcMain.handle(IPC.SESSION_CREATE, async (event, tabId, projectPath) => {
  try {
    await sessionManager.createSession(tabId, projectPath);
    return { success: true };
  } catch (error) {
    console.error('Failed to create session:', error);
    return { success: false, error: error.message };
  }
});
```

---

## Service Lifecycle

1. **App Startup:**
   - `ensurePilotAppDirs()` — Create config directories
   - Load app settings
   - Initialize `PilotSessionManager` (auth, models, memory, tasks, subagents)
   - Initialize companion services if enabled (server, auth, discovery, TLS)
   - `syncAllHandlers()` — Register all IPC handlers with companion bridge

2. **Tab Open:**
   - `createSession()` or `openSession()`
   - Session loads extensions, skills, memory, tasks
   - Session forwards events to renderer + companions

3. **Project Change:**
   - `devCommandsService.setProject()`
   - `extensionManager.setProject()`
   - `gitService = new GitService(projectPath)`

4. **Tab Close:**
   - `sessionManager.dispose(tabId)`
   - Cleans up session, subagents, staged diffs

5. **App Shutdown:**
   - `sessionManager.disposeAll()`
   - `taskManager.dispose()`
   - `subagentManager.cleanupAll()`
   - `devCommandsService.dispose()`
   - `terminalService.disposeAll()`
   - `companionServer.stop()`
   - `companionDiscovery.stop()`
   - `companionBridge.shutdown()`

---

## Cross-References

- **IPC Contracts:** `shared/ipc.ts` — All IPC channel name constants
- **Shared Types:** `shared/types.ts` — All types used across process boundary
- **SDK Documentation:** [Pi Coding Agent README](https://github.com/mariozechner/pi-coding-agent)
- **AGENTS.md:** Project orientation for AI coding agents
- **PRD.md:** Full product requirements and architecture
- **code-review.md:** Known issues, bugs, and technical debt

---

*Last Updated: February 23, 2026*
