# Pilot Companion — Desktop Implementation Spec

> Serve Pilot's React UI over the network and bridge IPC over WebSocket so iOS, iPad, and browser clients get full parity — chat, diffs, file tree, terminal, git, everything.

## Architecture

Pilot Desktop already has a React UI in Electron's renderer. The companion system serves that same UI over the network and bridges IPC over WebSocket. The iOS app is a thin native shell around WKWebView.

```
┌─────────────────────┐                        ┌─────────────────────┐
│     iOS / iPad      │         Network         │   Pilot Desktop     │
│  ┌───────────────┐  │                         │                     │
│  │  Native Shell │  │    Bonjour / mDNS       │  ┌───────────────┐  │
│  │  - Discovery  │──┼────────────────────────►│  │  Companion    │  │
│  │  - Auth       │  │                         │  │  Server       │  │
│  │  - Haptics    │  │    HTTPS (self-signed)   │  │               │  │
│  │  - Notifs     │  │◄────────────────────────┼──│  - HTTP serve │  │
│  │               │  │    Serves React bundle   │  │    React UI   │  │
│  │  ┌─────────┐  │  │                         │  │               │  │
│  │  │WKWebView│  │  │    WebSocket (wss://)    │  │  - WS bridge  │  │
│  │  │ (Pilot  │◄─┼──┼────────────────────────┼──│    IPC ↔ WS   │  │
│  │  │  React  │──┼──┼────────────────────────►│  │               │  │
│  │  │  UI)    │  │  │    User input / events   │  │  - mDNS       │  │
│  │  └─────────┘  │  │                         │  │    broadcast   │  │
│  └───────────────┘  │                         │  └───────┬───────┘  │
└─────────────────────┘                         │          │          │
                                                │  ┌───────▼───────┐  │
                                                │  │  Electron     │  │
                                                │  │  Main Process │  │
                                                │  │  (Pi SDK,     │  │
                                                │  │   IPC handlers│  │
                                                │  │   git, tools) │  │
                                                │  └───────────────┘  │
                                                └─────────────────────┘
```

**Zero duplicate UI code.** The iOS app renders the exact same React components. The only iOS-native code is the shell (discovery, auth, notifications, adaptive layout).

---

## New Files

```
electron/
├── services/
│   ├── companion-server.ts      # HTTP + WebSocket server
│   ├── companion-auth.ts        # Pairing, session tokens, PIN/QR
│   ├── companion-discovery.ts   # Bonjour/mDNS advertisement
│   └── companion-ipc-bridge.ts  # Maps WS messages ↔ existing IPC handlers
├── ipc/
│   └── companion.ts             # IPC handlers for companion settings UI
```

---

## Companion Server (`companion-server.ts`)

The server runs inside Electron's main process alongside the existing app. It serves the renderer's built React bundle over HTTPS and bridges IPC over WebSocket.

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 18088 | HTTPS + WebSocket port |
| `reactBundlePath` | string | `dist/renderer/` | Path to the built React bundle (same output Electron loads) |
| `tlsCert` | Buffer | — | Self-signed TLS certificate |
| `tlsKey` | Buffer | — | TLS private key |
| `ipcBridge` | CompanionIPCBridge | — | IPC bridge instance |
| `auth` | CompanionAuth | — | Authentication instance |

**State:** Maintains a `Map<string, WebSocket>` mapping session tokens to active client connections.

**`start()`** — Creates an Express app that serves the React bundle as static files with SPA fallback (all routes return `index.html`). Creates an HTTPS server using the self-signed TLS cert, then attaches a WebSocket server to the same port. Listens on `0.0.0.0` (all interfaces) so it's reachable from other devices on the LAN.

**WebSocket connection handling:** The first message from any new WebSocket client MUST be `{ type: 'auth', token: '...' }`. The server validates the token via `CompanionAuth.validateToken()`. On failure: sends `{ type: 'auth_error' }` and closes with code 4003. On success: sends `{ type: 'auth_ok' }`, registers the client by session ID, and attaches the client to the IPC bridge. On disconnect: removes the client and detaches from the bridge.

