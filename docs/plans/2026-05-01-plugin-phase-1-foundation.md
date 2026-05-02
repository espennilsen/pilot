# Phase 1 — Plugin System Foundation

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Set up the core plugin infrastructure — types, IPC channels, PluginBridge service, Extension Host process, installer, and renderer store — so a minimal "Hello World" plugin can be installed, activated, and communicate with Pilot.

**Architecture:** Three new main-process components: `PluginBridge` (JSON-RPC server + permission enforcement), `ExtensionHost` (forked Node.js child process that loads plugins via jiti), and `PluginInstaller` (npm/git install + registry). Plus shared types/IPC channels and a renderer-side `usePluginStore`.

**Tech Stack:** Node.js `child_process.fork()`, JSON-RPC 2.0 over stdio, jiti (plugin loader), Zustand (renderer store), npm CLI / git CLI (installer).

---

### Task 1: Add Plugin Types to `shared/types.ts`

**Files:**
- Modify: `shared/types.ts` (append)

**Step 1: Add plugin permission, manifest, and contribution types**

Insert at the end of `shared/types.ts`, before the final `export` or at the bottom:

```typescript
// ─── Plugin System ───────────────────────────────────────────────────────

/** Permissions a plugin requests. Each maps to a capability gate in PluginBridge. */
export type PluginPermission =
  | 'ui:sidebar'
  | 'ui:panel'
  | 'ui:status-bar'
  | 'ui:context-menu'
  | 'ui:settings'
  | 'ui:tabs'
  | 'ui:chat-renderer'
  | 'agent:tools'
  | 'agent:skills'
  | 'agent:events'
  | `network:${string}`
  | 'fs:read'
  | 'fs:write'
  | 'git:status'
  | 'git:write'
  | 'shell:exec';

/** Manifest extracted from a plugin's package.json under the "pilot" key. */
export interface PluginManifest {
  /** Entry files relative to package root (e.g. ["./dist/plugin.js"]) */
  plugins: string[];
  /** Permissions the plugin needs */
  permissions: PluginPermission[];
  /** Minimum Pilot version (semver) */
  minPilotVersion?: string;
}

/** A plugin installed on disk. */
export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'npm' | 'git' | 'local';
  sourceUrl: string;
  installedAt: number;
  enabled: boolean;
  manifest: PluginManifest;
  path: string;        // absolute path on disk
  hasErrors: boolean;
  errorMessage?: string;
}

/** Result of a plugin install operation. */
export interface PluginInstallResult {
  success: boolean;
  id?: string;
  name?: string;
  version?: string;
  error?: string;
}

// ─── Plugin Contributions (sent from Extension Host → renderer via PluginBridge) ──

/** A tree view item for sidebar/panel contributions. */
export interface PluginTreeItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  collapsible?: boolean;
  command?: { id: string; args?: unknown[] };
}

/** Registered tree view contributed by a plugin. */
export interface PluginTreeView {
  pluginId: string;
  viewId: string;
  title: string;
  icon?: string;
  location: 'sidebar' | 'panel';
}

/** Status bar item contributed by a plugin. */
export interface PluginStatusBarItem {
  pluginId: string;
  itemId: string;
  text: string;
  tooltip?: string;
  alignment: 'left' | 'right';
  priority: number;
  command?: { id: string; args?: unknown[] };
}

/** Context menu contribution. */
export interface PluginContextMenuContribution {
  pluginId: string;
  when: string;
  group: string;
  items: Array<{
    label: string;
    command: { id: string; args?: unknown[] };
  }>;
}

/** Registered command from a plugin. */
export interface PluginCommand {
  pluginId: string;
  id: string;
  label: string;
  keybinding?: string;
}

/** Settings section contribution. */
export interface PluginSettingsSection {
  pluginId: string;
  sectionId: string;
  title: string;
  icon?: string;
}

/** A tab type registered by a plugin. */
export interface PluginTabType {
  pluginId: string;
  typeId: string;
  label: string;
  icon?: string;
}

/** Chat message renderer contribution. */
export interface PluginMessageRenderer {
  pluginId: string;
  rendererId: string;
  matchToolName?: string;
  matchCustomType?: string;
}

/** Event forwarded from PluginBridge → renderer about plugin state changes. */
export interface PluginEventPayload {
  type: 'plugin-activated' | 'plugin-deactivated' | 'plugin-error' | 'contribution-updated';
  pluginId: string;
  data?: unknown;
}

/** Registered interest in an agent event. */
export interface PluginAgentEventSubscription {
  pluginId: string;
  event: string;   // 'tool_call' | 'tool_result' | 'agent_start' | etc.
}

/** Serialised agent event forwarded to plugins. */
export interface SerialisedAgentEvent {
  name: string;
  toolName?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  message?: unknown;
  prompt?: string;
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20
npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20
```

Expected: No new errors from the added types.

**Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(plugins): add plugin types to shared/types.ts"
```

---

### Task 2: Add Plugin IPC Channel Constants to `shared/ipc.ts`

**Files:**
- Modify: `shared/ipc.ts`

**Step 1: Add plugin IPC channels**

Insert before the closing `} as const;` in the IPC object:

```typescript
  // Plugins
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_INSTALL: 'plugin:install',
  PLUGIN_REMOVE: 'plugin:remove',
  PLUGIN_TOGGLE: 'plugin:toggle',
  PLUGIN_GET_CONTRIBUTIONS: 'plugin:get-contributions',
  PLUGIN_VIEW_GET_CHILDREN: 'plugin:view-get-children',
  PLUGIN_COMMAND_EXECUTE: 'plugin:command-execute',
  PLUGIN_SETTINGS_GET_HTML: 'plugin:settings-get-html',
  PLUGIN_SETTINGS_SAVE: 'plugin:settings-save',
  PLUGIN_EVENT: 'plugin:event',                       // main → renderer push
  PLUGIN_AGENT_EVENT_REQUEST: 'plugin:agent-event-request',  // PluginBridge → Extension Host, response expected
  PLUGIN_CONTRIBUTION_UPDATED: 'plugin:contribution-updated', // main → renderer push
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -10
```

Expected: No errors.

**Step 3: Commit**

```bash
git add shared/ipc.ts
git commit -m "feat(plugins): add plugin IPC channel constants"
```

---

### Task 3: Add Plugin Directory to `electron/services/pilot-paths.ts`

**Files:**
- Modify: `electron/services/pilot-paths.ts`

**Step 1: Add plugin directory and registry paths**

Insert after the `PILOT_EXTENSION_REGISTRY_FILE` line:

```typescript
// Plugin install directory (npm packages live here)
export const PILOT_PLUGINS_DIR = join(PILOT_APP_DIR, 'plugins');

