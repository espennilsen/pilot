# Phase 4 — Plugin SDK & Developer Experience

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Create the `@pilot/plugin-sdk` npm package that plugin authors import, plus developer tooling (scaffolding, dev mode with hot-reload, debugging support) and comprehensive API documentation. Plugin authors should be able to `pilot plugin init my-plugin`, write code with full type safety, and test with hot-reload.

**Architecture:** The SDK is an npm package `@pilot/plugin-sdk` that exports TypeScript types (`PluginAPI`, contribution interfaces) and an `activate` helper. Developer tooling is built into the Pilot CLI as `pilot plugin init|dev` commands. Hot-reload is achieved by watching the plugin directory and calling `plugin/deactivate` + `plugin/activate` on the Extension Host.

**Tech Stack:** npm, TypeScript, jiti, chokidar (file watching), Node.js child_process.

---

## Task 1: Create the @pilot/plugin-sdk npm Package

**Files:**
- Create: `packages/plugin-sdk/package.json`
- Create: `packages/plugin-sdk/src/index.ts`
- Create: `packages/plugin-sdk/tsconfig.json`

**Step 1: Set up package structure**

Create `packages/plugin-sdk/package.json`:

```json
{
  "name": "@pilot/plugin-sdk",
  "version": "0.1.0",
  "description": "TypeScript SDK for building Pilot plugins",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  },
  "peerDependencies": {},
  "license": "MIT"
}
```

**Step 2: Create tsconfig.json**

Create `packages/plugin-sdk/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 3: Write the SDK source**

Create `packages/plugin-sdk/src/index.ts`:

```typescript
/**
 * @pilot/plugin-sdk — TypeScript SDK for building Pilot plugins.
 *
 * Usage:
 *   import { activate, type PluginAPI } from '@pilot/plugin-sdk';
 *
 *   activate((pilot: PluginAPI) => {
 *     pilot.contributions.registerTreeView('my-view', { ... });
 *     return () => { /* cleanup */ };
 *   });
 */

// ─── Contribution Types ──────────────────────────────────────────────

/** Options for registering a TreeView. */
export interface TreeViewOptions {
  title: string;
  icon?: string;
  location: 'sidebar' | 'panel';
  /** Called to get root-level children. Pass null as element. */
  getChildren?: (element: any | null) => Promise<TreeItem[]> | TreeItem[];
}

/** A single item in a tree view. */
export interface TreeItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  collapsible?: boolean;
  /** Command to run when clicked. */
  command?: { id: string; args?: unknown[] };
}

/** Options for registering a WebviewView (full custom HTML panel). */
export interface WebviewViewOptions {
  title: string;
  icon?: string;
  location: 'sidebar' | 'panel';
  /** Return the HTML content for the webview. */
  getHtml: () => string | Promise<string>;
  /** Handle messages posted from the webview via postMessage. */
  onMessage?: (message: unknown) => void;
}

/** Options for creating a status bar item. */
export interface StatusBarItemOptions {
  text: string;
  tooltip?: string;
  alignment: 'left' | 'right';
  priority: number;
  command?: { id: string; args?: unknown[] };
}

/** Options for registering a context menu. */
export interface ContextMenuOptions {
  /** When clause — e.g., "view == file-tree", "view == chat-message" */
  when: string;
  /** Group for ordering within the menu. */
  group: string;
  /** Menu items. */
  items: Array<{
    label: string;
    command: { id: string; args?: unknown[] };
  }>;
}

/** Options for registering a custom tab type. */
export interface TabTypeOptions {
  label: string;
  icon?: string;
  /** Called when a tab of this type is opened. Returns HTML for the webview. */
  renderWebview: (context: TabContext) => { html: string; onMessage?: (msg: unknown) => void };
  /** Tab-level actions shown in the tab bar. */
  actions?: Array<{ label: string; command: { id: string; args?: unknown[] } }>;
}

export interface TabContext {
  tabData: Record<string, unknown>;
}

/** Options for registering a chat message renderer. */
export interface MessageRendererOptions {
  /** Match tool calls by tool name. */
  matchToolName?: string;
  /** Match custom message types. */
  matchCustomType?: string;
  /** Optional: transform tool result for display. */
  renderResult?: (props: { result: { content?: Array<{ type: string; text?: string }>; details?: unknown }; data?: unknown }) => {
    type: 'cards' | 'list' | 'custom';
    items?: Array<Record<string, unknown>>;
    html?: string;
  };
}

