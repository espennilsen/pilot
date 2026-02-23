import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { SubagentManager } from '../services/subagent-manager';
import type { SubagentSpawnOptions, SubagentPoolTask } from '../../shared/types';

/**
 * Register IPC handlers for the subagent system.
 * These allow the renderer to manually spawn, inspect, and abort subagents.
 */
export function registerSubagentIpc(subagentManager: SubagentManager) {
  // Spawn a single subagent (from renderer UI)
  ipcMain.handle(
    IPC.SUBAGENT_SPAWN,
    async (_event, parentTabId: string, projectPath: string, options: SubagentSpawnOptions) => {
      const subId = await subagentManager.spawn(parentTabId, projectPath, options);
      return { subId };
    }
  );

  // Spawn a parallel pool (from renderer UI)
  ipcMain.handle(
    IPC.SUBAGENT_SPAWN_POOL,
    async (_event, parentTabId: string, projectPath: string, tasks: SubagentPoolTask[]) => {
      const poolId = await subagentManager.spawnPool(parentTabId, projectPath, tasks);
      return { poolId };
    }
  );

  // Get status of all subagents for a tab
  ipcMain.handle(
    IPC.SUBAGENT_STATUS,
    async (_event, parentTabId: string) => {
      return subagentManager.getStatus(parentTabId);
    }
  );

  // Get result of a completed subagent
  ipcMain.handle(
    IPC.SUBAGENT_RESULT,
    async (_event, subId: string) => {
      return subagentManager.getResult(subId);
    }
  );

  // Abort a running subagent
  ipcMain.handle(
    IPC.SUBAGENT_ABORT,
    async (_event, subId: string) => {
      await subagentManager.abort(subId);
    }
  );

  // Abort all subagents in a pool
  ipcMain.handle(
    IPC.SUBAGENT_ABORT_POOL,
    async (_event, poolId: string) => {
      await subagentManager.abortPool(poolId);
    }
  );
}
