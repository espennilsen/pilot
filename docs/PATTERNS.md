# Patterns & Conventions

> Last updated: 2026-02-24

Pilot is an Electron + React + TypeScript app with strict process isolation. The patterns below are enforced throughout the codebase and must be followed when adding new code.

## Naming Conventions

| Entity | Convention | Example |
|--------|------------|---------|
| IPC channel constants | `SCREAMING_SNAKE` in `IPC` object | `IPC.AGENT_PROMPT` |
| Service classes | `PascalCase` + noun | `PilotSessionManager` |
| IPC handler files | `kebab-case`, domain-named | `electron/ipc/agent.ts` |
| Service files | `kebab-case` | `electron/services/pi-session-manager.ts` |
| Zustand stores | `camelCase` hook, `PascalCase` interface | `useTabStore`, `TabStore` |
| Store files | `<domain>-store.ts` | `src/stores/tab-store.ts` |
| React hooks | `use<Domain>` | `useAgentSession` |
| Component folders | `kebab-case`, domain-named | `src/components/diff-review/` |
| Shared types | `PascalCase` interface | `StagedDiff`, `SessionMetadata` |

## IPC Pattern

All inter-process communication follows a strict three-file pattern:

1. **`shared/ipc.ts`** — Add a new constant to the `IPC` object.
2. **`electron/ipc/<domain>.ts`** — Register `ipcMain.handle(IPC.NEW_CHANNEL, handler)`.
3. **`src/stores/<domain>-store.ts`** — Call `window.api.invoke(IPC.NEW_CHANNEL, args)`.

Never:
- Use raw channel name strings (always `IPC.CONSTANT`).
- Call `window.api.invoke()` inside JSX event handlers — call a store action instead.
- Import from `electron/` in `src/`, or vice versa.

```typescript
// ✅ GOOD — store action calls IPC
const createTab = useTabStore(state => state.createTab);
<button onClick={createTab}>New Tab</button>

// ❌ BAD — JSX handler calls IPC directly
<button onClick={() => window.api.invoke(IPC.TAB_CREATE)}>New Tab</button>
```

## Push Events

Main → renderer push events use `BrowserWindow.getAllWindows().forEach(...)` (never assume a single window):

```typescript
// electron/services/my-service.ts
import { BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc';

BrowserWindow.getAllWindows().forEach(win => {
  win.webContents.send(IPC.MY_EVENT, payload);
});
```

In the renderer, always return the unsubscribe function from `useEffect`:

```typescript
useEffect(() => {
  const unsub = window.api.on(IPC.MY_EVENT, (payload) => { /* ... */ });
  return unsub; // cleanup on unmount — prevents memory leaks
}, []);
```

## Zustand Store Conventions

**Immutability** — always return new objects/arrays from `set()`:

```typescript
// ✅ GOOD
set(state => ({
  tabs: state.tabs.map(t => t.id === id ? { ...t, title: newTitle } : t)
}));

// ❌ BAD — mutates state
set(state => {
  state.tabs[0].title = newTitle;
  return state;
});
```

**Computed values** belong in store selectors, not in components:

```typescript
// Store
getActiveTab: () => get().tabs.find(t => t.id === get().activeTabId),

// Component
const activeTab = useTabStore(state => state.getActiveTab());
```

**External access** (from hooks or utilities, not React components):

```typescript
const project = useProjectStore.getState().projectPath;
```

## Service Pattern (Main Process)

Services follow a consistent structure:

```typescript
export class MyService {
  constructor(private dep: OtherService) {}

  // Public methods for operations
  async doThing(arg: string): Promise<Result> { ... }

  // Emit events for async results — don't return promises from event-driven flows
  private notifyRenderer(payload: MyPayload) {
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send(IPC.MY_EVENT, payload)
    );
  }
}
```

Services are instantiated once in `electron/main/index.ts` and injected:

```typescript
const memManager = new MemoryManager();
const sessionManager = new PilotSessionManager(memManager);
registerAgentIpc(sessionManager);
registerMemoryIpc(memManager);
```

## Error Handling

- **IPC handlers**: `throw` on failure — Electron serializes the error; renderer receives a rejected Promise. Catch at the call site.
- **Background tasks** (memory extraction, session stat refresh): Silent errors are acceptable. Use `.catch(() => {})` only when failure truly doesn't matter.
- **Never** let background tasks crash or block the main conversation thread.

## File System Safety

All file paths in IPC handlers must be validated before touching disk:

```typescript
import { resolve, relative } from 'path';

function isWithinProject(filePath: string, projectRoot: string): boolean {
  const resolved = resolve(projectRoot, filePath);
  const rel = relative(projectRoot, resolved);
  return !rel.startsWith('..') && !resolve(filePath).startsWith('/');
}
```

Follow the pattern in `electron/services/sandboxed-tools.ts`. Use `execFile`/`spawn` with argument arrays — never `exec` with interpolated strings.

## Cross-Platform

- Use `path.join()` / `path.resolve()` — never hardcode `/` or `\\` separators.
- Use helpers from `electron/utils/paths.ts` (`expandHome`, `normalizePath`, `isWithinDir`).
- Check `process.platform` (`'win32'` | `'darwin'` | `'linux'`) for platform-specific branches.
- Keyboard shortcuts: macOS uses `Meta` (⌘), Windows/Linux use `Ctrl`. The keybinding system (`src/lib/keybindings.ts`) handles this automatically.

## TypeScript

- **No `any`** in new code. Use SDK types or define proper interfaces in `shared/types.ts`.
- **Static imports only** — no dynamic `require()`.
- Types shared across the IPC boundary live in `shared/types.ts`. Types internal to one side stay local.
- IPC payloads must be **Structured Clone serializable**: plain objects, arrays, primitives, Date, Map, Set. No functions, class instances, DOM nodes.

## Git Operations

- **Always ask for confirmation** before `git commit` or `git push`. Show the proposed commit message and changed files; wait for explicit approval.
- Never amend, force-push, or rebase without asking first.

## Companion Compatibility

Every user-facing feature must consider companion impact:

- All main→renderer push events are automatically forwarded to companion clients via `CompanionIpcBridge` — no extra work needed for event delivery.
- New `ipcMain.handle()` channels that companion clients should call must also be exposed through the companion REST/WebSocket API.
- UI-only state (Zustand stores) is NOT synced to companion automatically. Add an IPC push event if needed.
- Keep all payloads JSON-serializable (same constraint as Structured Clone).

## Changes Log

- 2026-02-24: Initial documentation generated
