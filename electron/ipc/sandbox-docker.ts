/**
 * @file IPC handlers for Docker sandbox management.
 */
import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { loadProjectSettings, saveProjectSettings } from '../services/project-settings';
import type { SandboxDockerService } from '../services/sandbox-docker-service';

export function registerSandboxDockerIpc(service: SandboxDockerService | null) {
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
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_GET_TOOLS_ENABLED, async (_event, projectPath: string) => {
    const settings = loadProjectSettings(projectPath);
    return settings.dockerToolsEnabled ?? null;
  });
}