**`broadcast(channel, payload)`** — Sends `{ type: 'event', channel, payload }` to all connected clients. Used by `PilotSessionManager` to forward agent events, task changes, and other main-process events to companion clients.

**`stop()`** — Closes all client WebSockets, shuts down the WSS and HTTPS server.

**Properties:** `running` (boolean), `port` (number), `connectedClients` (count).

---

## IPC Bridge (`companion-ipc-bridge.ts`)

This is the critical piece. It maps WebSocket messages to the exact same IPC handler functions the Electron renderer uses. No duplicate logic.

**Key insight:** The IPC handler files (in `electron/ipc/`) export plain functions like `createSession(tabId, projectPath)`. In the normal Electron flow, `ipcMain.handle()` calls these functions, stripping the Electron event object. The bridge calls the same functions directly — no Electron event needed. If any handler currently uses `event.sender`, it must be refactored to accept a callback/emitter instead.

**Handler registry:** Maps every IPC channel string to its handler function. This must mirror the `ipcMain.handle()` registrations in `main.ts` exactly.

| Channel group | Channels |
|---------------|----------|
| Agent | `agent:create-session`, `agent:prompt`, `agent:steer`, `agent:abort` |
| Model | `model:get-available`, `model:cycle` |
| Sessions | `session:list`, `session:new`, `session:fork` |
| Sandbox | `sandbox:get-settings`, `sandbox:toggle-yolo`, `sandbox:accept-diff`, `sandbox:accept-all` |
| Git | `git:status`, `git:stage`, `git:unstage`, `git:commit`, `git:branches`, `git:checkout`, `git:push`, `git:pull`, `git:log`, `git:diff` |
| Settings | `settings:get`, `settings:set` |
| Extensions | `extensions:list`, `extensions:import-zip`, `extensions:toggle`, `extensions:remove` |
| Tasks | `tasks:load-board`, `tasks:create`, `tasks:update`, `tasks:delete`, `tasks:comment`, `tasks:query`, `tasks:ready`, `tasks:epic-progress`, `tasks:dependencies` |
| Memory | `memory:get-entries`, `memory:search`, `memory:inject-context` |
| Updates | `updates:check`, `updates:download`, `updates:install`, `updates:get-status`, `updates:get-platform-info` |

**`attachClient(ws, sessionId)`** — Registers the WebSocket and listens for messages. Skips `auth` type messages (already handled by server). For `ipc` type messages (`{ type: 'ipc', id: 'uuid', channel: 'agent:prompt', args: [...] }`): looks up the handler, invokes it with the provided args, and sends back either `{ type: 'ipc_result', id, result }` or `{ type: 'ipc_error', id, error }`.

**`detachClient(sessionId)`** — Removes the client from the registry.

**`forwardEvent(channel, payload)`** — Sends `{ type: 'event', channel, payload }` to all connected companion clients. Called by existing main process code wherever it currently calls `mainWindow.webContents.send()` — the companion bridge is an additional target alongside the local renderer.

---

## Authentication (`companion-auth.ts`)

Pairing prevents unauthorized access. Two methods: 6-digit PIN (simple) and QR code (contains connection URL + one-time token).

### Data Structures

**PairingSession** (transient, in-memory):

| Field | Type | Description |
|-------|------|-------------|
| `pin` | string | 6-digit PIN or one-time QR token |
| `createdAt` | number | Timestamp |
| `expiresAt` | number | 5 minutes after creation |

**AuthToken** (persisted to disk):

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | UUID |
| `token` | string | 48 random hex bytes |
| `deviceName` | string | e.g. "Espen's iPhone" |
| `createdAt` | number | Timestamp |
| `lastSeen` | number | Updated on each validation |

### Pairing Flow

**`generatePIN()`** — Generates a random 6-digit PIN (100000–999999). Stores as active pairing session with 5-minute expiry. Returns `{ pin, expiresAt }`. Only one active pairing at a time (generating a new PIN replaces the old one).

**`generateQRPayload(serverHost, serverPort)`** — Generates a QR code payload as JSON: `{ type: 'pilot-companion', version: 1, host, port, token }`. The token is a 32-byte random hex string stored as the active pairing credential. Same 5-minute expiry. The iOS app scans this QR code to get everything it needs to connect and authenticate in one step.

