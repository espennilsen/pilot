/**
 * MCP Manager
 *
 * Manages MCP (Model Context Protocol) server connections, tool discovery,
 * and lifecycle. Bridges MCP tools to Pi SDK ToolDefinitions for use in
 * agent sessions.
 *
 * Key responsibilities:
 * - Load MCP server configs (global + per-project)
 * - Start/stop/restart MCP server connections (stdio, SSE, Streamable HTTP)
 * - Discover tools from connected servers
 * - Bridge MCP tools → Pi SDK ToolDefinition format
 * - Reference-count connections across tabs sharing a project
 * - Auto-reconnect on disconnect with exponential backoff
 * - Watch config files for external changes
 * - Emit status events for the UI and companion
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { EventEmitter } from 'events';
import { watch, type FSWatcher } from 'fs';
import { join } from 'path';
import {
  loadMergedMcpConfig,
  loadGlobalMcpConfig,
  addServerToConfig,
  removeServerFromConfig,
  updateServerInConfig,
} from './mcp-config';
import { PILOT_APP_DIR } from './pilot-paths';
import { createMcpToolDefinition, type McpTool } from './mcp-tool-bridge';
import { getLogger } from './logger';
import type { McpServerConfig, McpServerStatus } from '../../shared/types';

const log = getLogger('MCP');

// ─── Types ────────────────────────────────────────────────────────

interface ManagedServer {
  config: McpServerConfig;
  client: Client | null;
  transport: Transport | null;
  tools: McpTool[];
  status: McpServerStatus['status'];
  error: string | null;
  /** Tabs currently using this server */
  tabRefs: Set<string>;
  /** Reconnect timer handle */
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
}

const MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1_000;
const RECONNECT_BACKOFF = 1.5;
const CONNECT_TIMEOUT = 15_000;
const LIST_TOOLS_TIMEOUT = 10_000;
const CALL_TOOL_TIMEOUT = 60_000;
const MAX_RECONNECT_ATTEMPTS = 10;
/** Debounce config file change events */
const CONFIG_WATCH_DEBOUNCE = 500;

