# Architecture

> Last updated: 2026-03-06

Pilot is an Electron desktop app with strict three-process isolation. The **main process** owns all business logic; the **renderer** is a pure React app with no Node.js access; a **preload script** bridges them. All inter-process calls use typed IPC channels. The same renderer code also runs in a remote browser via a WebSocket-based companion mode.

## Component Map

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `PilotSessionManager` | `electron/services/pi-session-manager.ts` | SDK `AgentSession` lifecycle per tab; forwards SDK events to renderer |
| `SandboxedTools` | `electron/services/sandboxed-tools.ts` | Wraps SDK file tools; stages diffs instead of writing directly to disk |
| `StagedDiffManager` | `electron/services/staged-diffs.ts` | In-memory store of pending diffs; applies or discards on user decision |
| `GitService` | `electron/services/git-service.ts` | `simple-git` wrapper; status, commit, branch, rebase, conflict resolution |
| `MemoryManager` | `electron/services/memory-manager.ts` | Reads/writes two-tier MEMORY.md; builds system prompt injection |
| `MemoryTools` | `electron/services/memory-tools.ts` | Agent tools for memory CRUD (read, write, search, delete by category) |
| `DesktopService` | `electron/services/desktop-service.ts` | Docker container lifecycle for virtual display (Xvfb + Fluxbox + noVNC) |
| `DesktopTools` | `electron/services/desktop-tools.ts` | Agent tools: screenshot, click, type, scroll, clipboard, window management |
| `EditorTools` | `electron/services/editor-tools.ts` | Agent tools: `pilot_show_file`, `pilot_open_url`, `pilot_web` |
| `McpManager` | `electron/services/mcp-manager.ts` | MCP server connections; tool discovery; auto-reconnect with backoff |
| `McpConfig` | `electron/services/mcp-config.ts` | Global + per-project MCP server config persistence |
| `McpToolBridge` | `electron/services/mcp-tool-bridge.ts` | Converts MCP tools to Pi SDK `ToolDefinition` format |
| `DevCommandsService` | `electron/services/dev-commands.ts` | Spawns child processes for dev commands; streams stdout/stderr to renderer |
| `TerminalService` | `electron/services/terminal-service.ts` | `node-pty` PTY management |
| `ExtensionManager` | `electron/services/extension-manager.ts` | Extension/skill discovery, enable/disable on disk |
| `WorkspaceStateService` | `electron/services/workspace-state.ts` | Tab layout save/restore to `workspace.json` |
| `TaskManager` | `electron/services/task-manager.ts` | Task board CRUD via the pi task system |
| `SubagentManager` | `electron/services/subagent-manager.ts` | Parallel subagent pool; routes results back to the parent session |
| `CompanionServer` | `electron/services/companion-server.ts` | HTTPS + WSS server for remote browser access |
| `CompanionAuth` | `electron/services/companion-auth.ts` | PIN/QR pairing, JWT-like session token generation |
| `CompanionDiscovery` | `electron/services/companion-discovery.ts` | mDNS advertisement for local network discovery |
| `CompanionIpcBridge` | `electron/services/companion-ipc-bridge.ts` | Forwards all main→renderer push events to connected companion clients |
| IPC Client | `src/lib/ipc-client.ts` | Dual-mode: `window.api` in Electron, WebSocket in companion browser |
| Chat Store | `src/stores/chat-store.ts` | Messages per tab, streaming tokens, model info |
| Sandbox Store | `src/stores/sandbox-store.ts` | Staged diffs per tab, yolo mode flag |
| Tab Store | `src/stores/tab-store.ts` | Tab list, active tab, closed-tab stack, web/desktop tabs |
| Desktop Store | `src/stores/desktop-store.ts` | Desktop container state, VNC connection, screenshots |
| MCP Store | `src/stores/mcp-store.ts` | MCP server statuses, tool lists, configuration |
| Git Store | `src/stores/git-store.ts` | Git status, branches, log, blame, stashes, conflicts, rebase state |

## Data Flow

### Primary: Agent Conversation

```
User types message in ChatInput component
  → useChatStore.getState().sendMessage(tabId, text)
    → window.api.invoke(IPC.AGENT_PROMPT, { tabId, message })
      → ipcMain.handle(IPC.AGENT_PROMPT)
        → PilotSessionManager.sendMessage(tabId, message)
          → Pi SDK AgentSession.prompt(message)
            → SDK streams tokens/tool-calls back via events
              → PilotSessionManager catches each event
                → BrowserWindow.getAllWindows().forEach(w =>
                    w.webContents.send(IPC.AGENT_EVENT, event))
                  → window.api.on(IPC.AGENT_EVENT, cb) in useAgentSession hook
                    → useChatStore updated with new token/tool data
                      → React re-renders ChatMessage
```

### Agent File Write (Sandboxed)

