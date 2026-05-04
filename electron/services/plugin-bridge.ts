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

// ─── JSON-RPC Types ───────────────────────────────────────────────────────

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
  private buffer = '';
  private installedPlugins: InstalledPlugin[] = [];
  private isStopping = false;
  private sessionManager: any = null;
  private pluginSkills = new Map<string, Array<{ skillId: string; content: string }>>();
  private pendingApprovals = new Map<string, {
    pluginId: string;
    pluginName: string;
    requestedCapabilities: Array<{ type: 'tool' | 'skill'; name: string; description?: string }>;
    resolve: (approved: boolean) => void;
  }>();

  // ─── Lifecycle ─────────────────────────────────────────────────────

  /** Start the Extension Host child process. */
  start(debug?: boolean): void {
    this.isStopping = false;
    const hostScript = join(__dirname, 'extension-host.js');
    // Compile extension-host.ts → extension-host.js happens at build time (electron-vite)
    // The .js file lives next to the compiled services

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

    // Use fork IPC channel for JSON-RPC messages (not stdout)
    // This prevents console.log from plugins breaking the RPC protocol
    this.childProcess.on('message', (msg: string) => {
      this.handleData(msg.toString('utf-8'));
    });

    // Stdout/stderr are for logs only - plugins can console.log freely
    this.childProcess.stdout?.on('data', (data: Buffer) => {
      // Pass through stdout as-is for plugin console.log output
      process.stdout.write(data);
    });

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[PluginBridge] Extension Host: ${data.toString('utf-8')}`);
    });

    this.childProcess.on('exit', (code) => {
      console.warn(`[PluginBridge] Extension Host exited with code ${code}`);
      // Auto-restart after a short delay (only if not intentionally stopping)
      setTimeout(() => {
        if (!this.isStopping && this.plugins.size > 0) {
          console.log('[PluginBridge] Restarting Extension Host...');
          this.start();
          this.reloadAllPlugins();
        }
      }, 1000);
    });

    console.log('[PluginBridge] Extension Host started');
  }

  /** Gracefully stop the Extension Host. */
  stop(): void {
    this.isStopping = true;
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
      console.log(`[PluginBridge] Plugin activated: ${plugin.id}`);
      this.broadcastPluginEvent('plugin-activated', plugin.id);
    }).catch((err) => {
      console.error(`[PluginBridge] Plugin activation failed: ${plugin.id}`, err);
      this.plugins.delete(plugin.id);
      this.broadcastPluginEvent('plugin-error', plugin.id, { error: err instanceof Error ? err.message : 'Unknown error' });
    });
  }

  /** Unregister a plugin and tell the Extension Host to deactivate. */
  async unregisterPlugin(pluginId: string): Promise<void> {
    // Remove plugin skills first
    this.pluginSkills.delete(pluginId);
    
    this.plugins.delete(pluginId);
    await this.sendRequest('plugin/deactivate', { pluginId }).catch(() => {});
    this.broadcastPluginEvent('plugin-deactivated', pluginId);
  }

  setInstalledPlugins(plugins: InstalledPlugin[]): void {
    this.installedPlugins = plugins;
  }

  /** Set the PilotSessionManager reference (called during wiring). */
  setSessionManager(sm: any): void {
    this.sessionManager = sm;
  }

  /** Get all plugin skills as a concatenated string for prompt injection. */
  getAllSkills(): string {
    const parts: string[] = [];
    for (const skills of this.pluginSkills.values()) {
      for (const skill of skills) {
        parts.push(skill.content);
      }
    }
    return parts.join('\n\n');
  }

  /** Get skills for a specific project (scope by projectPath). */
  getSkillsForProject(projectPath: string | null): string {
    if (!projectPath) {
      // No project open, return all skills
      return this.getAllSkills();
    }
    
    // Filter skills by project scope
    // For now, we return all skills since we don't have project-scoped registration
    // Future enhancement: plugins can register skills with project scope
    return this.getAllSkills();
  }

  /** Register a skill from a plugin. */
  registerSkill(pluginId: string, skillId: string, content: string): void {
    if (!this.pluginSkills.has(pluginId)) {
      this.pluginSkills.set(pluginId, []);
    }
    this.pluginSkills.get(pluginId)!.push({ skillId, content });
  }

  /** Remove a skill. */
  removeSkill(pluginId: string, skillId: string): void {
    const skills = this.pluginSkills.get(pluginId);
    if (skills) {
      const idx = skills.findIndex(s => s.skillId === skillId);
      if (idx >= 0) skills.splice(idx, 1);
    }
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
        console.error(`[PluginBridge] Plugin ${pluginId} failed to handle event ${event.name}:`, err);
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
        console.error('[PluginBridge] Failed to parse JSON-RPC message:', trimmed);
      }
    }
  }

  private handleIncomingRequest(request: RpcRequest): void {
    // Handle requests initiated by the Extension Host (e.g. contribution registration)
    const { method, params, id } = request;

    switch (method) {
      case 'contribution/registerView': {
        const p = params as PluginTreeView & { pluginId: string };
        // Check permission based on view location
        const requiredPerm = p.location === 'sidebar' ? 'ui:sidebar' : 'ui:panel';
        if (!this.checkPermission(p.pluginId, requiredPerm)) {
          this.sendResponse(id!, { error: { code: -32001, message: `Permission denied: ${requiredPerm} required` } });
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
        const p = params as { pluginId: string; toolName: string; toolDefinition: any; projectPath: string };
        if (!this.checkPermission(p.pluginId, 'agent:tools')) {
          this.sendResponse(id!, {
            error: { code: -32001, message: 'Permission denied: agent:tools required' }
          });
          return;
        }
        // Tool registration requires user approval - handled in Phase 3 approval flow
        // For now, acknowledge with flag that approval is needed
        this.sendResponse(id!, { result: { ok: true, requiresApproval: true } });
        break;
      }

      case 'agent/registerSkill': {
        const p = params as { pluginId: string; skillId: string; content: string };
        if (!this.checkPermission(p.pluginId, 'agent:skills')) {
          this.sendResponse(id!, {
            error: { code: -32001, message: 'Permission denied: agent:skills required' }
          });
          return;
        }
        this.registerSkill(p.pluginId, p.skillId, p.content);
        this.sendResponse(id!, { result: { ok: true } });
        break;
      }

      default:
        console.warn(`[PluginBridge] Unknown RPC method: ${method}`);
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
    // Clear all plugin skills before reloading to prevent duplicates
    this.pluginSkills.clear();
    
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
