import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { DevCommandsService } from '../services/dev-commands';
import type { DevCommand } from '../../shared/types';

export function registerDevCommandsIpc(devService: DevCommandsService) {
  ipcMain.handle(IPC.DEV_LOAD_CONFIG, async (_event, projectPath: string) => {
    devService.setProject(projectPath);
    return devService.loadConfig();
  });

  ipcMain.handle(IPC.DEV_SAVE_CONFIG, async (_event, projectPath: string, commands: DevCommand[]) => {
    devService.setProject(projectPath);
    devService.saveConfig(commands);
  });

  ipcMain.handle(IPC.DEV_RUN_COMMAND, async (_event, commandId: string) => {
    return devService.runCommand(commandId);
  });

  ipcMain.handle(IPC.DEV_STOP_COMMAND, async (_event, commandId: string) => {
    devService.stopCommand(commandId);
  });
}
