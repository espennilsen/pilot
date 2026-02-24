# Development Guide

> Last updated: 2026-02-24

How to set up, run, and extend Pilot locally.

## Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+
- **macOS, Windows, or Linux** — all three are supported; code must run on all platforms

## Setup

```bash
git clone <repo-url>
cd pilot
npm install
```

On macOS, the `postinstall` script automatically runs `chmod +x` on the `node-pty` spawn-helper binary.

## Running in Development

```bash
npm run dev
```

This:
1. Builds the companion UI bundle with Vite (`vite.companion.mjs`)
2. Starts `electron-vite dev` with HMR for both main and renderer
3. Opens DevTools automatically

The app writes all config to `<PILOT_DIR>` (platform-dependent, see [CONFIGURATION.md](CONFIGURATION.md)). Delete that directory to reset to factory defaults.

**Trace mode** (for debugging unhandled rejections):
```bash
npm run dev:trace
```

## Building

```bash
npm run build          # Compile only (out/)
npm run build:mac      # Build + package for macOS
npm run build:win      # Build + package for Windows
npm run build:linux    # Build + package for Linux
```

Packaged output goes to `release/`. CI builds only on tag push.

## Linting

```bash
npm run lint
```

Uses ESLint with TypeScript rules. Zero warnings policy (`--max-warnings 0`).

## Testing

There are no automated tests yet. Manual testing via `npm run dev`. Future plans:
- Unit tests for services (Vitest)
- Integration tests for IPC flows
- E2E tests (Playwright)

## Adding a New Feature

### New IPC Domain

1. Add constants to `shared/ipc.ts`
2. Add types to `shared/types.ts` (if new payload shapes are needed)
3. Create `electron/services/<domain>.ts` for business logic
4. Create `electron/ipc/<domain>.ts` and register handlers with `ipcMain.handle()`
5. Register the service and IPC module in `electron/main/index.ts`
6. Create `src/stores/<domain>-store.ts` with Zustand
7. Create `src/components/<domain>/` for UI
8. Add a hook in `src/hooks/use<Domain>.ts` if push-event listening is needed

### New UI Component

- One folder per domain under `src/components/<domain>/`
- State in a store, not component-local `useState` (unless truly ephemeral UI)
- IPC calls belong in stores or hooks, not in JSX event handlers
- Use `useEffect` with returned unsubscribe for `window.api.on()` listeners

### Extending the Sandbox

- Edit `electron/services/sandboxed-tools.ts` to intercept additional tool types
- Add new operation type to `StagedDiff['operation']` in `shared/types.ts`
- Handle the new operation in `applyDiff()` in `electron/ipc/sandbox.ts`

### Adding a New Service

1. Create `electron/services/<name>.ts` — one class, focused responsibility
2. Constructor takes injected dependencies
3. Public methods for operations; emit events for async results
4. Instantiate in `electron/main/index.ts` and inject into IPC handlers

## Debugging

### Main Process

DevTools open automatically in `npm run dev`. The main process logs to the console.

Enable verbose logging:
```json
// <PILOT_DIR>/app-settings.json
{
  "logging": { "level": "debug" }
}
```

### Renderer

Use the Electron DevTools (auto-opened in dev mode). React DevTools can be installed as a Chrome extension.

### IPC Tracing

Enable `developerMode` in settings to unlock additional debug panels. Use `npm run dev:trace` for Node.js warning traces.

### Resetting State

```bash
rm -rf ~/.config/.pilot   # macOS/Linux
rmdir /s %APPDATA%\.pilot  # Windows
```

## Project Configuration Files

| File | Purpose |
|------|---------|
| `electron-vite.config.mjs` | electron-vite build config (main, preload, renderer) |
| `vite.companion.mjs` | Companion UI bundle build config |
| `electron-builder.yml` | Electron Builder packaging config (icons, targets, notarization) |
| `tsconfig.json` | Root TypeScript config |
| `tsconfig.node.json` | Main process TypeScript config |
| `tsconfig.web.json` | Renderer TypeScript config |

## Key Conventions Checklist

Before submitting a change:

- [ ] No `any` types in new code
- [ ] All IPC channels use constants from `shared/ipc.ts`
- [ ] No IPC calls inside JSX event handlers (use store actions)
- [ ] `window.api.on()` listeners return unsubscribe in `useEffect` cleanup
- [ ] `BrowserWindow.getAllWindows().forEach()` for push events (not `[0]`)
- [ ] File paths validated against project root before FS operations
- [ ] `execFile`/`spawn` with argument arrays (no `exec` with interpolated strings)
- [ ] `path.join()` used (no hardcoded `/` or `\\`)
- [ ] Works on Windows, macOS, and Linux
- [ ] Companion impact considered (new push channels auto-forwarded; new invoke channels may need REST/WS exposure)
- [ ] Docs updated if architecture changed

## Changes Log

- 2026-02-24: Initial documentation generated
