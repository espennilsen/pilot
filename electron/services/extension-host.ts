/**
 * Extension Host — Forked Node.js child process that loads and runs plugins.
 *
 * Communicates with PluginBridge via JSON-RPC 2.0 over stdio.
 * Loads plugins using jiti (same mechanism Pi SDK uses for extensions).
 */

import { createJiti } from 'jiti';

// Check for debug mode
const debugMode = process.env.PILOT_PLUGIN_DEBUG === '1';

if (debugMode) {
  console.error('[ExtensionHost] Debug mode enabled — attach inspector to this process');
  try {
    const inspector = require('node:inspector');
    inspector.open(9229, '0.0.0.0', true);
    console.error('[ExtensionHost] Inspector listening on port 9229');
  } catch (err) {
    console.error('[ExtensionHost] Failed to start inspector:', err);
  }
}

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
    registerTreeView: (id: string, options: { title?: string; icon?: string; location?: 'sidebar' | 'panel'; getChildren?: (elementId: string | null) => Promise<unknown[]> }) => void;
    registerWebviewView: (id: string, options: Record<string, unknown>) => void;
    createStatusBarItem: (id: string, options: { text?: string; tooltip?: string; alignment?: 'left' | 'right'; priority?: number; command?: Record<string, unknown> }) => void;
    registerContextMenu: (options: Record<string, unknown>) => void;
    registerTabType: (id: string, options: { label?: string; icon?: string }) => void;
    registerMessageRenderer: (id: string, options: { matchToolName?: string; matchCustomType?: string }) => void;
    registerSettingsSection: (id: string, options: { title?: string; icon?: string }) => void;
    registerCommand: (id: string, options: { label?: string; keybinding?: string; execute?: (args?: unknown[]) => Promise<unknown> }) => void;
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
    process.send(JSON.stringify(request));

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

  const mod: unknown = await jiti.import(entryPath);
  const activate = (mod as Record<string, unknown>).default || (mod as Record<string, unknown>).activate;

  if (typeof activate !== 'function') {
    // Try module-scope: the file may export `activate` directly
    if (typeof (mod as Record<string, unknown>).activate === 'function') {
      const api = createPluginAPI(pluginId);
      const deactivate = await ((mod as Record<string, unknown>).activate as (api: PluginAPI) => Promise<() => void>)(api);
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
  
  // Clean up contribution callbacks
  viewCallbacks.delete(pluginId);
  commandCallbacks.delete(pluginId);
}

// ─── Plugin API Factory ──────────────────────────────────────────────

function createPluginAPI(pluginId: string): PluginAPI {
  return {
    contributions: {
      registerTreeView(id, options) {
        const viewId = id;
        sendRequest('contribution/registerView', {
          pluginId,
          viewId,
          title: options.title as string,
          icon: options.icon as string,
          location: options.location as 'sidebar' | 'panel',
        }).catch(() => {});
        // Store callback for getChildren
        if (!viewCallbacks.has(pluginId)) {
          viewCallbacks.set(pluginId, new Map());
        }
        viewCallbacks.get(pluginId)!.set(viewId, options.getChildren as (elementId: string | null) => Promise<unknown[]>);
      },
      registerWebviewView(id, options) {
        sendRequest('contribution/registerWebviewView', {
          pluginId,
          viewId: id,
          title: options.title as string,
        }).catch(() => {});
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
        sendRequest('contribution/registerContextMenu', {
          pluginId,
          when: options.when as string,
          group: options.group as string,
          items: options.items,
        }).catch(() => {});
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
        const commandId = id;
        sendRequest('contribution/registerCommand', {
          pluginId,
          id: commandId,
          label: options.label as string,
          keybinding: options.keybinding as string,
        }).catch(() => {});
        // Store callback for execute
        if (!commandCallbacks.has(pluginId)) {
          commandCallbacks.set(pluginId, new Map());
        }
        commandCallbacks.get(pluginId)!.set(commandId, options.execute as (args?: unknown[]) => Promise<unknown>);
      },
    },
    agent: {
      async registerTool(definition) {
        await sendRequest('agent/registerTool', { pluginId, toolName: definition.name as string });
      },
      async removeTool(name) {
        // Phase 3 implementation
      },
      async registerSkill(content, options) {
        const skillId = options?.id as string || `skill-${Date.now()}`;
        await sendRequest('agent/registerSkill', { pluginId, skillId, content });
      },
      async removeSkill(id) {
        await sendRequest('agent/removeSkill', { pluginId, id });
      },
      on(event, handler) {
        sendRequest('agent/subscribeEvent', {
          pluginId,
          event,
        }).catch(() => {});
        // Store the handler locally, keyed by pluginId and event
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, new Map());
        }
        const pluginHandlers = eventHandlers.get(event)!;
        if (!pluginHandlers.has(pluginId)) {
          pluginHandlers.set(pluginId, new Map());
        }
        pluginHandlers.get(pluginId)!.set(handler, handler);
      },
      off(event, handler) {
        const pluginHandlers = eventHandlers.get(event)?.get(pluginId);
        if (pluginHandlers) {
          pluginHandlers.delete(handler);
        }
      },
    },
    storage: {
      async get<T>(key: string) {
        return sendRequest('storage/get', { pluginId, key }) as Promise<T | undefined>;
      },
      async set<T>(key: string, value: T) {
        return sendRequest('storage/set', { pluginId, key, value }) as Promise<void>;
      },
      async delete(key: string) {
        return sendRequest('storage/delete', { pluginId, key }) as Promise<void>;
      },
      async keys() {
        return sendRequest('storage/keys', { pluginId }) as Promise<string[]>;
      },
    },
    workspace: {
      projectPath: null as string | null,
      onDidChangeProject: (callback: (newPath: string | null) => void) => {
        workspaceChangeCallbacks.get(pluginId)?.add(callback);
        if (!workspaceChangeCallbacks.has(pluginId)) {
          workspaceChangeCallbacks.set(pluginId, new Set());
        }
        return {
          dispose: () => {
            workspaceChangeCallbacks.get(pluginId)?.delete(callback);
          }
        };
      },
    },
  };
}

