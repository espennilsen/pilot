# Pilot Plugin System — Design Plan

> Status: Design Complete
> Date: 2026-05-01
>
> **Implementation Plans:**
> - [Phase 1: Foundation](./2026-05-01-plugin-phase-1-foundation.md) — Types, PluginBridge, Extension Host, Installer, Store
> - [Phase 2: GUI Slots](./2026-05-01-plugin-phase-2-gui-slots.md) — Sidebar, Panel, Status Bar, Settings, Tabs, Chat Renderers
> - [Phase 3: Agent Integration](./2026-05-01-plugin-phase-3-agent-integration.md) — Tool Wrapper, Event Forwarding, Tool/Skill Injection, User Approval
> - [Phase 4: SDK & DevEx](./2026-05-01-plugin-phase-4-sdk-devex.md) — @pilot/plugin-sdk, Scaffolding, Dev Mode, Debugging, Docs
> - [Phase 5: Distribution](./2026-05-01-plugin-phase-5-distribution.md) — Community Catalog, Search, In-App Browser

## Terminology

| Term | Definition |
|------|-----------|
| **Plugin** | A third-party package that extends the Pilot **GUI** (panels, views, commands, status bar, etc.). Runs in the Extension Host. |
| **Extension** | A Pi SDK package that extends the **coding agent** (tools, system prompts, event handlers). Runs in the main process. Managed by Pi SDK. |
| **Extension Host** | A forked Node.js child process where plugins run. Isolated from both the main process and renderer. |
| **PluginBridge** | A service in the main process that mediates between the Extension Host and Pilot's services/renderer. |
| **Contribution Point** | A pre-defined slot in the Pilot GUI where plugins can add UI elements. |

---

## 1. Architecture Overview

### Process Model