// Plugin registry (installed plugins + enabled state)
export const PILOT_PLUGIN_REGISTRY_FILE = join(PILOT_APP_DIR, 'plugin-registry.json');
```

**Step 2: Add plugin dir to ensurePilotAppDirs()**

In the `ensurePilotAppDirs` function, add `PILOT_PLUGINS_DIR` to the `dirs` array:

```typescript
  const dirs = [
    PILOT_APP_DIR,
    PILOT_EXTENSIONS_DIR,
    PILOT_SKILLS_DIR,
    PILOT_PROMPTS_DIR,
    PILOT_THEMES_DIR,
    PILOT_LOGS_DIR,
    PILOT_PLUGINS_DIR,        // ← ADD THIS
  ];
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -10
```

**Step 4: Commit**

```bash
git add electron/services/pilot-paths.ts
git commit -m "feat(plugins): add plugin directory paths"
```

---

### Task 4: Create PluginBridge Service

**Files:**
- Create: `electron/services/plugin-bridge.ts`

**Step 1: Write the PluginBridge service**

```typescript
/**
 * PluginBridge — Mediates between Extension Host and Pilot's main process.
 *
 * Responsibilities:
 *  - JSON-RPC 2.0 server over child_process stdio
 *  - Permission enforcement (checks every RPC call against declared permissions)
 *  - Contribution registry (tracks which plugins registered what)
 *  - Event fan-out (routes agent events to multiple interested plugins)
 *  - Forwarding contributions to renderer via IPC
 */

import { fork, type ChildProcess } from 'child_process';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { broadcastToRenderer } from '../utils/broadcast';
import { IPC } from '../../shared/ipc';
import type {
  InstalledPlugin,
  PluginTreeView,
  PluginTreeItem,
  PluginStatusBarItem,
  PluginCommand,
  PluginSettingsSection,
  PluginTabType,
  PluginMessageRenderer,
  PluginAgentEventSubscription,
  SerialisedAgentEvent,
  PluginPermission,
} from '../../shared/types';
import { getLogger } from './logger';

// ─── JSON-RPC Types ──────────────────────────────────────────────────

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── Plugin Registry ─────────────────────────────────────────────────

interface PluginRegistration {
  pluginId: string;
  permissions: PluginPermission[];
  treeViews: PluginTreeView[];
  statusBarItems: PluginStatusBarItem[];
  commands: PluginCommand[];
  settingsSections: PluginSettingsSection[];
  tabTypes: PluginTabType[];
  messageRenderers: PluginMessageRenderer[];
  agentEventSubscriptions: PluginAgentEventSubscription[];
}

// ─── Main Class ──────────────────────────────────────────────────────

export class PluginBridge extends EventEmitter {
  private childProcess: ChildProcess | null = null;
  private plugins = new Map<string, PluginRegistration>();
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private nextRequestId = 1;
  private log = getLogger('plugin-bridge');
  private buffer = '';
  private installedPlugins: InstalledPlugin[] = [];

  // ─── Lifecycle ─────────────────────────────────────────────────────