/** Options for registering a settings section. */
export interface SettingsSectionOptions {
  title: string;
  icon?: string;
  /** Return HTML for the settings form. */
  render: () => string | Promise<string>;
  /** Called when the user saves settings. */
  onSave?: (formData: Record<string, unknown>) => void | Promise<void>;
}

/** Options for registering a command. */
export interface CommandOptions {
  label: string;
  /** Optional keybinding (e.g., "ctrl+shift+g"). */
  keybinding?: string;
  handler: (args?: unknown[]) => void | Promise<void>;
}

// ─── Agent Types ─────────────────────────────────────────────────────

/** Tool definition for agent tools. */
export interface ToolDefinition {
  name: string;
  label?: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text?: string }>;
    details?: Record<string, unknown>;
  }>;
}

/** Serialised agent event forwarded to plugin event handlers. */
export interface AgentEvent {
  name: string;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  message?: unknown;
  prompt?: string;
}

/** Return type for tool_call event handlers. */
export interface ToolCallResult {
  block?: boolean;
  reason?: string;
  patchedInput?: Record<string, unknown>;
}

/** Return type for tool_result event handlers. */
export interface ToolResultModification {
  modifiedResult?: unknown;
}

/** Union type for event handler return values. */
export type AgentEventResult = ToolCallResult | ToolResultModification | Record<string, unknown> | void;

/** Callback for agent event handlers. */
export type AgentEventHandler = (event: AgentEvent) => AgentEventResult | Promise<AgentEventResult>;

// ─── Plugin API ──────────────────────────────────────────────────────

/**
 * The PluginAPI object passed to the activate function.
 * Plugins use this to register contributions and interact with Pilot.
 */
export interface PluginAPI {
  /** Register GUI contributions (views, status bar, commands, etc.). */
  contributions: {
    registerTreeView(id: string, options: TreeViewOptions): void;
    registerWebviewView(id: string, options: WebviewViewOptions): void;
    createStatusBarItem(id: string, options: StatusBarItemOptions): void;
    registerContextMenu(options: ContextMenuOptions): void;
    registerTabType(id: string, options: TabTypeOptions): void;
    registerMessageRenderer(id: string, options: MessageRendererOptions): void;
    registerSettingsSection(id: string, options: SettingsSectionOptions): void;
    registerCommand(id: string, options: CommandOptions): void;
  };

  /** Interact with the AI agent. */
  agent: {
    registerTool(definition: ToolDefinition): Promise<void>;
    removeTool(name: string): Promise<void>;
    registerSkill(content: string, options?: { scope?: 'global' | 'project' }): Promise<void>;
    removeSkill(id: string): Promise<void>;
    on(event: string, handler: AgentEventHandler): void;
    off(event: string, handler: AgentEventHandler): void;
  };

  /** Persistent key-value storage scoped to this plugin. */
  storage: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };

  /** Read-only workspace information. */
  workspace: {
    projectPath: string | null;
    /** Subscribe to project changes. */
    onDidChangeProject(callback: (path: string | null) => void): () => void;
  };
}

// ─── Activate Helper ─────────────────────────────────────────────────

/**
 * Declare the global `activate` function that the Extension Host calls.
 * This is what plugin entry files export as default.
 */
export type ActivateFunction = (pilot: PluginAPI) => void | (() => void) | Promise<void | (() => void)>;

/**
 * Helper to define the activate function with correct typing.
 * Usage:
 *   import { activate, type PluginAPI } from '@pilot/plugin-sdk';
 *   activate((pilot: PluginAPI) => { ... });
 */
export function activate(fn: ActivateFunction): ActivateFunction {
  return fn;
}
```

**Step 4: Build the package**

```bash
cd packages/plugin-sdk && npm install && npm run build
```

**Step 5: Verify the build output exists**

```bash
ls packages/plugin-sdk/dist/
```

Expected: `index.js`, `index.d.ts`

**Step 6: Commit**

```bash
git add packages/plugin-sdk/
git commit -m "feat(plugins): create @pilot/plugin-sdk npm package"
```

---

### Task 2: Plugin Scaffolding — `pilot plugin init`

**Files:**
- Create: `electron/services/plugin-scaffolder.ts`

**Step 1: Create the scaffolder**

Create `electron/services/plugin-scaffolder.ts`:

```typescript
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const PACKAGE_JSON_TEMPLATE = `{
  "name": "{{NAME}}",
  "version": "1.0.0",
  "description": "{{DESCRIPTION}}",
  "main": "./dist/plugin.js",
  "pilot": {
    "plugins": ["./dist/plugin.js"],
    "permissions": [
      "ui:sidebar"
    ]
  },
  "devDependencies": {
    "@pilot/plugin-sdk": "^0.1.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
`;