**`pair(credential, deviceName)`** — Called when the iOS app submits a PIN or QR token. Validates against the active pairing session: fails if no active pairing, if expired, or if credential doesn't match. On success: generates a long-lived session token (UUID session ID + 48-byte random token), stores it in the token map, clears the active pairing, persists tokens to disk. Returns the token string.

**`validateToken(token)`** — Looks up the token in the map. Updates `lastSeen`. Returns the AuthToken or null.

### Device Management

**`getDevices()`** — Returns list of all paired devices with sessionId, deviceName, lastSeen. Shown in Pilot Settings.

**`revokeDevice(sessionId)`** — Removes all tokens for that session ID. Persists to disk. Any active WebSocket for that session will fail on next message.

### Persistence

Tokens stored in `<PILOT_DIR>/companion-tokens.json`, encrypted at rest using the same mechanism as `auth.json`.

---

## Discovery (`companion-discovery.ts`)

Bonjour/mDNS advertisement so the iOS app auto-finds Pilot on the local network. See [companion-api.md](companion-api.md#discovery-mdns) for the full mDNS protocol spec (service type, TXT records, client discovery).

**`start(port, instanceName)`** — Advertises `_pilot-comp._tcp` using `@homebridge/ciao`. Instance name is the computer's display name.

**`stop()`** — Stops the advertisement.

---

## TLS Certificate Generation

Self-signed cert generated on first run. See [companion-api.md](companion-api.md#connection--tls) for certificate details and pinning protocol.

**`ensureTLSCert(configDir)`** — Checks for `companion-cert.pem` and `companion-key.pem` in `<PILOT_DIR>/`. If missing, generates a self-signed RSA 2048-bit cert (CN=`Pilot Companion`, 10-year validity, SAN: `DNS:localhost` + `IP:0.0.0.0`). Returns `{ cert, key }` as Buffers.

---

## Renderer Modifications

The React app needs ONE change: detect whether it's running in Electron or in a browser, and use the appropriate IPC transport.

### Universal IPC Client (`src/lib/ipc-client.ts`)

Replaces all direct `window.electron.ipcRenderer` calls throughout the React app.

**IPCClient interface:**
- `invoke(channel, ...args)` → `Promise<any>` — Request/response, like `ipcMain.handle()`
- `on(channel, callback)` → `() => void` (unsubscribe) — Listen for events from main process

**ElectronIPCClient** — Wraps `window.electron.ipcRenderer.invoke()` and `.on()`. Used when `window.electron` exists (normal Electron renderer).

**WebSocketIPCClient** — Used in companion mode (browser/WKWebView). Constructor takes WebSocket URL and auth token. Behavior:
- On connect: sends `{ type: 'auth', token }` immediately
- `invoke()`: generates a UUID, sends `{ type: 'ipc', id, channel, args }`, waits for matching `ipc_result` or `ipc_error` response. 30-second timeout.
- `on()`: registers channel listener. When `{ type: 'event', channel, payload }` arrives, calls all matching callbacks.
- Auto-reconnect: on WebSocket close, reconnects after 2 seconds.
- Pending invoke map: `Map<id, { resolve, reject }>` for correlating responses.

**Factory — `createIPCClient()`**: Checks `window.electron` to detect Electron. If present, returns `ElectronIPCClient`. Otherwise reads companion connection params (host, port, token) from `sessionStorage` (injected by the WKWebView setup or the companion server) and returns `WebSocketIPCClient`. Exported as singleton `ipc`.

### Migration

Find-and-replace across the entire React codebase: every `window.electron.ipcRenderer.invoke(` becomes `ipc.invoke(` (imported from `@/lib/ipc-client`). Every `.on()` listener uses `ipc.on()`. This is a mechanical replacement — the channel names and arguments stay exactly the same.

---

## Responsive Layout Hooks

The React app needs to adapt to mobile screen sizes.

### `useLayoutMode()` Hook (`src/hooks/useCompanionMode.ts`)

Returns a `LayoutMode` object:

| Field | Type | Description |
|-------|------|-------------|
| `isCompanion` | boolean | `true` when loaded via companion server (no `window.electron`) |
| `isMobile` | boolean | Viewport width < 768px |
| `isTablet` | boolean | Viewport width 768–1024px |
| `isDesktop` | boolean | Viewport width > 1024px |
| `platform` | `'electron'` \| `'ios'` \| `'browser'` | Detected from user agent and `window.electron` |

Tracks viewport width via `resize` event listener. Detects iOS via user agent string.

### Layout Adaptations

```
Desktop (> 1024px) — existing three-panel layout as-is

Tablet (768–1024px):
┌──────────────────────────────────┐
│ Tab Bar                          │
├──────────────────────────────────┤
│                                  │
│      Chat (full width)           │
│                                  │
├──────────────────────────────────┤
│ 💬 Input                         │
├──────────────────────────────────┤
│ [Chat] [Files] [Git] [Terminal]  │  ← bottom tab bar
└──────────────────────────────────┘

Mobile (< 768px):
┌──────────────────────────────────┐
│ ← Project Name    ⚙️  ⋯          │  ← compact header
├──────────────────────────────────┤
│                                  │
│      Chat (full width)           │
│                                  │
├──────────────────────────────────┤
│ 💬 Input                         │
├──────────────────────────────────┤
│ [Chat] [Files] [Git] [Term] [⚙️] │  ← bottom tab bar
└──────────────────────────────────┘
```

- Sidebar becomes a bottom sheet or drawer (swipe up)
- Context panel becomes a separate view (bottom tab navigation)
- Terminal goes full-screen when active
- Diff review uses unified view only (no side-by-side on mobile)
- Touch targets minimum 44×44pt

---

## Desktop Settings UI

Add a "Companion" section to Pilot Settings:

```
Settings → Companion
  ┌─────────────────────────────────────┐
  │ 📱 Companion Access                  │
  │                                     │
  │ [Toggle] Enable companion server    │
  │                                     │
  │ Port: [18088]                       │
  │                                     │
  │ ── Pair New Device ──               │
  │                                     │
  │ [Show QR Code]  [Show PIN]          │
  │                                     │
  │  ┌─────────┐                        │
  │  │ QR Code │   PIN: 847293          │
  │  │         │   Expires in 4:32      │
  │  └─────────┘                        │
  │                                     │
  │ ── Paired Devices ──                │
  │                                     │
  │ 📱 Espen's iPhone    Last: 2 min ago│
  │                          [Revoke]   │
  │ 📱 Espen's iPad      Last: 3 days   │
  │                          [Revoke]   │
  │                                     │
  │ ── Remote Access ──                 │
  │ [Toggle] Enable Tailscale tunnel    │
  │ URL: https://pilot.tail1234.ts.net  │
  └─────────────────────────────────────┘
```

---

## Config Storage

Add companion config to `<PILOT_DIR>/config.json`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `companion.enabled` | boolean | `false` | Whether companion server starts |
| `companion.port` | number | 18088 | Server port |
| `companion.remoteTunnel.enabled` | boolean | `false` | Whether remote tunnel is active |
| `companion.remoteTunnel.provider` | `'tailscale'` \| `'cloudflare'` | `'tailscale'` | Tunnel provider |

Paired device tokens stored in `<PILOT_DIR>/companion-tokens.json` (encrypted at rest using the same mechanism as `auth.json`).

---

## Remote Access (Beyond Local Network)

See [companion-api.md](companion-api.md#remote-access) for Tailscale and Cloudflare Tunnel client-side setup.

**`setupTailscaleProxy(port)`** — Uses `tailscale cert` + `tailscale status --json` to get a proper TLS cert and DNS name. Returns the `https://<dnsname>:<port>` URL or null.

**`setupCloudflareTunnel(port)`** — Spawns `cloudflared tunnel --url https://localhost:<port>`, parses the `*.trycloudflare.com` URL. Returns URL or null.

---

## Security

See [companion-api.md](companion-api.md#security-model) for the full threat model, certificate pinning protocol, and error handling spec. Key design decisions:

- PIN/QR pairing required for initial access; long-lived tokens thereafter
- Self-signed TLS with cert pinning during pairing (SHA-256 fingerprint)
- Tokens stored in iOS Keychain + encrypted at rest on desktop
- Each WS message has unique ID; auth tokens are per-session

---

## Dependencies

Add to Pilot's `package.json`:

| Package | Version | Purpose |
|---------|---------|---------|
| `ws` | ^8.18.0 | WebSocket server |
| `express` | ^5.0.0 | HTTP static file server |
| `mdns` | ^2.7.0 | Bonjour/mDNS advertisement |
| `qrcode` | ^1.5.0 | QR code generation |
| `@types/ws` | ^8.5.0 | TypeScript types (dev) |
| `@types/express` | ^5.0.0 | TypeScript types (dev) |
| `@types/mdns` | ^2.7.0 | TypeScript types (dev) |

---

## Testing

### Desktop Companion Server
- [ ] Enable/disable companion server in Settings toggles HTTPS + WSS
- [ ] mDNS broadcast visible: `dns-sd -B _pilot-comp._tcp`
- [ ] Opening `https://localhost:18088` in a browser shows Pilot UI
- [ ] WebSocket connection test with `wscat` — auth flow works
- [ ] PIN generation returns 6-digit code with 5-minute expiry
- [ ] QR payload contains valid JSON with host, port, token
- [ ] Pairing with correct PIN returns long-lived token
- [ ] Pairing with wrong PIN returns null
- [ ] Pairing after expiry returns null
- [ ] Token validation updates `lastSeen`
- [ ] Device revocation invalidates token immediately
- [ ] Self-signed TLS cert generated on first run
- [ ] Cert persists across restarts

### IPC Bridge
- [ ] All IPC channels from handler registry are callable via WebSocket
- [ ] `ipc_result` returned for successful handler calls
- [ ] `ipc_error` returned for failed handler calls
- [ ] Unknown channel returns error
- [ ] Events forwarded to all connected companion clients
- [ ] Multiple simultaneous companion clients work independently

### Renderer Migration
- [ ] `ipc.invoke()` works identically in Electron and WebSocket modes
- [ ] `ipc.on()` receives events in both modes
- [ ] WebSocket auto-reconnects after disconnect (2-second delay)
- [ ] 30-second timeout on pending invocations
- [ ] Factory correctly detects Electron vs browser environment

### Responsive Layout
- [ ] `useLayoutMode()` returns correct breakpoints
- [ ] Mobile layout (< 768px) shows bottom tab bar and full-width chat
- [ ] Tablet layout (768–1024px) shows chat with bottom tab navigation
- [ ] Desktop layout (> 1024px) keeps existing three-panel layout
- [ ] Sidebar collapses to bottom sheet on mobile
- [ ] Touch targets meet 44×44pt minimum

### Remote Access
- [ ] Tailscale tunnel returns valid URL when Tailscale is installed
- [ ] Cloudflare tunnel returns `*.trycloudflare.com` URL
- [ ] Both return null gracefully when tools aren't installed
- [ ] Companion accessible over tunnel from outside LAN

---

## Implementation Order

1. ~~`companion-auth.ts` — PIN generation, token issuance, device management~~
2. ~~`companion-ipc-bridge.ts` — WebSocket ↔ IPC handler mapping~~
3. ~~`companion-server.ts` — HTTPS + WebSocket server serving React bundle~~
4. ~~`companion-discovery.ts` — mDNS advertisement~~
5. ~~TLS cert generation on first run~~
6. ~~Refactor React app: `ipc-client.ts` universal IPC client~~
7. ~~Replace all `window.electron.ipcRenderer` calls with `ipc.invoke()`~~
8. ~~Companion settings UI in Pilot (enable/disable, QR, PIN, devices)~~
9. Responsive layout hooks and mobile adaptations — **`useLayoutMode()` hook done; mobile layout adaptations (bottom tab bar, sidebar as bottom sheet, touch targets) not yet implemented**
10. ~~Tailscale / Cloudflare tunnel support~~