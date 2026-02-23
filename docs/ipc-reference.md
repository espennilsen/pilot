# IPC Channel Reference

Complete reference for all inter-process communication channels in PiLot.

> **Config directory** is platform-dependent: `~/.config/.pilot/` (macOS/Linux), `%APPDATA%\.pilot\` (Windows). Paths below use `<PILOT_DIR>` as shorthand.

---

## Architecture Overview

PiLot uses Electron's IPC (Inter-Process Communication) to communicate between the renderer process (React UI) and the main process (Node.js backend with Pi SDK).

### Key Files

| File | Purpose |
|---|---|
| `shared/ipc.ts` | Single source of truth for all channel name constants |
| `shared/types.ts` | All serializable TypeScript types used across the process boundary |
| `electron/ipc/<domain>.ts` | IPC handler registration per domain |
| `electron/preload/index.ts` | Exposes `window.api` to renderer via `contextBridge` |
| `src/stores/<domain>-store.ts` | Zustand stores that invoke IPC from renderer |

### Process Model

| Process | Has Node.js? | Role |
|---|---|---|
| **Main** | ✅ Yes | Owns SDK, file system, git, shell, all business logic |
| **Preload** | ✅ Limited | Only `contextBridge.exposeInMainWorld` — no logic |
| **Renderer** | ❌ No | React UI — all system calls go through `window.api` |

**Golden Rule:** Never import `fs`, `path`, `child_process`, or `electron` into renderer code. Never use `nodeIntegration: true`.

---

## IPC Patterns

### Renderer → Main (Request/Response)

```typescript
// shared/ipc.ts
export const IPC = {
  MY_CHANNEL: 'my:channel',
};

// electron/ipc/my-domain.ts
import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';

ipcMain.handle(IPC.MY_CHANNEL, async (event, arg1, arg2) => {
  return { result: 'value' };
});