  /** Start the Extension Host child process. */
  start(): void {
    const hostScript = join(__dirname, 'extension-host.js');
    // Compile extension-host.ts → extension-host.js happens at build time (electron-vite)
    // The .js file lives next to the compiled services

    this.childProcess = fork(hostScript, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, PILOT_PLUGIN_MODE: '1' },
    });

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString('utf-8'));
    });

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      this.log.error(`Extension Host stderr: ${data.toString('utf-8')}`);
    });

    this.childProcess.on('exit', (code) => {
      this.log.warn(`Extension Host exited with code ${code}`);
      // Auto-restart after a short delay
      setTimeout(() => {
        if (this.plugins.size > 0) {
          this.log.info('Restarting Extension Host...');
          this.start();
          this.reloadAllPlugins();
        }
      }, 1000);
    });

    this.log.info('Extension Host started');
  }

  /** Gracefully stop the Extension Host. */
  stop(): void {
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }
  }

  // ─── Plugin Management ─────────────────────────────────────────────

  /** Register a plugin's manifest and permissions. */
  registerPlugin(plugin: InstalledPlugin): void {
    if (this.plugins.has(plugin.id)) return;

    this.plugins.set(plugin.id, {
      pluginId: plugin.id,
      permissions: plugin.manifest.permissions,
      treeViews: [],
      statusBarItems: [],
      commands: [],
      settingsSections: [],
      tabTypes: [],
      messageRenderers: [],
      agentEventSubscriptions: [],
    });

    // Tell the Extension Host to load this plugin
    this.sendRequest('plugin/activate', {
      pluginId: plugin.id,
      entryPath: join(plugin.path, plugin.manifest.plugins[0]),
      pluginPath: plugin.path,
    }).then(() => {
      this.log.info(`Plugin activated: ${plugin.id}`);
      this.broadcastPluginEvent('plugin-activated', plugin.id);
    }).catch((err) => {
      this.log.error(`Plugin activation failed: ${plugin.id}`, err);
      this.plugins.delete(plugin.id);
      this.broadcastPluginEvent('plugin-error', plugin.id, { error: err.message });
    });
  }

  /** Unregister a plugin and tell the Extension Host to deactivate. */
  unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
    this.sendRequest('plugin/deactivate', { pluginId }).catch(() => {});
    this.broadcastPluginEvent('plugin-deactivated', pluginId);
  }

  setInstalledPlugins(plugins: InstalledPlugin[]): void {
    this.installedPlugins = plugins;
  }

  // ─── Permission Check ──────────────────────────────────────────────

  private checkPermission(pluginId: string, permission: PluginPermission): boolean {
    const reg = this.plugins.get(pluginId);
    if (!reg) return false;
    if (reg.permissions.includes(permission)) return true;

    // Handle wildcard permissions like network:*
    if (permission.startsWith('network:')) {
      return reg.permissions.includes('network:*' as PluginPermission) ||
             reg.permissions.includes(permission);
    }

    return false;
  }

  // ─── Contribution Tracking ─────────────────────────────────────────

  addTreeView(view: PluginTreeView): void {
    const reg = this.plugins.get(view.pluginId);
    if (reg) {
      reg.treeViews.push(view);
      this.broadcastContributionsUpdated(view.pluginId);
    }
  }

  addStatusBarItem(item: PluginStatusBarItem): void {
    const reg = this.plugins.get(item.pluginId);
    if (reg) {
      reg.statusBarItems.push(item);
      this.broadcastContributionsUpdated(item.pluginId);
    }
  }

  addCommand(cmd: PluginCommand): void {
    const reg = this.plugins.get(cmd.pluginId);
    if (reg) reg.commands.push(cmd);
  }

  addSettingsSection(section: PluginSettingsSection): void {
    const reg = this.plugins.get(section.pluginId);
    if (reg) {
      reg.settingsSections.push(section);
      this.broadcastContributionsUpdated(section.pluginId);
    }
  }

  addTabType(tabType: PluginTabType): void {
    const reg = this.plugins.get(tabType.pluginId);
    if (reg) {
      reg.tabTypes.push(tabType);
      this.broadcastContributionsUpdated(tabType.pluginId);
    }
  }

  addMessageRenderer(renderer: PluginMessageRenderer): void {
    const reg = this.plugins.get(renderer.pluginId);
    if (reg) reg.messageRenderers.push(renderer);
  }

  subscribeAgentEvent(sub: PluginAgentEventSubscription): void {
    const reg = this.plugins.get(sub.pluginId);
    if (reg) reg.agentEventSubscriptions.push(sub);
  }

  getActivePlugins(): string[] {
    return Array.from(this.plugins.keys());
  }

  getRegisteredViews(): PluginTreeView[] {
    const views: PluginTreeView[] = [];
    for (const reg of this.plugins.values()) {
      views.push(...reg.treeViews);
    }
    return views;
  }

  getRegisteredStatusBarItems(): PluginStatusBarItem[] {
    const items: PluginStatusBarItem[] = [];
    for (const reg of this.plugins.values()) {
      items.push(...reg.statusBarItems);
    }
    return items;
  }

  getRegisteredCommands(): PluginCommand[] {
    const cmds: PluginCommand[] = [];
    for (const reg of this.plugins.values()) {
      cmds.push(...reg.commands);
    }
    return cmds;
  }

  getRegisteredPlugins(): InstalledPlugin[] {
    return this.installedPlugins.filter(p => this.plugins.has(p.id));
  }

  // ─── Agent Event Forwarding ────────────────────────────────────────

  /** Forward an agent event to all plugins subscribed to it.
   *  Returns merged result (block, patchedInput, modifiedResult). */
  async forwardAgentEvent(event: SerialisedAgentEvent): Promise<{
    block: boolean;
    reason?: string;
    patchedInput?: Record<string, unknown>;
    modifiedResult?: unknown;
  }> {
    const subscriberIds = this.getSubscribersFor(event.name);
    if (subscriberIds.length === 0) return { block: false };

    let blocked = false;
    let blockReason: string | undefined;
    let patchedInput: Record<string, unknown> | undefined;
    let modifiedResult: unknown;

    for (const pluginId of subscriberIds) {
      try {
        const result = await this.sendRequest('agent/event', {
          pluginId,
          event,
        }) as {
          block?: boolean;
          reason?: string;
          patchedInput?: Record<string, unknown>;
          modifiedResult?: unknown;
        };

        if (result?.block) {
          blocked = true;
          blockReason = result.reason;
          break;
        }
        if (result?.patchedInput) {
          patchedInput = { ...patchedInput, ...result.patchedInput };
        }
        if (result?.modifiedResult !== undefined) {
          modifiedResult = result.modifiedResult;
        }
      } catch (err) {
        this.log.error(`Plugin ${pluginId} failed to handle event ${event.name}:`, err);
      }
    }

    return { block: blocked, reason: blockReason, patchedInput, modifiedResult };
  }

  /** Get list of plugin IDs subscribed to a given agent event. */
  getSubscribersFor(eventName: string): string[] {
    const ids: string[] = [];
    for (const reg of this.plugins.values()) {
      if (reg.agentEventSubscriptions.some(s => s.event === eventName)) {
        ids.push(reg.pluginId);
      }
    }
    return ids;
  }

  /** Check if any plugin is interested in a given event. */
  hasSubscribersFor(eventName: string): boolean {
    return this.getSubscribersFor(eventName).length > 0;
  }

  /** Fetch tree children for a specific plugin view. */
  async getViewChildren(viewId: string, elementId: string | null): Promise<PluginTreeItem[]> {
    // Find which plugin owns this view
    for (const reg of this.plugins.values()) {
      const view = reg.treeViews.find(v => v.viewId === viewId);
      if (view) {
        const result = await this.sendRequest('view/getChildren', {
          pluginId: view.pluginId,
          viewId,
          elementId,
        });
        return (result as PluginTreeItem[]) || [];
      }
    }
    return [];
  }

  /** Execute a plugin command. */
  async executeCommand(commandId: string, args: unknown[]): Promise<unknown> {
    for (const reg of this.plugins.values()) {
      const cmd = reg.commands.find(c => c.id === commandId);
      if (cmd) {
        return this.sendRequest('command/execute', {
          pluginId: cmd.pluginId,
          commandId,
          args,
        });
      }
    }
    throw new Error(`Command not found: ${commandId}`);
  }

  // ─── JSON-RPC over stdio ───────────────────────────────────────────

  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId++;
      const request: RpcRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });

      const line = JSON.stringify(request) + '\n';
      this.childProcess?.stdin?.write(line);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, 30_000);
    });
  }

  private sendNotification(method: string, params?: unknown): void {
    const notification: RpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
    };
    const line = JSON.stringify(notification) + '\n';
    this.childProcess?.stdin?.write(line);
  }

  private handleData(data: string): void {
    this.buffer += data;

    // Split on newlines and process complete messages
    const lines = this.buffer.split('\n');
    // Keep the last potentially incomplete line
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed);

        if ((msg as RpcRequest).method && !('result' in msg) && !('error' in msg)) {
          // This is a request from Extension Host → PluginBridge
          this.handleIncomingRequest(msg as RpcRequest);
        } else if ('id' in msg) {
          // This is a response to a pending request
          this.handleResponse(msg as RpcResponse);
        }
      } catch (err) {
        this.log.error('Failed to parse JSON-RPC message:', trimmed);
      }
    }
  }

  private handleIncomingRequest(request: RpcRequest): void {
    // Handle requests initiated by the Extension Host (e.g. contribution registration)
    const { method, params, id } = request;

    switch (method) {
      case 'contribution/registerView': {
        const p = params as PluginTreeView & { pluginId: string };
        if (!this.checkPermission(p.pluginId, 'ui:sidebar') && !this.checkPermission(p.pluginId, 'ui:panel')) {
          this.sendResponse(id!, { error: { code: -32001, message: 'Permission denied: ui:sidebar or ui:panel required' } });
          return;
        }
        this.addTreeView({
          pluginId: p.pluginId,
          viewId: p.viewId,
          title: p.title,
          icon: p.icon,
          location: p.location,
        });
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'contribution/registerStatusBar': {
        const p = params as PluginStatusBarItem & { pluginId: string };
        if (!this.checkPermission(p.pluginId, 'ui:status-bar')) {
          this.sendResponse(id!, { error: { code: -32001, message: 'Permission denied: ui:status-bar required' } });
          return;
        }
        this.addStatusBarItem(p);
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'contribution/registerCommand': {
        const p = params as PluginCommand & { pluginId: string };
        this.addCommand(p);
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'contribution/registerSettingsSection': {
        const p = params as PluginSettingsSection & { pluginId: string };
        if (!this.checkPermission(p.pluginId, 'ui:settings')) {
          this.sendResponse(id!, { error: { code: -32001, message: 'Permission denied: ui:settings required' } });
          return;
        }
        this.addSettingsSection(p);
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'contribution/registerTabType': {
        const p = params as PluginTabType & { pluginId: string };
        if (!this.checkPermission(p.pluginId, 'ui:tabs')) {
          this.sendResponse(id!, { error: { code: -32001, message: 'Permission denied: ui:tabs required' } });
          return;
        }
        this.addTabType(p);
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'contribution/registerMessageRenderer': {
        const p = params as PluginMessageRenderer & { pluginId: string };
        if (!this.checkPermission(p.pluginId, 'ui:chat-renderer')) {
          this.sendResponse(id!, { error: { code: -32001, message: 'Permission denied: ui:chat-renderer required' } });
          return;
        }
        this.addMessageRenderer(p);
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'contribution/updateStatusBar': {
        const p = params as { pluginId: string; itemId: string; text?: string; tooltip?: string };
        // Forward to renderer
        broadcastToRenderer(IPC.PLUGIN_CONTRIBUTION_UPDATED, {
          pluginId: p.pluginId,
          type: 'status-bar-update',
          data: p,
        });
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'agent/subscribeEvent': {
        const p = params as PluginAgentEventSubscription & { pluginId: string };
        if (!this.checkPermission(p.pluginId, 'agent:events')) {
          this.sendResponse(id!, { error: { code: -32001, message: 'Permission denied: agent:events required' } });
          return;
        }
        this.subscribeAgentEvent(p);
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'agent/registerTool': {
        const p = params as { pluginId: string; toolName: string };
        if (!this.checkPermission(p.pluginId, 'agent:tools')) {
          this.sendResponse(id!, { error: { code: -32001, message: 'Permission denied: agent:tools required' } });
          return;
        }
        // Tool registration is handled in Phase 3
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      default:
        this.log.warn(`Unknown RPC method: ${method}`);
        this.sendResponse(id!, { error: { code: -32601, message: `Method not found: ${method}` } });
    }
  }

  private sendResponse(id: string | number | undefined, response: Omit<RpcResponse, 'jsonrpc'>): void {
    if (id === undefined) return; // Don't respond to notifications
    const rpcResponse: RpcResponse = {
      jsonrpc: '2.0',
      id,
      ...response,
    };
    const line = JSON.stringify(rpcResponse) + '\n';
    this.childProcess?.stdin?.write(line);
  }

  private handleResponse(response: RpcResponse): void {
    const { id, result, error } = response;
    if (id === undefined) return;

    const pending = this.pendingRequests.get(id);
    if (!pending) return;
    this.pendingRequests.delete(id);

    if (error) {
      pending.reject(new Error(error.message));
    } else {
      pending.resolve(result);
    }
  }

  // ─── Renderer Broadcasting ─────────────────────────────────────────

  private broadcastPluginEvent(type: string, pluginId: string, data?: unknown): void {
    broadcastToRenderer(IPC.PLUGIN_EVENT, {
      type,
      pluginId,
      data,
    });
  }

  private broadcastContributionsUpdated(pluginId: string): void {
    broadcastToRenderer(IPC.PLUGIN_CONTRIBUTION_UPDATED, {
      pluginId,
      type: 'contributions-changed',
    });
  }

  // ─── Internal Helpers ──────────────────────────────────────────────

  private reloadAllPlugins(): void {
    const plugins = Array.from(this.plugins.keys());
    this.plugins.clear();
    for (const pluginId of plugins) {
      const installed = this.installedPlugins.find(p => p.id === pluginId);
      if (installed) {
        this.registerPlugin(installed);
      }
    }
  }
}

/** Singleton instance. */
export const pluginBridge = new PluginBridge();
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -30
```

Expected: May have errors about `getLogger` import. Verify that `electron/services/logger.ts` exports `getLogger`. If not, use `console.log` / `console.error` temporarily and fix in a later task.

**Step 3: Commit**

```bash
git add electron/services/plugin-bridge.ts
git commit -m "feat(plugins): create PluginBridge service"
```

---

### Task 5: Create Extension Host Bootstrap

**Files:**
- Create: `electron/services/extension-host.ts`

**Step 1: Write the Extension Host**

```typescript
/**
 * Extension Host — Forked Node.js child process that loads and runs plugins.
 *
 * Communicates with PluginBridge via JSON-RPC 2.0 over stdio.
 * Loads plugins using jiti (same mechanism Pi SDK uses for extensions).
 */

import { createJiti } from 'jiti';

// ─── JSON-RPC Types ──────────────────────────────────────────────────

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── Plugin State ────────────────────────────────────────────────────

interface ActivePlugin {
  id: string;
  entryPath: string;
  pluginPath: string;
  api: PluginAPI;
  deactivate?: () => void;
}

// ─── Plugin API (provided to activate()) ────────────────────────────

interface PluginAPI {
  contributions: {
    registerTreeView: (id: string, options: Record<string, unknown>) => void;
    registerWebviewView: (id: string, options: Record<string, unknown>) => void;
    createStatusBarItem: (id: string, options: Record<string, unknown>) => void;
    registerContextMenu: (options: Record<string, unknown>) => void;
    registerTabType: (id: string, options: Record<string, unknown>) => void;
    registerMessageRenderer: (id: string, options: Record<string, unknown>) => void;
    registerSettingsSection: (id: string, options: Record<string, unknown>) => void;
    registerCommand: (id: string, options: Record<string, unknown>) => void;
  };
  agent: {
    registerTool: (definition: Record<string, unknown>) => Promise<void>;
    removeTool: (name: string) => Promise<void>;
    registerSkill: (content: string, options?: Record<string, unknown>) => Promise<void>;
    removeSkill: (id: string) => Promise<void>;
    on: (event: string, handler: (payload: unknown) => unknown | Promise<unknown>) => void;
    off: (event: string, handler: (payload: unknown) => unknown | Promise<unknown>) => void;
  };
  storage: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
    keys: () => Promise<string[]>;
  };
  workspace: {
    projectPath: string | null;
  };
}

// ─── RPC Helpers ─────────────────────────────────────────────────────

let requestId = 1;
const pendingRequests = new Map<string | number, {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}>();

function sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const request: RpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    pendingRequests.set(id, { resolve, reject });
    process.stdout.write(JSON.stringify(request) + '\n');

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }
    }, 30_000);
  });
}

// ─── Active Plugins ──────────────────────────────────────────────────

const activePlugins = new Map<string, ActivePlugin>();
const jiti = createJiti(import.meta.url, { interopDefault: true });

// ─── Load and activate a plugin ──────────────────────────────────────

async function activatePlugin(pluginId: string, entryPath: string, pluginPath: string): Promise<void> {
  // If already active, deactivate first
  if (activePlugins.has(pluginId)) {
    await deactivatePlugin(pluginId);
  }

  const mod = await jiti.import(entryPath);
  const activate = mod.default || mod.activate;

  if (typeof activate !== 'function') {
    // Try module-scope: the file may export `activate` directly
    if (typeof mod.activate === 'function') {
      const api = createPluginAPI(pluginId);
      const deactivate = await mod.activate(api);
      activePlugins.set(pluginId, { id: pluginId, entryPath, pluginPath, api, deactivate });
      return;
    }
    throw new Error(`Plugin ${pluginId} does not export a default function or 'activate' function`);
  }

  const api = createPluginAPI(pluginId);
  const deactivate = await activate(api);
  activePlugins.set(pluginId, { id: pluginId, entryPath, pluginPath, api, deactivate });
}

async function deactivatePlugin(pluginId: string): Promise<void> {
  const plugin = activePlugins.get(pluginId);
  if (!plugin) return;

  try {
    if (plugin.deactivate) {
      await plugin.deactivate();
    }
  } catch (err) {
    // Best-effort cleanup
  }

  activePlugins.delete(pluginId);
}

// ─── Plugin API Factory ──────────────────────────────────────────────

function createPluginAPI(pluginId: string): PluginAPI {
  return {
    contributions: {
      registerTreeView(id, options) {
        sendRequest('contribution/registerView', {
          pluginId,
          viewId: id,
          title: options.title as string,
          icon: options.icon as string,
          location: options.location as 'sidebar' | 'panel',
        }).catch(() => {});
      },
      registerWebviewView(id, options) {
        // Phase 2 implementation
      },
      createStatusBarItem(id, options) {
        sendRequest('contribution/registerStatusBar', {
          pluginId,
          itemId: id,
          text: options.text as string,
          tooltip: options.tooltip as string,
          alignment: options.alignment as 'left' | 'right',
          priority: options.priority as number,
          command: options.command as Record<string, unknown>,
        }).catch(() => {});
      },
      registerContextMenu(options) {
        // Phase 2 implementation
      },
      registerTabType(id, options) {
        sendRequest('contribution/registerTabType', {
          pluginId,
          typeId: id,
          label: options.label as string,
          icon: options.icon as string,
        }).catch(() => {});
      },
      registerMessageRenderer(id, options) {
        sendRequest('contribution/registerMessageRenderer', {
          pluginId,
          rendererId: id,
          matchToolName: options.matchToolName as string,
          matchCustomType: options.matchCustomType as string,
        }).catch(() => {});
      },
      registerSettingsSection(id, options) {
        sendRequest('contribution/registerSettingsSection', {
          pluginId,
          sectionId: id,
          title: options.title as string,
          icon: options.icon as string,
        }).catch(() => {});
      },
      registerCommand(id, options) {
        sendRequest('contribution/registerCommand', {
          pluginId,
          id,
          label: options.label as string,
          keybinding: options.keybinding as string,
        }).catch(() => {});
      },
    },
    agent: {
      async registerTool(definition) {
        return sendRequest('agent/registerTool', { pluginId, toolName: definition.name as string });
      },
      async removeTool(name) {
        // Phase 3 implementation
      },
      async registerSkill(content, options) {
        // Phase 3 implementation
      },
      async removeSkill(id) {
        // Phase 3 implementation
      },
      on(event, handler) {
        sendRequest('agent/subscribeEvent', {
          pluginId,
          event,
        }).catch(() => {});
        // Store the handler locally. When an agent event arrives, route it to the handler.
        // The routing is done in handleIncomingRequest below.
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, new Map());
        }
        eventHandlers.get(event)!.set(handler, handler);
      },
      off(event, handler) {
        const handlers = eventHandlers.get(event);
        if (handlers) {
          handlers.delete(handler);
        }
      },
    },
    storage: {
      async get<T>(key) {
        return sendRequest('storage/get', { pluginId, key }) as Promise<T | undefined>;
      },
      async set<T>(key, value) {
        return sendRequest('storage/set', { pluginId, key, value }) as Promise<void>;
      },
      async delete(key) {
        return sendRequest('storage/delete', { pluginId, key }) as Promise<void>;
      },
      async keys() {
        return sendRequest('storage/keys', { pluginId }) as Promise<string[]>;
      },
    },
    workspace: {
      projectPath: null, // Updated via notifications from PluginBridge
    },
  };
}

