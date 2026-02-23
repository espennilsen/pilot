import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { PilotSessionManager } from '../services/pi-session-manager';
import { updateSessionMeta, removeSessionMeta } from '../services/session-metadata';
import type { SessionMeta } from '../services/session-metadata';

export function registerSessionIpc(sessionManager: PilotSessionManager) {
  ipcMain.handle(IPC.SESSION_LIST, async (_event, projectPath: string) => {
    return sessionManager.listSessions(projectPath);
  });

  ipcMain.handle(IPC.SESSION_LIST_ALL, async (_event, projectPaths: string[]) => {
    return sessionManager.listAllSessions(projectPaths || []);
  });

  ipcMain.handle(IPC.SESSION_UPDATE_META, async (_event, sessionPath: string, update: Partial<SessionMeta>) => {
    return updateSessionMeta(sessionPath, update);
  });

  ipcMain.handle(IPC.SESSION_DELETE, async (_event, sessionPath: string) => {
    return sessionManager.deleteSession(sessionPath);
  });
}
