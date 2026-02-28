/**
 * MCP IPC handlers — bridge between renderer and McpManager service.
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { broadcastToRenderer } from '../utils/broadcast';
import type { McpManager } from '../services/mcp-manager';
import type { McpServerConfig, McpServerStatus, McpToolInfo } from '../../shared/types';

export function registerMcpIpc(mcpManager: McpManager) {
  // Forward status events from McpManager to renderer (and companion clients)
  mcpManager.on('status', (status: McpServerStatus) => {
    broadcastToRenderer(IPC.MCP_SERVER_STATUS, status);
  });

  // Forward config-changed events (external edits to mcp.json)
  mcpManager.on('configChanged', () => {
    broadcastToRenderer(IPC.MCP_CONFIG_CHANGED, {});
  });

  // List all configured servers with status
  ipcMain.handle(
    IPC.MCP_LIST_SERVERS,
    (_, projectPath?: string): { configs: McpServerConfig[]; statuses: McpServerStatus[] } => {
      return {
        configs: mcpManager.listConfigs(projectPath),
        statuses: mcpManager.getServerStatuses(projectPath),
      };
    }
  );

  // Add a new server
  ipcMain.handle(
    IPC.MCP_ADD_SERVER,
    (_, server: McpServerConfig, scope: 'global' | 'project', projectPath?: string): void => {
      mcpManager.addServer(server, scope, projectPath);
    }
  );

  // Update a server
  ipcMain.handle(
    IPC.MCP_UPDATE_SERVER,
    (
      _,
      name: string,
      updates: Partial<McpServerConfig>,
      scope: 'global' | 'project',
      projectPath?: string
    ): void => {
      mcpManager.updateServer(name, updates, scope, projectPath);
    }
  );

  // Remove a server
  ipcMain.handle(
    IPC.MCP_REMOVE_SERVER,
    (_, name: string, scope: 'global' | 'project', projectPath?: string): void => {
      mcpManager.removeServer(name, scope, projectPath);
    }
  );

  // Manually start a server
  ipcMain.handle(
    IPC.MCP_START_SERVER,
    async (_, config: McpServerConfig): Promise<void> => {
      await mcpManager.startServer(config);
    }
  );

  // Stop a server
  ipcMain.handle(
    IPC.MCP_STOP_SERVER,
    async (_, name: string): Promise<void> => {
      await mcpManager.stopServer(name);
    }
  );

  // Restart a server
  ipcMain.handle(
    IPC.MCP_RESTART_SERVER,
    async (_, name: string): Promise<void> => {
      await mcpManager.restartServer(name);
    }
  );

  // Get tools from a specific server
  ipcMain.handle(
    IPC.MCP_GET_TOOLS,
    (_, name: string): McpToolInfo[] => {
      const tools = mcpManager.getServerTools(name);
      return tools.map(t => ({
        serverName: name,
        name: t.name,
        description: t.description || '',
      }));
    }
  );

  // Test a server connection
  ipcMain.handle(
    IPC.MCP_TEST_SERVER,
    async (_, config: McpServerConfig): Promise<{ success: boolean; toolCount: number; error?: string }> => {
      try {
        const { tools } = await mcpManager.testServer(config);
        return { success: true, toolCount: tools.length };
      } catch (error) {
        return {
          success: false,
          toolCount: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}