// src/stores/my-store.ts
const result = await window.api.invoke(IPC.MY_CHANNEL, arg1, arg2);
```

### Main → Renderer (Push Event)

```typescript
// electron/services/my-service.ts
import { BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc';

BrowserWindow.getAllWindows().forEach(win => {
  win.webContents.send(IPC.MY_PUSH_CHANNEL, payload);
});

// src/hooks/useMyEvents.ts
useEffect(() => {
  const unsubscribe = window.api.on(IPC.MY_PUSH_CHANNEL, (payload) => {
    // Handle push event
  });
  return unsubscribe; // Always cleanup
}, []);
```

### Serialization Constraints

All IPC payloads must be **Structured Clone serializable**:

- ✅ Plain objects, arrays, primitives (string, number, boolean, null)
- ✅ Date objects, RegExp, Blob, File, Map, Set
- ❌ Functions, class instances, DOM nodes, Symbols
- ❌ Circular references

Use plain objects with TypeScript interfaces from `shared/types.ts`.

---

## Adding a New IPC Channel — Checklist

1. Add the constant to `shared/ipc.ts`
2. Add any new payload types to `shared/types.ts`
3. Register `ipcMain.handle(IPC.NEW_CHANNEL, ...)` in `electron/ipc/<domain>.ts`
4. If it requires a service instance, register the handler in `electron/main/index.ts`
5. Call from renderer via `window.api.invoke(IPC.NEW_CHANNEL, ...)`
6. For push events, register listener with `window.api.on()` and return cleanup function

---

## Channel Reference

### Agent

Agent session lifecycle, messaging, and steering.

| Channel | Direction | Args | Returns | Handler |
|---|---|---|---|---|
| `AGENT_CREATE_SESSION` | renderer→main | `tabId: string, projectPath?: string, sessionPath?: string` | `void` | `PilotSessionManager` |
| `AGENT_CONTINUE_SESSION` | renderer→main | `tabId: string, sessionPath: string` | `void` | `PilotSessionManager` |
| `AGENT_PROMPT` | renderer→main | `tabId: string, message: string` | `void` | `PilotSessionManager` |
| `AGENT_STEER` | renderer→main | `tabId: string, message: string` | `void` | `PilotSessionManager` |
| `AGENT_FOLLOW_UP` | renderer→main | `tabId: string, message: string` | `void` | `PilotSessionManager` |
| `AGENT_GET_QUEUED` | renderer→main | `tabId: string` | `{ steering: string[], followUp: string[] }` | `PilotSessionManager` |
| `AGENT_CLEAR_QUEUE` | renderer→main | `tabId: string` | `void` | `PilotSessionManager` |
| `AGENT_ABORT` | renderer→main | `tabId: string` | `void` | `PilotSessionManager` |
| `AGENT_DISPOSE` | renderer→main | `tabId: string` | `void` | `PilotSessionManager` |
| `AGENT_GET_SLASH_COMMANDS` | renderer→main | — | `SlashCommand[]` | `PilotSessionManager` |
| `AGENT_EVENT` | main→renderer | `AgentSessionEvent` | — | Push event |

**`AgentSessionEvent` payload:**

```typescript
{
  tabId: string;
  type: 'streaming' | 'tool_call' | 'error' | 'done' | 'aborted';
  chunk?: string;
  toolName?: string;
  toolInput?: any;
  error?: string;
}
```

---

### Model

Model selection, cycling, and thinking level control.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `MODEL_GET_AVAILABLE` | renderer→main | — | `ModelInfo[]` |
| `MODEL_GET_INFO` | renderer→main | `tabId: string` | `ModelInfo` |
| `MODEL_SET` | renderer→main | `tabId: string, modelId: string` | `ModelInfo` |
| `MODEL_CYCLE` | renderer→main | `tabId: string` | `ModelInfo` |
| `MODEL_CYCLE_THINKING` | renderer→main | `tabId: string` | `string` (thinking level) |

**`ModelInfo` type:**

```typescript
{
  id: string;
  name: string;
  providerId: string;
  contextWindow: number;
  maxOutput: number;
  costPer1MIn?: number;
  costPer1MOut?: number;
  thinkingLevel?: 'low' | 'medium' | 'high';
}
```

---

### Session

Session management, stats, context usage, forking.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `SESSION_GET_STATS` | renderer→main | `tabId: string` | `SessionStats` |
| `SESSION_GET_CONTEXT_USAGE` | renderer→main | `tabId: string` | `ContextUsage` |
| `SESSION_GET_HISTORY` | renderer→main | `tabId: string` | `Message[]` |
| `SESSION_ENSURE` | renderer→main | `tabId: string` | `void` |
| `SESSION_OPEN` | renderer→main | `tabId: string, sessionPath: string` | `void` |
| `SESSION_LIST` | renderer→main | `projectPath?: string` | `SessionInfo[]` |
| `SESSION_LIST_ALL` | renderer→main | `projectPaths?: string[]` | `SessionInfo[]` |
| `SESSION_NEW` | renderer→main | `tabId: string` | `void` |
| `SESSION_SWITCH` | renderer→main | `tabId: string, sessionPath: string` | `void` |
| `SESSION_FORK` | renderer→main | `tabId: string` | `string` (new session path) |

**`SessionStats` type:**

```typescript
{
  messageCount: number;
  tokenCount: number;
  created: number; // timestamp
  modified: number;
}
```

**`ContextUsage` type:**

```typescript
{
  inputTokens: number;
  outputTokens: number;
  contextWindowSize: number;
  percentUsed: number;
}
```

---

### Sandbox

File operation review and approval, YOLO mode.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `SANDBOX_GET_SETTINGS` | renderer→main | `tabId: string` | `ProjectSandboxSettings` |
| `SANDBOX_UPDATE_SETTINGS` | renderer→main | `tabId: string, settings: Partial<ProjectSandboxSettings>` | `void` |
| `SANDBOX_TOGGLE_YOLO` | renderer→main | `tabId: string` | `{ yoloMode: boolean }` |
| `SANDBOX_ACCEPT_DIFF` | renderer→main | `tabId: string, diffId: string` | `void` |
| `SANDBOX_REJECT_DIFF` | renderer→main | `tabId: string, diffId: string` | `void` |
| `SANDBOX_ACCEPT_ALL` | renderer→main | `tabId: string` | `void` |
| `SANDBOX_STAGED_DIFF` | main→renderer | `{ tabId: string, diff: StagedDiff }` | — | Push event |

**`StagedDiff` type:**

```typescript
{
  id: string;
  tabId: string;
  toolCallId: string;
  filePath: string;
  operation: 'edit' | 'create' | 'delete' | 'bash';
  originalContent: string | null;
  proposedContent: string;
  unifiedDiff?: string; // @@ hunks, context lines
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}
```

**`ProjectSandboxSettings` type:**

```typescript
{
  jail: {
    enabled: boolean;
    allowedPaths: string[];
  };
  yoloMode: boolean;
}
```

---

### Git

Git operations via `simple-git`. One `GitService` instance per active project.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `GIT_INIT` | renderer→main | `projectPath: string` | `void` |
| `GIT_INIT_REPO` | renderer→main | `projectPath: string` | `void` |
| `GIT_STATUS` | renderer→main | — | `GitStatus` |
| `GIT_BRANCHES` | renderer→main | — | `GitBranch[]` |
| `GIT_CHECKOUT` | renderer→main | `branch: string` | `void` |
| `GIT_CREATE_BRANCH` | renderer→main | `name: string` | `void` |
| `GIT_STAGE` | renderer→main | `paths: string[]` | `void` |
| `GIT_UNSTAGE` | renderer→main | `paths: string[]` | `void` |
| `GIT_COMMIT` | renderer→main | `message: string` | `void` |
| `GIT_PUSH` | renderer→main | — | `void` |
| `GIT_PULL` | renderer→main | — | `void` |
| `GIT_DIFF` | renderer→main | `ref1?: string, ref2?: string` | `string` |
| `GIT_LOG` | renderer→main | `options?: { maxCount?: number, file?: string }` | `GitCommit[]` |
| `GIT_BLAME` | renderer→main | `filePath: string` | `BlameLine[]` |
| `GIT_STASH_LIST` | renderer→main | — | `GitStash[]` |
| `GIT_STASH_APPLY` | renderer→main | `stashId: string` | `void` |

**`GitStatus` type:**

```typescript
{
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  isClean: boolean;
}
```

**`GitBranch` type:**

```typescript
{
  name: string;
  current: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  lastCommitHash: string;
  lastCommitDate: number;
  lastCommitMessage: string;
}
```

**`GitCommit` type:**

```typescript
{
  hash: string;
  hashShort: string;
  author: string;
  authorEmail: string;
  date: number;
  message: string;
  parents: string[];
  refs: string[];
}
```

---

### Project

Project directory selection, file tree, file operations.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `PROJECT_SET_DIRECTORY` | renderer→main | `path: string` | `void` |
| `PROJECT_FILE_TREE` | renderer→main | — | `FileNode[]` |
| `PROJECT_READ_FILE` | renderer→main | `path: string` | `string` |
| `PROJECT_WRITE_FILE` | renderer→main | `path: string, content: string` | `void` |
| `PROJECT_DELETE_PATH` | renderer→main | `path: string` | `void` |
| `PROJECT_RENAME_PATH` | renderer→main | `oldPath: string, newPath: string` | `void` |
| `PROJECT_CREATE_FILE` | renderer→main | `path: string` | `void` |
| `PROJECT_CREATE_DIRECTORY` | renderer→main | `path: string` | `void` |
| `PROJECT_OPEN_DIALOG` | renderer→main | — | `string \| null` |
| `PROJECT_FS_CHANGED` | main→renderer | `void` | — | Push event |

**`FileNode` type:**

```typescript
{
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}
```

---

### Memory

Two-tier memory system (global, project).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `MEMORY_GET` | renderer→main | `projectPath?: string` | `MemoryContent` |
| `MEMORY_GET_FILES` | renderer→main | `projectPath?: string` | `{ global: string, project: string }` |
| `MEMORY_GET_COUNT` | renderer→main | `projectPath?: string` | `MemoryCount` |
| `MEMORY_GET_PATHS` | renderer→main | `projectPath?: string` | `{ global: string, project: string }` |
| `MEMORY_SAVE_FILE` | renderer→main | `scope: MemoryScope, projectPath?: string, content: string` | `void` |
| `MEMORY_CLEAR` | renderer→main | `scope: MemoryScope, projectPath?: string` | `void` |
| `MEMORY_HANDLE_COMMAND` | renderer→main | `command: string, projectPath?: string` | `string` |
| `MEMORY_SET_ENABLED` | renderer→main | `enabled: boolean` | `void` |
| `MEMORY_UPDATED` | main→renderer | `{ count: MemoryCount, preview: string }` | — | Push event |
| `MEMORY_SHOW_PANEL` | main→renderer | — | — | Push event |

**`MemoryScope` type:**

```typescript
type MemoryScope = 'global' | 'project';
```

**`MemoryCount` type:**

```typescript
{
  global: number;
  project: number;
}
```

**File Locations:**

- **Global:** `<PILOT_DIR>/MEMORY.md`
- **Project:** `<project>/.pilot/MEMORY.md` (can be git-tracked)

---

### Tasks

Task management integration (via `td` CLI).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `TASKS_LOAD_BOARD` | renderer→main | `projectPath: string` | `TaskBoard` |
| `TASKS_CREATE` | renderer→main | `projectPath: string, input: CreateTaskInput` | `TaskItem` |
| `TASKS_UPDATE` | renderer→main | `projectPath: string, taskId: string, updates: Partial<TaskItem>` | `TaskItem` |
| `TASKS_DELETE` | renderer→main | `projectPath: string, taskId: string` | `void` |
| `TASKS_COMMENT` | renderer→main | `projectPath: string, taskId: string, text: string` | `void` |
| `TASKS_QUERY` | renderer→main | `projectPath: string, query: string` | `TaskItem[]` |
| `TASKS_READY` | renderer→main | `projectPath: string` | `TaskItem[]` |
| `TASKS_EPIC_PROGRESS` | renderer→main | `projectPath: string, epicId: string` | `EpicProgress` |
| `TASKS_DEPENDENCIES` | renderer→main | `projectPath: string, taskId: string` | `Dependencies` |
| `TASKS_SET_ENABLED` | renderer→main | `enabled: boolean` | `void` |
| `TASKS_CHANGED` | main→renderer | `{ projectPath: string }` | — | Push event |
| `TASKS_SHOW_PANEL` | main→renderer | — | — | Push event |
| `TASKS_SHOW_CREATE` | main→renderer | — | — | Push event |

**`TaskBoard` type:**

```typescript
{
  backlog: TaskItem[];
  active: TaskItem[];
  done: TaskItem[];
  epics: EpicItem[];
}
```

**`TaskItem` type:**

```typescript
{
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'active' | 'done';
  priority: 'low' | 'medium' | 'high';
  created: number;
  updated: number;
  tags: string[];
  dependencies: string[];
  epic?: string;
}
```

---

### Auth

Provider authentication, OAuth flows, API keys.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `AUTH_GET_PROVIDERS` | renderer→main | — | `ProviderInfo[]` |
| `AUTH_GET_STATUS` | renderer→main | — | `ProviderAuthInfo[]` |
| `AUTH_SET_API_KEY` | renderer→main | `provider: string, apiKey: string` | `void` |
| `AUTH_SET_RUNTIME_KEY` | renderer→main | `provider: string, apiKey: string` | `void` |
| `AUTH_LOGIN_OAUTH` | renderer→main | `providerId: string` | `void` |
| `AUTH_OAUTH_PROMPT_REPLY` | renderer→main | `value: string` | `void` |
| `AUTH_LOGOUT` | renderer→main | `provider: string` | `void` |
| `AUTH_LOGIN_OAUTH_EVENT` | main→renderer | `OAuthEvent` | — | Push event |

**`OAuthEvent` type:**

```typescript
{
  type: 'prompt' | 'success' | 'error';
  providerId: string;
  message?: string;
  error?: string;
}
```

**`ProviderAuthInfo` type:**

```typescript
{
  providerId: string;
  isAuthenticated: boolean;
  username?: string;
  expiresAt?: number;
}
```

---

### Settings

App-level settings (in `<PILOT_DIR>/`) and project-level settings (in `<project>/.pilot/`).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `APP_SETTINGS_GET` | renderer→main | — | `PilotAppSettings` |
| `APP_SETTINGS_UPDATE` | renderer→main | `Partial<PilotAppSettings>` | `PilotAppSettings` |
| `PI_SETTINGS_GET` | renderer→main | — | `PiAgentConfig` |
| `PI_SETTINGS_UPDATE` | renderer→main | `Partial<PiAgentConfig>` | `PiAgentConfig` |
| `SETTINGS_GET` | renderer→main | `projectPath?: string` | `ProjectSandboxSettings` |
| `SETTINGS_UPDATE` | renderer→main | `projectPath: string, settings: Partial<ProjectSandboxSettings>` | `void` |

**`PilotAppSettings` type:**

```typescript
{
  piAgentDir: string; // Default: <PILOT_DIR>
  terminalApp: string | null;
  editorCli: string | null;
  onboardingComplete: boolean;
  developerMode: boolean;
  keybindOverrides?: Record<string, string | null>;
  companionPort?: number; // Default: 18088
  companionProtocol?: 'http' | 'https'; // Default: 'https'
}
```

**File Locations:**

- **App Settings:** `<PILOT_DIR>/app-settings.json`
- **Pi Settings:** `<PILOT_DIR>/config.json`
- **Project Settings:** `<project>/.pilot/settings.json`

---

### Workspace

Tab layout persistence and restoration.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `TABS_SAVE_STATE` | renderer→main | `state: WorkspaceState` | `void` |
| `TABS_RESTORE_STATE` | renderer→main | — | `WorkspaceState \| null` |

**`WorkspaceState` type:**

```typescript
{
  tabs: TabState[];
  activeTabId: string | null;
  ui: {
    sidebarOpen: boolean;
    rightPanelOpen: boolean;
    terminalOpen: boolean;
  };
}
```

**File Location:** `<PILOT_DIR>/workspace.json`

---

### Dev Commands

Project-specific development command buttons (run, stop, stream output).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `DEV_LOAD_CONFIG` | renderer→main | `projectPath: string` | `DevCommand[]` |
| `DEV_SAVE_CONFIG` | renderer→main | `projectPath: string, commands: DevCommand[]` | `void` |
| `DEV_RUN_COMMAND` | renderer→main | `commandId: string` | `void` |
| `DEV_STOP_COMMAND` | renderer→main | `commandId: string` | `void` |
| `DEV_COMMAND_OUTPUT` | main→renderer | `{ commandId: string, data: string }` | — | Push event |
| `DEV_COMMAND_STATUS` | main→renderer | `{ commandId: string, status: 'running' \| 'stopped' \| 'error' }` | — | Push event |
| `DEV_SERVER_URL` | main→renderer | `{ commandId: string, url: string }` | — | Push event |

**`DevCommand` type:**

```typescript
{
  id: string;
  label: string;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  autoStart?: boolean;
  detectUrl?: boolean;
}
```

**File Location:** `<project>/.pilot/commands.json`

---

### Extensions & Skills

Extension and skill management (list, toggle, remove, import).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `EXTENSIONS_LIST` | renderer→main | — | `InstalledExtension[]` |
| `EXTENSIONS_IMPORT_ZIP` | renderer→main | `zipPath: string, scope: 'global' \| 'project'` | `void` |
| `EXTENSIONS_TOGGLE` | renderer→main | `extensionId: string` | `void` |
| `EXTENSIONS_REMOVE` | renderer→main | `extensionId: string` | `void` |
| `SKILLS_LIST` | renderer→main | — | `InstalledSkill[]` |
| `SKILLS_IMPORT_ZIP` | renderer→main | `zipPath: string, scope: 'global' \| 'project'` | `void` |
| `SKILLS_REMOVE` | renderer→main | `skillId: string` | `void` |

**`InstalledExtension` type:**

```typescript
{
  id: string;
  name: string;
  description: string;
  path: string;
  scope: 'global' | 'project';
  enabled: boolean;
}
```

**File Locations:**

- **Global Extensions:** `<PILOT_DIR>/extensions/`
- **Global Skills:** `<PILOT_DIR>/skills/`
- **Extension Registry:** `<PILOT_DIR>/extension-registry.json`

---

### Prompts

Slash command prompt templates (create, update, delete, fill).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `PROMPTS_GET_ALL` | renderer→main | — | `PromptTemplate[]` |
| `PROMPTS_GET` | renderer→main | `id: string` | `PromptTemplate` |
| `PROMPTS_GET_BY_COMMAND` | renderer→main | `command: string` | `PromptTemplate` |
| `PROMPTS_GET_COMMANDS` | renderer→main | — | `string[]` |
| `PROMPTS_GET_SYSTEM_COMMANDS` | renderer→main | — | `string[]` |
| `PROMPTS_VALIDATE_COMMAND` | renderer→main | `command: string, excludePromptId?: string` | `boolean` |
| `PROMPTS_CREATE` | renderer→main | `input: CreatePromptInput, projectPath?: string` | `PromptTemplate` |
| `PROMPTS_UPDATE` | renderer→main | `id: string, updates: Partial<PromptTemplate>` | `PromptTemplate` |
| `PROMPTS_DELETE` | renderer→main | `id: string` | `void` |
| `PROMPTS_UNHIDE` | renderer→main | `id: string` | `void` |
| `PROMPTS_FILL` | renderer→main | `content: string, values: Record<string, string>` | `string` |
| `PROMPTS_RELOAD` | renderer→main | — | `void` |
| `PROMPTS_CHANGED` | main→renderer | — | — | Push event |

**`PromptTemplate` type:**

```typescript
{
  id: string;
  command: string;
  content: string;
  description?: string;
  variables?: string[];
  scope: 'global' | 'project';
  hidden?: boolean;
}
```

**File Locations:**

- **Global Prompts:** `<PILOT_DIR>/prompts/`
- **Project Prompts:** `<project>/.pilot/prompts/`

---

### Terminal

PTY terminal management via `node-pty`.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `TERMINAL_CREATE` | renderer→main | `cwd?: string, env?: Record<string, string>` | `{ id: string }` |
| `TERMINAL_DATA` | renderer→main | `id: string, data: string` | `void` |
| `TERMINAL_RESIZE` | renderer→main | `id: string, cols: number, rows: number` | `void` |
| `TERMINAL_DISPOSE` | renderer→main | `id: string` | `void` |
| `TERMINAL_SET_MENU_VISIBLE` | renderer→main | `visible: boolean` | `void` |
| `TERMINAL_OUTPUT` | main→renderer | `{ id: string, data: string }` | — | Push event |
| `TERMINAL_EXITED` | main→renderer | `{ id: string, exitCode: number }` | — | Push event |

**Usage Pattern:**

1. Renderer calls `TERMINAL_CREATE` → receives `{ id }`
2. Renderer listens for `TERMINAL_OUTPUT` with that `id`
3. User types → renderer sends `TERMINAL_DATA` with `id` and keystrokes
4. Terminal exits → renderer receives `TERMINAL_EXITED`
5. Renderer calls `TERMINAL_DISPOSE` to cleanup

---

### Subagent

Parallel task execution with subagents (Pi SDK feature).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `SUBAGENT_SPAWN` | renderer→main | `tabId: string, task: string` | `{ subagentId: string }` |
| `SUBAGENT_SPAWN_POOL` | renderer→main | `tabId: string, tasks: string[], concurrency?: number` | `{ poolId: string }` |
| `SUBAGENT_STATUS` | renderer→main | `subagentId: string` | `SubagentStatus` |
| `SUBAGENT_RESULT` | renderer→main | `subagentId: string` | `SubagentResult` |
| `SUBAGENT_ABORT` | renderer→main | `subagentId: string` | `void` |
| `SUBAGENT_ABORT_POOL` | renderer→main | `poolId: string` | `void` |
| `SUBAGENT_EVENT` | main→renderer | `SubagentEvent` | — | Push event |
| `SUBAGENT_POOL_PROGRESS` | main→renderer | `SubagentPoolProgress` | — | Push event |

**`SubagentEvent` type:**

```typescript
{
  subagentId: string;
  type: 'started' | 'progress' | 'completed' | 'failed' | 'aborted';
  message?: string;
  result?: any;
  error?: string;
}
```

**`SubagentPoolProgress` type:**

```typescript
{
  poolId: string;
  total: number;
  completed: number;
  failed: number;
  active: number;
}
```

---

### Companion

Companion app pairing, remote access, tunnel management.

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `COMPANION_GET_STATUS` | renderer→main | — | `CompanionStatus` |
| `COMPANION_ENABLE` | renderer→main | — | `void` |
| `COMPANION_DISABLE` | renderer→main | — | `void` |
| `COMPANION_GENERATE_PIN` | renderer→main | — | `string` (PIN code) |
| `COMPANION_GENERATE_QR` | renderer→main | — | `string` (QR code data URL) |
| `COMPANION_GET_DEVICES` | renderer→main | — | `PairedDevice[]` |
| `COMPANION_REVOKE_DEVICE` | renderer→main | `deviceId: string` | `void` |
| `COMPANION_ENABLE_REMOTE` | renderer→main | — | `void` |
| `COMPANION_DISABLE_REMOTE` | renderer→main | — | `void` |
| `COMPANION_PAIR` | renderer→main | `pin: string` | `void` |
| `COMPANION_GET_TUNNELS` | renderer→main | — | `TunnelInfo[]` |
| `COMPANION_OPEN_TUNNEL` | renderer→main | `localPort: number, remotePort: number` | `string` (tunnel ID) |
| `COMPANION_CHECK_REMOTE` | renderer→main | — | `boolean` (is remote accessible) |
| `COMPANION_REGEN_CERT` | renderer→main | — | `void` |

**`CompanionStatus` type:**

```typescript
{
  enabled: boolean;
  port: number;
  protocol: 'http' | 'https';
  localUrl: string;
  remoteEnabled: boolean;
  remoteUrl?: string;
  pairedDevices: number;
}
```

---

### Shell

OS integration (reveal in Finder, open in terminal/editor, detect apps).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `SHELL_REVEAL_IN_FINDER` | renderer→main | `path: string` | `void` |
| `SHELL_OPEN_IN_TERMINAL` | renderer→main | `path: string` | `void` |
| `SHELL_OPEN_IN_EDITOR` | renderer→main | `path: string, line?: number` | `void` |
| `SHELL_DETECT_EDITORS` | renderer→main | — | `DetectedEditor[]` |
| `SHELL_DETECT_TERMINALS` | renderer→main | — | `DetectedTerminal[]` |

**`DetectedEditor` type:**

```typescript
{
  name: string;
  cliCommand: string;
  installed: boolean;
}
```

**Detected Editors:**

- VS Code (`code`)
- Cursor (`cursor`)
- Zed (`zed`)
- Neovim (`nvim`)
- Vim (`vim`)
- Emacs (`emacs`)
- Sublime Text (`subl`)
- BBEdit (`bbedit`)

---

### Docs

Documentation file reading (Pi SDK integration).

| Channel | Direction | Args | Returns |
|---|---|---|---|
| `DOCS_READ` | renderer→main | `path: string` | `string` |
| `DOCS_LIST` | renderer→main | `directory: string` | `string[]` |

---

## Security Best Practices

### Path Validation

Always validate file paths in IPC handlers before touching disk:

```typescript
import { join, resolve, relative } from 'path';

function isWithinProject(filePath: string, projectRoot: string): boolean {
  const resolved = resolve(projectRoot, filePath);
  const rel = relative(projectRoot, resolved);
  return !rel.startsWith('..') && !rel.startsWith('/');
}
```

Follow the pattern in `electron/services/sandboxed-tools.ts` for jail enforcement.

### Shell Command Execution

Use `execFile` or `spawn` with argument arrays instead of `exec` with interpolated strings:

```typescript
// ✅ Good
import { execFile } from 'child_process';
execFile('git', ['commit', '-m', userMessage], { cwd: projectPath });

// ❌ Bad - shell injection risk
exec(`git commit -m "${userMessage}"`);
```

### API Key Storage

API keys and OAuth tokens are stored in `<PILOT_DIR>/auth.json` with file permissions `0600`. Never log or expose these in error messages.

---

## Common Pitfalls

### Mutating Zustand State

Always return new objects/arrays from `set()`. Never mutate `state.*` in place:

```typescript
// ✅ Good
set((state) => ({
  items: [...state.items, newItem]
}));

// ❌ Bad
set((state) => {
  state.items.push(newItem); // Mutation!
  return state;
});
```

### Memory Leaks in Push Event Listeners

Always return the unsubscribe function from `window.api.on()`:

```typescript
useEffect(() => {
  const unsubscribe = window.api.on(IPC.MY_EVENT, handleEvent);
  return unsubscribe; // Cleanup on unmount
}, []);
```

### Multi-Window Push Events

Push events should be sent to all windows, not just the first:

```typescript
// ✅ Good
BrowserWindow.getAllWindows().forEach(win => {
  win.webContents.send(IPC.MY_EVENT, payload);
});

// ❌ Bad - breaks multi-window support
const mainWindow = BrowserWindow.getAllWindows()[0];
mainWindow?.webContents.send(IPC.MY_EVENT, payload);
```

---

## See Also

- [AGENTS.md](../AGENTS.md) — Project orientation for AI agents
- [PRD.md](PRD.md) — Full product requirements
- [memory.md](memory.md) — Memory system architecture
- [code-review.md](code-review.md) — Known bugs and issues
- [electron.md](electron.md) — Electron 40 API reference

