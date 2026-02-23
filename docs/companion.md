# Pilot Companion API Reference

> Complete technical reference for building companion clients (iOS, Android, browser) that connect to Pilot Desktop over the network.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Discovery (mDNS)](#discovery-mdns)
3. [Connection & TLS](#connection--tls)
4. [Authentication & Pairing](#authentication--pairing)
5. [WebSocket Protocol](#websocket-protocol)
6. [IPC Channels Reference](#ipc-channels-reference)
7. [Event Channels Reference](#event-channels-reference)
8. [REST Endpoints](#rest-endpoints)
9. [Renderer Companion Mode](#renderer-companion-mode)
10. [Responsive Layout](#responsive-layout)
11. [Remote Access](#remote-access)
12. [Security Model](#security-model)
13. [Error Handling](#error-handling)

---

## Architecture Overview

Pilot Desktop runs a companion server inside the Electron main process. It serves the same React UI over HTTPS and bridges all IPC over WebSocket. Companion clients get full parity — chat, diffs, file tree, terminal, git, everything.

```
┌─────────────────────┐                        ┌─────────────────────┐
│   Companion Client  │         Network         │   Pilot Desktop     │
│                     │                         │                     │
│   1. mDNS browse    │    _pilot-comp     │   mDNS advertise    │
│      ───────────────┼────────────────────────►│                     │
│                     │                         │                     │
│   2. HTTPS GET /    │    self-signed TLS      │   Express serves    │
│      ───────────────┼────────────────────────►│   React bundle      │
│                     │                         │                     │
│   3. WSS connect    │    wss://host:18088/    │   WebSocket server  │
│      ───────────────┼────────────────────────►│                     │
│                     │                         │                     │
│   4. Auth handshake │    { type: 'auth' }     │   CompanionAuth     │
│      ───────────────┼────────────────────────►│   validates token   │
│                     │                         │                     │
│   5. IPC invoke     │    { type: 'ipc' }      │   IPC Bridge maps   │
│      ───────────────┼────────────────────────►│   to ipcMain.handle │
│                     │                         │                     │
│   6. Events pushed  │    { type: 'event' }    │   forwardEvent()    │
│      ◄──────────────┼────────────────────────┤│   mirrors sends     │
└─────────────────────┘                         └─────────────────────┘
```

**Server**: `companion-server.ts` — Express + HTTPS + WebSocket on port `18088`  
**Bridge**: `companion-ipc-bridge.ts` — Routes WS messages to Electron IPC handlers  
**Auth**: `companion-auth.ts` — PIN/QR pairing, session tokens  
**Discovery**: `companion-discovery.ts` — Bonjour/mDNS advertisement  
**TLS**: `companion-tls.ts` — Self-signed certificate generation  

---

## Discovery (mDNS)

The companion server advertises itself via Bonjour/mDNS so clients can auto-discover Pilot on the local network.

### Service Details

| Field | Value |
|-------|-------|
| Service type | `_pilot-comp._tcp` |
| Domain | `local` |
| Port | `18088` (configurable) |
| TXT record `version` | `1` |
| TXT record `app` | `pilot` |
| Instance name | Computer display name (e.g. "Espen's MacBook Pro") |

### Client Discovery (iOS)

```swift
// Use NWBrowser to discover Pilot on the local network
let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_pilot-comp._tcp", domain: "local"), using: .tcp)
browser.browseResultsChangedHandler = { results, changes in
    for result in results {
        // result.endpoint contains host and port
        // result.metadata contains TXT records
    }
}
browser.start(queue: .main)
```

### Client Discovery (Android)

```kotlin
val nsdManager = getSystemService(Context.NSD_SERVICE) as NsdManager
nsdManager.discoverServices("_pilot-comp._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
```

### Client Discovery (CLI — testing)

```bash
# Browse for services
dns-sd -B _pilot-comp._tcp

# Resolve a specific instance
dns-sd -L "Espen's MacBook Pro" _pilot-comp._tcp local
```

---

## Connection & TLS

The companion server uses self-signed TLS certificates. Clients must trust the certificate during the pairing process.

### Certificate Details

| Property | Value |
|----------|-------|
| Algorithm | RSA 2048-bit |
| CN | `Pilot Companion` |
| Validity | 3650 days (10 years) |
| SAN (DNS) | `localhost` |
| SAN (IP) | `127.0.0.1`, `0.0.0.0` |
| Files | `<PILOT_DIR>/companion-cert.pem`, `companion-key.pem` |

### Certificate Pinning

During pairing, the client should capture the certificate's SHA-256 fingerprint and pin all subsequent connections to it:

```swift
// iOS: Implement URLSessionDelegate for certificate pinning
func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
    guard let serverTrust = challenge.protectionSpace.serverTrust,
          let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) else {
        completionHandler(.cancelAuthenticationChallenge, nil)
        return
    }
    let serverFingerprint = sha256(SecCertificateCopyData(certificate) as Data)
    if serverFingerprint == savedFingerprint {
        completionHandler(.useCredential, URLCredential(trust: serverTrust))
    } else {
        completionHandler(.cancelAuthenticationChallenge, nil)
    }
}
```

### Connecting

```
HTTPS: https://<host>:18088/
WSS:   wss://<host>:18088/
```

The HTTPS endpoint serves the Pilot React UI. The WSS endpoint on the same port handles the IPC bridge.

---

## Authentication & Pairing

All WebSocket connections require authentication. The pairing flow creates a long-lived session token.

### Pairing Methods

#### Method 1: PIN Pairing

1. User opens Pilot Desktop → Settings → Companion → "Show PIN"
2. Desktop generates a random 6-digit PIN (100000–999999), valid for 5 minutes
3. User enters PIN in the companion app
4. Companion app calls `POST /api/companion-pair` with the PIN
5. Server validates and returns a long-lived session token

#### Method 2: QR Code Pairing

1. User opens Pilot Desktop → Settings → Companion → "Show QR Code"
2. Desktop generates a QR payload containing everything needed to connect
3. User scans QR with companion app
4. Companion app extracts host, port, and one-time token from QR data
5. Companion app calls `POST /api/companion-pair` with the QR token

### QR Payload Format

```json
{
  "type": "pilot-companion",
  "version": 1,
  "host": "192.168.1.42",
  "port": 18088,
  "token": "a1b2c3d4e5f6...64-char-hex-string"
}
```

### Pairing API

```
POST /api/companion-pair
Content-Type: application/json

{
  "credential": "847293",           // 6-digit PIN or QR token
  "deviceName": "Espen's iPhone"    // Display name for device management
}
```

**Success response** (200):
```json
{
  "token": "a1b2c3...96-char-hex-session-token",
  "wsUrl": "wss://192.168.1.42:18088/"
}
```

**Failure response** (401):
```json
{
  "error": "Invalid or expired credential"
}
```

### Session Token

| Property | Value |
|----------|-------|
| Format | 96 hex characters (48 random bytes) |
| Lifetime | Permanent until revoked |
| Storage (iOS) | Keychain |
| Storage (Desktop) | `<PILOT_DIR>/companion-tokens.json` |

The session token is used for all subsequent WebSocket connections. Store it securely — it grants full access to the Pilot instance.

### Token Data Structure (server-side)

```typescript
interface AuthToken {
  sessionId: string;   // UUID
  token: string;       // 96 hex chars (48 bytes)
  deviceName: string;  // "Espen's iPhone"
  createdAt: number;   // Unix timestamp ms
  lastSeen: number;    // Updated on each validateToken() call
}
```

---

## WebSocket Protocol

All communication after pairing uses a single WebSocket connection with JSON messages.

### Connection Flow

```
Client                          Server
  │                               │
  │──── WSS connect ─────────────►│
  │                               │
  │──── { type: 'auth',      ────►│  First message MUST be auth
  │       token: '...' }         │
  │                               │
  │◄─── { type: 'auth_ok' } ─────│  Success → client is registered
  │  OR                           │
  │◄─── { type: 'auth_error',    │  Failure → connection closed (code 4003)
  │       reason: '...' }   ─────│
  │                               │
  │──── { type: 'ipc', ... } ───►│  IPC invocations (request/response)
  │◄─── { type: 'ipc-response' } │
  │                               │
  │◄─── { type: 'event', ... } ──│  Push events (server → client)
  │                               │
```

**Auth timeout**: 5 seconds. If no auth message received, server sends `auth_error` and closes with code 4003.

### Message Types

#### 1. Auth Request (client → server)

```json
{
  "type": "auth",
  "token": "a1b2c3...96-char-hex-session-token"
}
```

Must be the first message. Server validates via `CompanionAuth.validateToken()`.

#### 2. Auth OK (server → client)

```json
{
  "type": "auth_ok"
}
```

Client is now authenticated and can send IPC messages.

#### 3. Auth Error (server → client)

```json
{
  "type": "auth_error",
  "reason": "Invalid token"
}
```

Connection will be closed with WebSocket close code `4003`.

#### 4. IPC Invoke (client → server)

```json
{
  "type": "ipc",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "channel": "agent:prompt",
  "args": ["tab-1", "Hello, help me refactor this function", "/Users/espen/Dev/myproject"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"ipc"` | Message type |
| `id` | string | UUID for correlating request/response |
| `channel` | string | IPC channel name (see [IPC Channels Reference](#ipc-channels-reference)) |
| `args` | any[] | Arguments passed to the handler (same as Electron IPC args) |

#### 5. IPC Response (server → client)

**Success:**
```json
{
  "type": "ipc-response",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "result": { "history": [...], "sessionPath": "/path/to/session" }
}
```

**Error:**
```json
{
  "type": "ipc-response",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "error": "No project selected. Open a project before sending messages."
}
```

#### 6. Push Event (server → client)

```json
{
  "type": "event",
  "channel": "agent:event",
  "payload": {
    "tabId": "tab-1",
    "event": {
      "type": "assistant_message",
      "content": "Here's the refactored function..."
    }
  }
}
```

Events are pushed automatically — no subscription needed. All events that would go to the Electron renderer are also forwarded to companion clients.

### Auto-Reconnect

Companion clients should implement auto-reconnect:

1. On WebSocket close, wait 2 seconds
2. Reconnect to the same WSS URL
3. Re-send the auth message with the stored session token
4. Resume operations

### Timeouts

| Timeout | Duration | Behavior |
|---------|----------|----------|
| Auth handshake | 5 seconds | Server closes connection if no auth received |
| IPC invoke | 30 seconds | Client should timeout pending invocations |
| Reconnect delay | 2 seconds | Delay before reconnection attempt |

---

## IPC Channels Reference

Every IPC channel available in the Electron renderer is also available over the companion WebSocket. Send as `{ type: 'ipc', channel: '...', args: [...] }`.

### Blocked Channels

These channels are blocked for companion clients (desktop-only):

- `window:minimize`, `window:maximize`, `window:close`, `window:is-maximized`
- `shell:open-external`, `shell:reveal-in-finder`, `shell:open-in-terminal`, `shell:open-in-editor`
- `project:open-dialog` (native file dialog)

### Agent

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `agent:create-session` | `(tabId: string, projectPath: string)` | `void` | Create a new agent session |
| `agent:prompt` | `(tabId: string, text: string, projectPath?: string, images?: any[])` | `void` | Send a prompt to the agent |
| `agent:steer` | `(tabId: string, text: string)` | `void` | Steer the agent while it's running |
| `agent:follow-up` | `(tabId: string, text: string)` | `void` | Queue a follow-up message |
| `agent:get-queued` | `(tabId: string)` | `{ steering: string[], followUp: string[] }` | Get queued messages |
| `agent:clear-queue` | `(tabId: string)` | `{ steering: string[], followUp: string[] }` | Clear queued messages |
| `agent:abort` | `(tabId: string)` | `void` | Abort the current agent operation |
| `agent:dispose` | `(tabId: string)` | `void` | Dispose an agent session |
| `agent:get-slash-commands` | `(tabId: string)` | `Array<{ name, description, source }>` | Get available slash commands |

### Sessions

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `session:ensure` | `(tabId: string, projectPath: string)` | `{ history, sessionPath }` | Ensure session exists, return history |
| `session:get-history` | `(tabId: string)` | `HistoryEntry[]` | Get chat history |
| `session:open` | `(tabId: string, sessionPath: string, projectPath: string)` | `{ history, sessionPath }` | Open a specific session file |
| `session:list` | `(projectPath: string)` | `SessionMetadata[]` | List sessions for a project |
| `session:list-all` | `(projectPaths: string[])` | `SessionMetadata[]` | List sessions across projects |
| `session:get-stats` | `(tabId: string)` | `SessionStats \| null` | Get token usage, cost, etc. |
| `session:get-context-usage` | `(tabId: string)` | `ContextUsage \| null` | Get context window usage |

### Model

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `model:get-available` | `()` | `Array<{ provider, id, name }>` | List available models |
| `model:set` | `(tabId: string, provider: string, modelId: string)` | `ModelInfo` | Set model for a session |
| `model:cycle` | `(tabId: string)` | `ModelInfo` | Cycle to next model |
| `model:cycle-thinking` | `(tabId: string)` | `ThinkingLevel` | Cycle thinking level |
| `model:get-info` | `(tabId: string)` | `ModelInfo \| null` | Get current model info |

### Sandbox (Diff Review)

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `sandbox:get-settings` | `(projectPath: string)` | `ProjectSettings` | Get sandbox settings |
| `sandbox:update-settings` | `(projectPath: string, overrides: object)` | `ProjectSettings` | Update sandbox settings |
| `sandbox:toggle-yolo` | `(tabId: string, projectPath: string)` | `{ yoloMode: boolean }` | Toggle YOLO mode |
| `sandbox:accept-diff` | `(tabId: string, diffId: string)` | `void` | Accept a staged diff |
| `sandbox:reject-diff` | `(tabId: string, diffId: string)` | `void` | Reject a staged diff |
| `sandbox:accept-all` | `(tabId: string)` | `void` | Accept all pending diffs |

### Git

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `git:init` | `(projectPath: string)` | `{ available, isRepo }` | Initialize git service for project |
| `git:init-repo` | `(projectPath: string)` | `{ available, isRepo }` | Initialize a new git repo |
| `git:status` | `(projectPath?: string)` | `GitStatus` | Get git status |
| `git:branches` | `(projectPath?: string)` | `GitBranch[]` | List branches |
| `git:checkout` | `(branch: string, projectPath?: string)` | `void` | Checkout branch |
| `git:create-branch` | `(name: string, from?: string, projectPath?: string)` | `void` | Create new branch |
| `git:stage` | `(paths: string[], projectPath?: string)` | `void` | Stage files |
| `git:unstage` | `(paths: string[], projectPath?: string)` | `void` | Unstage files |
| `git:commit` | `(message: string, projectPath?: string)` | `void` | Commit staged changes |
| `git:push` | `(remote?: string, branch?: string, projectPath?: string)` | `void` | Push to remote |
| `git:pull` | `(remote?: string, branch?: string, projectPath?: string)` | `void` | Pull from remote |
| `git:diff` | `(ref1?: string, ref2?: string, projectPath?: string)` | `string` | Get diff |
| `git:log` | `(options?: GitLogOptions, projectPath?: string)` | `GitCommit[]` | Get commit log |
| `git:blame` | `(filePath: string, projectPath?: string)` | `BlameLine[]` | Get file blame |
| `git:stash-list` | `(projectPath?: string)` | `GitStash[]` | List stashes |
| `git:stash-apply` | `(stashId: string, projectPath?: string)` | `void` | Apply a stash |

### Project (File System)

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `project:set-directory` | `(path: string)` | `void` | Set active project directory |
| `project:file-tree` | `()` | `FileNode[]` | Get project file tree |
| `project:read-file` | `(filePath: string)` | `{ content } \| { error }` | Read file content |
| `project:write-file` | `(filePath: string, content: string)` | `{ ok } \| { error }` | Write file content |
| `project:delete-path` | `(targetPath: string)` | `{ ok } \| { error }` | Delete file or directory |
| `project:rename-path` | `(oldPath: string, newPath: string)` | `{ ok } \| { error }` | Rename file or directory |
| `project:create-file` | `(filePath: string)` | `{ ok } \| { error }` | Create empty file |
| `project:create-directory` | `(dirPath: string)` | `{ ok } \| { error }` | Create directory |

### Settings

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `app-settings:get` | `()` | `PilotAppSettings` | Get app settings |
| `app-settings:update` | `(updates: object)` | `PilotAppSettings` | Update app settings |
| `pi-settings:get` | `()` | `object` | Get pi agent settings |
| `pi-settings:update` | `(updates: object)` | `object` | Update pi agent settings |
| `settings:get` | `(projectPath: string)` | `object` | Get project settings |
| `settings:update` | `(projectPath: string, overrides: object)` | `void` | Update project settings |

### Auth

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `auth:get-providers` | `()` | `ProviderInfo[]` | List auth providers |
| `auth:get-status` | `()` | `{ providers, hasAnyAuth }` | Get auth status |
| `auth:set-api-key` | `(provider: string, apiKey: string)` | `{ success }` | Set API key |
| `auth:logout` | `(provider: string)` | `{ success }` | Remove credentials |

### Tasks

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `tasks:load-board` | `(projectPath: string)` | `TaskBoardData` | Load task board |
| `tasks:create` | `(projectPath: string, input: TaskCreateInput)` | `TaskItem` | Create task |
| `tasks:update` | `(projectPath: string, taskId: string, updates: TaskUpdateInput)` | `TaskItem` | Update task |
| `tasks:delete` | `(projectPath: string, taskId: string)` | `void` | Delete task |
| `tasks:comment` | `(projectPath: string, taskId: string, text: string)` | `TaskComment` | Add comment |
| `tasks:query` | `(projectPath: string, filter: TaskFilter)` | `TaskItem[]` | Query tasks |
| `tasks:ready` | `(projectPath: string)` | `TaskItem[]` | Get ready tasks |
| `tasks:epic-progress` | `(projectPath: string, epicId: string)` | `TaskEpicProgress` | Get epic progress |
| `tasks:dependencies` | `(projectPath: string, taskId: string)` | `TaskDependencyChain` | Get dependency chain |

### Memory

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `memory:get` | `(projectPath: string)` | `string` | Get memory context |
| `memory:get-files` | `(projectPath: string)` | `MemoryFiles` | Get memory file contents |
| `memory:save-file` | `(scope: string, projectPath: string, content: string)` | `void` | Save memory file |
| `memory:clear` | `(scope: string, projectPath: string)` | `void` | Clear memory file |
| `memory:get-count` | `(projectPath: string)` | `MemoryCount` | Get memory entry count |
| `memory:get-paths` | `(projectPath: string)` | `object` | Get memory file paths |

### Extensions

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `extensions:list` | `()` | `InstalledExtension[]` | List extensions |
| `extensions:toggle` | `(extensionId: string)` | `boolean` | Toggle extension |
| `extensions:remove` | `(extensionId: string)` | `boolean` | Remove extension |
| `skills:list` | `()` | `InstalledSkill[]` | List skills |

### Terminal

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `terminal:create` | `(id: string, cwd: string, shell?: string)` | `void` | Create terminal |
| `terminal:data` | `(id: string, data: string)` | `void` | Send input to terminal (fire-and-forget) |
| `terminal:resize` | `(id: string, cols: number, rows: number)` | `void` | Resize terminal |
| `terminal:dispose` | `(id: string)` | `void` | Close terminal |

### Companion Management

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `companion:get-status` | `()` | `CompanionStatus` | Get server status |
| `companion:enable` | `()` | `{ enabled, port, running }` | Start companion server |
| `companion:disable` | `()` | `{ enabled, running }` | Stop companion server |
| `companion:generate-pin` | `()` | `{ pin: string }` | Generate 6-digit pairing PIN |
| `companion:generate-qr` | `(host: string)` | `QRPayload` | Generate QR pairing payload |
| `companion:pair` | `(credential: string, deviceName: string)` | `{ token: string }` | Pair a device |
| `companion:get-devices` | `()` | `DeviceInfo[]` | List paired devices |
| `companion:revoke-device` | `(sessionId: string)` | `{ success: boolean }` | Revoke device access |
| `companion:enable-remote` | `(preferTailscale?: boolean)` | `{ url, type, active }` | Enable remote tunnel |
| `companion:disable-remote` | `()` | `{ active: boolean }` | Disable remote tunnel |

### Workspace

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `tabs:save-state` | `(state: WorkspaceState)` | `void` | Save workspace state |
| `tabs:restore-state` | `()` | `WorkspaceState` | Restore workspace state |

### Prompts

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `prompts:get-all` | `()` | `PromptTemplate[]` | Get all prompts |
| `prompts:get` | `(id: string)` | `PromptTemplate` | Get prompt by ID |
| `prompts:get-commands` | `()` | `PromptCommand[]` | Get slash commands from prompts |
| `prompts:create` | `(input: PromptCreateInput, projectPath?: string)` | `PromptTemplate` | Create prompt |
| `prompts:update` | `(id: string, updates: PromptUpdateInput)` | `PromptTemplate` | Update prompt |
| `prompts:delete` | `(id: string)` | `void` | Delete prompt |
| `prompts:fill` | `(content: string, values: Record<string, string>)` | `string` | Fill template variables |

### Docs

| Channel | Args | Returns | Description |
|---------|------|---------|-------------|
| `docs:read` | `(page: string)` | `string \| null` | Read documentation page |
| `docs:list` | `()` | `string[]` | List available doc pages |

---

## Event Channels Reference

Events are pushed from server to client via `{ type: 'event', channel, payload }`. No subscription needed — all events are broadcast to all connected clients.

| Channel | Payload | Description |
|---------|---------|-------------|
| `agent:event` | `{ tabId, event: AgentSessionEvent }` | Agent output, tool calls, thinking, completions |
| `sandbox:staged-diff` | `StagedDiff` | New diff staged for review |
| `terminal:output` | `{ id: string, data: string }` | Terminal PTY output |
| `terminal:exited` | `string` (terminal ID) | Terminal process exited |
| `project:fs-changed` | `undefined` | File system changed (refresh file tree) |
| `prompts:changed` | `undefined` | Prompt library changed |
| `auth:login-oauth-event` | `{ type, providerId, ... }` | OAuth flow progress |
| `tasks:changed` | `object` | Task data changed |
| `tasks:show-panel` | `{ tabId }` | Show tasks panel |
| `tasks:show-create` | `{ tabId }` | Show task create dialog |
| `memory:updated` | `object` | Memory data changed |
| `memory:show-panel` | `{ tabId }` | Show memory panel |
| `dev:command-output` | `(commandId, output)` | Dev command output |
| `dev:command-status` | `(commandId, status)` | Dev command status change |

### Agent Event Types

The `agent:event` payload contains an event object with these types:

| `event.type` | Description |
|--------------|-------------|
| `assistant_message` | Agent text response (streamed) |
| `tool_call` | Agent is calling a tool |
| `tool_result` | Tool execution result |
| `thinking` | Agent thinking/reasoning (if enabled) |
| `system_message` | System notification |
| `session_complete` | Agent finished |
| `error` | Agent error |
| `model_changed` | Model switched |

---

## REST Endpoints

The companion server exposes these HTTP endpoints alongside the WebSocket:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves Pilot React UI (SPA with companion bootstrap) |
| `GET` | `/api/companion-mode` | Returns `{ companion: true }` — used to detect companion mode |
| `GET` | `/api/companion-config` | Returns `{ wsPort, wsPath, secure, tokenRequired }` |
| `POST` | `/api/companion-pair` | Pair a device (see [Authentication](#authentication--pairing)) |

All other routes serve static files from the React bundle with SPA fallback (returns `index.html`).

---

## Renderer Companion Mode

When the React app is loaded via the companion server (not in Electron), a bootstrap flow runs:

### Bootstrap Sequence

1. Companion server injects a `<script>` into `index.html` that writes the WebSocket URL to `sessionStorage`
2. `main.tsx` calls `initCompanionPolyfill()` before React mounts
3. `initCompanionPolyfill()` detects companion mode (no `window.api`)
4. Creates a `WebSocketIPCClient` that polyfills `window.api` with identical method signatures
5. All React components use `window.api.invoke()` and `window.api.on()` — works identically in both modes

### SessionStorage Keys

| Key | Value | Source |
|-----|-------|--------|
| `companion-ws-url` | `wss://192.168.1.42:18088/` | Injected by companion server |
| `companion-auth-token` | `a1b2c3...` | Set by native app after pairing |

### window.api Polyfill

In companion mode, `window.api` is polyfilled with:

```typescript
window.api = {
  platform: 'ios' | 'darwin' | 'win32' | 'linux',
  invoke: (channel, ...args) => wsClient.invoke(channel, ...args),
  on: (channel, listener) => wsClient.on(channel, listener),
  send: (channel, ...args) => wsClient.send(channel, ...args),
  // Window controls are no-ops:
  windowMinimize: async () => {},
  windowMaximize: async () => {},
  windowClose: async () => {},
  windowIsMaximized: async () => false,
  onWindowMaximizedChanged: () => () => {},
  openExternal: async (url) => { window.open(url, '_blank'); },
};
```

### Native App Integration (iOS/WKWebView)

The iOS app should:

1. Discover Pilot via mDNS
2. Complete pairing (PIN or QR) via the REST API
3. Store the session token in Keychain
4. Load `https://<host>:18088/` in WKWebView
5. Before the page loads, inject the auth token into sessionStorage:

```swift
let script = """
    sessionStorage.setItem('companion-auth-token', '\(sessionToken)');
"""
webView.evaluateJavaScript(script)
```

---

## Responsive Layout

The `useLayoutMode()` hook in `src/hooks/useCompanionMode.ts` provides responsive breakpoints:

| Field | Type | Description |
|-------|------|-------------|
| `isCompanion` | `boolean` | `true` when no `window.api` (not Electron) |
| `isMobile` | `boolean` | Viewport width < 768px |
| `isTablet` | `boolean` | Viewport width 768–1024px |
| `isDesktop` | `boolean` | Viewport width > 1024px |
| `platform` | `string` | `'electron'`, `'ios'`, or `'browser'` |

### Layout Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Desktop | > 1024px | Three-panel (sidebar + chat + context panel) |
| Tablet | 768–1024px | Chat full-width + bottom tab bar for panels |
| Mobile | < 768px | Chat full-width + compact header + bottom tab bar |

### iOS User Agent Detection

```typescript
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
```

---

## Remote Access

For access outside the local network:

### Tailscale

If the user has Tailscale installed, the companion server can be accessed via the tailnet:

```
https://<device-name>.<tailnet>.ts.net:18088/
```

Enable via: `companion:enable-remote` with `preferTailscale: true`

### Cloudflare Tunnel

Uses `cloudflared` to create a quick tunnel (no account needed):

```
https://<random-name>.trycloudflare.com/
```

Enable via: `companion:enable-remote` with `preferTailscale: false`

---

## Security Model

### Threat Mitigations

| Threat | Mitigation |
|--------|------------|
| Unauthorized LAN access | PIN/QR pairing required, long-lived tokens |
| Man-in-the-middle | Self-signed TLS, certificate pinning during pairing |
| Token theft | iOS Keychain storage, encrypted on desktop |
| Replay attacks | Each WS message has unique ID |
| Rogue mDNS | Pairing step verifies identity via PIN |

### Companion Blocklist

Security-sensitive channels are blocked from companion access:

```typescript
const COMPANION_BLOCKLIST = new Set([
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:is-maximized',
  'shell:open-external',
  'shell:reveal-in-finder',
  'shell:open-in-terminal',
  'shell:open-in-editor',
  'project:open-dialog',
]);
```

---

## Error Handling

### WebSocket Errors

| Code | Meaning | Action |
|------|---------|--------|
| 4003 | Auth failed | Re-pair the device |
| 1000 | Normal close | Server shutting down, reconnect |
| 1006 | Abnormal close | Network issue, auto-reconnect |

### IPC Errors

IPC errors are returned in the `error` field of `ipc-response`:

```json
{
  "type": "ipc-response",
  "id": "...",
  "error": "No project selected. Open a project before sending messages."
}
```

Common errors:

| Error | Cause | Resolution |
|-------|-------|------------|
| `No handler registered for channel: ...` | Channel is blocked or doesn't exist | Check blocklist / channel name |
| `No project selected` | Tab has no project path | Call `project:set-directory` first |
| `Git not initialized` | Git service not set up for project | Call `git:init` first |
| `Session not found` | Tab ID doesn't have an active session | Call `session:ensure` first |

---

## File Reference

| File | Purpose |
|------|---------|
| `electron/services/companion-server.ts` | Express HTTPS + WebSocket server |
| `electron/services/companion-auth.ts` | PIN/QR pairing, session tokens, device management |
| `electron/services/companion-ipc-bridge.ts` | WebSocket ↔ IPC handler mapping with auto-sync |
| `electron/services/companion-discovery.ts` | Bonjour/mDNS advertisement |
| `electron/services/companion-tls.ts` | Self-signed TLS certificate generation |
| `electron/services/companion-remote.ts` | Tailscale / Cloudflare tunnel support |
| `electron/ipc/companion.ts` | IPC handlers for Settings UI |
| `shared/ipc.ts` | IPC channel name constants (includes `COMPANION_*`) |
| `src/lib/ipc-client.ts` | Universal IPC client with WebSocket polyfill |
| `src/hooks/useCompanionMode.ts` | `useLayoutMode()` responsive hook |
| `<PILOT_DIR>/companion-tokens.json` | Persisted device tokens |
| `<PILOT_DIR>/companion-cert.pem` | Self-signed TLS certificate |
| `<PILOT_DIR>/companion-key.pem` | TLS private key |
