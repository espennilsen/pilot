import { useEffect } from 'react';
import { useMcpStore } from '../stores/mcp-store';
import { useProjectStore } from '../stores/project-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type { McpServerStatus } from '../../shared/types';

/**
 * Listens for MCP server status events and config changes from the main process.
 * Updates the MCP store in real-time as servers connect, disconnect, or error.
 *
 * Also loads initial MCP server state when the project changes.
 *
 * Should be mounted once at the app root level.
 */
export function useMcpEvents() {
  const handleStatusUpdate = useMcpStore(s => s.handleStatusUpdate);
  const loadServers = useMcpStore(s => s.loadServers);
  const projectPath = useProjectStore(s => s.projectPath);

  // Subscribe to server status push events
  useEffect(() => {
    const unsub = on(IPC.MCP_SERVER_STATUS, (status: McpServerStatus) => {
      handleStatusUpdate(status);
    });
    return unsub;
  }, [handleStatusUpdate]);

  // Subscribe to config-changed push events (external edits to mcp.json)
  useEffect(() => {
    const unsub = on(IPC.MCP_CONFIG_CHANGED, () => {
      loadServers(projectPath || undefined);
    });
    return unsub;
  }, [loadServers, projectPath]);

  // Load MCP servers when project changes
  useEffect(() => {
    loadServers(projectPath || undefined);
  }, [projectPath, loadServers]);
}
