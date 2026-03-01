/**
 * @file IPC handlers for Docker sandbox management.
 */
import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { loadProjectSettings, saveProjectSettings } from '../services/project-settings';
import type { DesktopService } from '../services/desktop-service';
import type { PilotSessionManager } from '../services/pi-session-manager';
import type { DesktopCheckResult } from '../../shared/types';

export function registerDesktopIpc(service: DesktopService | null, sessionManager?: PilotSessionManager) {
  ipcMain.handle(IPC.DESKTOP_CHECK, async (): Promise<DesktopCheckResult> => {
    if (!service) {
      return {
        available: false,
        reason: 'service-init-failed',
        message: 'Docker sandbox service failed to initialise. Check that Docker is installed.',
      };
    }
    try {
      const ok = await service.isDockerAvailable();
      if (ok) {
        return { available: true };
      }
      return {
        available: false,
        reason: 'not-running',
        message: 'Docker Desktop is installed but not running. Start Docker Desktop and try again.',
      };
    } catch {
      return {
        available: false,
        reason: 'not-installed',
        message: 'Docker is not installed. Install Docker Desktop to use sandboxes.',
      };
    }
  });

  ipcMain.handle(IPC.DESKTOP_START, async (_event, projectPath: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    return service.startSandbox(projectPath);
  });

  ipcMain.handle(IPC.DESKTOP_STOP, async (_event, projectPath: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    await service.stopSandbox(projectPath);
  });

  ipcMain.handle(IPC.DESKTOP_STATUS, async (_event, projectPath: string) => {
    if (!service) return null;
    return service.getSandboxStatus(projectPath);
  });

  ipcMain.handle(IPC.DESKTOP_EXEC, async (_event, projectPath: string, command: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    return service.execInSandbox(projectPath, command);
  });

  ipcMain.handle(IPC.DESKTOP_SCREENSHOT, async (_event, projectPath: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    return service.screenshotSandbox(projectPath);
  });

  ipcMain.handle(IPC.DESKTOP_SET_TOOLS_ENABLED, async (_event, projectPath: string, enabled: boolean) => {
    const settings = loadProjectSettings(projectPath);
    settings.desktopToolsEnabled = enabled;
    saveProjectSettings(projectPath, settings);

    // Update live sessions for this project
    if (sessionManager) {
      sessionManager.updateDesktopToolsForProject(projectPath, enabled);
    }
  });

  ipcMain.handle(IPC.DESKTOP_GET_TOOLS_ENABLED, async (_event, projectPath: string) => {
    const settings = loadProjectSettings(projectPath);
    return settings.desktopToolsEnabled ?? null;
  });
}
