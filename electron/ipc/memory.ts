import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { MemoryManager } from '../services/memory-manager';

export function registerMemoryIpc(memoryManager: MemoryManager) {
  ipcMain.handle(IPC.MEMORY_GET, async (_event, projectPath: string) => {
    return memoryManager.getMemoryContext(projectPath);
  });

  ipcMain.handle(IPC.MEMORY_GET_FILES, async (_event, projectPath: string) => {
    return memoryManager.getMemoryFiles(projectPath);
  });

  ipcMain.handle(IPC.MEMORY_SAVE_FILE, async (_event, scope: string, projectPath: string, content: string) => {
    await memoryManager.saveMemoryFile(
      scope as 'global' | 'project',
      projectPath,
      content
    );
  });

  ipcMain.handle(IPC.MEMORY_CLEAR, async (_event, scope: string, projectPath: string) => {
    await memoryManager.clearMemoryFile(
      scope as 'global' | 'project',
      projectPath
    );
  });

  ipcMain.handle(IPC.MEMORY_GET_COUNT, async (_event, projectPath: string) => {
    return memoryManager.getMemoryCount(projectPath);
  });

  ipcMain.handle(IPC.MEMORY_HANDLE_COMMAND, async (_event, message: string, projectPath: string) => {
    return memoryManager.handleManualMemory(message, projectPath);
  });

  ipcMain.handle(IPC.MEMORY_GET_PATHS, async (_event, projectPath: string) => {
    return memoryManager.getMemoryPaths(projectPath);
  });

  ipcMain.handle(IPC.MEMORY_SET_ENABLED, async (_event, enabled: boolean) => {
    memoryManager.setEnabled(enabled);
  });
}