```
┌──────────────────────────────────────────────────────────────┐
│  Renderer Process (React, no Node.js)                        │
│                                                              │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ Shell UI │  │ Contribution  │  │ Plugin Webview       │  │
│  │ (tabs,    │  │ Slots         │  │ (sandboxed iframe,   │  │
│  │ panels,   │  │ - sidebar     │  │  optional per-plugin │  │
│  │ status    │  │ - right panel │  │  HTML/CSS/JS panel)  │  │
│  │ bar)      │  │ - status bar  │  │                      │  │
│  │           │  │ - context menu│  │                      │  │
│  │           │  │ - tab bar     │  │                      │  │
│  │           │  │ - chat stream │  │                      │  │
│  └──────────┘  └───────────────┘  └──────────────────────┘  │
│       │               │                      ▲               │
│       │   window.api  │                      │ postMessage   │
│       │   .invoke()   │                      │               │
│       └───────┬───────┘                      │               │
└───────────────┼──────────────────────────────┼───────────────┘
                │ IPC                          │
┌───────────────┼──────────────────────────────┼───────────────┐
│  Main Process │                              │               │
│               │                              │               │
│  ┌────────────▼──────────┐  ┌───────────────▼─────────────┐  │
│  │ Existing Services     │  │ PluginBridge                │  │
│  │ - PilotSessionManager│  │ - Contribution registry      │  │
│  │ - SandboxedTools      │  │ - Event forwarding           │  │
│  │ - MemoryManager       │  │ - Permission enforcement     │  │
│  │ - GitService          │  │ - Plugin lifecycle mgmt      │  │
│  │ - Pi SDK              │  │ - Tool/skill injection       │  │
│  └───────────────────────┘  └──────────────┬──────────────┘  │
│                                            │ stdio           │
│                                            │ JSON-RPC 2.0    │
└────────────────────────────────────────────┼─────────────────┘
                                             │
┌────────────────────────────────────────────┼─────────────────┐
│  Extension Host (forked Node.js process)   │                 │
│                                            ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Plugin A     │  │ Plugin B     │  │ Plugin C     │       │
│  │ @pilot-      │  │ @pilot-      │  │ git:github.  │       │
│  │ plugins/a2a  │  │ plugins/gh   │  │ com/user/foo │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Plugins run in a separate process** — the Extension Host. They never touch the DOM directly. All UI is rendered by the Pilot shell from declarative contributions.

2. **JSON-RPC 2.0 over stdio** — the protocol between PluginBridge and Extension Host. Same approach VS Code uses. Request/response correlation via `id` field. Notifications for fire-and-forget.

3. **No custom registry** — plugins are distributed via npm and git repos. Discovery through npm search, a community index repo, or direct install.

4. **PluginBridge hooks into existing interception points** — no proxy extension needed. Pi SDK runs in-process; PluginBridge taps into `PilotSessionManager` events, `SandboxedTools` tool wrapping, and prompt assembly.

5. **Hybrid capabilities** — plugins can contribute GUI elements AND register agent tools/skills from a single activation. Agent parts are delegated to Pi SDK via existing mechanisms (`SessionToolInjector` for tools, prompt assembly for skills).

---

## 2. Plugin Manifest

Each plugin is an npm package (or git repo) with a `package.json` declaring contributions under the `pilot` key:

```jsonc
{
  "name": "@pilot-plugins/github-dashboard",
  "version": "1.0.0",
  "description": "GitHub PR and CI status in your sidebar",
  "main": "./dist/plugin.js",
  "pilot": {
    "plugins": ["./dist/plugin.js"],
    "permissions": [
      "ui:sidebar",
      "ui:status-bar",
      "ui:context-menu",
      "agent:tools",
      "agent:skills",
      "agent:events",
      "network:github.com",
      "fs:read",
      "git:status"
    ]
  },
  "dependencies": {
    "@pilot/plugin-sdk": "^1.0.0"
  }
}
```

### Permissions

| Category | Permission | Description |
|----------|-----------|-------------|
| **UI** | `ui:sidebar` | Add views to the left sidebar |
| | `ui:panel` | Add views to the right panel |
| | `ui:status-bar` | Add items to the status bar |
| | `ui:context-menu` | Add items to context menus |
| | `ui:settings` | Add settings sections |
| | `ui:tabs` | Register custom tab types |
| | `ui:chat-renderer` | Register chat message renderers |
| **Agent** | `agent:tools` | Register agent tools |
| | `agent:skills` | Register agent skills |
| | `agent:events` | Listen to agent events |
| **System** | `network:*` or `network:host` | Make network requests |
| | `fs:read` | Read files from the project |
| | `fs:write` | Write files to the project |
| | `git:status` | Read git status |
| | `git:write` | Run git operations |
| | `shell:exec` | Execute shell commands |

Permissions are shown to the user on install and must be explicitly approved.

---

## 3. Contribution Points

### 3.1 Plugin Activation

Each plugin exports an `activate` function:

```typescript
import { activate } from "@pilot/plugin-sdk";

activate((pilot) => {
  // Register GUI contributions
  // Register agent tools/skills
  // Subscribe to events
});
```

The `activate` callback receives the `PluginAPI` object. All registrations happen during activation. Deactivation is handled by returning a cleanup function.

### 3.2 Views (Sidebar & Panel)

```typescript
// Tree view — for hierarchical data (file trees, agent lists, etc.)
pilot.contributions.registerTreeView("github-prs", {
  title: "Pull Requests",
  icon: "git-pull-request",
  location: "sidebar",  // "sidebar" | "panel"
  getChildren: async (element) => {
    // element is null for root, or a tree item for children
    return items.map(item => ({
      id: item.id,
      label: item.title,
      description: item.status,
      icon: getStatusIcon(item),
      collapsible: false,
      command: { id: "pilot.openUrl", args: [item.url] }
    }));
  }
});

// Webview view — for full custom HTML/CSS/JS panels
pilot.contributions.registerWebviewView("github-ci-log", {
  title: "CI Output",
  location: "panel",
  getHtml: () => `<html>...</html>`,
  onMessage: (msg) => { /* handle postMessage from webview */ }
});
```

### 3.3 Status Bar

```typescript
const item = pilot.contributions.createStatusBarItem("github-ci", {
  alignment: "left",   // "left" | "right"
  priority: 10,        // lower = farther left/right
  text: "$(check) CI: 3/5 passing",
  tooltip: "GitHub CI Status",
  command: { id: "github-dashboard.showCI" }
});