const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`;

const PLUGIN_SRC_TEMPLATE = `import { activate, type PluginAPI } from '@pilot/plugin-sdk';

activate((pilot: PluginAPI) => {
  console.log('{{NAME}} plugin activated!');

  // Register a sidebar view
  pilot.contributions.registerTreeView('{{SAFE_NAME}}-main', {
    title: '{{NAME}}',
    icon: 'puzzle',
    location: 'sidebar',
    getChildren: async () => {
      return [
        {
          id: 'hello',
          label: 'Hello from {{NAME}}!',
          icon: 'smile',
        },
      ];
    },
  });

  // Register a status bar item
  pilot.contributions.createStatusBarItem('{{SAFE_NAME}}-status', {
    text: '{{NAME}} active',
    alignment: 'right',
    priority: 100,
    tooltip: '{{NAME}} plugin',
  });

  // Return cleanup function
  return () => {
    console.log('{{NAME}} plugin deactivated');
  };
});
`;

export function scaffoldPlugin(
  name: string,
  targetDir: string,
  description?: string,
): { success: boolean; path?: string; error?: string } {
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const pluginDir = resolve(targetDir, safeName);

  if (existsSync(pluginDir)) {
    return { success: false, error: `Directory already exists: ${pluginDir}` };
  }

  try {
    mkdirSync(join(pluginDir, 'src'), { recursive: true });

    const desc = description || `${name} plugin for Pilot`;

    const packageJson = PACKAGE_JSON_TEMPLATE
      .replace(/{{NAME}}/g, safeName)
      .replace(/{{DESCRIPTION}}/g, desc);

    const tsconfig = TSCONFIG_TEMPLATE;

    const pluginSrc = PLUGIN_SRC_TEMPLATE
      .replace(/{{NAME}}/g, name)
      .replace(/{{SAFE_NAME}}/g, safeName);

    writeFileSync(join(pluginDir, 'package.json'), packageJson);
    writeFileSync(join(pluginDir, 'tsconfig.json'), tsconfig);
    writeFileSync(join(pluginDir, 'src', 'plugin.ts'), pluginSrc);

    return { success: true, path: pluginDir };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to scaffold plugin',
    };
  }
}
```

**Step 2: Add plugin init IPC channel**

In `shared/ipc.ts`:

```typescript
PLUGIN_INIT: 'plugin:init',
```

**Step 3: Register IPC handler**

In `electron/ipc/plugins.ts`:

```typescript
import { scaffoldPlugin } from '../services/plugin-scaffolder';

ipcMain.handle(
  IPC.PLUGIN_INIT,
  async (_event, name: string, targetDir: string, description?: string) => {
    return scaffoldPlugin(name, targetDir, description);
  }
);
```

**Step 4: Commit**

```bash
git add electron/services/plugin-scaffolder.ts shared/ipc.ts electron/ipc/plugins.ts
git commit -m "feat(plugins): add plugin scaffolding (pilot plugin init)"
```

---

### Task 3: Plugin Dev Mode — Hot Reload

**Files:**
- Create: `electron/services/plugin-dev-mode.ts`

**Step 1: Create dev mode file watcher**

Create `electron/services/plugin-dev-mode.ts`:

```typescript
import { watch, type FSWatcher } from 'chokidar';
import { pluginBridge } from './plugin-bridge';

/**
 * PluginDevMode — watches a plugin directory for changes and triggers
 * hot-reload by deactivating and reactivating the plugin in the Extension Host.
 */
export class PluginDevMode {
  private watchers = new Map<string, FSWatcher>();
  private reloadTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Start watching a plugin directory.
   * On file changes, deactivate then reactivate after a 300ms debounce.
   */
  startWatching(pluginId: string, pluginPath: string): void {
    if (this.watchers.has(pluginId)) {
      this.stopWatching(pluginId);
    }

    const watcher = watch(pluginPath, {
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on('change', (filePath) => {
      console.log(`[PluginDevMode] Change detected in ${pluginId}: ${filePath}`);
      this.scheduleReload(pluginId);
    });

    watcher.on('add', (filePath) => {
      console.log(`[PluginDevMode] File added in ${pluginId}: ${filePath}`);
      this.scheduleReload(pluginId);
    });

    watcher.on('unlink', (filePath) => {
      console.log(`[PluginDevMode] File removed in ${pluginId}: ${filePath}`);
      this.scheduleReload(pluginId);
    });

    this.watchers.set(pluginId, watcher);
    console.log(`[PluginDevMode] Watching ${pluginId} at ${pluginPath}`);
  }

  stopWatching(pluginId: string): void {
    const watcher = this.watchers.get(pluginId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(pluginId);
    }

    const timeout = this.reloadTimeouts.get(pluginId);
    if (timeout) {
      clearTimeout(timeout);
      this.reloadTimeouts.delete(pluginId);
    }
  }

  stopAll(): void {
    for (const pluginId of this.watchers.keys()) {
      this.stopWatching(pluginId);
    }
  }

  private scheduleReload(pluginId: string): void {
    const existing = this.reloadTimeouts.get(pluginId);
    if (existing) clearTimeout(existing);

    this.reloadTimeouts.set(pluginId, setTimeout(async () => {
      this.reloadTimeouts.delete(pluginId);
      console.log(`[PluginDevMode] Hot-reloading plugin ${pluginId}...`);

      pluginBridge.unregisterPlugin(pluginId);

      // Small delay to ensure cleanup completes
      await new Promise(r => setTimeout(r, 200));

      // Re-register — PluginBridge will call plugin/activate
      pluginBridge.registerPlugin({
        id: pluginId,
        name: pluginId,
        version: 'dev',
        description: '',
        source: 'local',
        sourceUrl: '',
        installedAt: Date.now(),
        enabled: true,
        manifest: { plugins: [''], permissions: [] },
        path: '',
        hasErrors: false,
      });
    }, 300));
  }
}

export const pluginDevMode = new PluginDevMode();
```

**Step 2: Add plugin dev IPC channels**

In `shared/ipc.ts`:

```typescript
PLUGIN_DEV_START: 'plugin:dev-start',
PLUGIN_DEV_STOP: 'plugin:dev-stop',
```

**Step 3: Register IPC handlers**

In `electron/ipc/plugins.ts`:

```typescript
import { pluginDevMode } from '../services/plugin-dev-mode';

ipcMain.handle(
  IPC.PLUGIN_DEV_START,
  async (_event, pluginId: string, pluginPath: string) => {
    pluginDevMode.startWatching(pluginId, pluginPath);
  }
);

ipcMain.handle(
  IPC.PLUGIN_DEV_STOP,
  async (_event, pluginId: string) => {
    pluginDevMode.stopWatching(pluginId);
  }
);
```

**Step 4: Wire into main/index.ts**

```typescript
import { pluginDevMode } from '../services/plugin-dev-mode';

// In will-quit:
pluginDevMode.stopAll();
```

**Step 5: Commit**

```bash
git add electron/services/plugin-dev-mode.ts shared/ipc.ts electron/ipc/plugins.ts electron/main/index.ts
git commit -m "feat(plugins): add plugin dev mode with hot-reload"
```

---

### Task 4: Debugging Support — Node Inspector

**Files:**
- Modify: `electron/services/extension-host.ts`

**Step 1: Support --inspect flag for Extension Host**

In `extension-host.ts`, check for a debug flag:

```typescript
// At the top of extension-host.ts:
const debugMode = process.env.PILOT_PLUGIN_DEBUG === '1';

if (debugMode) {
  console.log('[ExtensionHost] Debug mode enabled — attach inspector to this process');
  // The inspector is started by Node.js when --inspect is passed.
  // If we want to start it programmatically:
  try {
    const inspector = require('node:inspector');
    inspector.open(9229, '0.0.0.0', true);
    console.log('[ExtensionHost] Inspector listening on port 9229');
  } catch (err) {
    console.error('[ExtensionHost] Failed to start inspector:', err);
  }
}
```

**Step 2: Update PluginBridge to pass debug flag**

In `plugin-bridge.ts`, when starting the Extension Host:

```typescript
start(debug?: boolean): void {
  const env: Record<string, string> = {
    ...process.env,
    PILOT_PLUGIN_MODE: '1',
  };

  if (debug) {
    env.PILOT_PLUGIN_DEBUG = '1';
  }

  const execArgv = debug ? ['--inspect=9229'] : [];

  this.childProcess = fork(hostScript, [], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env,
    execArgv,
  });
  // ...
}
```

**Step 3: Add debug flag to main/index.ts**

```typescript
// Check for --plugin-debug flag
const debugPlugins = process.argv.includes('--plugin-debug');
pluginBridge.start(debugPlugins);
```

**Step 4: Commit**

```bash
git add electron/services/extension-host.ts electron/services/plugin-bridge.ts electron/main/index.ts
git commit -m "feat(plugins): add debugging support with Node.js inspector"
```

