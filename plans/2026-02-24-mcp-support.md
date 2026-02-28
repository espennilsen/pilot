---
task: "Add MCP (Model Context Protocol) server support to Pilot"
status: completed
created: 2026-02-24
approach: "MCP client in main process, tools bridged as SDK ToolDefinitions"
---

# MCP Support for Pilot

## Understanding

Add MCP (Model Context Protocol) support to Pilot so users can configure external MCP servers (stdio, SSE, and Streamable HTTP transports) and have their tools available to the AI agent during sessions. This follows the same pattern as Claude Desktop — users declare MCP servers in a config file, Pilot manages their lifecycle (spawn/connect/disconnect), and the servers' tools appear as regular tools the agent can call.

**Assumptions:**
- The Pi SDK has **no built-in MCP support** — confirmed by codebase search. We need to implement the MCP client layer ourselves in Pilot's main process.
- MCP server tools should appear as regular `ToolDefinition` objects to the SDK — same as sandboxed tools, memory tools, etc. This means no SDK changes are needed.
- MCP servers are configured **globally** (app-level) and optionally **per-project** (project-level), similar to how extensions/skills work with dual scope.
- We support all three MCP transports: **stdio** (spawn a process), **SSE** (connect to HTTP+SSE endpoint), and **Streamable HTTP** (the newer HTTP transport).
- MCP server lifecycle is tied to **session lifecycle** — servers start when a session is created and stop when it's disposed. Shared servers (used by multiple tabs on the same project) should be reference-counted.
- The sandbox/jail system should **not** apply to MCP tool results by default — MCP tools are pre-approved by the user configuring the server. However, yolo mode and sandbox settings should control whether MCP tool calls require approval.

**Open questions:**
1. **Should MCP servers be per-project, global, or both?** Recommendation: both, matching the extensions pattern (global in `<PILOT_DIR>/mcp.json`, project in `<project>/.pilot/mcp.json`). The UI merges them.
2. **Should MCP tool calls go through the sandbox approval flow?** Recommendation: Yes when yolo mode is OFF (default), the user sees tool calls before execution. When yolo is ON, they auto-execute. This matches the existing sandboxed tools pattern.
3. **Should we support MCP resources and prompts in addition to tools?** Recommendation: Start with **tools only** in Phase 1. Resources and prompts can be added later — they're less common and more complex to integrate.

---

## Approach Options

### Option A: Direct MCP Client Integration (Recommended)

**Summary:** Implement an `McpManager` service in the main process that uses `@modelcontextprotocol/sdk` to manage MCP server connections, and bridge their tools as SDK `ToolDefinition` objects injected into sessions.

**How it works:**
1. Add `@modelcontextprotocol/sdk` as a dependency
2. Create `McpManager` service that reads MCP config, manages server lifecycle (start/stop/reconnect), and exposes discovered tools
3. In `buildSessionConfig()`, call `McpManager.getToolsForProject()` to get `ToolDefinition[]` wrappers for each MCP server's tools
4. MCP tool calls flow: Agent calls tool → SDK invokes our `ToolDefinition.execute()` → we forward to MCP server via the SDK client → return result
5. Settings UI gets an "MCP Servers" tab to add/edit/remove/test servers
6. Server health monitoring with auto-reconnect and status indicators

**Pros:**
- Clean separation — MCP is a service like any other, no SDK modifications needed
- Full control over lifecycle, error handling, and UI
- Can add sandbox approval for MCP tool calls
- Future-proof for MCP resources/prompts

**Cons:**
- More code to write and maintain
- Need to handle transport-specific edge cases (stdio process crashes, SSE timeouts)

**Effort:** Large (but well-scoped into phases)

### Option B: Extension-Based MCP Support

**Summary:** Implement MCP as a Pilot extension that hooks into the extension system rather than as a core service.

**How it works:**
1. Create a built-in extension that manages MCP servers
2. Extension registers tools dynamically via the extension API
3. Config lives in extension-specific storage

**Pros:**
- Leverages existing extension infrastructure
- Could be distributed independently