// Update dynamically
item.setText("$(x) CI: 4/5 failing");
```

### 3.4 Context Menus

```typescript
pilot.contributions.registerContextMenu({
  // On file tree items
  when: "view == file-tree && resourceExt == .json",
  group: "navigation",
  items: [
    { label: "Format JSON", command: { id: "json-formatter.format" } },
  ]
});

pilot.contributions.registerContextMenu({
  // On chat messages
  when: "view == chat-message",
  group: "1_actions",
  items: [
    { label: "Copy as Markdown", command: { id: "clipboard.copyMarkdown" } },
  ]
});
```

### 3.5 Custom Tab Types

```typescript
pilot.contributions.registerTabType("a2a-conversation", {
  label: "A2A Chat",
  icon: "radio",
  renderWebview: (context) => ({
    html: buildConversationHtml(context.tabData),
    onMessage: (msg) => handleTabMessage(context, msg)
  }),
  // Optional: custom tab actions
  actions: [
    { label: "Clear", command: { id: "a2a.clearConversation" } }
  ]
});
```

### 3.6 Chat Message Renderers

```typescript
pilot.contributions.registerMessageRenderer("github-pr-card", {
  matchToolName: "github_list_prs",
  renderResult: (props) => ({
    type: "custom",
    component: "PrCardList",  // rendered by a pre-built renderer in the shell
    data: props.result.details  // passed as props
  })
});

// For completely custom rendering:
pilot.contributions.registerMessageRenderer("my-custom-block", {
  matchCustomType: "my-plugin-payload",
  render: (props) => `<div class="my-plugin-card">${sanitize(props.data)}</div>`
});
```

### 3.7 Settings Sections

```typescript
pilot.contributions.registerSettingsSection("github-dashboard", {
  title: "GitHub Dashboard",
  icon: "github",
  render: () => `<div>
    <label>GitHub Token</label>
    <input type="password" id="gh-token" />
  </div>`,
  onSave: (formData) => {
    // Persist to plugin storage
  }
});
```

### 3.8 Commands

```typescript
pilot.contributions.registerCommand("github-dashboard.refresh", {
  label: "GitHub: Refresh Dashboard",
  handler: async () => {
    await refreshData();
  }
});

