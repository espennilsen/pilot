# Docker Sandbox — Implementation Plan

> Feature branch: `feature/docker-sandbox`
> Epic: Docker Sandbox — project-scoped containers with agent-controlled virtual display
> Status: Planning

---

## Overview

Add a "Sandbox" feature: project-scoped Docker containers with a virtual display (Xvfb + noVNC) that the agent can control programmatically via mouse, keyboard, screenshot, and clipboard tools. Each sandbox is tied to an active project and persists across sessions. Sandbox tools are disabled by default to avoid wasting tokens.

**Key differentiator:** The agent can see and interact with a graphical desktop — useful for browser testing, GUI automation, visual verification, and any task that needs a screen.

---

## Architecture Summary

```
┌─ Renderer ──────────────────────────────────────┐
│  SandboxPanel.tsx                                │
│  ├─ noVNC iframe (localhost:{wsPort}/vnc.html)   │
│  ├─ Status badge + Start/Stop buttons            │
│  └─ "Agent tools" toggle                         │
│                                                  │
│  useSandboxDockerStore (Zustand)                 │
│  └─ Per-project: { containerId, ports, status,   │
│       toolsEnabled }                             │
├──────────────── IPC Bridge ──────────────────────┤
│  Main Process                                    │
│  ├─ SandboxDockerService (dockerode)             │
│  │  ├─ startSandbox(projectPath)                 │
│  │  ├─ stopSandbox(projectPath)                  │
│  │  ├─ execInSandbox(projectPath, cmd)           │
│  │  ├─ screenshotSandbox(projectPath)            │
│  │  └─ reconcileOnStartup()                      │
│  ├─ sandbox-docker-tools.ts (ToolDefinition[])   │
│  │  └─ 16 agent tools (mouse/keyboard/screen/…)  │
│  └─ pi-session-config.ts (conditional inclusion) │
│     └─ if toolsEnabled → append sandbox tools    │
├──────────────── Docker ──────────────────────────┤
│  Container (Ubuntu 24.04)                        │
│  ├─ Xvfb :99 (virtual display)                  │
│  ├─ fluxbox (window manager)                     │
│  ├─ x11vnc → websockify → noVNC (port 6080)     │
│  ├─ xdotool (mouse/keyboard)                     │
│  ├─ scrot (screenshots)                          │
│  └─ xclip (clipboard)                            │
└──────────────────────────────────────────────────┘
```

---

## Task Breakdown

### Phase 1: Foundation (Types, IPC, Settings)

#### Task 1.1 — Add Docker sandbox types to `shared/types.ts`
**Priority:** P0 — Blocks everything else

New types:

```typescript
/** Status of a project-scoped Docker sandbox */
export interface DockerSandboxState {
  containerId: string;
  wsPort: number;         // noVNC websockify port on host
  vncPort: number;        // VNC port on host
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  createdAt: number;      // timestamp
  error?: string;
}

/** Persisted to <project>/.pilot/sandbox.json */
export interface DockerSandboxConfig {
  containerId: string;
  wsPort: number;
  vncPort: number;
  status: string;
  createdAt: number;
}
```

Extend `ProjectSandboxSettings` in `shared/types.ts`:

```typescript
export interface ProjectSandboxSettings {
  jail: { enabled: boolean; allowedPaths: string[] };
  yoloMode: boolean;
  dockerToolsEnabled?: boolean;  // NEW — default false
}
```

**Files:** `shared/types.ts`

---

#### Task 1.2 — Add IPC channel constants
**Priority:** P0 — Blocks IPC handlers and store

Add to `shared/ipc.ts`:

```typescript
// Docker Sandbox
DOCKER_SANDBOX_START: 'docker-sandbox:start',
DOCKER_SANDBOX_STOP: 'docker-sandbox:stop',
DOCKER_SANDBOX_STATUS: 'docker-sandbox:status',
DOCKER_SANDBOX_EXEC: 'docker-sandbox:exec',
DOCKER_SANDBOX_SCREENSHOT: 'docker-sandbox:screenshot',
DOCKER_SANDBOX_EVENT: 'docker-sandbox:event',           // main → renderer push
DOCKER_SANDBOX_SET_TOOLS_ENABLED: 'docker-sandbox:set-tools-enabled',
DOCKER_SANDBOX_GET_TOOLS_ENABLED: 'docker-sandbox:get-tools-enabled',
```

