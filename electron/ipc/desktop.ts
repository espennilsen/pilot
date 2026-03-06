/**
 * @file IPC handlers for Docker desktop management.
 */
import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { loadProjectSettings, saveProjectSettings } from '../services/project-settings';
import { requireString, requireBoolean, validateProjectPath } from '../utils/ipc-validation';
import type { DesktopService } from '../services/desktop-service';
import type { PilotSessionManager } from '../services/pi-session-manager';
import type { DesktopCheckResult } from '../../shared/types';

export function registerDesktopIpc(service: DesktopService | null, sessionManager?: PilotSessionManager) {
  ipcMain.handle(IPC.DESKTOP_CHECK, async (): Promise<DesktopCheckResult> => {
    if (!service) {
      return {
        available: false,
        reason: 'service-init-failed',
        message: 'Docker desktop service failed to initialise. Check that Docker is installed.',
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
        message: 'Docker is not installed. Install Docker Desktop to use desktop environments.',
      };
    }
  });

  ipcMain.handle(IPC.DESKTOP_START, async (_event, projectPath: unknown) => {
    if (!service) throw new Error('Docker desktop service is not available');
    const validPath = validateProjectPath(projectPath);
    try {
      return await service.startDesktop(validPath);
    } catch (err) {
      // A rebuild raced with this start — return current status instead of
      // surfacing a confusing error in the renderer's desktop store.
      if (err instanceof Error && err.message.includes('superseded')) {
        return service.getDesktopStatus(validPath);
      }
      throw err;
    }
  });

  ipcMain.handle(IPC.DESKTOP_STOP, async (_event, projectPath: unknown) => {
    if (!service) throw new Error('Docker desktop service is not available');
    const validPath = validateProjectPath(projectPath);
    await service.stopDesktop(validPath);
  });

  ipcMain.handle(IPC.DESKTOP_STATUS, async (_event, projectPath: unknown) => {
    if (!service) return null;
    const validPath = validateProjectPath(projectPath);
    return service.getDesktopStatus(validPath);
  });

  // NOTE: There is no desktop exec IPC handler. Agent tools call
  // service.execInDesktop() directly — no renderer-callable exec handler
  // is needed, and omitting it reduces attack surface.

  ipcMain.handle(IPC.DESKTOP_REBUILD, async (_event, projectPath: unknown) => {
    if (!service) throw new Error('Docker desktop service is not available');
    const validPath = validateProjectPath(projectPath);
    try {
      return await service.rebuildDesktop(validPath);
    } catch (err) {
      // A start raced with this rebuild — return current status instead of
      // surfacing a confusing error in the renderer's desktop store.
      if (err instanceof Error && err.message.includes('superseded')) {
        return service.getDesktopStatus(validPath);
      }
      throw err;
    }
  });

  ipcMain.handle(IPC.DESKTOP_SCREENSHOT, async (_event, projectPath: unknown) => {
    if (!service) throw new Error('Docker desktop service is not available');
    const validPath = validateProjectPath(projectPath);
    return service.screenshotDesktop(validPath);
  });

  ipcMain.handle(IPC.DESKTOP_SET_TOOLS_ENABLED, async (_event, projectPath: unknown, enabled: unknown) => {
    const validPath = validateProjectPath(projectPath);
    const validEnabled = requireBoolean(enabled, 'enabled');
    const settings = loadProjectSettings(validPath);
    settings.desktopToolsEnabled = validEnabled;
    saveProjectSettings(validPath, settings);

    // Update live sessions for this project
    if (sessionManager) {
      sessionManager.updateDesktopToolsForProject(validPath, validEnabled);
    }
  });

  ipcMain.handle(IPC.DESKTOP_GET_TOOLS_ENABLED, async (_event, projectPath: unknown) => {
    const validPath = validateProjectPath(projectPath);
    const settings = loadProjectSettings(validPath);
    return settings.desktopToolsEnabled ?? null;
  });
}