// Commands can be bound to keybindings:
pilot.contributions.registerCommand("github-dashboard.openRepo", {
  label: "GitHub: Open Repository",
  keybinding: "ctrl+shift+g",
  handler: async () => { /* ... */ }
});
```

---

## 4. Plugin API Surface

The `PluginAPI` object passed to `activate()`:

### 4.1 GUI Contributions

```typescript
interface PluginAPI {
  contributions: {
    // Views
    registerTreeView(id: string, options: TreeViewOptions): TreeView;
    registerWebviewView(id: string, options: WebviewViewOptions): WebviewView;
    
    // Status bar
    createStatusBarItem(id: string, options: StatusBarOptions): StatusBarItem;
    
    // Context menus
    registerContextMenu(options: ContextMenuOptions): void;
    
    // Tabs
    registerTabType(id: string, options: TabTypeOptions): void;
    
    // Chat
    registerMessageRenderer(id: string, options: MessageRendererOptions): void;
    
    // Settings
    registerSettingsSection(id: string, options: SettingsSectionOptions): void;
    
    // Commands
    registerCommand(id: string, options: CommandOptions): void;
  };
```

### 4.2 Agent Integration

```typescript
  agent: {
    // Register agent tools (delegates to SessionToolInjector)
    registerTool(definition: ToolDefinition): Promise<void>;
    removeTool(name: string): Promise<void>;
    
    // Register skills (injected into system prompt assembly)
    registerSkill(content: string, options?: { scope?: 'global' | 'project' }): Promise<void>;
    removeSkill(id: string): Promise<void>;
    
    // Subscribe to agent events
    on(event: AgentEventName, handler: AgentEventHandler): void;
    off(event: AgentEventName, handler: AgentEventHandler): void;
  };
```

### 4.3 Plugin Storage & State

```typescript
  storage: {
    // Key-value store scoped to this plugin, persisted to disk
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
```

### 4.4 Workspace & Project

```typescript
  workspace: {
    // Current project path (read-only)
    projectPath: string | null;
    
    // Watch for project changes
    onDidChangeProject(callback: (path: string | null) => void): void;
    
    // Access Pilot services (gated by permissions)
    git: {
      getStatus(): Promise<GitStatus>;
      getBranches(): Promise<GitBranch[]>;
      // ... (only if git:read permission granted)
    };
  };
```

### 4.5 Agent Events

```typescript
type AgentEventName = 
  | 'tool_call'       // Before tool execution (can block)
  | 'tool_result'     // After tool execution (can modify)
  | 'agent_start'     // Agent turn starts
  | 'agent_end'       // Agent turn complete
  | 'turn_start'      // Individual turn starts
  | 'turn_end'        // Individual turn ends
  | 'message_start'   // Message starts streaming
  | 'message_update'  // Message token update
  | 'message_end'     // Message complete
  | 'session_start'   // Session created/restored
  | 'session_shutdown'; // Session ending
```

Events carrying non-serializable fields (SessionManager references, AbortSignal, UI context) have those fields stripped before forwarding. The API exposes only the serializable subset documented per event.

---

## 5. PluginBridge — Internal Architecture

### 5.1 Interception Points

PluginBridge hooks into three existing Pilot pipelines:

```
┌─────────────────────────────────────────────────────────┐
│  PilotSessionManager                                    │
│                                                         │
│  session.on('event', (e) => {                           │
│    broadcastToRenderer(IPC.AGENT_EVENT, e);  // existing│
│    pluginBridge.forwardAgentEvent(e);        // NEW      │
│  });                                                    │
│                                                         │
│  // Tool injection at session creation / plugin request  │
│  injectTools(session, pluginTools);          // existing │
│                                                         │
│  // Prompt assembly                                     │
│  buildSystemPrompt({ ..., pluginSkills });   // NEW      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  SandboxedTools                                         │
│                                                         │
│  Generic tool wrapper applied to ALL tools:  // NEW      │
│    before: pluginBridge.forward('tool_call', ...)        │
│    after:  pluginBridge.forward('tool_result', ...)      │
│    (no-op if no plugins registered for this tool)        │
└─────────────────────────────────────────────────────────┘
```

### 5.2 JSON-RPC 2.0 Protocol

#### Requests (PluginBridge → Extension Host)

```jsonc
// Forward agent event to plugins
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "agent/event",
  "params": {
    "name": "tool_call",
    "payload": {
      "toolName": "bash",
      "toolCallId": "call_123",
      "input": { "command": "rm -rf /" }
    }
  }
}

// Call a plugin command
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "plugin/command",
  "params": {
    "commandId": "github-dashboard.refresh",
    "args": []
  }
}

// Request tree children for a view
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "view/getChildren",
  "params": {
    "viewId": "github-prs",
    "element": null
  }
}
```

#### Responses (Extension Host → PluginBridge)

```jsonc
// Block a tool call
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "handled": true,
    "block": true,
    "reason": "Dangerous command blocked by plugin"
  }
}

// Passthrough (no plugin interested)
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "handled": false }
}
```

#### Notifications (Extension Host → PluginBridge, fire-and-forget)

```jsonc
// Update status bar
{
  "jsonrpc": "2.0",
  "method": "ui/updateStatusBar",
  "params": {
    "itemId": "github-ci",
    "text": "$(x) CI: 5/5 failing"
  }
}

