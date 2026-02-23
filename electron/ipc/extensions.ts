import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { ExtensionManager } from '../services/extension-manager';
import type { InstalledExtension, InstalledSkill, ImportResult } from '../../shared/types';

export function registerExtensionsIpc(extensionManager: ExtensionManager) {
  // Extensions
  ipcMain.handle(IPC.EXTENSIONS_LIST, (): InstalledExtension[] => {
    return extensionManager.listExtensions();
  });

  ipcMain.handle(
    IPC.EXTENSIONS_IMPORT_ZIP,
    async (_, zipPath: string, scope: 'global' | 'project'): Promise<ImportResult> => {
      return extensionManager.importExtensionZip(zipPath, scope);
    }
  );

  ipcMain.handle(IPC.EXTENSIONS_TOGGLE, async (_, extensionId: string): Promise<boolean> => {
    return extensionManager.toggleExtension(extensionId);
  });

  ipcMain.handle(IPC.EXTENSIONS_REMOVE, async (_, extensionId: string): Promise<boolean> => {
    return extensionManager.removeExtension(extensionId);
  });

  // Skills
  ipcMain.handle(IPC.SKILLS_LIST, (): InstalledSkill[] => {
    return extensionManager.listSkills();
  });

  ipcMain.handle(
    IPC.SKILLS_IMPORT_ZIP,
    async (_, zipPath: string, scope: 'global' | 'project'): Promise<ImportResult> => {
      return extensionManager.importSkillZip(zipPath, scope);
    }
  );

  ipcMain.handle(IPC.SKILLS_TOGGLE, async (_, skillId: string): Promise<boolean> => {
    return extensionManager.toggleSkill(skillId);
  });

  ipcMain.handle(IPC.SKILLS_REMOVE, async (_, skillId: string): Promise<boolean> => {
    return extensionManager.removeSkill(skillId);
  });
}
