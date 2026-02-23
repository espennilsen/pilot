# AGENTS.md — Pilot Agent Guide

Quick orientation for AI coding agents working on this codebase.

---

## What This Project Is

Pilot is an **Electron 40 + React 19 + TypeScript** desktop app that wraps the `@mariozechner/pi-coding-agent` SDK in a GUI shell. Users chat with an AI agent, review diffs before they touch disk, manage git, and run dev commands — all from one keyboard-driven app.

The SDK runs in the **main process** and owns sessions, streaming, tool execution, auth, and persistence. The React renderer communicates with it over a typed IPC bridge. Nothing in the renderer touches Node.js directly.

---

## Repository Layout

```
electron/
  main/index.ts          # App entry — creates window, initialises services, registers IPC
  preload/index.ts       # contextBridge — exposes window.api to renderer
  ipc/                   # One file per domain: agent, auth, git, model, sandbox, session, …
  services/              # Business logic: PilotSessionManager, GitService, MemoryManager, …
  utils/                 # (empty — reserved)
shared/
  ipc.ts                 # All IPC channel name constants (the IPC contract)
  types.ts               # All serialisable types used across the process boundary
src/
  app.tsx                # Root component — keyboard shortcuts, tab↔project sync, lifecycle
  components/            # React UI, one sub-folder per domain
  stores/                # Zustand stores, one file per domain
  hooks/                 # useAgentSession, useSandboxEvents, useWorkspacePersistence, …
  lib/                   # ipc-client.ts, keybindings.ts, markdown.tsx, utils.ts, …
docs/
  README.md              # Documentation index — links to all docs
  PRD.md                 # Full product requirements and SDK integration details
  architecture.md        # High-level architecture overview
  ipc-reference.md       # Complete IPC channel reference
  services.md            # Main process services reference
  stores-and-hooks.md    # Renderer stores and hooks reference
  development.md         # Developer setup, conventions, debugging
  settings.md            # Settings layers, schemas, IPC reference
  memory.md              # Memory system deep-dive
  companion-api.md       # Companion client API spec
  companion-implementation.md  # Companion desktop implementation spec
  code-review.md         # Code review — known bugs, issues, action plan
  user/                  # User-facing guides (12 files)
```

---

## Process Model — The Golden Rule

| Process | Has Node? | Rule |
|---|---|---|
| **Main** (`electron/`) | ✅ Yes | All file system, SDK, git, and shell operations live here |
| **Preload** | ✅ Limited | Only `contextBridge.exposeInMainWorld` — expose `window.api`, nothing else |
| **Renderer** (`src/`) | ❌ No | All system calls go through `window.api.invoke` / `window.api.on` |

Never import `fs`, `path`, `child_process`, or `electron` into renderer code. Never use `nodeIntegration: true`.

---

## How IPC Works

Every channel name is a constant in `shared/ipc.ts`. Use those constants everywhere — never raw strings.

```
shared/ipc.ts           ← single source of truth for channel names
shared/types.ts         ← single source of truth for payload shapes

electron/ipc/<domain>.ts  ← ipcMain.handle(IPC.FOO, handler)
src/stores/<domain>.ts    ← window.api.invoke(IPC.FOO, args)
```

**Adding a new IPC call — checklist:**
1. Add the constant to `shared/ipc.ts`
2. Add any new payload types to `shared/types.ts`
3. Register `ipcMain.handle(IPC.NEW_CHANNEL, ...)` in the appropriate `electron/ipc/<domain>.ts`
4. Call from the renderer via `window.api.invoke(IPC.NEW_CHANNEL, ...)`
5. Register the handler in `electron/main/index.ts` if it requires a service instance

**Push from main → renderer:**
```typescript
// main process
BrowserWindow.getAllWindows().forEach(win =>
  win.webContents.send(IPC.MY_PUSH_CHANNEL, payload)
);

// renderer
window.api.on(IPC.MY_PUSH_CHANNEL, (payload) => { ... });
// api.on() returns an unsubscribe function — always call it in useEffect cleanup
```

---

## Key Services (Main Process)

| Service | File | Role |
|---|---|---|
| `PilotSessionManager` | `services/pi-session-manager.ts` | Owns the SDK `AgentSession` per tab. Creates, continues, and disposes sessions. Forwards events to renderer. |
| `SandboxedTools` | `services/sandboxed-tools.ts` | Wraps SDK file tools — stages diffs for review, enforces project jail, handles bash approval. |
| `StagedDiffManager` | `services/staged-diffs.ts` | In-memory store of pending diffs per tab. Accept/reject applies or discards them. |
| `GitService` | `services/git-service.ts` | Thin `simple-git` wrapper. One instance per active project. |
| `MemoryManager` | `services/memory-manager.ts` | Reads/writes two-tier Markdown memory files. Builds system prompt injection. |
| `DevCommandsService` | `services/dev-commands.ts` | Spawns/kills child processes for dev commands. Streams output to renderer. |
| `TerminalService` | `services/terminal-service.ts` | PTY management via `node-pty`. |
| `ExtensionManager` | `services/extension-manager.ts` | Lists/toggles/removes extensions and skills from disk. |
| `WorkspaceStateService` | `services/workspace-state.ts` | Saves and restores tab layout + UI state to `~/.config/.pilot/workspace.json`. |