// Update tree view data
{
  "jsonrpc": "2.0",
  "method": "ui/refreshView",
  "params": {
    "viewId": "github-prs"
  }
}
```

### 5.3 Generic Tool Wrapper

```typescript
// In sandboxed-tools.ts — wraps every tool with plugin interception
function wrapToolForPlugins(
  tool: ToolDefinition,
  bridge: PluginBridge
): ToolDefinition {
  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // Before: forward to plugins, await response
      const beforeResult = await bridge.forward('tool_call', {
        toolName: tool.name,
        toolCallId,
        input: params,
      });
      
      if (beforeResult.block) {
        return {
          content: [{ type: 'text', text: `Blocked: ${beforeResult.reason}` }],
          details: { blocked: true, reason: beforeResult.reason },
        };
      }
      
      // Apply any input mutations from plugins
      if (beforeResult.patchedInput) {
        Object.assign(params, beforeResult.patchedInput);
      }
      
      // Execute the actual tool
      const result = await tool.execute(toolCallId, params, signal, onUpdate, ctx);
      
      // After: forward result to plugins, allow modification
      const afterResult = await bridge.forward('tool_result', {
        toolName: tool.name,
        toolCallId,
        input: params,
        result,
      });
      
      return afterResult.modifiedResult || result;
    }
  };
}
```

### 5.4 Event Forwarding with Fan-out

When multiple plugins register for the same event, PluginBridge fans out the request to all matching plugins and merges results:

```typescript
async forwardEvent(name: string, payload: unknown): Promise<EventResult> {
  const registrations = this.getRegistrations(name);
  if (registrations.length === 0) return { handled: false };
  
  let blocked = false;
  let blockReason = '';
  let patchedInput = {};
  let modifiedResult = null;
  
  for (const reg of registrations) {
    const result = await this.sendRpc(reg.pluginId, 'agent/event', {
      name,
      payload
    });
    
    if (result.block) {
      blocked = true;
      blockReason = result.reason;
      break;  // First block wins
    }
    
    if (result.patchedInput) Object.assign(patchedInput, result.patchedInput);
    if (result.modifiedResult) modifiedResult = result.modifiedResult;
  }
  
  return { handled: true, blocked, blockReason, patchedInput, modifiedResult };
}
```

---

## 6. Security Model

### 6.1 Plugin Sandboxing

- Plugins run in a forked Node.js child process with no direct filesystem access
- All system calls go through the JSON-RPC bridge → main process → gated by permissions
- The Extension Host has no `require('electron')` access — it's a plain Node.js process
- Plugins cannot access `window`, `document`, or any renderer APIs
- Webview views run in `<iframe sandbox>` with no Node.js integration

### 6.2 Permission Enforcement

On install, the user sees:

```
┌──────────────────────────────────────────────┐
│  Install Plugin: @pilot-plugins/github       │
│                                              │
│  This plugin wants to:                       │
│  ✓ Add a sidebar panel                       │
│  ✓ Add status bar items                      │
│  ✓ Add agent tools                           │
│  ✓ Make network requests to github.com       │
│  ✓ Read git status                           │
│                                              │
│  [View Details]  [Cancel]  [Install]         │
└──────────────────────────────────────────────┘
```

PluginBridge enforces permissions at the RPC level — every method call is checked against the plugin's declared permissions before executing. Unauthorized calls return an error.

### 6.3 User Approval for Agent Changes

When a plugin registers agent tools or skills, the user approves separately from the initial install:

```
┌──────────────────────────────────────────────┐
│  Plugin "GitHub Dashboard" wants to add:     │
│                                              │
│  Tools:                                       │
│  • github_list_prs — List pull requests      │
│  • github_get_ci — Get CI status             │
│                                              │
│  Skills:                                      │
│  • GitHub workflow conventions               │
│                                              │
│  [Deny]  [Allow]                             │
└──────────────────────────────────────────────┘
```

---

## 7. Distribution & Discovery

### 7.1 Installation

```bash
# From npm
pilot plugin install @pilot-plugins/github-dashboard
pilot plugin install @pilot-plugins/github-dashboard@1.2.0

# From git
pilot plugin install git:github.com/user/pilot-plugin
pilot plugin install git:github.com/user/pilot-plugin@v1.0.0

# From local path (development)
pilot plugin install ./my-plugin

# List installed
pilot plugin list

# Remove
pilot plugin remove @pilot-plugins/github-dashboard