// ─── Event Handler Registry ──────────────────────────────────────────

const eventHandlers = new Map<string, Map<string, Map<Function, Function>>>(); // event -> pluginId -> handler map
const workspaceChangeCallbacks = new Map<string, Set<(newPath: string | null) => void>>(); // pluginId -> callbacks

// ─── Contribution Callback Registries ─────────────────────────────────

const viewCallbacks = new Map<string, Map<string, (elementId: string | null) => Promise<unknown[]>>>(); // pluginId -> viewId -> callback
const commandCallbacks = new Map<string, Map<string, (args?: unknown[]) => Promise<unknown>>>(); // pluginId -> commandId -> callback

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

      if ('id' in msg && ('result' in msg || 'error' in msg)) {
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
        // Route event only to handlers registered by this specific plugin
        const pluginHandlers = eventHandlers.get(name)?.get(pluginId);
        if (pluginHandlers && pluginHandlers.size > 0) {
          const results = [];
          for (const handler of pluginHandlers.values()) {
            const result = await handler(eventData);
            results.push(result);
          }
          const merged = results.find(r => r !== undefined) ?? results[results.length - 1];
          sendResponse(id!, { result: merged ?? { handled: false } });
        } else {
          sendResponse(id!, { result: { handled: false } });
        }
        break;
      }

      case 'view/getChildren': {
        const { pluginId, viewId, elementId } = params as {
          pluginId: string;
          viewId: string;
          elementId: string | null;
        };
        // Look up and invoke the plugin's getChildren callback
        const viewCallback = viewCallbacks.get(pluginId)?.get(viewId);
        if (viewCallback) {
          try {
            const result = await viewCallback(elementId);
            sendResponse(id!, { result });
          } catch (err) {
            console.error(`[ExtensionHost] view/getChildren error for ${pluginId}/${viewId}:`, err);
            sendResponse(id!, { error: { code: -32000, message: err instanceof Error ? err.message : 'Unknown error' } });
          }
        } else {
          console.warn(`[ExtensionHost] No callback registered for view ${pluginId}/${viewId}`);
          sendResponse(id!, { result: [] });
        }
        break;
      }

      case 'command/execute': {
        const { pluginId, commandId, args } = params as {
          pluginId: string;
          commandId: string;
          args?: unknown[];
        };
        // Look up and invoke the plugin's execute callback
        const commandCallback = commandCallbacks.get(pluginId)?.get(commandId);
        if (commandCallback) {
          try {
            const result = await commandCallback(args);
            sendResponse(id!, { result });
          } catch (err) {
            console.error(`[ExtensionHost] command/execute error for ${pluginId}/${commandId}:`, err);
            sendResponse(id!, { error: { code: -32000, message: err instanceof Error ? err.message : 'Unknown error' } });
          }
        } else {
          console.warn(`[ExtensionHost] No callback registered for command ${pluginId}/${commandId}`);
          sendResponse(id!, { result: { ok: false, error: 'Command not found' } });
        }
        break;
      }

      case 'workspace/update': {
        const { projectPath } = params as { projectPath: string };
        // Update projectPath in all active plugin APIs
        for (const plugin of activePlugins.values()) {
          plugin.api.workspace.projectPath = projectPath;
        }
        // Notify all workspace change callbacks
        for (const [pid, callbacks] of workspaceChangeCallbacks.entries()) {
        for (const callback of callbacks) {
          try {
            callback(projectPath);
          } catch (err) {
            console.error('[ExtensionHost] workspace.onDidChangeProject callback error:', err);
          }
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
  process.send(JSON.stringify(rpcResponse));
}

// ─── Startup ─────────────────────────────────────────────────────────

// Signal that the Extension Host is ready
process.send(JSON.stringify({
  jsonrpc: '2.0',
  method: 'host/ready',
}) + '\n');
