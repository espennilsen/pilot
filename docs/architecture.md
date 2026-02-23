# Architecture Overview

Pilot is an **Electron 40 + React 19 + TypeScript** desktop application that wraps the `@mariozechner/pi-coding-agent` SDK in a GUI shell with diff review, git integration, terminal emulation, and companion mobile access.

This document provides a high-level architecture overview for developers working on the codebase.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Framework** | Electron 40 |
| **UI Framework** | React 19 |
| **Language** | TypeScript (strict mode) |
| **Build System** | Vite (via electron-vite) |
| **State Management** | Zustand |
| **AI Agent SDK** | `@mariozechner/pi-coding-agent` |
| **Git Operations** | `simple-git` |
| **Terminal Emulation** | `node-pty` |
| **Companion Server** | Express + WebSocket (`ws`) |
| **Local Discovery** | Bonjour/mDNS (`bonjour-service`) |
| **TLS** | Node.js `tls` module + self-signed certificates |

---

## Process Model

Pilot uses Electron's standard three-process architecture with strict process isolation for security.

### Main Process (`electron/`)

**Full Node.js access** — owns all system operations.

- **Entry Point**: `electron/main/index.ts`
- **Responsibilities**:
  - SDK session lifecycle and streaming
  - File system operations (read, write, watch)
  - Git operations via `simple-git`
  - Shell command execution
  - Terminal PTY management
  - Companion HTTPS + WebSocket server
  - Application lifecycle and window management
- **Structure**:
  - `electron/services/` — Business logic (one class per domain)
  - `electron/ipc/` — IPC handlers (one file per domain)