# Update
pilot plugin update              # all
pilot plugin update github-dashboard  # specific
```

### 7.2 Plugin Storage

```
<PILOT_DIR>/
├── plugins/
│   ├── node_modules/
│   │   └── @pilot-plugins/
│   │       └── github-dashboard/
│   │           ├── package.json
│   │           ├── dist/
│   │           │   └── plugin.js
│   │           ├── skills/
│   │           │   └── github-workflow.md
│   │           └── node_modules/
│   │               └── octokit/
│   └── plugin-registry.json      # installed plugins + enabled state
└── extension-registry.json        # existing Pi SDK extension registry
```

### 7.3 Discovery (Future)

Phase 1: Direct install only.

Phase 2: Community index — a simple git repo (`pilot-plugins/registry`) containing a JSON catalog of known plugins. Users browse via `pilot plugin search github` which fetches and searches the index.

Phase 3: In-app plugin browser — a sidebar panel that renders the catalog with descriptions, install counts, and one-click install.

---

## 8. Implementation Phases

### Phase 1 — Foundation (Core Infrastructure)

| # | Task | Description |
|---|---|---|
| 1 | Define plugin types | `shared/types.ts` — PluginManifest, ContributionPoint types, PluginPermissions |
| 2 | Add IPC channels | `shared/ipc.ts` — PLUGIN_INSTALL, PLUGIN_LIST, PLUGIN_REMOVE, PLUGIN_TOGGLE, PLUGIN_EVENT |
| 3 | Create PluginBridge service | `electron/services/plugin-bridge.ts` — JSON-RPC server over stdio, permission enforcement, registration bookkeeping |
| 4 | Create Extension Host bootstrap | `electron/services/extension-host.ts` — child_process.fork(), JSON-RPC client, plugin loader via jiti |
| 5 | Plugin installer | `electron/services/plugin-installer.ts` — npm install / git clone, permission prompt, registry management |
| 6 | Register Plugin IPC handlers | `electron/ipc/plugins.ts` — PLUGIN_* channel handlers |
| 7 | Wire into main/index.ts | Instantiate PluginBridge, start Extension Host, register IPC handlers |

**Milestone:** Plugin loads, activates, and can communicate with main process. No GUI contributions yet.

### Phase 2 — GUI Contribution Slots

| # | Task | Description |
|---|---|---|
| 8 | Contribution slot registry | Renderer-side registry of available slots — sidebar sections, panel tabs, status bar zones |
| 9 | Sidebar views | Render TreeView and WebviewView contributions in sidebar |
| 10 | Panel views | Render views in right panel tab bar |
| 11 | Status bar items | Render plugin status bar items alongside built-in items |
| 12 | Context menus | Hook plugin context menus into file tree, chat messages, tab bar |
| 13 | Settings sections | Render plugin settings in Settings modal |
| 14 | Tab types | Support custom tab creation and rendering via webviews |

**Milestone:** Plugin can contribute UI. A "Hello World" sidebar plugin works end-to-end.

### Phase 3 — Agent Integration

| # | Task | Description |
|---|---|---|
| 15 | Generic tool wrapper | Wrap all tools with before/after plugin forwarding in sandboxed-tools.ts |
| 16 | Agent event forwarding | Forward agent events through PluginBridge to Extension Host |
| 17 | Tool injection | PluginBridge → SessionToolInjector for registering plugin tools |
| 18 | Skill injection | PluginBridge → prompt assembly for injecting plugin skills |
| 19 | User approval flow | Permission prompts for agent tool/skill registrations |

**Milestone:** Plugin can add agent tools and react to agent events.

### Phase 4 — Plugin SDK & Developer Experience

| # | Task | Description |
|---|---|---|
| 20 | `@pilot/plugin-sdk` npm package | Plugin API types, activate function, contribution helpers |
| 21 | Plugin scaffolding | `pilot plugin init` — generates plugin project from template |
| 22 | Plugin development mode | `pilot plugin dev ./my-plugin` — hot-reload on changes |
| 23 | Debugging support | `pilot --inspect-plugin` — attaches Node.js inspector to Extension Host |
| 24 | API documentation | Plugin SDK reference, contribution point guide, examples |

### Phase 5 — Distribution & Discovery

| # | Task | Description |
|---|---|---|
| 25 | Community index repo | `github.com/pilot-plugins/registry` — JSON catalog with CI validation |
| 26 | `pilot plugin search` | CLI search against the community index |
| 27 | In-app plugin browser | Sidebar panel: browse, search, install plugins |
| 28 | Plugin verification | Optional plugin signing / checksum verification for trust |

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Latency from IPC round-trips** | Tool wrapper only forwards when plugins registered. Short-circuits to no-op for tools with no listeners. Async event forwarding doesn't block the main agent loop. |
| **Plugin crashes don't take down Pilot** | Extension Host is a separate process. Crashes are caught, plugin is auto-disabled, user notified. |
| **Malicious plugins** | Permission model limits damage. No DOM access. All system calls gated. npm audit and community index review process. |
| **API surface grows unbounded** | Contribution points are deliberately finite. VsCode has ~50; we start with 8. Add new ones based on real plugin demand, not speculation. |
| **SDK internals break (SessionToolInjector)** | Already isolated with runtime guards that detect SDK changes. If Pi SDK adds a public API, swap to it. |
| **Companion mode compatibility** | PluginBridge forwards events to renderer via IPC (same as existing push events), which automatically reach companion via `CompanionIpcBridge`. Plugin webview views are iframe-based, compatible with companion browser. |
| **Plugin conflicts (two plugins for same slot)** | View registration is first-come-first-served per slot ID. Ordering is configurable via priority. Conflicts are surfaced to user. |
| **npm dependency hell** | Plugins live in their own `node_modules` under `<PILOT_DIR>/plugins/`. Isolated from Pilot's dependencies. |

---

## 10. What's Explicitly Out of Scope

- **Custom registry server** — using npm/git instead
- **Plugin marketplace website** — community index repo is sufficient initially
- **Plugin monetization / paid plugins** — not needed for v1
- **Cross-plugin communication** — plugins are isolated from each other
- **Plugin-specific linting / testing framework** — developers use standard tools
- **Extending the companion server** — plugins work in companion mode via existing forwarding, but cannot add new companion-specific features
- **Extending Pi SDK internals** — plugins use the public extension API only (tools, skills, events forwarded via PluginBridge)

---

## 11. Plugin Examples (Illustrative)

### Example: A2A Plugin

```typescript
// @pilot-plugins/a2a/plugin.js
activate((pilot) => {
  // Sidebar panel: discovered agents
  pilot.contributions.registerTreeView("a2a-agents", {
    title: "A2A Agents",
    location: "sidebar",
    getChildren: async () => {
      const agents = await discoverAgents();
      return agents.map(a => ({
        label: a.name,
        description: a.description,
        command: { id: "a2a.openConversation", args: [a.id] }
      }));
    }
  });

  // Custom tab: A2A conversation
  pilot.contributions.registerTabType("a2a-conversation", {
    label: "A2A Chat",
    renderWebview: (ctx) => buildA2ATab(ctx),
  });

  // Agent tool: send message to A2A agent
  pilot.agent.registerTool({
    name: "a2a_send",
    description: "Send a message to a remote A2A agent",
    parameters: Type.Object({
      agentId: Type.String(),
      message: Type.String(),
    }),
    execute: async (id, params) => {
      const response = await a2aClient.send(params.agentId, params.message);
      return { content: [{ type: 'text', text: response }] };
    }
  });

  // Agent tool: discover A2A agents
  pilot.agent.registerTool({
    name: "a2a_discover",
    description: "Discover available A2A agents",
    parameters: Type.Object({}),
    execute: async () => {
      const agents = await discoverAgents();
      return {
        content: [{
          type: 'text',
          text: agents.map(a => `- ${a.name}: ${a.description}`).join('\n')
        }]
      };
    }
  });

  // Status bar: active connections
  pilot.contributions.createStatusBarItem("a2a-connections", {
    alignment: "right",
    text: "$(radio) 3 agents connected",
  });
});
```

### Example: GitHub Dashboard Plugin

```typescript
// @pilot-plugins/github-dashboard/plugin.js
activate((pilot) => {
  // Sidebar: PR list
  pilot.contributions.registerTreeView("github-prs", {
    title: "Pull Requests",
    location: "sidebar",
    getChildren: () => fetchPRs().then(mapToTreeItems),
  });

  // Status bar: CI status
  const ciItem = pilot.contributions.createStatusBarItem("github-ci", {
    alignment: "left",
    text: "$(sync~spin) Loading CI...",
  });
  
  // Update periodically
  setInterval(async () => {
    const status = await getCIStatus();
    ciItem.setText(getCIStatusText(status));
  }, 60000);

  // Context menu: file tree → Git blame
  pilot.contributions.registerContextMenu({
    when: "view == file-tree",
    group: "git",
    items: [
      { label: "GitHub: Open on Web", command: { id: "github.openOnWeb" } },
      { label: "GitHub: Copy Permalink", command: { id: "github.copyPermalink" } },
    ]
  });

  // Agent tools
  pilot.agent.registerTool({
    name: "github_list_prs",
    description: "List open pull requests for the current repo",
    parameters: Type.Object({ state: Type.Optional(Type.String()) }),
    execute: async (id, params) => {
      const prs = await octokit.pulls.list({ state: params.state || 'open' });
      return {
        content: [{ type: 'text', text: formatPRs(prs) }],
        details: { prs }  // used by chat message renderer
      };
    }
  });

  // Custom chat renderer for PR results
  pilot.contributions.registerMessageRenderer("github-pr-card", {
    matchToolName: "github_list_prs",
    renderResult: (props) => ({
      type: "cards",
      items: props.result.details.prs.map(pr => ({
        title: pr.title,
        subtitle: `#${pr.number} by ${pr.user.login}`,
        badge: pr.state,
        url: pr.html_url,
      }))
    })
  });
});
```

---

## 12. Changes to Existing Code

### New files:

```
electron/
  services/
    plugin-bridge.ts          # JSON-RPC server, permission enforcement, fan-out
    plugin-installer.ts       # npm/git install, registry management
    extension-host.ts         # child_process fork, plugin loader
  ipc/
    plugins.ts                # PLUGIN_* IPC handlers
