# Development Guide

## Prerequisites
- Node.js 20+ (recommended: use mise or nvm)
- npm 10+
- Git
- macOS, Windows, or Linux
- **Linux only:** `sudo apt install build-essential libx11-dev libxkbfile-dev` (for node-pty native compilation)

## Getting Started

```bash
git clone <repo-url>
cd PiLot
npm install
npm run dev
```

`npm run dev` starts Electron with Vite HMR. DevTools open automatically.

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Development mode with HMR and DevTools |
| `npm run build` | Production build to `out/` |
| `npm run build:mac` | Package for macOS (.dmg + .zip, arm64 & x64) |
| `npm run build:win` | Package for Windows (NSIS installer + portable + .zip) |
| `npm run build:linux` | Package for Linux (AppImage + .deb + .tar.gz) |
| `npm run preview` | Preview production build |

## Project Structure

Refer to [Architecture Overview](./architecture.md) for the full structure.

## CI/CD

Continuous integration builds are **only** triggered when version tags are pushed:

```bash
git tag v0.x.x
git push --tags
```

- Tags must match the `v*` pattern (e.g., `v0.1.0`, `v1.2.3`)
- No builds run on push to `main` or on pull requests
- Tagged releases trigger multi-platform builds (macOS, Windows, Linux)

## Adding a New Feature

### Adding a New IPC Domain

Example: Adding a "notifications" domain.

1. **Add channel constants** to `shared/ipc.ts`:
```typescript
// Notifications
export const NOTIFICATIONS_LIST = 'notifications:list';
export const NOTIFICATIONS_SEND = 'notifications:send';
export const NOTIFICATIONS_DISMISS = 'notifications:dismiss';
export const NOTIFICATIONS_NEW = 'notifications:new'; // push event
```

2. **Add types** to `shared/types.ts`:
```typescript
export interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
}
```

3. **Create IPC handler** `electron/ipc/notifications.ts`:
```typescript
import { ipcMain, BrowserWindow } from 'electron';
import * as IPC from '../../shared/ipc';
import { NotificationService } from '../services/notification-service';

export function registerNotificationsIpc(service: NotificationService) {
  ipcMain.handle(IPC.NOTIFICATIONS_LIST, async () => {
    return service.list();
  });

  ipcMain.handle(IPC.NOTIFICATIONS_SEND, async (_event, notification) => {
    const result = await service.send(notification);
    // Push to all windows
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send(IPC.NOTIFICATIONS_NEW, result)
    );
    return result;
  });
}
```

4. **Create service** `electron/services/notification-service.ts` if business logic needed.

5. **Register in main** `electron/main/index.ts`:
```typescript
import { registerNotificationsIpc } from './ipc/notifications';
const notificationService = new NotificationService();
registerNotificationsIpc(notificationService);
```

6. **Create Zustand store** `src/stores/notification-store.ts`:
```typescript
import { create } from 'zustand';
import * as IPC from '../../shared/ipc';

interface NotificationStore {
  notifications: Notification[];
  loadNotifications: () => Promise<void>;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  loadNotifications: async () => {
    const notifications = await window.api.invoke(IPC.NOTIFICATIONS_LIST);
    set({ notifications });
  },
}));
```

7. **Listen for push events** in a hook or component:
```typescript
useEffect(() => {
  const unsubscribe = window.api.on(IPC.NOTIFICATIONS_NEW, (notification) => {
    useNotificationStore.getState().addNotification(notification);
  });
  return unsubscribe;
}, []);
```

### Adding a New UI Panel

- Create a folder under `src/components/<domain>/`
- State in a Zustand store, not component `useState` (unless ephemeral)
- IPC calls in the store or a hook, never in JSX event handlers
- Use `useEffect` cleanup for `window.api.on()` listeners

### Extending the Agent Sandbox

- Edit `electron/services/sandboxed-tools.ts` to intercept additional tool types
- Add new diff operation type to `StagedDiff['operation']` in `shared/types.ts`
- Handle the new operation in `applyDiff` in `electron/ipc/sandbox.ts`

## Conventions

### TypeScript
- No `any` in new code — use SDK types or define interfaces in `shared/types.ts`
- Static imports only — no dynamic `require()`
- Types shared across process boundary in `shared/types.ts`; internal types stay local

### IPC
- All channel names from `shared/ipc.ts` — never raw strings
- Payloads must be Structured Clone serializable: no functions, classes, DOM nodes
- Main→renderer pushes use `BrowserWindow.getAllWindows()`

### Zustand
- Always return new objects/arrays from `set()` — never mutate `state.*` in place
- Derive computed values in selectors, not components
- Access stores outside React via `useStore.getState()`

### Electron Security
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` — never change
- Validate file paths against project root (jail pattern from `sandboxed-tools.ts`)
- Use `execFile`/`spawn` with argument arrays, not `exec` with interpolated strings

### Error Handling
- IPC handlers that can fail should `throw` — Electron serializes to rejected promise
- Catch at the call site in the renderer
- Silent errors acceptable only for truly non-critical background tasks

## Implementation Notes

### File Tree
- Uses the [`ignore`](https://www.npmjs.com/package/ignore) npm package for `.gitignore`-syntax pattern matching
- Hidden files (dotfiles) are filtered using the same patterns as git

### Sandboxed File Access
- The preload exposes `webUtils.getPathForFile()` as `window.api.getFilePath()`
- This allows the renderer to safely obtain file paths from drag-and-drop or file input events
- File objects cannot cross the context bridge directly; use this API instead

## Config & Data Paths

The app config directory (`<PILOT_DIR>`) is platform-dependent:

| Platform | Default location |
|---|---|
| macOS | `~/.config/.pilot/` |
| Windows | `%APPDATA%\.pilot\` |
| Linux | `$XDG_CONFIG_HOME/.pilot/` (default: `~/.config/.pilot/`) |

| Path | Contents |
|---|---|
| `<PILOT_DIR>/auth.json` | API keys and OAuth tokens |
| `<PILOT_DIR>/models.json` | Model registry cache |
| `<PILOT_DIR>/app-settings.json` | App settings |
| `<PILOT_DIR>/workspace.json` | Saved tab layout and UI state |
| `<PILOT_DIR>/session-metadata.json` | Session pin/archive state |
| `<PILOT_DIR>/sessions/` | Session .jsonl files |
| `<PILOT_DIR>/extensions/` | Global extensions |
| `<PILOT_DIR>/skills/` | Global skills |
| `<PILOT_DIR>/MEMORY.md` | Global memory |
| `<project>/.pilot/` | Project-level config |
| `<project>/.pilot/settings.json` | Jail, yolo mode |
| `<project>/.pilot/commands.json` | Dev command buttons |
| `<project>/.pilot/MEMORY.md` | Project memory |
| `<project>/.pilot/tasks.jsonl` | Project tasks |

To reset all config, delete the `<PILOT_DIR>` directory.

## Debugging

### DevTools
- Opens automatically in dev mode
- Renderer DevTools: Cmd+Shift+I
- Main process logs in terminal where `npm run dev` runs

### Common Issues

| Issue | Solution |
|---|---|
| White screen on launch | Check DevTools console for errors. Usually a missing import or type error. |
| IPC handler not found | Verify channel constant matches in shared/ipc.ts, handler is registered in main/index.ts |
| Store not updating | Check that `set()` returns new objects (immutability). Check selector in component. |
| File operations failing | Check jail settings. Verify path resolves within project root. |
| Memory not injecting | Verify MemoryManager instance is shared (known bug: two instances). |