**Cons:**
- Extension API doesn't support dynamic tool registration well — `ToolDefinition` must be known at session creation time
- Extensions are loaded per-session, complicating server lifecycle management (can't share servers between tabs)
- Worse UX — MCP is a first-class feature, not an extension
- The Pi SDK extension system is different from Pilot's extension management

**Effort:** Medium, but more hacky

### Option C: Proxy MCP via Claude's API native MCP support

**Summary:** Pass MCP server config to the AI provider and let them handle it.

**Pros:** Zero client-side work

**Cons:** Only works with providers that support MCP natively (Anthropic's tool_use doesn't support MCP pass-through today). Not portable. Doesn't give Pilot control over approval flow.

**Effort:** Small, but extremely limited

**Recommendation:** **Option A** — Direct MCP Client Integration. It's the most work but it's the right architecture. MCP is a core capability, not a bolt-on. The tool bridging pattern (MCP tools → `ToolDefinition`) is clean and proven by how Pilot already wraps sandboxed tools, memory tools, task tools, etc.

---

## Task Breakdown

### Phase 1: MCP Manager Service & Config (Backend Foundation)

- [ ] **1.1** Install `@modelcontextprotocol/sdk` as a dependency
- [ ] **1.2** Add MCP types to `shared/types.ts`:
  - `McpServerConfig` — server definition (name, transport, command/args/url/headers, env, enabled)
  - `McpServerStatus` — runtime state (id, name, status: connecting|connected|error|disconnected, toolCount, error?)
  - `McpToolInfo` — discovered tool metadata (serverId, name, description, inputSchema)
- [ ] **1.3** Create `electron/services/mcp-manager.ts`:
  - `McpManager` class: manages server connections, tool discovery, lifecycle
  - `loadConfig(projectPath?)` — reads global + project MCP config, merges
  - `startServer(id)` / `stopServer(id)` / `restartServer(id)` — lifecycle
  - `startAllForProject(projectPath)` — starts all enabled servers relevant to a project
  - `stopAllForTab(tabId)` — reference-counted cleanup
  - `getToolDefinitions(projectPath)` → `ToolDefinition[]` — bridges MCP tools to SDK tool format
  - `getServerStatuses()` → `McpServerStatus[]` — for UI
  - Event emitter for status changes → push to renderer
- [ ] **1.4** Create `electron/services/mcp-config.ts`:
  - `loadMcpConfig()` — reads `<PILOT_DIR>/mcp.json`
  - `loadProjectMcpConfig(projectPath)` — reads `<project>/.pilot/mcp.json`
  - `saveMcpConfig(config)` / `saveProjectMcpConfig(projectPath, config)`
  - `mergeMcpConfigs(global, project)` — project overrides global by server name
- [ ] **1.5** Create MCP tool bridge (`electron/services/mcp-tool-bridge.ts`):
  - `createMcpToolDefinition(client, tool, serverId)` → `ToolDefinition`
  - Maps MCP `Tool` → Pi SDK `ToolDefinition` with proper parameter schema conversion (JSON Schema → TypeBox)
  - `execute()` calls `client.callTool()` and formats result as `AgentToolResult`
  - Handles MCP tool errors gracefully (returns error text, doesn't crash session)

**Checkpoint:** `McpManager` can load config, connect to a stdio MCP server, list its tools, and call a tool programmatically. Verified via unit test or dev console.

### Phase 2: Session Integration

- [ ] **2.1** Wire `McpManager` into `PilotSessionManager`:
  - Instantiate `McpManager` in constructor (alongside `MemoryManager`, `TaskManager`, etc.)
  - Expose as public property for IPC registration
- [ ] **2.2** Update `buildSessionConfig()` in `pi-session-config.ts`:
  - Accept `mcpManager: McpManager` in `SessionConfigOptions`
  - Call `mcpManager.getToolDefinitions(projectPath)` to get MCP tool definitions
  - Add MCP tools to `customTools` array
- [ ] **2.3** Update `initSession()` to register tab with MCP manager:
  - Call `mcpManager.startAllForProject(projectPath, tabId)` during session init
  - Call `mcpManager.stopAllForTab(tabId)` during `dispose()`
- [ ] **2.4** Handle MCP tool calls in the sandbox flow:
  - When yolo mode is OFF, MCP tool calls should show in the staged diff queue for approval
  - Add `'mcp'` as a new `StagedDiff.operation` type (or handle differently since MCP tools don't produce diffs — they produce arbitrary results)
  - Decision: MCP tool calls execute immediately (like web_fetch), but results are shown in the chat. The sandbox only gates file-writing tools. MCP tools are user-configured and pre-trusted.

**Checkpoint:** Create a session with a project that has an MCP server configured. The agent can see MCP tools in its available tools. Calling an MCP tool from the agent works end-to-end.

### Phase 3: IPC & Renderer Communication

- [ ] **3.1** Add IPC channels to `shared/ipc.ts`:
  - `MCP_LIST_SERVERS` — get all configured servers with status
  - `MCP_ADD_SERVER` — add a new server config
  - `MCP_UPDATE_SERVER` — update server config
  - `MCP_REMOVE_SERVER` — remove server config
  - `MCP_START_SERVER` — manually start a server
  - `MCP_STOP_SERVER` — manually stop a server
  - `MCP_RESTART_SERVER` — restart a server
  - `MCP_GET_TOOLS` — list tools from a specific server
  - `MCP_TEST_SERVER` — test connection to a server
  - `MCP_SERVER_STATUS` (push) — server status changes
- [ ] **3.2** Create `electron/ipc/mcp.ts`:
  - `registerMcpIpc(mcpManager)` — register all MCP IPC handlers
- [ ] **3.3** Register in `electron/main/index.ts`:
  - Instantiate and wire up MCP IPC handlers
- [ ] **3.4** Create `src/stores/mcp-store.ts`:
  - Zustand store for MCP state: servers list, statuses, loading states
  - Actions: `loadServers()`, `addServer()`, `updateServer()`, `removeServer()`, `testServer()`
  - Subscribe to `MCP_SERVER_STATUS` push events

**Checkpoint:** Renderer can list, add, remove MCP servers via IPC. Server status updates flow from main → renderer in real-time.

### Phase 4: Settings UI

- [ ] **4.1** Create `src/components/settings/sections/McpSettings.tsx`:
  - List of configured MCP servers with status indicators (green dot = connected, red = error, grey = stopped)
  - "Add Server" button → inline form or modal
  - Per-server: name, transport type (stdio/sse/streamable-http), command+args (stdio) or URL (SSE/HTTP), env vars, enabled toggle
  - Per-server actions: start/stop/restart, test connection, remove
  - Show discovered tools count per server
  - Expand server to see list of tools it provides
- [ ] **4.2** Add MCP tab to `SettingsPanel.tsx`:
  - Add to `TABS` array: `{ id: 'mcp', label: 'MCP Servers', icon: Plug }` (or `Server` icon)
  - Position after Extensions/Skills (these are conceptually related)
- [ ] **4.3** Add server scope selector:
  - Toggle between "Global" and "Project" scope when adding/editing servers
  - Show scope badge on each server in the list
- [ ] **4.4** Add MCP status indicator to chat header or status bar:
  - Small indicator showing N connected MCP servers
  - Click to open MCP settings
  - Show error badge if any server is in error state

**Checkpoint:** User can add an MCP server through the UI, see it connect, view its tools, and verify the agent can use them in a conversation.

### Phase 5: Robustness & Polish

- [ ] **5.1** Server lifecycle management:
  - Auto-reconnect on disconnect (with exponential backoff)
  - Process crash detection for stdio servers (watch child process exit)
  - Graceful shutdown on app quit (`disposeAll`)
  - Connection timeout handling
- [ ] **5.2** Reference counting for shared servers:
  - Multiple tabs on the same project share MCP server connections
  - Track which tabs use which servers
  - Only stop a server when the last tab using it is disposed
- [ ] **5.3** Tool namespace prefixing:
  - Prefix MCP tool names to avoid collisions with built-in tools: `mcp_<servername>_<toolname>` or just use the MCP server name as context
  - Or: if tool names are unique, use them directly; if collision detected, prefix
- [ ] **5.4** Config file watching:
  - Watch `mcp.json` files for external edits
  - Auto-reload and reconcile running servers
- [ ] **5.5** Error handling & user feedback:
  - Surface MCP server errors in the UI (toast notifications or status bar)
  - Log MCP traffic in developer mode for debugging
  - Handle malformed tool responses gracefully
- [ ] **5.6** Companion support:
  - Forward MCP server status events to companion clients
  - Expose MCP config endpoints via companion REST API

**Checkpoint:** MCP servers survive session restarts, reconnect after crashes, multiple tabs share connections correctly, and error states are clearly communicated to the user.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MCP SDK adds significant bundle size | Low | Low | It's a runtime dependency in main process only, not bundled for renderer |
| stdio server processes become zombies on crash | Medium | Medium | Track child PIDs, kill on dispose, use process group kills. Add watchdog. |
| Tool name collisions between MCP servers and built-in tools | Medium | High | Prefix strategy: `mcp__<servername>__<toolname>` for MCP tools, or detect and warn |
| JSON Schema → TypeBox conversion is lossy | Medium | Medium | Handle common cases (object, string, number, array, enum). Fall back to `Type.Any()` for complex schemas. Agent still sees the JSON Schema description. |
| MCP server sends huge responses (e.g., file contents) | Low | Medium | Truncate tool results beyond a configurable limit, show warning |
| Config format diverges from Claude Desktop / other tools | Low | Low | Follow Claude Desktop's `mcpServers` format as closely as possible for familiarity |
| SSE/HTTP transport needs CORS handling in Electron | Low | Low | Main process HTTP requests don't have CORS restrictions |
| MCP servers with long-running tools block agent | Medium | Medium | Support AbortSignal forwarding to MCP `callTool`, implement timeout |
| Windows path/spawn issues with stdio servers | Medium | Medium | Use `cross-spawn` or careful `spawn` with shell detection per platform |

---

## Affected Files

### Create
- `electron/services/mcp-manager.ts` — Core MCP server lifecycle management
- `electron/services/mcp-config.ts` — Config loading/saving (global + project)
- `electron/services/mcp-tool-bridge.ts` — MCP Tool → SDK ToolDefinition bridge
- `electron/ipc/mcp.ts` — IPC handlers for MCP domain
- `src/stores/mcp-store.ts` — Zustand store for MCP state
- `src/components/settings/sections/McpSettings.tsx` — MCP settings UI
- `plans/2026-02-24-mcp-support.md` — This plan

### Modify
- `package.json` — Add `@modelcontextprotocol/sdk` dependency
- `shared/ipc.ts` — Add MCP IPC channel constants
- `shared/types.ts` — Add MCP types (McpServerConfig, McpServerStatus, McpToolInfo)
- `electron/main/index.ts` — Instantiate McpManager, register MCP IPC, wire into session manager
- `electron/services/pi-session-manager.ts` — Add McpManager as dependency, pass to buildSessionConfig
- `electron/services/pi-session-config.ts` — Accept McpManager, include MCP tools in customTools
- `src/components/settings/SettingsPanel.tsx` — Add MCP tab to settings navigation
- `src/stores/ui-store.ts` — Add 'mcp' to settings tab type (if typed)

### No changes needed
- `electron/preload/index.ts` — No changes (uses generic `invoke`/`on`)
- `electron/services/sandboxed-tools.ts` — MCP tools don't go through sandbox
- `electron/services/extension-manager.ts` — MCP is separate from extensions

---

## Config File Format

Following Claude Desktop's convention for familiarity:

**`<PILOT_DIR>/mcp.json`** (global):
```json
{
  "mcpServers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents"],
      "env": {},
      "enabled": true
    },
    "web-search": {
      "transport": "sse",
      "url": "http://localhost:8080/sse",
      "headers": {},
      "enabled": true
    },
    "remote-api": {
      "transport": "streamable-http",
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer xxx" },
      "enabled": true
    }
  }
}
```

**`<project>/.pilot/mcp.json`** (project-level, same format):
```json
{
  "mcpServers": {
    "my-db": {
      "transport": "stdio",
      "command": "node",
      "args": ["./tools/db-mcp-server.js"],
      "env": { "DATABASE_URL": "postgres://..." },
      "enabled": true
    }
  }
}
```

Merge strategy: project servers are added to global servers. If same name exists in both, project wins.

---

## Ready to Execute?

Plan is complete. Please review and let me know:
- ✅ **Approve** — proceed with implementation (I'll start with Phase 1)
- 🔄 **Revise** — adjust the approach (tell me what to change)
- ❓ **Clarify** — answer open questions first
- ❌ **Cancel** — abort this task