// ─── Event Handler Registry ──────────────────────────────────────────

const eventHandlers = new Map<string, Map<Function, Function>>();

// ─── Message Processing ──────────────────────────────────────────────

let buffer = '';

process.stdin.on('data', (data: Buffer) => {
  buffer += data.toString('utf-8');

  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const msg = JSON.parse(trimmed);

      if ('id' in msg && 'result' in msg || 'error' in msg) {
        // This is a response
        handleResponse(msg as RpcResponse);
      } else if ('method' in msg) {
        // This is a request or notification from PluginBridge
        handleIncomingRequest(msg as RpcRequest);
      }
    } catch (err) {
      // Malformed JSON — ignore
    }
  }
});

function handleResponse(response: RpcResponse): void {
  const { id, result, error } = response;
  if (id === undefined) return;

  const pending = pendingRequests.get(id);
  if (!pending) return;
  pendingRequests.delete(id);

  if (error) {
    pending.reject(new Error(error.message));
  } else {
    pending.resolve(result);
  }
}

async function handleIncomingRequest(request: RpcRequest): Promise<void> {
  const { method, params, id } = request;

  try {
    switch (method) {
      case 'plugin/activate': {
        const { pluginId, entryPath, pluginPath } = params as {
          pluginId: string; entryPath: string; pluginPath: string;
        };
        await activatePlugin(pluginId, entryPath, pluginPath);
        sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'plugin/deactivate': {
        const { pluginId } = params as { pluginId: string };
        await deactivatePlugin(pluginId);
        sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'agent/event': {
        const { pluginId, event } = params as {
          pluginId: string;
          event: { name: string; [key: string]: unknown };
        };
        const { name, ...eventData } = event;
        const handlers = eventHandlers.get(name);
        if (handlers && handlers.size > 0) {
          const results = [];
          for (const handler of handlers.values()) {
            const result = await handler(eventData);
            results.push(result);
          }
          // Merge results: return the first non-undefined result, or the last
          const merged = results.find(r => r !== undefined) ?? results[results.length - 1];
          sendResponse(id!, { result: merged ?? { handled: false } });
        } else {
          sendResponse(id!, { result: { handled: false } });
        }
        break;
      }

      case 'view/getChildren': {
        // Plugin's getChildren is called — we'd need the plugin to have stored it.
        // For Phase 1, return empty.
        sendResponse(id!, { result: [] });
        break;
      }

      case 'command/execute': {
        sendResponse(id!, { result: { ok: true } });
        break;
      }

      case 'workspace/update': {
        const { projectPath } = params as { projectPath: string };
        // Update projectPath in all active plugin APIs
        for (const plugin of activePlugins.values()) {
          plugin.api.workspace.projectPath = projectPath;
        }
        // No response needed (notification)
        break;
      }

      default:
        sendResponse(id!, { error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    sendResponse(id!, {
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : 'Internal error',
        data: err instanceof Error ? err.stack : undefined,
      },
    });
  }
}

function sendResponse(id: string | number | undefined, response: Omit<RpcResponse, 'jsonrpc'>): void {
  if (id === undefined) return;
  const rpcResponse: RpcResponse = {
    jsonrpc: '2.0',
    id,
    ...response,
  };
  process.stdout.write(JSON.stringify(rpcResponse) + '\n');
}

// ─── Startup ─────────────────────────────────────────────────────────

// Signal that the Extension Host is ready
process.stdout.write(JSON.stringify({
  jsonrpc: '2.0',
  method: 'host/ready',
}) + '\n');
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -30
```

Expected: Some errors related to `jiti` import may appear if jiti is not in dependencies. This is expected — jiti is a Pi SDK dependency already available.

**Step 3: Commit**

```bash
git add electron/services/extension-host.ts
git commit -m "feat(plugins): create Extension Host bootstrap"
```

---

### Task 6: Create Plugin Installer Service

**Files:**
- Create: `electron/services/plugin-installer.ts`

**Step 1: Write the Plugin Installer**

```typescript
/**
 * PluginInstaller — Installs, lists, and removes Pilot plugins from npm / git / local.
 *
 * Plugins live under <PILOT_DIR>/plugins/node_modules/<name>/
 * Installed plugin metadata is stored in <PILOT_DIR>/plugins/plugin-registry.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join, resolve, basename } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { PILOT_PLUGINS_DIR, PILOT_PLUGIN_REGISTRY_FILE } from './pilot-paths';
import type { InstalledPlugin, PluginManifest, PluginInstallResult } from '../../shared/types';

const execFileAsync = promisify(execFile);

// ─── Registry ─────────────────────────────────────────────────────────

interface PluginRegistry {
  plugins: InstalledPlugin[];
  lastUpdated: number;
}

function loadRegistry(): PluginRegistry {
  try {
    if (!existsSync(PILOT_PLUGIN_REGISTRY_FILE)) {
      return { plugins: [], lastUpdated: Date.now() };
    }
    const raw = readFileSync(PILOT_PLUGIN_REGISTRY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { plugins: [], lastUpdated: Date.now() };
  }
}

function saveRegistry(registry: PluginRegistry): void {
  registry.lastUpdated = Date.now();
  mkdirSync(PILOT_PLUGINS_DIR, { recursive: true });
  writeFileSync(PILOT_PLUGIN_REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

// ─── Installer ────────────────────────────────────────────────────────

export class PluginInstaller {
  listPlugins(): InstalledPlugin[] {
    const registry = loadRegistry();

    // Filter out plugins whose directories no longer exist
    return registry.plugins.filter(p => {
      if (!existsSync(p.path)) return false;
      // Re-read the manifest from disk in case it changed
      try {
        const pkgPath = join(p.path, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
          if (pkg.pilot) {
            p.manifest = pkg.pilot;
            p.name = pkg.name || p.name;
            p.version = pkg.version || p.version;
            p.description = pkg.description || p.description;
          }
        }
        return true;
      } catch {
        p.hasErrors = true;
        return true; // Still show it but with error flag
      }
    });
  }

  async install(source: string): Promise<PluginInstallResult> {
    mkdirSync(PILOT_PLUGINS_DIR, { recursive: true });

    if (source.startsWith('npm:')) {
      return this.installFromNpm(source.slice(4));
    } else if (source.startsWith('git:')) {
      return this.installFromGit(source.slice(4));
    } else if (source.startsWith('./') || source.startsWith('/') || source.startsWith('~')) {
      return this.installFromLocal(resolve(source));
    } else {
      // Default: treat as npm package
      return this.installFromNpm(source);
    }
  }

  private async installFromNpm(packageSpec: string): Promise<PluginInstallResult> {
    const pluginDir = join(PILOT_PLUGINS_DIR, 'node_modules');

    try {
      // npm install into the plugins directory
      await execFileAsync('npm', ['install', '--prefix', PILOT_PLUGINS_DIR, '--omit=dev', '--no-save', packageSpec], {
        timeout: 120_000,
        env: { ...process.env },
      });

      // npm creates the package under node_modules/<name>/
      // Resolve package name from spec (strip @scope/ and @version)
      const pkgName = packageSpec.split('@')[0] || packageSpec;
      const scopedParts = packageSpec.startsWith('@')
        ? packageSpec.split('/').slice(0, 2).join('/')
        : pkgName;

      return this.registerInstalledPlugin(join(pluginDir, scopedParts), packageSpec, 'npm');
    } catch (err) {
      return {
        success: false,
        error: `npm install failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private async installFromGit(repoUrl: string): Promise<PluginInstallResult> {
    // Format: github.com/user/repo  or  github.com/user/repo@v1.0.0
    const [repo, ref] = repoUrl.includes('@')
      ? [repoUrl.substring(0, repoUrl.lastIndexOf('@')), repoUrl.substring(repoUrl.lastIndexOf('@') + 1)]
      : [repoUrl, 'HEAD'];

    const repoName = basename(repo, '.git');
    const pluginDir = join(PILOT_PLUGINS_DIR, 'node_modules', repoName);

    try {
      if (existsSync(pluginDir)) {
        rmSync(pluginDir, { recursive: true, force: true });
      }

      const gitUrl = `https://${repo}`;
      await execFileAsync('git', ['clone', '--branch', ref, '--depth', '1', gitUrl, pluginDir], {
        timeout: 60_000,
      });

      // Run npm install in the cloned repo if it has dependencies
      if (existsSync(join(pluginDir, 'package.json'))) {
        await execFileAsync('npm', ['install', '--omit=dev'], {
          cwd: pluginDir,
          timeout: 60_000,
        });
      }

      return this.registerInstalledPlugin(pluginDir, repoUrl, 'git');
    } catch (err) {
      return {
        success: false,
        error: `git install failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private async installFromLocal(localPath: string): Promise<PluginInstallResult> {
    const pluginName = basename(localPath);
    const pluginDir = join(PILOT_PLUGINS_DIR, 'node_modules', pluginName);

    try {
      if (existsSync(pluginDir)) {
        rmSync(pluginDir, { recursive: true, force: true });
      }

      // Symlink or copy the local directory
      // For development, we symlink so changes are immediate
      await execFileAsync('ln', ['-s', localPath, pluginDir], { timeout: 5_000 }).catch(async () => {
        // If symlink fails (Windows), copy instead
        await execFileAsync('cp', ['-r', localPath, pluginDir], { timeout: 10_000 });
      });

      return this.registerInstalledPlugin(pluginDir, localPath, 'local');
    } catch (err) {
      return {
        success: false,
        error: `local install failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private registerInstalledPlugin(
    pluginDir: string,
    sourceUrl: string,
    source: 'npm' | 'git' | 'local',
  ): PluginInstallResult {
    const pkgPath = join(pluginDir, 'package.json');

    if (!existsSync(pkgPath)) {
      return { success: false, error: 'No package.json found — not a valid plugin' };
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const manifest: PluginManifest = pkg.pilot;

      if (!manifest || !manifest.plugins || manifest.plugins.length === 0) {
        return {
          success: false,
          error: 'package.json missing "pilot.plugins" field — not a valid plugin',
        };
      }

      // Verify the entry file exists
      const entryPath = join(pluginDir, manifest.plugins[0]);
      if (!existsSync(entryPath)) {
        return {
          success: false,
          error: `Plugin entry file not found: ${manifest.plugins[0]}`,
        };
      }

      const registry = loadRegistry();
      const existingIdx = registry.plugins.findIndex(p => p.id === pkg.name);

      const installed: InstalledPlugin = {
        id: pkg.name,
        name: pkg.name,
        version: pkg.version || '0.0.0',
        description: pkg.description || 'No description',
        source,
        sourceUrl,
        installedAt: Date.now(),
        enabled: true,
        manifest,
        path: pluginDir,
        hasErrors: false,
      };

      if (existingIdx >= 0) {
        registry.plugins[existingIdx] = { ...registry.plugins[existingIdx], ...installed };
      } else {
        registry.plugins.push(installed);
      }

      saveRegistry(registry);

      return {
        success: true,
        id: installed.id,
        name: installed.name,
        version: installed.version,
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to register plugin: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  remove(pluginId: string): boolean {
    const registry = loadRegistry();
    const idx = registry.plugins.findIndex(p => p.id === pluginId);
    if (idx < 0) return false;

    const plugin = registry.plugins[idx];

    try {
      if (existsSync(plugin.path)) {
        rmSync(plugin.path, { recursive: true, force: true });
      }
    } catch (err) {
      // Continue — remove from registry even if disk cleanup fails
    }

    registry.plugins.splice(idx, 1);
    saveRegistry(registry);
    return true;
  }

  toggle(pluginId: string): boolean {
    const registry = loadRegistry();
    const plugin = registry.plugins.find(p => p.id === pluginId);
    if (!plugin) return false;

    plugin.enabled = !plugin.enabled;
    saveRegistry(registry);
    return true;
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add electron/services/plugin-installer.ts
git commit -m "feat(plugins): create PluginInstaller service"
```

---

### Task 7: Register Plugin IPC Handlers

**Files:**
- Create: `electron/ipc/plugins.ts`

**Step 1: Write the IPC handler registration**

```typescript
import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { PluginBridge } from '../services/plugin-bridge';
import type { PluginInstaller } from '../services/plugin-installer';
import type { InstalledPlugin, PluginInstallResult } from '../../shared/types';

export function registerPluginsIpc(
  pluginBridge: PluginBridge,
  pluginInstaller: PluginInstaller
) {
  // List installed plugins
  ipcMain.handle(IPC.PLUGIN_LIST, (): InstalledPlugin[] => {
    const plugins = pluginInstaller.listPlugins();
    pluginBridge.setInstalledPlugins(plugins);
    return plugins;
  });

  // Install a plugin
  ipcMain.handle(
    IPC.PLUGIN_INSTALL,
    async (_event, source: string): Promise<PluginInstallResult> => {
      const result = await pluginInstaller.install(source);

      // If install succeeded, register the plugin with PluginBridge
      if (result.success && result.id) {
        const plugins = pluginInstaller.listPlugins();
        const installed = plugins.find(p => p.id === result.id);
        if (installed) {
          pluginBridge.registerPlugin(installed);
        }
      }

      return result;
    }
  );

  // Remove a plugin
  ipcMain.handle(IPC.PLUGIN_REMOVE, async (_event, pluginId: string): Promise<boolean> => {
    // Unregister from PluginBridge first
    pluginBridge.unregisterPlugin(pluginId);

    return pluginInstaller.remove(pluginId);
  });

  // Toggle a plugin
  ipcMain.handle(IPC.PLUGIN_TOGGLE, async (_event, pluginId: string): Promise<boolean> => {
    const result = pluginInstaller.toggle(pluginId);
    if (result) {
      const plugins = pluginInstaller.listPlugins();
      const plugin = plugins.find(p => p.id === pluginId);
      if (plugin) {
        if (plugin.enabled) {
          pluginBridge.registerPlugin(plugin);
        } else {
          pluginBridge.unregisterPlugin(pluginId);
        }
      }
    }
    return result;
  });

  // Get contributions
  ipcMain.handle(IPC.PLUGIN_GET_CONTRIBUTIONS, (_event) => {
    return {
      views: pluginBridge.getRegisteredViews(),
      statusBarItems: pluginBridge.getRegisteredStatusBarItems(),
      commands: pluginBridge.getRegisteredCommands(),
      plugins: pluginBridge.getRegisteredPlugins(),
    };
  });

  // Get tree children for a plugin view
  ipcMain.handle(
    IPC.PLUGIN_VIEW_GET_CHILDREN,
    async (_event, viewId: string, elementId: string | null) => {
      return pluginBridge.getViewChildren(viewId, elementId);
    }
  );

  // Execute a plugin command
  ipcMain.handle(
    IPC.PLUGIN_COMMAND_EXECUTE,
    async (_event, commandId: string, args: unknown[]) => {
      return pluginBridge.executeCommand(commandId, args);
    }
  );
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add electron/ipc/plugins.ts
git commit -m "feat(plugins): register plugin IPC handlers"
```

---

### Task 8: Wire Plugin System into `electron/main/index.ts`

**Files:**
- Modify: `electron/main/index.ts`

**Step 1: Import plugin services and IPC registration**

Add these imports near the top of `electron/main/index.ts` (alongside existing imports):

```typescript
import { pluginBridge } from '../services/plugin-bridge';
import { PluginInstaller } from '../services/plugin-installer';
import { registerPluginsIpc } from '../ipc/plugins';
```

**Step 2: Add pluginInstaller variable declaration**

Add near the other service declarations (`let mcpManager`, etc.):

```typescript
let pluginInstaller: PluginInstaller | null = null;
```

**Step 3: Initialize plugin system after companion setup**

Inside `app.whenReady()`, after the companion registration section (around line where `registerPromptsIpc(promptLibrary)` is called), add:

```typescript
  // Initialize plugin system
  pluginInstaller = new PluginInstaller();
  registerPluginsIpc(pluginBridge, pluginInstaller);

  // Start the Extension Host
  pluginBridge.start();

  // Activate installed plugins that are enabled
  const installedPlugins = pluginInstaller.listPlugins();
  pluginBridge.setInstalledPlugins(installedPlugins);
  for (const plugin of installedPlugins) {
    if (plugin.enabled) {
      try {
        pluginBridge.registerPlugin(plugin);
      } catch (err) {
        console.error(`Failed to activate plugin ${plugin.id}:`, err);
      }
    }
  }
```

**Step 4: Add plugin cleanup on quit**

In the `app.on('will-quit', ...)` handler, add before `shutdownLogger()`:

```typescript
  pluginBridge.stop();
```

**Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -30
```

**Step 6: Commit**

```bash
git add electron/main/index.ts
git commit -m "feat(plugins): wire plugin system into main process"
```

---

### Task 9: Create Plugin Store (Renderer)

**Files:**
- Create: `src/stores/plugin-store.ts`

**Step 1: Write the plugin store**

```typescript
import { create } from 'zustand';
import { invoke, onEvent } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type {
  InstalledPlugin,
  PluginInstallResult,
  PluginTreeView,
  PluginStatusBarItem,
  PluginCommand,
  PluginEventPayload,
} from '../../shared/types';

interface PluginStore {
  // State
  installedPlugins: InstalledPlugin[];
  activeViews: PluginTreeView[];
  activeStatusBarItems: PluginStatusBarItem[];
  activeCommands: PluginCommand[];
  activePluginIds: string[];
  installing: boolean;
  installError: string | null;

  // Actions
  loadPlugins: () => Promise<void>;
  installPlugin: (source: string) => Promise<PluginInstallResult>;
  removePlugin: (pluginId: string) => Promise<boolean>;
  togglePlugin: (pluginId: string) => Promise<boolean>;
  refreshContributions: () => Promise<void>;
  getViewChildren: (viewId: string, elementId: string | null) => Promise<unknown[]>;
  executeCommand: (commandId: string, args?: unknown[]) => Promise<unknown>;
  startListening: () => () => void; // returns unsubscribe
}

export const usePluginStore = create<PluginStore>((set, get) => ({
  installedPlugins: [],
  activeViews: [],
  activeStatusBarItems: [],
  activeCommands: [],
  activePluginIds: [],
  installing: false,
  installError: null,

  loadPlugins: async () => {
    const plugins = await invoke<InstalledPlugin[]>(IPC.PLUGIN_LIST);
    set({ installedPlugins: plugins });
    await get().refreshContributions();
  },

  installPlugin: async (source: string) => {
    set({ installing: true, installError: null });
    try {
      const result = await invoke<PluginInstallResult>(IPC.PLUGIN_INSTALL, source);
      if (result.success) {
        await get().loadPlugins();
      } else {
        set({ installError: result.error || 'Install failed' });
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      set({ installError: msg });
      return { success: false, error: msg };
    } finally {
      set({ installing: false });
    }
  },

  removePlugin: async (pluginId: string) => {
    const result = await invoke<boolean>(IPC.PLUGIN_REMOVE, pluginId);
    if (result) {
      set(state => ({
        installedPlugins: state.installedPlugins.filter(p => p.id !== pluginId),
        activePluginIds: state.activePluginIds.filter(id => id !== pluginId),
      }));
    }
    return result;
  },

  togglePlugin: async (pluginId: string) => {
    const result = await invoke<boolean>(IPC.PLUGIN_TOGGLE, pluginId);
    if (result) {
      set(state => ({
        installedPlugins: state.installedPlugins.map(p =>
          p.id === pluginId ? { ...p, enabled: !p.enabled } : p
        ),
      }));
      await get().refreshContributions();
    }
    return result;
  },

  refreshContributions: async () => {
    const contributions = await invoke<{
      views: PluginTreeView[];
      statusBarItems: PluginStatusBarItem[];
      commands: PluginCommand[];
      plugins: InstalledPlugin[];
    }>(IPC.PLUGIN_GET_CONTRIBUTIONS);

    set({
      activeViews: contributions.views,
      activeStatusBarItems: contributions.statusBarItems,
      activeCommands: contributions.commands,
      activePluginIds: contributions.plugins.map(p => p.id),
    });
  },

  getViewChildren: async (viewId: string, elementId: string | null) => {
    return invoke<unknown[]>(IPC.PLUGIN_VIEW_GET_CHILDREN, viewId, elementId);
  },

  executeCommand: async (commandId: string, args?: unknown[]) => {
    return invoke(IPC.PLUGIN_COMMAND_EXECUTE, commandId, args || []);
  },

  startListening: () => {
    const unsub1 = onEvent<PluginEventPayload>(IPC.PLUGIN_EVENT, (payload) => {
      if (payload.type === 'plugin-activated') {
        set(state => ({
          activePluginIds: [...new Set([...state.activePluginIds, payload.pluginId])],
        }));
      } else if (payload.type === 'plugin-deactivated') {
        set(state => ({
          activePluginIds: state.activePluginIds.filter(id => id !== payload.pluginId),
        }));
      }
      // Refresh contributions on any plugin event
      get().refreshContributions();
    });

    const unsub2 = onEvent(IPC.PLUGIN_CONTRIBUTION_UPDATED, () => {
      get().refreshContributions();
    });

    return () => {
      unsub1();
      unsub2();
    };
  },
}));
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -30
```

**Step 3: Commit**

```bash
git add src/stores/plugin-store.ts
git commit -m "feat(plugins): create renderer plugin store"
```

---

### Task 10: End-to-End Verification

**Files:**
- Create: `test-plugins/hello-world/package.json`
- Create: `test-plugins/hello-world/plugin.js`

**Step 1: Create a minimal test plugin**

Create `test-plugins/hello-world/package.json`:

```json
{
  "name": "hello-world-plugin",
  "version": "1.0.0",
  "description": "A minimal test plugin",
  "pilot": {
    "plugins": ["./plugin.js"],
    "permissions": ["ui:sidebar", "ui:status-bar"]
  },
  "dependencies": {}
}
```

Create `test-plugins/hello-world/plugin.js`:

```javascript
// Minimal test plugin — verifies that the Extension Host can load and activate plugins
function activate(pilot) {
  console.log('Hello World plugin activated!');

  // Register a simple tree view
  pilot.contributions.registerTreeView('hello-world', {
    title: 'Hello World',
    icon: 'smile',
    location: 'sidebar',
  });

  // Register a status bar item
  pilot.contributions.createStatusBarItem('hello-status', {
    text: '$(smile) Hello from plugin!',
    alignment: 'right',
    priority: 100,
    tooltip: 'Hello World Plugin',
  });

  // Return cleanup
  return () => {
    console.log('Hello World plugin deactivated');
  };
}

module.exports = { default: activate };
```

**Step 2: Install and verify**

```bash
# Install the test plugin
pilot plugin install ./test-plugins/hello-world

# Or, since the CLI doesn't exist yet, manually trigger via IPC:
# We can test by adding a menu item or using the DevTools console
```

**Manual verification steps:**
1. Build the app: `npm run dev`
2. Open DevTools (they open automatically in dev mode)
3. In the renderer console, run:
   ```javascript
   await window.api.invoke('plugin:install', './test-plugins/hello-world')
   ```
4. Check that:
   - Main process logs show "Extension Host started"
   - Main process logs show "Hello World plugin activated!"
   - `window.api.invoke('plugin:list')` returns the installed plugin
   - `window.api.invoke('plugin:get-contributions')` shows the registered view and status bar item

**Expected output from `plugin:list`:**
```json
[{
  "id": "hello-world-plugin",
  "name": "hello-world-plugin",
  "version": "1.0.0",
  "enabled": true,
  "manifest": {
    "plugins": ["./plugin.js"],
    "permissions": ["ui:sidebar", "ui:status-bar"]
  }
}]
```

**Step 3: Debug and fix any issues**

Common issues to watch for:
- Extension Host doesn't start: Check that `extension-host.js` exists at the compiled output path. The `join(__dirname, 'extension-host.js')` path in PluginBridge must match where electron-vite outputs the compiled file.
- jiti can't import: The extension-host.js runs in a forked Node.js process. Ensure jiti is available (it's a dependency of pi-coding-agent, pulled in transitively).
- IPC message not delivered: Verify the `onEvent` function in `src/lib/ipc-client.ts` correctly handles `IPC.PLUGIN_EVENT` and `IPC.PLUGIN_CONTRIBUTION_UPDATED`.

**Step 4: Commit the test plugin**

```bash
git add test-plugins/
git commit -m "test(plugins): add hello-world test plugin"
```

**Step 5: Commit Phase 1 completion**

```bash
git commit --allow-empty -m "feat(plugins): Phase 1 foundation complete"
```

---

### Phase 1 Completion Checklist

- [ ] `shared/types.ts` — plugin types defined
- [ ] `shared/ipc.ts` — plugin IPC channels added
- [ ] `electron/services/pilot-paths.ts` — plugin directory paths
- [ ] `electron/services/plugin-bridge.ts` — PluginBridge service
- [ ] `electron/services/extension-host.ts` — Extension Host bootstrap
- [ ] `electron/services/plugin-installer.ts` — Plugin installer
- [ ] `electron/ipc/plugins.ts` — IPC handlers
- [ ] `electron/main/index.ts` — wired into app lifecycle
- [ ] `src/stores/plugin-store.ts` — renderer store
- [ ] Test plugin activates and communicates with PluginBridge
- [ ] TypeScript compiles without errors in both main and renderer