**Files:** `shared/ipc.ts`

---

### Phase 2: Docker Infrastructure

#### Task 2.1 — Create Dockerfile
**Priority:** P0 — Required for container startup

Create `resources/docker/sandbox/Dockerfile`:

```dockerfile
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV RESOLUTION=1280x800x24

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xdotool scrot x11vnc fluxbox xclip \
    novnc websockify \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5900 6080

ENTRYPOINT ["/entrypoint.sh"]
```

Create `resources/docker/sandbox/entrypoint.sh`:

```bash
#!/bin/bash
Xvfb $DISPLAY -screen 0 $RESOLUTION &
sleep 1
fluxbox &
x11vnc -display $DISPLAY -forever -shared -nopw -rfbport 5900 &
websockify --web /usr/share/novnc 6080 localhost:5900 &
wait
```

**Files:** `resources/docker/sandbox/Dockerfile`, `resources/docker/sandbox/entrypoint.sh`

---

#### Task 2.2 — Install dockerode dependency
**Priority:** P0

```bash
npm install dockerode
npm install --save-dev @types/dockerode
```

**Files:** `package.json`

---

#### Task 2.3 — Create SandboxDockerService
**Priority:** P0 — Core service, blocks everything

Create `electron/services/sandbox-docker-service.ts`:

**Responsibilities:**
- Manage Docker containers keyed by `projectPath`
- Build sandbox image on first use (or if missing)
- Start/stop containers with random host port mapping
- Persist state to `<project>/.pilot/sandbox.json`
- Execute commands inside containers via `container.exec()`
- Take screenshots via `scrot` exec + file copy out
- Reconcile state on app startup (verify containers still running)
- Label containers with `pilot.sandbox=true` and `pilot.project=<path>`

**Key methods:**

```typescript
class SandboxDockerService {
  private docker: Dockerode;
  private sandboxes: Map<string, DockerSandboxState>;  // projectPath → state

  async ensureImage(): Promise<void>
  // Build or pull the sandbox image. Check if 'pilot-sandbox:latest' exists first.
  // If not, build from resources/docker/sandbox/Dockerfile.
  // Use path.join(app.getAppPath(), 'resources/docker/sandbox') for Dockerfile context.

  async startSandbox(projectPath: string): Promise<DockerSandboxState>
  // 1. Check if already running → return existing state
  // 2. ensureImage()
  // 3. Find available ports (random high ports for 5900 and 6080)
  // 4. Create container with labels, port mapping, env (RESOLUTION)
  // 5. Start container
  // 6. Wait for websockify to be ready (poll localhost:{wsPort} with timeout)
  // 7. Write sandbox.json to <project>/.pilot/
  // 8. Update in-memory map
  // 9. Push DOCKER_SANDBOX_EVENT to renderer

  async stopSandbox(projectPath: string): Promise<void>
  // 1. Read from in-memory map or sandbox.json
  // 2. Stop and remove container
  // 3. Delete sandbox.json
  // 4. Remove from in-memory map
  // 5. Push DOCKER_SANDBOX_EVENT to renderer

  async getSandboxStatus(projectPath: string): Promise<DockerSandboxState | null>
  // Return from in-memory map, or check sandbox.json + verify container

  async execInSandbox(projectPath: string, command: string): Promise<string>
  // container.exec() with DISPLAY=:99, capture stdout

  async screenshotSandbox(projectPath: string): Promise<string>
  // exec 'scrot -o /tmp/screen.png' then read file as base64
  // Use container.getArchive() to copy /tmp/screen.png out

  async reconcileOnStartup(): Promise<void>
  // For each known project with sandbox.json:
  //   - Check if container is still running via docker API
  //   - If dead: delete sandbox.json, remove from map
  //   - If alive: add to in-memory map

  isDockerAvailable(): Promise<boolean>
  // Try docker.ping(). Return true/false.
}
```

**Port allocation strategy:**
- Use `net.createServer()` to find available ports (bind to 0, read assigned port, close)
- Or use a simple random range 10000-60000 and check Docker isn't already using it

**Error handling:**
- Docker not installed → return clear error message, don't crash
- Image build fails → return error with build output
- Container fails to start → cleanup, return error
- Port conflict → retry with different ports