---

### Task 5: API Documentation

**Files:**
- Create: `docs/user/plugins.md`

**Step 1: Write the plugin development guide**

Create `docs/user/plugins.md`:

```markdown
# Plugins

> Pilot plugins extend the GUI with new panels, views, status bar items, and agent capabilities.

## Quick Start

```bash
# Scaffold a new plugin
pilot plugin init my-awesome-plugin

# Install dependencies
cd my-awesome-plugin && npm install

# Start dev mode (watches for changes)
pilot plugin dev ./

# Build for distribution
npm run build
```

## Plugin Structure

```text
my-awesome-plugin/
├── package.json       # Plugin manifest + dependencies
├── tsconfig.json      # TypeScript config
└── src/
    └── plugin.ts      # Entry point — exports activate()
```

## Writing a Plugin

```typescript
import { activate, type PluginAPI } from '@pilot/plugin-sdk';

activate((pilot: PluginAPI) => {
  // Register a sidebar view
  pilot.contributions.registerTreeView('my-view', {
    title: 'My Plugin',
    location: 'sidebar',
    getChildren: async () => [
      { id: '1', label: 'Item 1' },
      { id: '2', label: 'Item 2' },
    ],
  });

  // Add a status bar item
  pilot.contributions.createStatusBarItem('my-status', {
    text: 'My Plugin active',
    alignment: 'right',
    priority: 100,
  });

  // Register an agent tool
  pilot.agent.registerTool({
    name: 'my_tool',
    description: 'My custom agent tool',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
    execute: async (toolCallId, params) => ({
      content: [{ type: 'text', text: `Results for: ${params.query}` }],
    }),
  });

  // Listen to agent events
  pilot.agent.on('tool_call', (event) => {
    if (event.toolName === 'bash' && event.input?.command?.includes('rm -rf')) {
      return { block: true, reason: 'Dangerous command blocked' };
    }
  });

  // Cleanup
  return () => {
    console.log('Plugin deactivated');
  };
});
```

## Contribution Points

### Views
Tree views and webview panels in the sidebar or right panel.

### Status Bar
Left and right-aligned status bar text with tooltips and click commands.

### Context Menus
Add items to right-click menus on files, messages, and tabs.

### Settings
Add custom settings sections in the Settings modal.

### Tab Types
Register new tab types (e.g., A2A conversations, CI dashboards).

### Chat Message Renderers
Custom rendering for agent tool results in chat messages.

### Commands
Register commands that appear in the command palette and can be bound to keybindings.

## Agent Integration

### Tools
Register tools the AI agent can call. Tools are injected at runtime — no reload needed.

### Skills
Register system prompt fragments the agent considers during conversations.

### Events
Subscribe to agent events to block tool calls, modify results, or inject context.

## Permissions

Plugins declare permissions in `package.json` under `pilot.permissions`:

| Permission | Description |
|-----------|-------------|
| `ui:sidebar` | Add views to the sidebar |
| `ui:panel` | Add views to the right panel |
| `ui:status-bar` | Add items to the status bar |
| `ui:settings` | Add settings sections |
| `ui:tabs` | Register tab types |
| `ui:chat-renderer` | Register message renderers |
| `agent:tools` | Register agent tools |
| `agent:skills` | Register agent skills |
| `agent:events` | Listen to agent events |
| `network:*` | Make network requests |

## Debugging

```bash
# Start Pilot with plugin debug mode
pilot --plugin-debug

# Attach Chrome DevTools to localhost:9229
```

## Publishing

```bash
# To npm
npm publish

# Users install with:
pilot plugin install my-awesome-plugin
```
```

**Step 2: Link from docs/INDEX.md**

Update `docs/INDEX.md` to include the plugins guide.

**Step 3: Commit**

```bash
git add docs/user/plugins.md docs/INDEX.md
git commit -m "docs(plugins): add plugin development guide"
git commit --allow-empty -m "feat(plugins): Phase 4 SDK & developer experience complete"
```

---

### Phase 4 Completion Checklist

- [ ] `@pilot/plugin-sdk` npm package with full TypeScript types
- [ ] `activate()` helper with correct PluginAPI typing
- [ ] `pilot plugin init` scaffolds a working plugin project
- [ ] Dev mode watches plugin files and hot-reloads on changes
- [ ] Node.js inspector can attach to Extension Host for debugging
- [ ] Plugin development guide covers all contribution points
- [ ] Plugin authors can write plugins with full type safety