---

## Key Stores (Renderer)

| Store | File | Owns |
|---|---|---|
| `useTabStore` | `stores/tab-store.ts` | Tab list, active tab, closed-tab stack, project grouping |
| `useChatStore` | `stores/chat-store.ts` | Messages per tab, streaming state, model info, token counts |
| `useSandboxStore` | `stores/sandbox-store.ts` | Staged diffs per tab, yolo mode, auto-accept per tool |
| `useGitStore` | `stores/git-store.ts` | Git status, branches, commit log, blame, stashes |
| `useProjectStore` | `stores/project-store.ts` | Current project path, file tree, file preview/edit |
| `useUIStore` | `stores/ui-store.ts` | Sidebar/panel visibility, settings modal, terminal tabs, scratch pad |
| `useSessionStore` | `stores/session-store.ts` | Historical sessions list for sidebar |
| `useAppSettingsStore` | `stores/app-settings-store.ts` | Developer mode, keybind overrides |
| `useMemoryStore` | `stores/memory-store.ts` | Memory count badge, last-update pulse |

---

## Key Hooks

| Hook | File | Does |
|---|---|---|
| `useAgentSession` | `hooks/useAgentSession.ts` | Listens for `AGENT_EVENT` push events, updates chat store. Exposes `sendMessage`, `abortAgent`, `cycleModel`, etc. |
| `useSandboxEvents` | `hooks/useSandboxEvents.ts` | Listens for `SANDBOX_STAGED_DIFF` push events, feeds `useSandboxStore`. |
| `useWorkspacePersistence` | `hooks/useWorkspacePersistence.ts` | Restores workspace on mount, auto-saves on tab/UI change (debounced 500ms). |
| `useKeyboardShortcuts` | `hooks/useKeyboardShortcut.ts` | Global keydown handler. Skips when focus is in an input/textarea. |
| `useAuthEvents` | `hooks/useAuthEvents.ts` | Listens for OAuth flow events from main. |
| `useFileWatcher` | `hooks/useFileWatcher.ts` | Reloads file tree on `PROJECT_FS_CHANGED` push. |

---

## Conventions & Best Practices

### TypeScript
- **No `any`** in new code — use SDK types or define proper interfaces in `shared/types.ts`.
- **Static imports only** — no dynamic `require()` in either process.
- Types shared across the process boundary live in `shared/types.ts`. Types that are internal to one side stay local.

### IPC
- All channel names are constants from `shared/ipc.ts` — never raw strings.
- IPC payloads must be **Structured Clone serialisable**: no functions, no class instances, no DOM nodes. Plain objects, arrays, primitives only.
- Main-to-renderer pushes use `BrowserWindow.getAllWindows()` — do not assume a single window.

### Zustand
- **Immutability** — always return new objects/arrays from `set()`. Never mutate `state.*` in place.
- Derive computed values in selectors (`getGroupedTabs`, `getPendingDiffs`), not in components.
- Access stores outside React (in hooks/effects) via `useStore.getState()`, not the hook.