shared/
  types.ts                    # Add PluginManifest, PluginContribution, PluginPermissions types
  ipc.ts                      # Add PLUGIN_* channel constants
src/
  components/
    plugins/                  # Plugin contribution slot rendering
      PluginSidebarViews.tsx
      PluginPanelViews.tsx
      PluginStatusBar.tsx
      PluginContextMenus.tsx
      PluginSettingsSections.tsx
  stores/
    plugin-store.ts           # Installed plugins, active contributions, event subscriptions
  hooks/
    usePluginEvents.ts        # Forward contribution data from main → renderer
```

### Modified files:

| File | Change |
|------|--------|
| `electron/main/index.ts` | Instantiate PluginBridge, start Extension Host, register plugin IPC handlers |
| `electron/services/sandboxed-tools.ts` | Add generic tool wrapper for plugin before/after interception |
| `electron/services/pi-session-manager.ts` | Forward agent events to PluginBridge |
| `electron/services/pi-session-config.ts` | Accept plugin skill injections in prompt assembly |
| `electron/utils/broadcast.ts` | No change needed — PluginBridge uses same `broadcastToRenderer` for rendering contributions |
| `src/app.tsx` | Render contribution slots (sidebar extensions section, status bar plugin zone) |
| `src/components/sidebar/Sidebar.tsx` | Add plugin views section |
| `src/components/context/ContextPanel.tsx` | Add plugin panel tabs |
| `src/components/status-bar/StatusBar.tsx` | Add plugin status bar zone |
| `src/components/settings/SettingsPanel.tsx` | Add plugin settings section |
| `src/components/tab-bar/TabBar.tsx` | Support custom tab types |
| `src/components/chat/ChatMessage.tsx` | Support plugin message renderers |