- **Key Services**: See [Service Architecture](#service-architecture-main-process)

### Preload (`electron/preload/index.ts`)

**Bridge layer** — exposes a controlled API to the renderer.

- **Technology**: Electron's `contextBridge` API
- **Exposes**: `window.api` with three methods:
  - `invoke(channel, ...args)` — Request/response IPC (returns Promise)
  - `on(channel, callback)` — Subscribe to push events (returns unsubscribe function)
  - `send(channel, ...args)` — Fire-and-forget push to main
- **Security**: Never exposes raw Node.js APIs — only the explicit bridge functions

### Renderer (`src/`)

**Pure browser environment** — NO Node.js access.

- **Entry Point**: `src/app.tsx`
- **Framework**: React 19 with Zustand for state management
- **Structure**:
  - `src/stores/` — Zustand stores (one per domain)
  - `src/hooks/` — Lifecycle and event management hooks
  - `src/components/` — UI components (one folder per domain)
  - `src/lib/` — Utilities (IPC client, keybindings, markdown rendering, etc.)
- **Security**: All system calls go through `window.api.invoke()` / `window.api.on()`
- **IPC Client**: Universal client (`src/lib/ipc-client.ts`) works in both Electron and companion browser mode

---

## Data Flow

### Request/Response Pattern

```
User Action → React Component → Zustand Store Action → window.api.invoke(IPC.CHANNEL, args)
    ↓
ipcMain.handle(IPC.CHANNEL, handler) → Service Method → SDK/FS/Git/Shell
    ↓
Return Value → ipcMain response → Promise resolves → Store update → React re-render
```

**Example**: User sends a message to the agent
1. User types in `ChatInput` and hits Enter
2. Component calls `useChatStore.getState().sendMessage()`
3. Store action calls `window.api.invoke(IPC.AGENT_SEND_MESSAGE, { tabId, message })`
4. Main process handler `ipcMain.handle(IPC.AGENT_SEND_MESSAGE, ...)` receives it
5. Handler calls `PilotSessionManager.sendMessage(tabId, message)`
6. Session streams tokens back via push events (see below)

### Push Event Pattern

```
Service Event → BrowserWindow.getAllWindows().forEach(win =>
  win.webContents.send(IPC.PUSH_CHANNEL, payload)
)
    ↓
window.api.on(IPC.PUSH_CHANNEL, callback) → Hook updates store → React re-render
```

**Example**: Agent streams tokens
1. `PilotSessionManager` receives token from SDK
2. Manager calls `BrowserWindow.getAllWindows().forEach(win => win.webContents.send(IPC.AGENT_EVENT, event))`
3. Renderer's `useAgentSession` hook has registered `window.api.on(IPC.AGENT_EVENT, callback)`
4. Hook updates `useChatStore` with new token
5. React re-renders `ChatMessage` with updated content

---

## Key Architectural Decisions

### 1. Sandboxed File Operations

**Problem**: AI-generated code changes can be destructive if applied directly to disk.

**Solution**: All agent-initiated file writes go through a staging layer:

```
Agent executes write/edit → SandboxedTools intercepts → StagedDiffManager stores in memory
    ↓
Renderer receives SANDBOX_STAGED_DIFF event → DiffReview UI shows changes
    ↓
User accepts → applyDiff writes to disk
User rejects → discard (no filesystem touch)
```

**Components**:
- `SandboxedTools` (main) — Wraps SDK file tools, stages diffs instead of writing directly
- `StagedDiffManager` (main) — In-memory store of pending diffs per tab
- `useSandboxStore` (renderer) — Zustand store for diff state
- `DiffReview` component (renderer) — Monaco editor with side-by-side diff

**Yolo Mode**: Bypass review — writes go directly to disk. Configurable per project in `.pilot/settings.json`.

### 2. Two-Tier Memory System

**Problem**: Agent needs context about user preferences, project conventions, and team knowledge.

**Solution**: Two-tier Markdown memory system:

| Tier | Path | Scope | Git-Trackable |
|---|---|---|---|
| **Global** | `~/.config/.pilot/MEMORY.md` | User preferences across all projects | ❌ No |
| **Project** | `<project>/.pilot/MEMORY.md` | Team knowledge, conventions | ✅ Yes |

**Injection**: Both tiers are concatenated and injected into the agent's system prompt when a session starts.

**Extraction**: Background process analyzes conversations and extracts reusable information to the appropriate tier.

See `docs/memory.md` for full details.

### 3. Universal IPC Client

**Problem**: Same React UI needs to run in both Electron (desktop) and browser (companion mobile access).

**Solution**: Universal IPC client (`src/lib/ipc-client.ts`) with dual modes:

```typescript
// Electron mode (window.api exists)
invoke(channel, args) → window.api.invoke(channel, args)

// Companion mode (window.api does not exist)
invoke(channel, args) → WebSocket.send({ type: 'invoke', channel, args })
```

The client auto-detects the environment and routes accordingly. Stores and hooks use the same API regardless of mode.

### 4. Tab-Based Session Model

**Concept**: Each tab represents one agent session. Tabs can be associated with projects.

**Components**:
- `useTabStore` (renderer) — Tab list, active tab, closed-tab stack
- `PilotSessionManager` (main) — SDK `AgentSession` instances per tab
- `WorkspaceStateService` (main) — Saves/restores tab layout to `~/.config/.pilot/workspace.json`

**Lifecycle**:
1. User creates a tab → `TAB_CREATE` → Main creates session → Renderer adds tab to store
2. User switches tabs → `setActiveTab()` → UI updates
3. User sends message → `AGENT_SEND_MESSAGE` with `tabId` → Routed to correct session
4. User closes tab → `TAB_CLOSE` → Session disposed, tab moved to closed-tab stack (can be restored)

### 5. Project Jail

**Problem**: Agent should not write files outside the project directory.

**Solution**: `SandboxedTools` validates all file paths against the project root:

```typescript
const isWithinProject = (filePath: string, projectRoot: string): boolean => {
  const resolved = path.resolve(projectRoot, filePath);
  return resolved.startsWith(projectRoot);
};
```

Paths that escape the project root are rejected. Optional allowed paths can be configured in `.pilot/settings.json`.

### 6. Service Injection Pattern

**Problem**: Services need to share state and dependencies (e.g., `MemoryManager` instance used by both session creation and UI updates).

**Solution**: Services are instantiated once in `electron/main/index.ts` and injected into IPC handlers:

```typescript
// electron/main/index.ts
const memoryManager = new MemoryManager();
const sessionManager = new PilotSessionManager(memoryManager);

registerMemoryIpc(memoryManager);
registerAgentIpc(sessionManager);
```

Ensures single source of truth for shared state.

---

## Service Architecture (Main Process)

Services are instantiated in `electron/main/index.ts` and injected into IPC handlers. One service per domain.

| Service | File | Responsibility |
|---|---|---|
| **PilotSessionManager** | `pi-session-manager.ts` | SDK `AgentSession` lifecycle per tab. Creates, continues, disposes sessions. Forwards SDK events to renderer. |
| **SandboxedTools** | `sandboxed-tools.ts` | Wraps SDK file tools. Stages diffs for review, enforces project jail, handles bash approval. |
| **StagedDiffManager** | `staged-diffs.ts` | In-memory store of pending diffs per tab. Accept/reject applies or discards. |
| **GitService** | `git-service.ts` | Thin `simple-git` wrapper. One instance per active project. |
| **MemoryManager** | `memory-manager.ts` | Reads/writes two-tier Markdown memory files (global + project). Builds system prompt injection. |
| **DevCommandsService** | `dev-commands.ts` | Spawns/kills child processes for dev commands. Streams stdout/stderr to renderer. |
| **TerminalService** | `terminal-service.ts` | PTY management via `node-pty`. Handles terminal creation, resize, input, kill. |
| **ExtensionManager** | `extension-manager.ts` | Lists/toggles/removes extensions and skills from `~/.config/.pilot/extensions/` and `~/.config/.pilot/skills/`. |
| **WorkspaceStateService** | `workspace-state.ts` | Saves and restores tab layout + UI state to `~/.config/.pilot/workspace.json`. |
| **CompanionServer** | `companion-server.ts` | HTTPS + WebSocket server for mobile companion access. |
| **CompanionAuth** | `companion-auth.ts` | PIN/QR pairing, session token generation/validation. |
| **CompanionDiscovery** | `companion-discovery.ts` | mDNS/Bonjour advertisement for local network discovery. |

**Pattern**: Services follow a standard structure:
- Constructor takes dependencies (injected from main)
- Public methods for operations
- Emit events or call callbacks for async results (never return promises from service methods called by IPC)
- No direct IPC handling (that lives in `electron/ipc/<domain>.ts`)

---

## Store Architecture (Renderer)

Zustand stores follow strict conventions for immutability and separation of concerns.

| Store | File | Owns |
|---|---|---|
| **TabStore** | `tab-store.ts` | Tab list, active tab, closed-tab stack, project grouping |
| **ChatStore** | `chat-store.ts` | Messages per tab, streaming state, model info, token counts |
| **SandboxStore** | `sandbox-store.ts` | Staged diffs per tab, yolo mode, auto-accept per tool |
| **GitStore** | `git-store.ts` | Git status, branches, commit log, blame, stashes |
| **ProjectStore** | `project-store.ts` | Current project path, file tree, file preview/edit |
| **UIStore** | `ui-store.ts` | Sidebar/panel visibility, settings modal, terminal tabs, scratch pad |
| **SessionStore** | `session-store.ts` | Historical sessions list for sidebar |
| **AppSettingsStore** | `app-settings-store.ts` | Developer mode, keybind overrides, terminal/editor preferences |
| **MemoryStore** | `memory-store.ts` | Memory count badge, last-update pulse |

### Store Conventions

1. **Immutability** — Always return new objects/arrays from `set()`. Never mutate `state.*` in place.

   ```typescript
   // ❌ BAD
   set(state => {
     state.tabs[0].title = 'New Title';
     return state;
   });

   // ✅ GOOD
   set(state => ({
     tabs: state.tabs.map((tab, i) =>
       i === 0 ? { ...tab, title: 'New Title' } : tab
     )
   }));
   ```

2. **Computed Values** — Derive in selectors, not in components.

   ```typescript
   // Store
   export const useTabStore = create<TabStore>((set, get) => ({
     tabs: [],
     activeTabId: null,
     getActiveTab: () => get().tabs.find(t => t.id === get().activeTabId),
     getGroupedTabs: () => { /* grouping logic */ }
   }));

   // Component
   const activeTab = useTabStore(state => state.getActiveTab());
   ```

3. **IPC Calls in Actions** — IPC calls belong in store actions or hooks, never in JSX event handlers.

   ```typescript
   // ❌ BAD
   <button onClick={() => window.api.invoke(IPC.TAB_CREATE)}>New Tab</button>

   // ✅ GOOD
   const createTab = useTabStore(state => state.createTab);
   <button onClick={createTab}>New Tab</button>
   ```

4. **External Access** — Use `useStore.getState()` to access stores outside React components.

   ```typescript
   // In a hook or utility function
   const currentProject = useProjectStore.getState().projectPath;
   ```

---

## Security Model

Pilot follows Electron security best practices:

### Process Isolation

- **`contextIsolation: true`** — Renderer has no direct access to Electron or Node.js APIs
- **`sandbox: true`** — Renderer runs in a sandboxed environment
- **`nodeIntegration: false`** — Node.js is disabled in renderer
- **No remote module** — All IPC goes through explicit `contextBridge` API

### File System Access

- **Project Jail** — All file paths validated against project root before any FS operation
- **Path Resolution** — Always `path.resolve()` before checking, to prevent `..` escapes
- **Optional Allowed Paths** — Configurable in `.pilot/settings.json` for multi-repo workflows

### Shell Execution

- **Use `execFile` / `spawn`** — Never `exec` with interpolated strings
- **Argument Arrays** — Pass arguments as arrays, not concatenated strings
- **No Shell Interpolation** — Use `shell: false` option

```typescript
// ❌ BAD
exec(`git commit -m "${message}"`); // Shell injection risk

// ✅ GOOD
execFile('git', ['commit', '-m', message], { shell: false });
```

### IPC Payloads

- **Structured Clone Serializable** — No functions, class instances, or DOM nodes
- **Validate on Receipt** — IPC handlers validate payload shape before processing
- **Never Pass Callbacks** — Use push events for async results

### Companion Server

- **TLS Required** — HTTPS + WSS only, no plaintext HTTP
- **Certificate Pinning** — Client verifies server certificate fingerprint
- **Session Tokens** — PIN/QR pairing generates time-limited tokens
- **Rate Limiting** — Pairing endpoint rate-limited to prevent brute force

See `docs/companion-api.md` for full companion security details.

---

## IPC Architecture

All IPC channels are defined as constants in `shared/ipc.ts`. All payload types are in `shared/types.ts`.

### Adding a New IPC Call

**Checklist**:
1. Add constant to `shared/ipc.ts`
2. Add types to `shared/types.ts` (if needed)
3. Register handler in `electron/ipc/<domain>.ts` → `ipcMain.handle(IPC.NEW_CHANNEL, ...)`
4. Call from renderer via `window.api.invoke(IPC.NEW_CHANNEL, ...)`
5. Update store or hook to use the new call

**Example**: Add a new git operation

```typescript
// 1. shared/ipc.ts
export const IPC = {
  // ... existing
  GIT_CREATE_BRANCH: 'git:create-branch',
} as const;

// 2. shared/types.ts
export interface GitCreateBranchRequest {
  projectPath: string;
  branchName: string;
  startPoint?: string;
}

// 3. electron/ipc/git.ts
export function registerGitIpc(gitService: GitService) {
  ipcMain.handle(IPC.GIT_CREATE_BRANCH, async (event, req: GitCreateBranchRequest) => {
    const git = await gitService.getGitInstance(req.projectPath);
    await git.checkoutBranch(req.branchName, req.startPoint || 'HEAD');
  });
}

// 4. src/stores/git-store.ts
export const useGitStore = create<GitStore>((set, get) => ({
  // ... existing
  createBranch: async (branchName: string, startPoint?: string) => {
    const projectPath = useProjectStore.getState().projectPath;
    if (!projectPath) return;
    await window.api.invoke(IPC.GIT_CREATE_BRANCH, { projectPath, branchName, startPoint });
    // Refresh git state
    await get().refresh();
  }
}));
```

---

## Directory Structure

```
PiLot/
├── electron/                       # Main process (Node.js)
│   ├── main/
│   │   └── index.ts                # App entry — service init, IPC registration, window creation
│   ├── preload/
│   │   └── index.ts                # contextBridge — exposes window.api
│   ├── ipc/                        # IPC handlers (one file per domain)
│   │   ├── agent.ts                # Agent session IPC
│   │   ├── auth.ts                 # Authentication IPC (API keys, OAuth)
│   │   ├── companion.ts            # Companion server control
│   │   ├── dev-commands.ts         # Dev command spawning
│   │   ├── extensions.ts           # Extension/skill management
│   │   ├── git.ts                  # Git operations
│   │   ├── memory.ts               # Memory system
│   │   ├── model.ts                # Model management
│   │   ├── prompts.ts              # Prompt templates
│   │   ├── sandbox.ts              # Sandbox/diff review
│   │   ├── session.ts              # Session management
│   │   ├── settings.ts             # Settings persistence
│   │   ├── tasks.ts                # Task management (future)
│   │   ├── terminal.ts             # Terminal PTY
│   │   └── updates.ts              # Auto-update (future)
│   └── services/                   # Business logic (one class per domain)
│       ├── pi-session-manager.ts   # SDK session lifecycle
│       ├── sandboxed-tools.ts      # File tool interception + staging
│       ├── staged-diffs.ts         # In-memory diff store
│       ├── git-service.ts          # simple-git wrapper
│       ├── memory-manager.ts       # Two-tier memory system (global + project)
│       ├── dev-commands.ts         # Child process spawning for dev commands
│       ├── terminal-service.ts     # node-pty wrapper
│       ├── extension-manager.ts    # Extension/skill discovery
│       ├── workspace-state.ts      # Tab layout persistence
│       ├── pilot-paths.ts          # Path utilities (~/.config/.pilot/*)
│       ├── app-settings.ts         # App settings persistence
│       ├── companion-server.ts     # HTTPS + WebSocket server
│       ├── companion-auth.ts       # PIN/QR pairing, tokens
│       ├── companion-discovery.ts  # mDNS/Bonjour advertisement
│       ├── companion-ipc-bridge.ts # Bridge IPC to WebSocket clients
│       └── companion-tls.ts        # Certificate generation + management
├── shared/                         # Shared between main and renderer
│   ├── ipc.ts                      # IPC channel constants (single source of truth)
│   └── types.ts                    # Serializable types used across IPC
├── src/                            # Renderer process (React)
│   ├── app.tsx                     # Root component — keyboard shortcuts, lifecycle
│   ├── components/                 # UI components (one folder per domain)
│   │   ├── chat/                   # Chat UI
│   │   ├── diff-review/            # Diff review UI (Monaco side-by-side)
│   │   ├── sidebar/                # Sidebar (tabs, sessions, git)
│   │   ├── terminal/               # Terminal UI (xterm.js)
│   │   ├── settings/               # Settings modal
│   │   ├── project/                # Project file tree + editor
│   │   └── ...
│   ├── stores/                     # Zustand stores (one file per domain)
│   │   ├── tab-store.ts            # Tab list, active tab
│   │   ├── chat-store.ts           # Messages per tab
│   │   ├── sandbox-store.ts        # Staged diffs per tab
│   │   ├── git-store.ts            # Git status
│   │   ├── project-store.ts        # File tree, project path
│   │   ├── ui-store.ts             # Panel visibility
│   │   ├── session-store.ts        # Historical sessions
│   │   ├── app-settings-store.ts   # Developer mode, keybinds
│   │   └── memory-store.ts         # Memory badge
│   ├── hooks/                      # React hooks
│   │   ├── useAgentSession.ts      # Listen for agent events, update chat store
│   │   ├── useSandboxEvents.ts     # Listen for staged diffs
│   │   ├── useWorkspacePersistence.ts # Save/restore tab layout
│   │   ├── useKeyboardShortcuts.ts # Global keyboard shortcuts
│   │   ├── useAuthEvents.ts        # OAuth flow events
│   │   └── useFileWatcher.ts       # Reload file tree on FS changes
│   └── lib/                        # Utilities
│       ├── ipc-client.ts           # Universal IPC client (Electron + companion)
│       ├── keybindings.ts          # Keyboard shortcut utilities
│       ├── markdown.tsx            # Markdown rendering (react-markdown)
│       └── utils.ts                # General utilities
├── docs/                           # Documentation
│   ├── AGENTS.md                   # Quick orientation (this file)
│   ├── PRD.md                      # Product requirements
│   ├── architecture.md             # Architecture overview (you are here)
│   ├── electron.md                 # Electron 40 API sitemap
│   ├── memory.md                   # Memory system deep-dive
│   ├── code-review.md              # Code review — bugs, issues, action plan
│   ├── companion-api.md            # Companion API spec
│   ├── companion-implementation.md # Companion implementation guide
│   ├── user/                       # User-facing guides
│   └── diary/                      # Development diary
├── electron-builder.json           # Electron Builder config
├── electron-vite.config.ts         # electron-vite config
├── package.json                    # Dependencies, scripts
└── tsconfig.json                   # TypeScript config
```

---

## Build & Development

```bash
npm run dev        # Electron + Vite HMR — DevTools open automatically
npm run build      # Production build → out/
npm run preview    # Preview production build
```

**Config Files**:
- `~/.config/.pilot/` — All app data (auth, settings, sessions, workspace, extensions, memory)
- `<project>/.pilot/` — Project-specific settings (jail, commands, shared memory)

**Resetting State**: `rm -rf ~/.config/.pilot/` — safe to do at any time (will require re-auth).

---

## Testing

**Current State**: No automated tests yet. Manual testing via `npm run dev`.

**Future**:
- Unit tests for services (Jest or Vitest)
- Integration tests for IPC flows (mock renderer ↔ main)
- E2E tests for full user flows (Playwright or Spectron successor)

---

## Related Documentation

| Document | What's in it |
|---|---|
| **AGENTS.md** | Quick orientation for AI coding agents |
| **PRD.md** | Full product requirements, SDK integration patterns |
| **electron.md** | Electron 40 API sitemap with canonical URLs |
| **memory.md** | Memory system architecture, file formats, extraction flow |
| **code-review.md** | Code review — bugs, issues, security observations |
| **companion-api.md** | Companion API spec (HTTPS + WebSocket) |
| **companion-implementation.md** | Companion implementation guide |

---

## Contributing

When adding features or fixing bugs:

1. **Read before writing** — Understand existing code before making changes
2. **Minimal, focused changes** — Don't refactor unrelated code
3. **Follow conventions** — Match the style and patterns in this doc
4. **Test manually** — Run `npm run dev` and verify your changes
5. **Update docs** — If you change architecture, update this file

**Adding a new domain**:
1. Service in `electron/services/<domain>.ts`
2. IPC handlers in `electron/ipc/<domain>.ts`
3. Store in `src/stores/<domain>-store.ts`
4. Components in `src/components/<domain>/`
5. Hook (if needed) in `src/hooks/use<Domain>.ts`
6. IPC constants in `shared/ipc.ts`
7. Types in `shared/types.ts`

---

**Questions?** Check `docs/code-review.md` for known issues, or read the SDK docs at `node_modules/@mariozechner/pi-coding-agent/README.md`.
