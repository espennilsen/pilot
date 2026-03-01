# Desktop — Technical Reference

The Desktop feature provides project-scoped Docker containers with a virtual display (Xvfb + fluxbox + noVNC). The agent can control the virtual display via mouse, keyboard, clipboard, and screenshot tools. Users see the display embedded in the context panel via a noVNC iframe.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                                   │
│                                                                     │
│  DesktopPanel ──→ DesktopHeader ──→ Start/Stop, Tools toggle        │
│       │                                                             │
│       └──→ DesktopViewer ──→ noVNC iframe (http://localhost:<port>)  │
│                                                                     │
│  useDesktopStore ──→ IPC invoke/on ──→ window.api                   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ IPC
┌────────────────────────────────▼────────────────────────────────────┐
│  Main Process                                                       │
│                                                                     │
│  desktop.ts (IPC handlers) ──→ DesktopService                       │
│                                    │                                │
│                                    ├── Dockerode (Docker API)       │
│                                    ├── Container lifecycle          │
│                                    ├── Port allocation              │
│                                    └── Persist config (.pilot/)     │
│                                                                     │
│  desktop-tools.ts ──→ 18 agent ToolDefinitions                      │
│                        (mouse, keyboard, screen, clipboard,         │
│                         lifecycle, browser, exec)                   │
│                                                                     │
│  pi-session-config.ts ──→ Wires desktop tools into agent session    │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                    Docker Socket / API
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│  Docker Container (pilot-desktop:latest)                            │
│                                                                     │
│  Xvfb :99 ──→ fluxbox ──→ x11vnc :5900 ──→ websockify :6080       │
│                                                                     │
│  Browsers: chromium-browser, firefox                                │
│  Tools:    xdotool, scrot, xclip, curl, wget, jq, Node.js 22      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Role |
|------|------|
| `electron/services/desktop-service.ts` | Docker container lifecycle — start, stop, status, exec, screenshot |
| `electron/services/desktop-tools.ts` | 18 agent `ToolDefinition`s (mouse, keyboard, screenshot, clipboard, browser, exec) |
| `electron/ipc/desktop.ts` | IPC handlers — bridges renderer ↔ `DesktopService` |
| `electron/services/pi-session-config.ts` | Wires desktop tools into agent sessions when enabled |
| `src/stores/desktop-store.ts` | Zustand store — per-project state, availability check, tools toggle |
| `src/components/desktop/DesktopPanel.tsx` | Main panel — state-dependent views (stopped, starting, running, error) |
| `src/components/desktop/DesktopHeader.tsx` | Status badge, start/stop buttons, agent tools toggle |
| `src/components/desktop/DesktopViewer.tsx` | noVNC iframe wrapper with auto-retry on load failure |
| `shared/ipc.ts` | IPC channel constants (`DESKTOP_*`) |
| `shared/types.ts` | `DesktopState`, `DesktopConfig`, `DesktopCheckResult` types |
| `resources/docker/desktop/Dockerfile` | Base image — Ubuntu 24.04, Xvfb, fluxbox, VNC, browsers, Node.js |
| `resources/docker/desktop/entrypoint.sh` | Container entrypoint — starts display stack |

---

## Container

### Base Image (`pilot-desktop:latest`)

Built from `resources/docker/desktop/Dockerfile` on first use. Contains:

- **Display stack:** Xvfb (virtual framebuffer), fluxbox (window manager), x11vnc, websockify + noVNC
- **Browsers:** Chromium, Firefox (with international font support)
- **Agent tools:** xdotool (mouse/keyboard), scrot (screenshots), xclip (clipboard)
- **Dev tools:** Node.js 22, curl, wget, jq, xterm, net-tools
- **Ports:** 5900 (VNC), 6080 (noVNC/WebSocket)

Default resolution: `1280×800×24`. Configurable via `RESOLUTION` env var.

### Resource Limits

- Memory: 2 GB
- CPU: 2 cores

### Project-Specific Images

If `<project>/.pilot/desktop.Dockerfile` exists, a project-specific image is built on top of the base image. The Dockerfile should use `FROM pilot-desktop:latest` and can `COPY` project files or install additional dependencies. The image is tagged `pilot-desktop-project-<sha256-hash>:latest` and rebuilt automatically when the Dockerfile is newer than the existing image.

### Persistence

Desktop config is persisted to `<project>/.pilot/desktop.json` while a container is running. On app startup, `reconcileOnStartup()` checks all containers labelled `pilot.desktop=true` — running ones are re-adopted, dead ones are cleaned up.

---

## IPC Channels

| Channel | Direction | Args | Returns |
|---------|-----------|------|---------|
| `DESKTOP_CHECK` | renderer → main | — | `DesktopCheckResult` |
| `DESKTOP_START` | renderer → main | `projectPath` | `DesktopState` |
| `DESKTOP_STOP` | renderer → main | `projectPath` | `void` |
| `DESKTOP_STATUS` | renderer → main | `projectPath` | `DesktopState \| null` |
| `DESKTOP_EXEC` | renderer → main | `projectPath, command` | `string` (stdout) |
| `DESKTOP_SCREENSHOT` | renderer → main | `projectPath` | `string` (base64 PNG) |
| `DESKTOP_SET_TOOLS_ENABLED` | renderer → main | `projectPath, enabled` | `void` |
| `DESKTOP_GET_TOOLS_ENABLED` | renderer → main | `projectPath` | `boolean \| null` |
| `DESKTOP_EVENT` | main → renderer | — | `{ projectPath } & Partial<DesktopState>` |

---

## Agent Tools (18 total)

Tools are created by `createDesktopTools()` and included in the agent session when `desktopToolsEnabled` is true. Project setting overrides global; when neither is set, tools are disabled.

### Mouse (7)

| Tool | Description |
|------|-------------|
| `desktop_click` | Left-click at (x, y) |
| `desktop_double_click` | Double-click at (x, y) |
| `desktop_right_click` | Right-click at (x, y) |
| `desktop_middle_click` | Middle-click at (x, y) |
| `desktop_hover` | Move cursor to (x, y) without clicking |
| `desktop_drag` | Click-and-drag from start to end coordinates |
| `desktop_scroll` | Scroll up/down/left/right at (x, y) |

### Keyboard (2)

| Tool | Description |
|------|-------------|
| `desktop_type` | Type a text string into the focused window |
| `desktop_key` | Press a key or key combo (e.g. `ctrl+c`, `Return`) |

### Screen (1)

| Tool | Description |
|------|-------------|
| `desktop_screenshot` | Take a PNG screenshot and return as image content |

### Clipboard (2)

| Tool | Description |
|------|-------------|
| `desktop_clipboard_get` | Read clipboard contents |
| `desktop_clipboard_set` | Set clipboard contents |

### Lifecycle (3)

| Tool | Description |
|------|-------------|
| `desktop_start` | Start the desktop container |
| `desktop_stop` | Stop the desktop container |
| `desktop_wait` | Wait N seconds (max 30) for async operations |

### Browser & Shell (3)

| Tool | Description |
|------|-------------|
| `desktop_open_browser` | Open a URL in Chromium or Firefox |
| `desktop_exec` | Run an arbitrary shell command inside the container |
| `desktop_screenshot` | (listed above) |

---

## Docker Socket Discovery

`DesktopService` resolves the Docker socket in this order:

1. `DOCKER_HOST` env var (`unix://`, `npipe://`, or `tcp://`)
2. **Windows:** `//./pipe/docker_engine`
3. **macOS / Linux:** Probes known socket paths:
   - `~/.docker/run/docker.sock` (Docker Desktop)
   - `/var/run/docker.sock` (Linux standard)
   - `~/.colima/default/docker.sock` (Colima)
   - `~/.rd/docker.sock` (Rancher Desktop)

---

## Session Integration

When a tab is disposed (`PilotSessionManager.dispose`), the session manager checks if any other tabs still reference the same project. If not, the desktop container is stopped automatically.

The `updateDesktopToolsForProject()` method on `PilotSessionManager` updates the tools toggle for all live sessions sharing a project path, taking effect on the next conversation turn.

---

## Settings

| Setting | Scope | Location | Default |
|---------|-------|----------|---------|
| `desktopEnabled` | Global | `app-settings.json` | `false` |
| `desktopToolsEnabled` | Per-project | `.pilot/settings.json` | (inherits global) |

Priority: project setting > global setting > `false`.