```
Agent decides to write/edit a file
  → SandboxedTools.handleWrite(filePath, content)
    → Validates path is within project jail
    → StagedDiffManager.stageDiff(tabId, { filePath, operation, proposedContent })
      → BrowserWindow.getAllWindows().forEach(w =>
          w.webContents.send(IPC.SANDBOX_STAGED_DIFF, { tabId, diff }))
        → useSandboxEvents hook → useSandboxStore updated
          → DiffReview UI shown to user

User accepts:
  → window.api.invoke(IPC.SANDBOX_ACCEPT_DIFF, { tabId, diffId })
    → StagedDiffManager.applyDiff(tabId, diffId)  →  writes to disk

User rejects:
  → window.api.invoke(IPC.SANDBOX_REJECT_DIFF, { tabId, diffId })
    → StagedDiffManager.rejectDiff(tabId, diffId)  →  no disk write
```

### Desktop Virtual Display

```
User enables Desktop in settings
  → window.api.invoke(IPC.DESKTOP_START, { projectPath })
    → DesktopService.start(projectPath)
      → Pulls/builds Docker image
      → Starts container (Xvfb + Fluxbox + x11vnc + noVNC)
      → Waits for noVNC readiness
      → Broadcasts DESKTOP_EVENT with state { status: 'running', novncUrl, ... }
        → useDesktopEvents hook → desktopStore updated
          → DesktopViewer renders noVNC iframe

Agent uses desktop tools:
  → pilot_desktop_screenshot → scrot inside container → base64 image
  → pilot_desktop_click/type/scroll → xdotool commands inside container
  → pilot_desktop_browser → launches browser in container
```

### MCP Tool Integration

```
User adds MCP server in settings
  → window.api.invoke(IPC.MCP_ADD_SERVER, config)
    → McpConfig persists to mcp-servers.json
    → McpManager.startServer(config)
      → Creates MCP Client with stdio/SSE/HTTP transport
      → Discovers tools via listTools()
      → McpToolBridge converts to Pi SDK ToolDefinition[]
      → Broadcasts MCP_SERVER_STATUS to renderer
        → useMcpEvents hook → mcpStore updated

Agent uses MCP tool:
  → PilotSessionManager has MCP tools registered in session
  → SDK calls tool.execute()
    → McpToolBridge routes to MCP Client.callTool()
      → MCP server processes request
    ← Returns result to SDK
```

### Git Conflict Resolution

```
Git merge/rebase encounters conflicts
  → GitService detects conflict state
  → Broadcasts GIT_STATUS_CHANGED with conflict files
    → useGitStatusEvents hook → gitStore updated with conflict list
      → Conflict resolution UI shown

AI-assisted resolution:
  → window.api.invoke(IPC.GIT_RESOLVE_CONFLICT_STRATEGY, { tabId, filePath, strategy })
    → PilotSessionManager sends conflict context to agent
    → Agent produces resolved content
    → GitService.resolveFile(filePath, resolvedContent)
      → Marks file as resolved
```

### Push Event (Main → Renderer)

```
Service emits event
  → BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send(IPC.PUSH_CHANNEL, payload))
    → [Electron] window.api.on(IPC.PUSH_CHANNEL, cb) in useEffect
    → [Companion] WebSocket message forwarded by CompanionIpcBridge
      → companion IPC client routes to same callback
```

### Companion Access

```
Companion browser loads companion UI bundle
  → ipc-client.ts detects window.api is absent → enters WebSocket mode
  → All window.api.invoke() calls → WebSocket message to CompanionServer
    → CompanionServer validates token → forwards to main process handler
      → response sent back over WebSocket
  → All window.api.on() subscriptions → registered in CompanionIpcBridge
    → Every main→renderer push event → forwarded over WebSocket to companion
```

## Key Abstractions

### IPC Channel Constants (`shared/ipc.ts`)

- **What**: A single `IPC` object whose values are all channel name strings used for `ipcMain.handle` and `window.api.invoke`.
- **Where**: `shared/ipc.ts`
- **Used by**: Every IPC handler file (`electron/ipc/*`) and every store/hook that makes IPC calls (`src/stores/*`, `src/hooks/*`).
- **Why it matters**: The single source of truth for the IPC contract. Never use raw strings.

### Serializable Types (`shared/types.ts`)

- **What**: All TypeScript interfaces and types that cross the IPC boundary. Must be Structured Clone serializable (no functions, no class instances).
- **Where**: `shared/types.ts`
- **Used by**: Both main and renderer sides.
- **Why it matters**: Defines the API contract. Changes here affect both sides.

### Universal IPC Client (`src/lib/ipc-client.ts`)

- **What**: A dual-mode client. In Electron it wraps `window.api`. In a browser companion client it routes through a WebSocket.
- **Where**: `src/lib/ipc-client.ts`
- **Used by**: All stores and hooks.
- **Why it matters**: Enables the same React code to run on both Electron and a remote browser with zero changes.