/** Race a promise against a timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

// ─── McpManager ───────────────────────────────────────────────────

export class McpManager extends EventEmitter {
  /** Keyed by server name */
  private servers = new Map<string, ManagedServer>();
  /** File watchers for config files */
  private configWatchers = new Map<string, FSWatcher>();
  /** Debounce timers for config reload */
  private configReloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Currently watched project paths */
  private watchedProjects = new Set<string>();
  /** Whether we're shutting down (suppress reconnects) */
  private disposing = false;

  constructor() {
    super();
    this.watchGlobalConfig();
  }

  // ─── Server Lifecycle ─────────────────────────────────────────

  /**
   * Start all enabled servers for a project.
   * Called when a session is created/restored.
   */
  async startAllForProject(projectPath: string, tabId: string): Promise<void> {
    const configs = loadMergedMcpConfig(projectPath);
    const enabledConfigs = configs.filter(c => c.enabled);

    log.info(`Starting ${enabledConfigs.length} MCP server(s) for project`, { projectPath, tabId });

    // Watch project config file for changes
    this.watchProjectConfig(projectPath);

    const startPromises = enabledConfigs.map(config => {
      const existing = this.servers.get(config.name);
      if (existing && (existing.status === 'connected' || existing.status === 'connecting')) {
        // Server already running — just add tab ref
        log.debug(`Server "${config.name}" already ${existing.status}, adding tab ref`, { tabId });
        existing.tabRefs.add(tabId);
        return Promise.resolve();
      }
      return this.startServer(config, tabId);
    });

    await Promise.allSettled(startPromises);
  }

  /**
   * Stop servers that are no longer used by any tab.
   * Called when a session is disposed.
   */
  async stopAllForTab(tabId: string): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const [name, server] of this.servers) {
      server.tabRefs.delete(tabId);
      if (server.tabRefs.size === 0) {
        log.debug(`No remaining tab refs for "${name}", stopping server`);
        stopPromises.push(this.stopServer(name));
      }
    }

    await Promise.allSettled(stopPromises);
  }

  /**
   * Start a single MCP server connection.
   */
  async startServer(config: McpServerConfig, tabId?: string): Promise<void> {
    if (this.disposing) return;
    const { name } = config;

    // Stop existing if running
    if (this.servers.has(name)) {
      const existing = this.servers.get(name)!;
      const existingTabRefs = new Set(existing.tabRefs);
      await this.stopServer(name);
      // Preserve tab refs from the old server
      if (tabId) existingTabRefs.add(tabId);
      tabId = undefined; // Don't add again below
      const managed = this.createManagedEntry(config, existingTabRefs);
      this.servers.set(name, managed);
    }

    let managed = this.servers.get(name);
    if (!managed) {
      managed = this.createManagedEntry(config, new Set(tabId ? [tabId] : []));
      this.servers.set(name, managed);
    } else if (tabId) {
      managed.tabRefs.add(tabId);
    }

    managed.status = 'connecting';
    managed.error = null;
    this.emitStatus(name);

    log.info(`Connecting to MCP server "${name}"`, { transport: config.transport });

    try {
      const transport = this.createTransport(config);
      const client = new Client(
        { name: 'pilot', version: '1.0.0' },
        {
          capabilities: {},
          // Re-discover tools when the server notifies us
          listChanged: {
            tools: {
              onChanged: (_error, tools) => {
                if (tools && managed) {
                  managed.tools = tools.map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema as McpTool['inputSchema'],
                  }));
                  this.emitStatus(name);
                }
              },
            },
          },
        }
      );

      managed.transport = transport;
      managed.client = client;

      // Set up close/error handlers
      transport.onclose = () => {
        if (this.disposing) return;
        const current = this.servers.get(name);
        if (current && current.status === 'connected') {
          log.warn(`MCP server "${name}" connection closed unexpectedly`);
          current.status = 'disconnected';
          current.error = 'Connection closed';
          this.emitStatus(name);
          this.scheduleReconnect(name);
        }
      };

      transport.onerror = (error: Error) => {
        if (this.disposing) return;
        const current = this.servers.get(name);
        if (current && (current.status === 'connected' || current.status === 'connecting')) {
          log.error(`MCP server "${name}" transport error: ${error.message}`);
          current.error = error.message;
          current.status = 'error';
          this.emitStatus(name);
          this.scheduleReconnect(name);
        }
      };

      // Connect with timeout
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT, 'MCP connect');

      // Discover tools (also with timeout)
      const toolsResult = await withTimeout(client.listTools(), LIST_TOOLS_TIMEOUT, 'MCP listTools');
      managed.tools = (toolsResult.tools || []).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as McpTool['inputSchema'],
      }));

      managed.status = 'connected';
      managed.error = null;
      managed.reconnectAttempt = 0;
      log.info(`MCP server "${name}" connected`, { toolCount: managed.tools.length, tools: managed.tools.map(t => t.name) });
      this.emitStatus(name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to MCP server "${name}": ${message}`);
      managed.status = 'error';
      managed.error = message;
      managed.client = null;
      managed.transport = null;
      this.emitStatus(name);
      this.scheduleReconnect(name);
    }
  }

  /**
   * Stop and clean up a server connection.
   */
  async stopServer(name: string): Promise<void> {
    const managed = this.servers.get(name);
    if (!managed) return;

    log.info(`Stopping MCP server "${name}"`);

    // Clear reconnect timer
    if (managed.reconnectTimer) {
      clearTimeout(managed.reconnectTimer);
      managed.reconnectTimer = null;
    }

    // Close transport
    try {
      if (managed.transport) {
        await managed.transport.close();
      }
    } catch {
      // Ignore close errors — the process may already be dead
    }

    managed.client = null;
    managed.transport = null;
    managed.tools = [];
    managed.status = 'disconnected';
    managed.error = null;
    this.servers.delete(name);
    this.emitStatus(name);
  }

  /**
   * Restart a server connection, preserving tab refs.
   */
  async restartServer(name: string): Promise<void> {
    const managed = this.servers.get(name);
    if (!managed) return;

    const config = { ...managed.config };
    const tabRefs = new Set(managed.tabRefs);

    await this.stopServer(name);

    // Recreate with existing tab refs
    const newManaged = this.createManagedEntry(config, tabRefs);
    this.servers.set(name, newManaged);

    await this.startServer(config);
  }

  // ─── Tool Access ──────────────────────────────────────────────

  /**
   * Get Pi SDK ToolDefinition wrappers for all connected MCP servers.
   */
  getToolDefinitions(projectPath?: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    const configs = projectPath ? loadMergedMcpConfig(projectPath) : loadGlobalMcpConfig();
    const enabledNames = new Set(configs.filter(c => c.enabled).map(c => c.name));

    for (const [name, managed] of this.servers) {
      if (!enabledNames.has(name)) continue;
      if (managed.status !== 'connected' || !managed.client) continue;

      for (const mcpTool of managed.tools) {
        tools.push(createMcpToolDefinition(managed.client, mcpTool, name));
      }
    }

    return tools;
  }

  /**
   * Get tools discovered from a specific server.
   */
  getServerTools(name: string): McpTool[] {
    return this.servers.get(name)?.tools || [];
  }

  // ─── Status ───────────────────────────────────────────────────

  /**
   * Get status for all configured servers (including disconnected).
   */
  getServerStatuses(projectPath?: string): McpServerStatus[] {
    const configs = projectPath ? loadMergedMcpConfig(projectPath) : loadGlobalMcpConfig();
    return configs.map(config => {
      const managed = this.servers.get(config.name);
      return {
        name: config.name,
        transport: config.transport,
        scope: config.scope || 'global',
        status: managed?.status || 'disconnected',
        toolCount: managed?.tools.length || 0,
        error: managed?.error || null,
        enabled: config.enabled,
      };
    });
  }

  /**
   * Get status for a single server.
   */
  getServerStatus(name: string): McpServerStatus | null {
    const managed = this.servers.get(name);
    if (!managed) return null;
    return {
      name,
      transport: managed.config.transport,
      scope: managed.config.scope || 'global',
      status: managed.status,
      toolCount: managed.tools.length,
      error: managed.error,
      enabled: managed.config.enabled,
    };
  }

  /**
   * Get count of currently connected servers.
   */
  getConnectedCount(): number {
    let count = 0;
    for (const managed of this.servers.values()) {
      if (managed.status === 'connected') count++;
    }
    return count;
  }

  // ─── Config Passthrough ───────────────────────────────────────

  listConfigs(projectPath?: string): McpServerConfig[] {
    return projectPath ? loadMergedMcpConfig(projectPath) : loadGlobalMcpConfig();
  }

  addServer(server: McpServerConfig, scope: 'global' | 'project', projectPath?: string): void {
    addServerToConfig(server, scope, projectPath);
  }

  updateServer(
    name: string,
    updates: Partial<McpServerConfig>,
    scope: 'global' | 'project',
    projectPath?: string
  ): void {
    updateServerInConfig(name, updates, scope, projectPath);
  }

  removeServer(name: string, scope: 'global' | 'project', projectPath?: string): void {
    removeServerFromConfig(name, scope, projectPath);
    // Also stop the running server
    this.stopServer(name).catch(() => {});
  }

  /**
   * Test connectivity to a server without persisting the connection.
   * Returns tools if successful, throws on failure.
   */
  async testServer(config: McpServerConfig): Promise<{ tools: McpTool[] }> {
    const transport = this.createTransport(config);
    const client = new Client(
      { name: 'pilot', version: '1.0.0' },
      { capabilities: {} }
    );

    try {
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT, 'MCP connect');
      const toolsResult = await withTimeout(client.listTools(), LIST_TOOLS_TIMEOUT, 'MCP listTools');
      const tools: McpTool[] = (toolsResult.tools || []).map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as McpTool['inputSchema'],
      }));

      return { tools };
    } finally {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  // ─── Config File Watching ─────────────────────────────────────

  /**
   * Watch the global mcp.json for external edits.
   */
  private watchGlobalConfig(): void {
    const configPath = join(PILOT_APP_DIR, 'mcp.json');
    this.watchConfigFile(configPath, 'global');
  }

  /**
   * Watch a project's .pilot/mcp.json for external edits.
   */
  private watchProjectConfig(projectPath: string): void {
    if (this.watchedProjects.has(projectPath)) return;
    this.watchedProjects.add(projectPath);

    const configPath = join(projectPath, '.pilot', 'mcp.json');
    this.watchConfigFile(configPath, `project:${projectPath}`);
  }

  /**
   * Watch a specific config file and debounce reload.
   */
  private watchConfigFile(configPath: string, key: string): void {
    // Don't duplicate watchers
    if (this.configWatchers.has(key)) return;

    try {
      const watcher = watch(configPath, { persistent: false }, () => {
        // Debounce — config writes may trigger multiple events
        const existing = this.configReloadTimers.get(key);
        if (existing) clearTimeout(existing);

        this.configReloadTimers.set(key, setTimeout(() => {
          this.configReloadTimers.delete(key);
          this.emitConfigChanged();
        }, CONFIG_WATCH_DEBOUNCE));
      });

      watcher.on('error', () => {
        // File doesn't exist yet — that's fine, we'll create it when needed
        this.configWatchers.delete(key);
      });

      this.configWatchers.set(key, watcher);
    } catch {
      // Config file doesn't exist yet — ignore, UI will create it
    }
  }

  /**
   * Notify the renderer that config has changed externally.
   */
  private emitConfigChanged(): void {
    log.info('MCP config changed externally, notifying renderer');
    this.emit('configChanged');
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  /**
   * Dispose all connections and watchers. Called on app quit.
   */
  async disposeAll(): Promise<void> {
    log.info('Disposing all MCP connections');
    this.disposing = true;

    // Clear all reconnect timers first
    for (const managed of this.servers.values()) {
      if (managed.reconnectTimer) {
        clearTimeout(managed.reconnectTimer);
        managed.reconnectTimer = null;
      }
    }

    // Stop all servers
    const stopPromises = Array.from(this.servers.keys()).map(name =>
      this.stopServer(name)
    );
    await Promise.allSettled(stopPromises);

    // Close config watchers
    for (const watcher of this.configWatchers.values()) {
      watcher.close();
    }
    this.configWatchers.clear();

    // Clear debounce timers
    for (const timer of this.configReloadTimers.values()) {
      clearTimeout(timer);
    }
    this.configReloadTimers.clear();

    this.watchedProjects.clear();
    this.removeAllListeners();
  }

  // ─── Private ──────────────────────────────────────────────────

  private createManagedEntry(config: McpServerConfig, tabRefs: Set<string>): ManagedServer {
    return {
      config,
      client: null,
      transport: null,
      tools: [],
      status: 'disconnected',
      error: null,
      tabRefs,
      reconnectTimer: null,
      reconnectAttempt: 0,
    };
  }

  private createTransport(config: McpServerConfig): Transport {
    switch (config.transport) {
      case 'stdio': {
        if (!config.command) {
          throw new Error(`MCP server "${config.name}": stdio transport requires a command`);
        }
        return new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: config.env
            ? { ...process.env, ...config.env } as Record<string, string>
            : undefined,
          cwd: config.cwd,
          stderr: 'pipe',
        });
      }
      case 'sse': {
        if (!config.url) {
          throw new Error(`MCP server "${config.name}": SSE transport requires a URL`);
        }
        return new SSEClientTransport(new URL(config.url), {
          requestInit: config.headers
            ? { headers: config.headers }
            : undefined,
        });
      }
      case 'streamable-http': {
        if (!config.url) {
          throw new Error(`MCP server "${config.name}": Streamable HTTP transport requires a URL`);
        }
        return new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: config.headers
            ? { headers: config.headers }
            : undefined,
        });
      }
      default:
        throw new Error(`MCP server "${config.name}": unknown transport "${(config as McpServerConfig).transport}"`);
    }
  }

  private scheduleReconnect(name: string): void {
    if (this.disposing) return;

    const managed = this.servers.get(name);
    if (!managed || managed.tabRefs.size === 0) return;

    // Give up after max attempts
    if (managed.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      log.error(`MCP server "${name}" giving up after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`);
      managed.error = `Failed after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`;
      managed.status = 'error';
      this.emitStatus(name);
      return;
    }

    // Clear existing timer
    if (managed.reconnectTimer) {
      clearTimeout(managed.reconnectTimer);
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_BACKOFF, managed.reconnectAttempt),
      MAX_RECONNECT_DELAY
    );

    managed.reconnectAttempt++;
    log.warn(`Scheduling reconnect for "${name}" in ${Math.round(delay / 1000)}s (attempt ${managed.reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`);

    managed.reconnectTimer = setTimeout(async () => {
      if (this.disposing) return;
      if (!this.servers.has(name)) return;
      const current = this.servers.get(name)!;
      if (current.status === 'connected') return;

      const tabRefs = new Set(current.tabRefs);
      const attempt = current.reconnectAttempt;

      try {
        await this.startServer(current.config);
        // Restore tab refs and attempt count
        const updated = this.servers.get(name);
        if (updated) {
          for (const tabId of tabRefs) {
            updated.tabRefs.add(tabId);
          }
          updated.reconnectAttempt = attempt;
        }
      } catch {
        // startServer handles errors internally
      }
    }, delay);
  }

  private emitStatus(name: string): void {
    const managed = this.servers.get(name);
    if (managed) {
      this.emit('status', {
        name,
        transport: managed.config.transport,
        scope: managed.config.scope || 'global',
        status: managed.status,
        toolCount: managed.tools.length,
        error: managed.error,
        enabled: managed.config.enabled,
      } satisfies McpServerStatus);
    } else {
      // Server was removed — emit disconnected
      this.emit('status', {
        name,
        transport: 'stdio',
        scope: 'global',
        status: 'disconnected',
        toolCount: 0,
        error: null,
        enabled: false,
      } satisfies McpServerStatus);
    }
  }
}
