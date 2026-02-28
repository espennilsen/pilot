/**
 * MCP Store — Zustand store for MCP server state in the renderer.
 */

import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import type { McpServerConfig, McpServerStatus, McpToolInfo } from '../../shared/types';

interface McpState {
  configs: McpServerConfig[];
  statuses: McpServerStatus[];
  loading: boolean;

  // Actions
  loadServers: (projectPath?: string) => Promise<void>;
  addServer: (server: McpServerConfig, scope: 'global' | 'project', projectPath?: string) => Promise<void>;
  updateServer: (name: string, updates: Partial<McpServerConfig>, scope: 'global' | 'project', projectPath?: string) => Promise<void>;
  removeServer: (name: string, scope: 'global' | 'project', projectPath?: string) => Promise<void>;
  startServer: (config: McpServerConfig) => Promise<void>;
  stopServer: (name: string) => Promise<void>;
  restartServer: (name: string) => Promise<void>;
  getTools: (name: string) => Promise<McpToolInfo[]>;
  testServer: (config: McpServerConfig) => Promise<{ success: boolean; toolCount: number; error?: string }>;
  handleStatusUpdate: (status: McpServerStatus) => void;
}

export const useMcpStore = create<McpState>((set, get) => ({
  configs: [],
  statuses: [],
  loading: false,

  loadServers: async (projectPath) => {
    set({ loading: true });
    try {
      const result: { configs: McpServerConfig[]; statuses: McpServerStatus[] } =
        await window.api.invoke(IPC.MCP_LIST_SERVERS, projectPath);
      set({ configs: result.configs, statuses: result.statuses, loading: false });
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
      set({ loading: false });
    }
  },

  addServer: async (server, scope, projectPath) => {
    await window.api.invoke(IPC.MCP_ADD_SERVER, server, scope, projectPath);
    await get().loadServers(projectPath);
  },

  updateServer: async (name, updates, scope, projectPath) => {
    await window.api.invoke(IPC.MCP_UPDATE_SERVER, name, updates, scope, projectPath);
    await get().loadServers(projectPath);
  },

  removeServer: async (name, scope, projectPath) => {
    await window.api.invoke(IPC.MCP_REMOVE_SERVER, name, scope, projectPath);
    await get().loadServers(projectPath);
  },

  startServer: async (config) => {
    await window.api.invoke(IPC.MCP_START_SERVER, config);
  },

  stopServer: async (name) => {
    await window.api.invoke(IPC.MCP_STOP_SERVER, name);
  },

  restartServer: async (name) => {
    await window.api.invoke(IPC.MCP_RESTART_SERVER, name);
  },

  getTools: async (name) => {
    return await window.api.invoke(IPC.MCP_GET_TOOLS, name);
  },

  testServer: async (config) => {
    return await window.api.invoke(IPC.MCP_TEST_SERVER, config);
  },

  handleStatusUpdate: (status) => {
    set(state => {
      const newStatuses = [...state.statuses];
      const idx = newStatuses.findIndex(s => s.name === status.name);
      if (idx >= 0) {
        newStatuses[idx] = status;
      } else {
        newStatuses.push(status);
      }
      return { statuses: newStatuses };
    });
  },
}));
