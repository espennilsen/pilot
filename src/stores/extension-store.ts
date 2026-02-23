import { create } from 'zustand';
import type { InstalledExtension, InstalledSkill, ImportResult } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

interface ExtensionStore {
  extensions: InstalledExtension[];
  skills: InstalledSkill[];

  loadExtensions: () => Promise<void>;
  loadSkills: () => Promise<void>;
  toggleExtension: (extensionId: string) => Promise<boolean>;
  removeExtension: (extensionId: string) => Promise<boolean>;
  removeSkill: (skillId: string) => Promise<boolean>;
  importExtensionZip: (zipPath: string, scope: 'global' | 'project') => Promise<ImportResult>;
  importSkillZip: (zipPath: string, scope: 'global' | 'project') => Promise<ImportResult>;
}

export const useExtensionStore = create<ExtensionStore>((set, get) => ({
  extensions: [],
  skills: [],

  loadExtensions: async () => {
    const extensions = await invoke(IPC.EXTENSIONS_LIST);
    set({ extensions });
  },

  loadSkills: async () => {
    const skills = await invoke(IPC.SKILLS_LIST);
    set({ skills });
  },

  toggleExtension: async (extensionId: string) => {
    const success = await invoke(IPC.EXTENSIONS_TOGGLE, extensionId);
    if (success) {
      await get().loadExtensions();
    }
    return success;
  },

  removeExtension: async (extensionId: string) => {
    const success = await invoke(IPC.EXTENSIONS_REMOVE, extensionId);
    if (success) {
      await get().loadExtensions();
    }
    return success;
  },

  removeSkill: async (skillId: string) => {
    const success = await invoke(IPC.SKILLS_REMOVE, skillId);
    if (success) {
      await get().loadSkills();
    }
    return success;
  },

  importExtensionZip: async (zipPath: string, scope: 'global' | 'project') => {
    const result = await invoke(IPC.EXTENSIONS_IMPORT_ZIP, zipPath, scope);
    if (result.success) {
      await get().loadExtensions();
    }
    return result;
  },

  importSkillZip: async (zipPath: string, scope: 'global' | 'project') => {
    const result = await invoke(IPC.SKILLS_IMPORT_ZIP, zipPath, scope);
    if (result.success) {
      await get().loadSkills();
    }
    return result;
  },
}));