**Files:** `electron/services/sandbox-docker-service.ts`

---

#### Task 2.4 — Register IPC handlers
**Priority:** P0

Create `electron/ipc/sandbox-docker.ts`:

```typescript
export function registerSandboxDockerIpc(service: SandboxDockerService) {
  ipcMain.handle(IPC.DOCKER_SANDBOX_START, async (_, projectPath: string) => {
    return service.startSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_STOP, async (_, projectPath: string) => {
    await service.stopSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_STATUS, async (_, projectPath: string) => {
    return service.getSandboxStatus(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_EXEC, async (_, projectPath: string, command: string) => {
    return service.execInSandbox(projectPath, command);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_SCREENSHOT, async (_, projectPath: string) => {
    return service.screenshotSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_SET_TOOLS_ENABLED, async (_, projectPath: string, enabled: boolean) => {
    // Update project settings
    // This will be picked up on next agent request
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_GET_TOOLS_ENABLED, async (_, projectPath: string) => {
    const settings = loadProjectSettings(projectPath);
    return settings.dockerToolsEnabled ?? false;
  });
}
```

Register in `electron/main/index.ts`:
```typescript
import { SandboxDockerService } from '../services/sandbox-docker-service';
import { registerSandboxDockerIpc } from '../ipc/sandbox-docker';

const sandboxDockerService = new SandboxDockerService();
registerSandboxDockerIpc(sandboxDockerService);

// On app ready, reconcile
sandboxDockerService.reconcileOnStartup().catch(console.error);
```

**Files:** `electron/ipc/sandbox-docker.ts`, `electron/main/index.ts`

---

### Phase 3: Agent Tools

#### Task 3.1 — Create sandbox tool definitions
**Priority:** P1

Create `electron/services/sandbox-docker-tools.ts`:

**16 tools, all following the SDK `ToolDefinition` pattern:**

**Mouse tools:**
- `sandbox_click(x, y)` → `xdotool mousemove --sync x y click 1`
- `sandbox_double_click(x, y)` → `xdotool mousemove --sync x y click --repeat 2 1`
- `sandbox_right_click(x, y)` → `xdotool mousemove --sync x y click 3`
- `sandbox_middle_click(x, y)` → `xdotool mousemove --sync x y click 2`
- `sandbox_hover(x, y)` → `xdotool mousemove --sync x y`
- `sandbox_drag(startX, startY, endX, endY)` → `xdotool mousemove --sync startX startY mousedown 1 mousemove --sync endX endY mouseup 1`
- `sandbox_scroll(x, y, direction, amount)` → `xdotool mousemove --sync x y` then `click 4/5` (up/down) repeated `amount` times. For left/right: `click 6/7`.

**Keyboard tools:**
- `sandbox_type(text)` → `xdotool type -- "text"`. Escape shell special chars.
- `sandbox_key(keys)` → `xdotool key keys`. Accepts combos like "ctrl+c", "Return", "alt+Tab".

**Screen tools:**
- `sandbox_screenshot()` → Call `screenshotSandbox()`, return base64 PNG as image content type.

**Clipboard tools:**
- `sandbox_clipboard_get()` → `xclip -selection clipboard -o`
- `sandbox_clipboard_set(text)` → `echo "text" | xclip -selection clipboard`

**Lifecycle tools:**
- `sandbox_start()` → Start sandbox for current project, return connection info.
- `sandbox_stop()` → Stop current project's sandbox.
- `sandbox_wait(seconds)` → `sleep` with max 30 seconds.
- `sandbox_exec(command)` → Run arbitrary shell command in sandbox. Return stdout/stderr.

**Implementation pattern:**

```typescript
export function createSandboxDockerTools(
  service: SandboxDockerService,
  projectPath: string,
): ToolDefinition[] {
  return [
    {
      name: 'sandbox_click',
      description: 'Left-click at screen coordinates (x, y) in the sandbox virtual display.',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate' },
          y: { type: 'number', description: 'Y coordinate' },
        },
        required: ['x', 'y'],
      },
      async execute(toolCallId, params) {
        await service.execInSandbox(projectPath,
          `DISPLAY=:99 xdotool mousemove --sync ${params.x} ${params.y} click 1`);
        return {
          content: [{ type: 'text', text: `Clicked at (${params.x}, ${params.y})` }],
          details: {},
        };
      },
    },
    // ... remaining tools
  ];
}
```

