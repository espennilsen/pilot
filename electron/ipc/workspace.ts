import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { WorkspaceStateService, type WorkspaceState } from '../services/workspace-state';

const service = new WorkspaceStateService();

export function registerWorkspaceIpc() {
  ipcMain.handle(IPC.TABS_SAVE_STATE, async (_event, state: WorkspaceState) => {
    await service.save(state);
  });

  ipcMain.handle(IPC.TABS_RESTORE_STATE, async () => {
    return await service.load();
  });
}