### Electron Security
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` — never change these.
- Validate file paths in IPC handlers before touching disk. Resolve against the project root and reject paths that escape it (follow the pattern in `sandboxed-tools.ts` → `isWithinProject`).
- Use `execFile` / `spawn` with argument arrays instead of `exec` with interpolated strings.

### File Operations
- All agent-initiated file writes go through `SandboxedTools` → `StagedDiffManager`. Do not write files directly from IPC handlers on behalf of the agent.
- Project settings live in `<project>/.pilot/` — create the directory if missing before writing.
- App-level settings live in `~/.config/.pilot/` — use helpers from `services/pilot-paths.ts` and `services/app-settings.ts`.

### Error Handling
- IPC handlers that can fail should `throw` — Electron serialises the error and the renderer receives it as a rejected promise. Catch at the call site.
- Silent errors in background tasks (memory extraction, session stat refresh) are acceptable — use `catch(() => {})` only when failure truly doesn't matter.
- Never let background memory extraction crash or block the main conversation thread.

---

## Important File Paths (Runtime)

| Path | Contents |
|---|---|
| `~/.config/.pilot/auth.json` | API keys and OAuth tokens |
| `~/.config/.pilot/models.json` | Model registry cache |
| `~/.config/.pilot/app-settings.json` | Terminal, editor, developer mode, keybind overrides |
| `~/.config/.pilot/workspace.json` | Saved tab layout and UI state |
| `~/.config/.pilot/sessions/` | Session `.jsonl` files (managed by Pi SDK) |
| `~/.config/.pilot/extensions/` | Global extensions |
| `~/.config/.pilot/skills/` | Global skills |
| `~/.config/.pilot/extension-registry.json` | Extension enabled/disabled state |
| `~/.config/.pilot/MEMORY.md` | Global memory |
| `<project>/.pilot/settings.json` | Jail, yolo mode, allowed paths |
| `<project>/.pilot/commands.json` | Dev command buttons |
| `<project>/.pilot/MEMORY.md` | Project memory (can be git-tracked) |

---

## Adding a New Feature — Workflow

### New IPC domain (e.g., "notifications")

1. Add constants to `shared/ipc.ts`: `NOTIFICATIONS_SEND`, `NOTIFICATIONS_LIST`, …
2. Add types to `shared/types.ts` if new payloads are needed.
3. Create `electron/ipc/notifications.ts` with `registerNotificationsIpc(...)`.
4. Create `electron/services/notification-service.ts` if business logic is needed.
5. Register in `electron/main/index.ts`: instantiate service, call `registerNotificationsIpc(service)`.
6. Create `src/stores/notification-store.ts` with Zustand.
7. Call from components via `window.api.invoke(IPC.NOTIFICATIONS_SEND, ...)`.

### New UI panel or component

- One folder per domain under `src/components/<domain>/`.
- State in a store, not component-local `useState`, unless it's truly ephemeral UI state.
- IPC calls belong in the store or a hook, not inside JSX event handlers.
- Use `useEffect` with a returned unsubscribe for `window.api.on(...)` listeners.

### Extending the agent sandbox

- Edit `electron/services/sandboxed-tools.ts` to intercept additional tool types.
- Add the new diff operation type to `StagedDiff['operation']` in `shared/types.ts`.
- Handle the new operation in `applyDiff` in `electron/ipc/sandbox.ts`.

---

## Known Issues (see `docs/code-review.md` for full details)

| Severity | Location | Summary |
|---|---|---|
| 🔴 Critical | `electron/ipc/sandbox.ts` | `readFileSync` used but not imported — ReferenceError when accepting an edit diff |
| 🔴 Critical | `main/index.ts` + `pi-session-manager.ts` | Two separate `MemoryManager` instances — UI writes not seen by session prompt injection |
| 🔴 Critical | `electron/ipc/sandbox.ts` | `SANDBOX_TOGGLE_YOLO` always returns `{ yoloMode: true }` — toggle is a no-op in main |
| 🔴 Critical | `pi-session-manager.ts` `listAllSessions` | Path decoding replaces all `-` with `/` — breaks hyphenated project names |
| 🟠 High | `pi-session-manager.ts` | `createSession` / `openSession` are ~80% duplicated |
| 🟠 High | `electron/ipc/git.ts` | Module-level `currentGitService` breaks multi-project git operations |
| 🟠 High | `stores/tab-store.ts` `moveTab` | Mutates Zustand state objects in place |
| 🟠 High | `electron/ipc/agent.ts` | Dynamic `require('electron')` inside handler — use static import |
| 🟠 High | `electron/ipc/settings.ts` | `settings:set-project-path` never emitted → `SETTINGS_UPDATE` silently no-ops |

---

## Dev Commands

```bash
npm run dev        # Electron + Vite HMR — DevTools open automatically
npm run build      # Production build → out/
npm run preview    # Preview production build
```

The app writes all config to `~/.config/.pilot/` — safe to `rm -rf` that directory to reset to factory defaults.

---

## Further Reading

| Document | What's in it |
|---|---|
| `docs/README.md` | Documentation index — links to all docs |
| `docs/PRD.md` | Full product requirements, SDK integration patterns, data models |
| `docs/architecture.md` | High-level architecture — process model, data flow, tech stack, key decisions |
| `docs/ipc-reference.md` | Complete IPC channel reference — every channel, direction, args, returns |
| `docs/services.md` | Main process services — all service classes, methods, responsibilities |
| `docs/stores-and-hooks.md` | Renderer state — all Zustand stores and React hooks with full API |
| `docs/settings.md` | Settings layers, storage locations, schemas, IPC reference |
| `docs/memory.md` | Memory system architecture, file formats, extraction flow |
| `docs/development.md` | Setup, scripts, adding features, conventions, debugging |
| `docs/companion.md` | Companion client API — protocol, WebSocket messages, REST endpoints |
| `docs/code-review.md` | Full code review — bugs, issues, security observations, action plan |
| `docs/user/` | User-facing guides — sessions, agent, memory, tasks, settings, companion |