**Screenshot tool** is special — returns image content:

```typescript
{
  name: 'sandbox_screenshot',
  description: 'Take a screenshot of the sandbox virtual display. Returns a PNG image.',
  parameters: { type: 'object', properties: {} },
  async execute(toolCallId) {
    const base64 = await service.screenshotSandbox(projectPath);
    return {
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
      ],
      details: {},
    };
  },
}
```

**Files:** `electron/services/sandbox-docker-tools.ts`

---

#### Task 3.2 — Conditionally register tools in session config
**Priority:** P1 — Blocks agent tool availability

Modify `electron/services/pi-session-config.ts`:

```typescript
import { createSandboxDockerTools } from './sandbox-docker-tools';
import { sandboxDockerService } from './sandbox-docker-service'; // or inject

// In buildSessionConfig():
const dockerToolsEnabled = projectSettings.dockerToolsEnabled ?? false;
const dockerTools = dockerToolsEnabled
  ? createSandboxDockerTools(sandboxDockerService, projectPath)
  : [];

const customTools: ToolDefinition[] = [
  ...tools,
  ...readOnlyTools,
  ...taskTools,
  ...memoryTools,
  ...editorTools,
  ...subagentTools,
  createWebFetchTool(),
  ...mcpTools,
  ...dockerTools,  // NEW — conditionally included
];
```

**Key requirement:** When `dockerToolsEnabled` is `false`, the `dockerTools` array is empty → the agent has zero knowledge of sandbox capabilities. No tool definitions are sent. No wasted tokens.

**Service injection:** The `SandboxDockerService` instance needs to be accessible in `buildSessionConfig`. Options:
1. Pass it through `SessionConfigOptions` (cleanest)
2. Import a singleton (simpler)

Prefer option 1: add `sandboxDockerService?: SandboxDockerService` to `SessionConfigOptions`. PilotSessionManager passes it when calling `buildSessionConfig()`.

**Files:** `electron/services/pi-session-config.ts`, `electron/services/pi-session-manager.ts`

---

### Phase 4: Renderer UI

#### Task 4.1 — Create Zustand store
**Priority:** P1

Create `src/stores/sandbox-docker-store.ts`:

```typescript
interface SandboxDockerStore {
  // Per-project state
  stateByProject: Record<string, DockerSandboxState>;
  toolsEnabledByProject: Record<string, boolean>;
  isDockerAvailable: boolean | null;

  // Actions
  checkDockerAvailable: () => Promise<void>;
  startSandbox: (projectPath: string) => Promise<void>;
  stopSandbox: (projectPath: string) => Promise<void>;
  loadStatus: (projectPath: string) => Promise<void>;
  setToolsEnabled: (projectPath: string, enabled: boolean) => Promise<void>;

  // Selectors
  getSandboxState: (projectPath: string) => DockerSandboxState | null;
  isToolsEnabled: (projectPath: string) => boolean;
}
```

**Files:** `src/stores/sandbox-docker-store.ts`

---

#### Task 4.2 — Create Sandbox panel component
**Priority:** P1

Create `src/components/sandbox-docker/SandboxPanel.tsx`:

**Layout:**
```
┌─ Sandbox ──────────────────────────────────────────┐
│  ● Running  │  [Stop]  │  Agent tools: [  toggle  ]│
├────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ noVNC iframe ────────────────────────────────┐  │
│  │                                                │  │
│  │  (live virtual display)                        │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**When stopped:**
```
┌─ Sandbox ──────────────────────────────────────────┐
│  ○ Stopped                                          │
├────────────────────────────────────────────────────┤
│                                                     │
│     🖥  No sandbox running                          │
│                                                     │
│     [Start Sandbox]                                 │
│                                                     │
│     Docker required. Sandbox provides a virtual     │
│     display the agent can control.                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**When Docker not available:**
```
│     ⚠ Docker not found                             │
│     Install Docker Desktop to use sandboxes.        │
```

**Components:**
- `SandboxPanel.tsx` — main panel, project-aware
- `SandboxHeader.tsx` — status badge, start/stop, tools toggle
- `SandboxViewer.tsx` — noVNC iframe wrapper