### StagedDiff Flow

- **What**: All agent-initiated file writes are intercepted, held in memory as `StagedDiff` objects, and displayed for user review before disk write.
- **Where**: `electron/services/sandboxed-tools.ts` (interception), `electron/services/staged-diffs.ts` (storage), `src/stores/sandbox-store.ts` (renderer state), `src/components/sandbox/` (UI).
- **Why it matters**: Core safety guarantee — the agent cannot write files without explicit user approval (unless yolo mode is on).

### Agent Tool Registration

- **What**: Agent tools are registered per-session during session creation. Custom tools (memory, desktop, editor, MCP) are added alongside SDK built-in tools.
- **Where**: `pi-session-config.ts` (assembly), `memory-tools.ts`, `desktop-tools.ts`, `editor-tools.ts`, `mcp-tool-bridge.ts` (tool definitions).
- **Why it matters**: Tools define what the agent can do. Adding a new tool means creating a `ToolDefinition` and registering it in session config.

### Service Injection Pattern

- **What**: All services are instantiated once in `electron/main/index.ts` and injected into IPC handler registration functions.
- **Where**: `electron/main/index.ts` (instantiation), `electron/ipc/<domain>.ts` (handler registration).
- **Why it matters**: Ensures a single shared instance of each service and makes dependencies explicit.

## Process Isolation (Security)

| Setting | Value | Effect |
|---------|-------|--------|
| `contextIsolation` | `true` | Renderer has no direct Electron/Node access |
| `sandbox` | `true` | Renderer runs in OS sandbox |
| `nodeIntegration` | `false` | Node.js disabled in renderer |
| Project Jail | enforced in `SandboxedTools` | Agent cannot write outside project root |
| Companion TLS | self-signed cert + fingerprint pinning | Companion connection is encrypted |
| Docker isolation | `DesktopService` | Virtual display runs in isolated container |

## External Dependencies

| Dependency | Purpose | Integration Point |
|-----------|---------|-------------------|
| `@mariozechner/pi-coding-agent` | AI agent SDK (sessions, tools, streaming) | `electron/services/pi-session-manager.ts` |
| `@modelcontextprotocol/sdk` | MCP client (stdio, SSE, HTTP transports) | `electron/services/mcp-manager.ts` |
| `dockerode` | Docker container management | `electron/services/desktop-service.ts` |
| `simple-git` | Git operations | `electron/services/git-service.ts` |
| `node-pty` | PTY terminal emulation | `electron/services/terminal-service.ts` |
| `@xterm/xterm` | Terminal UI rendering | `src/components/terminal/` |
| `express` | Companion HTTP server | `electron/services/companion-server.ts` |
| `ws` | Companion WebSocket | `electron/services/companion-server.ts` |
| `@homebridge/ciao` | mDNS/Bonjour discovery | `electron/services/companion-discovery.ts` |
| `node-forge` | TLS cert generation | `electron/services/companion-tls.ts` |
| `chokidar` | File system watching | `electron/ipc/project.ts` |
| `ignore` | Gitignore-syntax file filtering | `electron/ipc/project.ts` |
| `gray-matter` | Frontmatter parsing in memory/prompt files | `electron/services/memory-manager.ts` |
| `adm-zip` | Extension/skill ZIP import | `electron/services/extension-manager.ts` |
| `diff` | Diff computation for staged diffs | `electron/services/staged-diffs.ts` |
| `@sinclair/typebox` | JSON Schema for tool parameter definitions | `electron/services/*-tools.ts` |

## Architectural Decisions

- **No raw IPC strings**: All channel names are constants from `shared/ipc.ts` to prevent typos and enable find-all-references.
- **Stores own IPC, components own rendering**: Components never call `window.api.invoke()` directly — they call store actions.
- **Push events go to all windows**: `BrowserWindow.getAllWindows().forEach(...)` is used everywhere to support multi-window and companion forwarding.
- **Companion is a first-class citizen**: Every main→renderer push event is automatically forwarded to companion clients via `CompanionIpcBridge`, so no special companion-only code paths are needed for event delivery.
- **Session metadata is separate from session files**: Pinned/archived/title metadata lives in `session-metadata.json` so it survives session file deletion.
- **Agent tools are registered per-session**: Each session gets its own tool set based on project context (MCP servers, desktop availability, etc.).
- **MCP servers are reference-counted**: Multiple tabs sharing a project share a single MCP connection with reference counting for cleanup.
- **Desktop containers are project-scoped**: One Docker container per project, shared across all tabs in that project.

## Changes Log

- 2026-03-06: Added Desktop, MCP, editor tools, memory tools, git conflict/rebase flows, agent tool registration pattern
- 2026-02-24: Initial documentation generated
