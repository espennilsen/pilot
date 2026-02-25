# AGENTS.md — Pilot Agent Guide

Quick orientation for AI coding agents working on this codebase.

---

## Read the Docs First

Before searching files manually, read **[docs/INDEX.md](docs/INDEX.md)**. It links to structured documentation covering architecture, data models, IPC reference, configuration, patterns, and glossary. Use those docs to answer "where does X live?" before reaching for grep or find.

Recommended reading order:
1. [docs/OVERVIEW.md](docs/OVERVIEW.md) — what the project is
2. [docs/STRUCTURE.md](docs/STRUCTURE.md) — where things live
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how components connect
4. [docs/GLOSSARY.md](docs/GLOSSARY.md) — domain terminology
5. [docs/PATTERNS.md](docs/PATTERNS.md) — conventions to follow

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
  utils/paths.ts         # Cross-platform path utilities (expandHome, normalizePath, isWithinDir)
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
  INDEX.md               # Documentation index — start here
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
| `WorkspaceStateService` | `services/workspace-state.ts` | Saves and restores tab layout + UI state to `<PILOT_DIR>/workspace.json`. |

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

### Cross-Platform (Windows / macOS / Linux)
All code changes **must** work on Windows, macOS, and Linux. This is a hard requirement.

- **Paths:** Use `path.join()` / `path.resolve()` — never hardcode `/` or `\` separators. Use helpers from `electron/utils/paths.ts` (`expandHome`, `normalizePath`, `isWithinDir`).
- **Line endings:** Don't assume `\n` — use `os.EOL` when writing to disk where it matters. Be tolerant of `\r\n` when reading.
- **Shell commands:** Never assume a specific shell. Use `spawn` / `execFile` with argument arrays. If `shell: true` is needed, keep commands POSIX-compatible or branch per platform. Check `process.platform` for platform-specific logic (`'win32'` | `'darwin'` | `'linux'`).
- **File system:** Paths are case-sensitive on Linux, case-insensitive on Windows/macOS (mostly). Use `normalizePath()` from `electron/utils/paths.ts` for comparisons. Respect `APPDATA`, `XDG_CONFIG_HOME`, etc. — see `pilot-paths.ts`.
- **Keyboard shortcuts:** macOS uses `Meta` (⌘), Windows/Linux use `Ctrl`. The keybinding system handles this — follow the existing patterns in `lib/keybindings.ts`.
- **Native APIs:** Electron APIs like `dialog`, `shell`, `Menu` have platform quirks. Test or guard behind `process.platform` checks when behaviour differs.

### Companion Mode
Pilot supports a **companion client** (mobile/web) that connects over WebSocket and mirrors the desktop UI. Every user-facing feature must consider companion impact.

- **IPC events forwarded to companion:** All `main → renderer` push events are also forwarded via `companionBridge.forwardEvent(channel, data)` in `PilotSessionManager.sendToRenderer()`. If you add a new push channel, it will automatically reach companion clients.
- **New IPC invoke channels:** If you add a new `ipcMain.handle()` that the companion should also be able to call, expose it through the companion REST/WebSocket API.
- **UI-only state:** State that only exists in the renderer (Zustand stores) is **not** synced to companion by default. If companion needs it, add an IPC push event.
- **Serialisation:** Companion payloads must be JSON-serialisable — same Structured Clone constraint as IPC. No functions, class instances, or DOM nodes.
- **Testing companion impact:** When changing agent events, sandbox flow, session management, or any streamed data — verify the companion WebSocket protocol still works. Companion clients rely on the same event shapes.

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
- App-level settings live in the platform config directory — use helpers from `services/pilot-paths.ts` and `services/app-settings.ts`.

### Git
- **Always ask for confirmation** before running `git commit` or `git push`. Show the proposed commit message and list of changed files, then wait for explicit human approval before proceeding.
- Never amend, force-push, or rebase without asking first.

### Error Handling
- IPC handlers that can fail should `throw` — Electron serialises the error and the renderer receives it as a rejected promise. Catch at the call site.
- Silent errors in background tasks (memory extraction, session stat refresh) are acceptable — use `catch(() => {})` only when failure truly doesn't matter.
- Never let background memory extraction crash or block the main conversation thread.

---

## Important File Paths (Runtime)

The app config directory (`<PILOT_DIR>`) is platform-dependent:
- **macOS:** `~/.config/pilot/`
- **Windows:** `%APPDATA%\pilot\`
- **Linux:** `$XDG_CONFIG_HOME/pilot/` (default: `~/.config/pilot/`)

All paths are resolved via `PILOT_APP_DIR` in `services/pilot-paths.ts`.

| Path | Contents |
|---|---|
| `<PILOT_DIR>/auth.json` | API keys and OAuth tokens |
| `<PILOT_DIR>/models.json` | Model registry cache |
| `<PILOT_DIR>/app-settings.json` | Terminal, editor, developer mode, keybind overrides |
| `<PILOT_DIR>/workspace.json` | Saved tab layout and UI state |
| `<PILOT_DIR>/sessions/` | Session `.jsonl` files (managed by Pi SDK) |
| `<PILOT_DIR>/extensions/` | Global extensions |
| `<PILOT_DIR>/skills/` | Global skills |
| `<PILOT_DIR>/extension-registry.json` | Extension enabled/disabled state |
| `<PILOT_DIR>/MEMORY.md` | Global memory |
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

## Dev Commands

```bash
npm run dev        # Electron + Vite HMR — DevTools open automatically
npm run build      # Production build → out/
npm run preview    # Preview production build
```

The app writes all config to `<PILOT_DIR>` — safe to delete that directory to reset to factory defaults.