**noVNC iframe URL:**
```
http://localhost:{wsPort}/vnc.html?autoconnect=true&resize=scale&toolbar=0&view_only=false
```

**CSP consideration:** Need to allow iframe src for `localhost:*` in the Content Security Policy. Check existing CSP config for web tabs — similar pattern.

**Files:** `src/components/sandbox-docker/SandboxPanel.tsx`, `SandboxHeader.tsx`, `SandboxViewer.tsx`

---

#### Task 4.3 — Integrate panel into app layout
**Priority:** P1

**Option A (recommended):** Add as a new tab in the context panel (right side), alongside Files and Git:
- Add to `src/components/context/` or as a sibling panel
- Tab label: "Sandbox" with monitor icon
- Only show tab when Docker is available

**Option B:** Add as a bottom panel like Terminal:
- Add `sandboxPanelVisible` and `sandboxPanelHeight` to `ui-store.ts`
- Keyboard shortcut to toggle

Prefer **Option A** — it's a monitoring/status view like Files and Git, not a persistent output stream like Terminal.

**Changes:**
- `src/stores/ui-store.ts` — add context panel tab option: `'files' | 'git' | 'sandbox'`
- `src/app.tsx` — add push event listener for `DOCKER_SANDBOX_EVENT`
- Keybinding: consider `Cmd+Shift+S` / `Ctrl+Shift+S` but check for conflicts

**Files:** `src/stores/ui-store.ts`, `src/app.tsx`, context panel integration point

---

#### Task 4.4 — Add push event hook for sandbox lifecycle
**Priority:** P1

Create `src/hooks/useSandboxDockerEvents.ts`:

```typescript
export function useSandboxDockerEvents() {
  useEffect(() => {
    const unsub = window.api.on(IPC.DOCKER_SANDBOX_EVENT, (payload) => {
      const store = useSandboxDockerStore.getState();
      // Update stateByProject based on event
    });
    return unsub;
  }, []);
}
```

Mount in `src/app.tsx`.

**Files:** `src/hooks/useSandboxDockerEvents.ts`, `src/app.tsx`

---

### Phase 5: Integration & Cleanup

#### Task 5.1 — Project close cleanup
**Priority:** P2

When a project is closed (all tabs for that project closed):
- Check if sandbox is running for that project
- Stop the container automatically
- Clean up sandbox.json

Hook into existing project/tab close flow in `electron/main/index.ts` or `PilotSessionManager.dispose()`.

**Files:** `electron/services/pi-session-manager.ts` or `electron/main/index.ts`

---

#### Task 5.2 — App startup reconciliation
**Priority:** P2

On app launch:
1. `SandboxDockerService.reconcileOnStartup()` checks all workspace projects
2. For each with a `sandbox.json`, verify container is alive
3. Dead containers → clean up json
4. Alive containers → populate in-memory map, push state to renderer

**Files:** `electron/services/sandbox-docker-service.ts`, `electron/main/index.ts`

---

#### Task 5.3 — Settings persistence for tool toggle
**Priority:** P2

When user toggles "Agent tools" on/off:
1. Update `<project>/.pilot/settings.json` with `dockerToolsEnabled: true/false`
2. The next `buildSessionConfig()` call reads this setting
3. Tools are included/excluded from the next agent request

No need to restart the session — the setting is read on each `buildSessionConfig()` call which happens per-prompt.

**Verification:** Confirm `buildSessionConfig` is called per-prompt, not just on session creation. If it's only on session creation, tools won't dynamically toggle mid-session. In that case, need to rebuild the tools array and update the session.

Looking at `pi-session-manager.ts`: `buildSessionConfig` is called in `initSession()` which runs once per session. So for mid-session tool toggling, we need to update the session's tool list directly. Options:
- Store a reference to the current `customTools` array and mutate it
- Or recreate the session (heavyweight)
- Or accept that toggle takes effect on next new session (simplest, acceptable for prototype)

**Recommendation for prototype:** Toggle takes effect on next new conversation/session. Document this clearly in the UI: "Takes effect on next conversation."

**Files:** `electron/services/project-settings.ts`, `shared/types.ts`

---

## Dependency Graph

