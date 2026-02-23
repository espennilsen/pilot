import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { PilotSessionManager } from '../services/pi-session-manager';

export function registerSessionIpc(sessionManager: PilotSessionManager) {
  ipcMain.handle(IPC.SESSION_LIST, async (_event, projectPath: string) => {
    return sessionManager.listSessions(projectPath);
  });

  ipcMain.handle(IPC.SESSION_LIST_ALL, async (_event, projectPaths: string[]) => {
    return sessionManager.listAllSessions(projectPaths || []);
  });
}
