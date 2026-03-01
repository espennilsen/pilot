/**
 * @file IPC handlers for Docker sandbox management.
 */
import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { loadProjectSettings, saveProjectSettings } from '../services/project-settings';
import type { SandboxDockerService } from '../services/sandbox-docker-service';

export function registerSandboxDockerIpc(service: SandboxDockerService) {
  ipcMain.handle(IPC.DOCKER_SANDBOX_START, async (_event, projectPath: string) => {
    return service.startSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_STOP, async (_event, projectPath: string) => {
    await service.stopSandbox(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_STATUS, async (_event, projectPath: string) => {
    return service.getSandboxStatus(projectPath);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_EXEC, async (_event, projectPath: string, command: string) => {
    return service.execInSandbox(projectPath, command);
  });

  ipcMain.handle(IPC.DOCKER_SANDBOX_SCREENSHOT, async (_event, projectPath: string) => {
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
