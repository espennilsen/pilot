/**
 * @file Extension store — manages extensions and skills (list, toggle, remove, import).
 */
import { create } from 'zustand';
import type { InstalledExtension, InstalledSkill, ImportResult } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invokeAndReload } from '../lib/invoke-and-reload';

interface ExtensionStore {
  extensions: InstalledExtension[];
  skills: InstalledSkill[];

  loadExtensions: () => Promise<void>;
  loadSkills: () => Promise<void>;
  toggleExtension: (extensionId: string) => Promise<boolean>;
  removeExtension: (extensionId: string) => Promise<boolean>;
  toggleSkill: (skillId: string) => Promise<boolean>;
  removeSkill: (skillId: string) => Promise<boolean>;
  importExtensionZip: (zipPath: string, scope: 'global' | 'project') => Promise<ImportResult>;
  importSkillZip: (zipPath: string, scope: 'global' | 'project') => Promise<ImportResult>;
}

/**
 * Extension store — manages extensions and skills (list, toggle, remove, import).
 */
export const useExtensionStore = create<ExtensionStore>((set, get) => ({
  extensions: [],
  skills: [],

  loadExtensions: async () => {
    const extensions = await invokeAndReload<InstalledExtension[]>(
      IPC.EXTENSIONS_LIST,
      [],
      async () => {}
    );
    if (extensions) set({ extensions });
  },

  loadSkills: async () => {
    const skills = await invokeAndReload<InstalledSkill[]>(
      IPC.SKILLS_LIST,
      [],
      async () => {}
    );
    if (skills) set({ skills });
  },

  toggleExtension: async (extensionId: string) => {
    const success = await invokeAndReload<boolean>(
      IPC.EXTENSIONS_TOGGLE,
      [extensionId],
      get().loadExtensions
    );
    return success ?? false;
  },

  removeExtension: async (extensionId: string) => {
    const success = await invokeAndReload<boolean>(
      IPC.EXTENSIONS_REMOVE,
      [extensionId],
      get().loadExtensions
    );
    return success ?? false;
  },

  toggleSkill: async (skillId: string) => {
    const success = await invokeAndReload<boolean>(
      IPC.SKILLS_TOGGLE,
      [skillId],
      get().loadSkills
    );
    return success ?? false;
  },

  removeSkill: async (skillId: string) => {
    const success = await invokeAndReload<boolean>(
      IPC.SKILLS_REMOVE,
      [skillId],
      get().loadSkills
    );
    return success ?? false;
  },

  importExtensionZip: async (zipPath: string, scope: 'global' | 'project') => {
    const result = await invokeAndReload<ImportResult>(
      IPC.EXTENSIONS_IMPORT_ZIP,
      [zipPath, scope],
      get().loadExtensions
    );
    return result ?? { success: false, error: 'Import failed' };
  },

  importSkillZip: async (zipPath: string, scope: 'global' | 'project') => {
    const result = await invokeAndReload<ImportResult>(
      IPC.SKILLS_IMPORT_ZIP,
      [zipPath, scope],
      get().loadSkills
    );
    return result ?? { success: false, error: 'Import failed' };
  },
}));
