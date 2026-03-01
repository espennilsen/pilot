/**
 * @file IPC handlers for Docker desktop management.
 */
import { ipcMain } from 'electron';
import { resolve } from 'path';
import { IPC } from '../../shared/ipc';
import { loadProjectSettings, saveProjectSettings } from '../services/project-settings';
import type { DesktopService } from '../services/desktop-service';
import type { PilotSessionManager } from '../services/pi-session-manager';
import type { DesktopCheckResult } from '../../shared/types';

/** Validate that a value is a non-empty string. Throws with a descriptive message. */
function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

/** Validate that a value is a boolean. Throws with a descriptive message. */
function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

/**
 * Validate a project path: must be a non-empty string that resolves to an absolute path.
 * Returns the resolved absolute path.
 */
function validateProjectPath(value: unknown): string {
  const raw = requireString(value, 'projectPath');
  const resolved = resolve(raw);
  return resolved;
}

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
    return service.startDesktop(validPath);
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

  ipcMain.handle(IPC.DESKTOP_EXEC, async (_event, projectPath: unknown, command: unknown) => {
    if (!service) throw new Error('Docker desktop service is not available');
    const validPath = validateProjectPath(projectPath);
    const validCommand = requireString(command, 'command');
    return service.execInDesktop(validPath, validCommand);
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