```
Task 1.1 (types) ──────────────────┐
Task 1.2 (IPC constants) ──────────┤
                                    ├── Task 2.3 (SandboxDockerService)
Task 2.1 (Dockerfile) ─────────────┤     │
Task 2.2 (dockerode) ──────────────┘     │
                                          ├── Task 2.4 (IPC handlers)
                                          ├── Task 3.1 (tool definitions)
                                          │     │
                                          │     └── Task 3.2 (conditional registration)
                                          │
                                          ├── Task 4.1 (Zustand store)
                                          │     │
                                          │     ├── Task 4.2 (Panel component)
                                          │     │     │
                                          │     │     └── Task 4.3 (Layout integration)
                                          │     │
                                          │     └── Task 4.4 (Push event hook)
                                          │
                                          ├── Task 5.1 (Project close cleanup)
                                          ├── Task 5.2 (Startup reconciliation)
                                          └── Task 5.3 (Settings persistence)
```

**Critical path:** 1.1 + 1.2 + 2.1 + 2.2 → 2.3 → 3.1 → 3.2 (agent tools working end-to-end)

**Parallelizable after 2.3:**
- Tasks 2.4, 3.1, 4.1 can all start once the service exists
- Tasks 4.2–4.4 can start once the store exists
- Tasks 5.x are independent cleanup work

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Docker not installed on user machine | High | Medium | Graceful degradation — check `docker.ping()`, show clear message |
| Image build slow on first use | Medium | Low | Show progress indicator, cache image |
| Port conflicts | Low | Low | Random port allocation with retry |
| noVNC iframe CSP blocked | Medium | High | Update CSP in electron config to allow localhost iframe |
| Screenshot latency too high | Low | Medium | scrot is fast (<100ms), base64 encoding adds ~50ms |
| Container resource usage | Medium | Medium | Set memory/CPU limits in container config |
| Windows path issues in Docker volume mounts | Medium | Medium | Use forward slashes, handle drive letters |
| Tool toggle mid-session | Medium | Low | Accept "next conversation" behavior for prototype |

---

## Estimated Effort

| Phase | Tasks | Estimate |
|-------|-------|----------|
| Phase 1: Foundation | 1.1, 1.2 | 30 min |
| Phase 2: Docker | 2.1–2.4 | 3–4 hours |
| Phase 3: Agent Tools | 3.1–3.2 | 2–3 hours |
| Phase 4: UI | 4.1–4.4 | 2–3 hours |
| Phase 5: Integration | 5.1–5.3 | 1–2 hours |
| **Total** | **14 tasks** | **~10 hours** |

---

## Files Changed/Created Summary

### New Files (10)
- `resources/docker/sandbox/Dockerfile`
- `resources/docker/sandbox/entrypoint.sh`
- `electron/services/sandbox-docker-service.ts`
- `electron/services/sandbox-docker-tools.ts`
- `electron/ipc/sandbox-docker.ts`
- `src/stores/sandbox-docker-store.ts`
- `src/components/sandbox-docker/SandboxPanel.tsx`
- `src/components/sandbox-docker/SandboxHeader.tsx`
- `src/components/sandbox-docker/SandboxViewer.tsx`
- `src/hooks/useSandboxDockerEvents.ts`

### Modified Files (6)
- `shared/types.ts` — new types
- `shared/ipc.ts` — new constants
- `package.json` — add dockerode
- `electron/main/index.ts` — register service + IPC
- `electron/services/pi-session-config.ts` — conditional tool inclusion
- `src/app.tsx` — mount event hook

---

## Open Questions

1. **Panel placement:** Context panel tab (right side) vs bottom panel vs floating window? Recommend context panel tab for prototype.

2. **Container resource limits:** Set `--memory=2g --cpus=2` by default? Or leave unconstrained?

3. **Volume mounts:** Should the project directory be mounted into the container? Useful for file access but adds security considerations. Recommend: no mount for prototype — the sandbox is isolated.

4. **Resolution configurability:** The Dockerfile accepts `RESOLUTION` env var (default `1280x800x24`). Expose in UI or hardcode?

5. **Multi-monitor / HiDPI:** noVNC `resize=scale` handles this, but screenshots will be at container resolution. Acceptable for prototype.

6. **Companion support:** Should companion clients see the sandbox? noVNC already works in browser, so the iframe approach would work if the port is accessible. For prototype: desktop only.
