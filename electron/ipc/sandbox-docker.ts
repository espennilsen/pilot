/**
 * @file IPC handlers for Docker sandbox management.
 */
import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { loadProjectSettings, saveProjectSettings } from '../services/project-settings';
import type { SandboxDockerService } from '../services/sandbox-docker-service';
import type { PilotSessionManager } from '../services/pi-session-manager';
import type { DockerSandboxCheckResult } from '../../shared/types';

export function registerSandboxDockerIpc(service: SandboxDockerService | null, sessionManager?: PilotSessionManager) {
  ipcMain.handle(IPC.DOCKER_SANDBOX_CHECK, async (): Promise<DockerSandboxCheckResult> => {
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

  ipcMain.handle(IPC.DOCKER_SANDBOX_START, async (_event, projectPath: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    return service.startSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_STOP, async (_event, projectPath: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    await service.stopSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_STATUS, async (_event, projectPath: string) => {
    if (!service) return null;
    return service.getSandboxStatus(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_EXEC, async (_event, projectPath: string, command: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    return service.execInSandbox(projectPath, command);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_SCREENSHOT, async (_event, projectPath: string) => {
    if (!service) throw new Error('Docker sandbox service is not available');
    return service.screenshotSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_SET_TOOLS_ENABLED, async (_event, projectPath: string, enabled: boolean) => {
    const settings = loadProjectSettings(projectPath);
    settings.dockerToolsEnabled = enabled;
    saveProjectSettings(projectPath, settings);

    // Update live sessions for this project
    if (sessionManager) {
      sessionManager.updateDockerToolsForProject(projectPath, enabled);
    }
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_GET_TOOLS_ENABLED, async (_event, projectPath: string) => {
    const settings = loadProjectSettings(projectPath);
    return settings.dockerToolsEnabled ?? null;
  });
}
