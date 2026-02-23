import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

export interface MemoryCount {
  global: number;
  project: number;
  total: number;
}

interface MemoryState {
  // Memory file contents
  globalMemory: string | null;
  projectSharedMemory: string | null;

  // Memory count for status bar
  memoryCount: MemoryCount | null;

  // Auto-extraction notification
  lastUpdate: { count: number; preview: string } | null;
  lastUpdateTime: number;

  // Settings
  memoryEnabled: boolean;
  autoExtractEnabled: boolean;

  // Actions
  loadMemories: (projectPath: string) => Promise<void>;
  loadMemoryCount: (projectPath: string) => Promise<void>;
  saveMemory: (scope: string, projectPath: string, content: string) => Promise<void>;
  clearMemory: (scope: string, projectPath: string) => Promise<void>;
  setLastUpdate: (update: { count: number; preview: string }) => void;
  clearLastUpdate: () => void;
  setMemoryEnabled: (enabled: boolean) => void;
  setAutoExtractEnabled: (enabled: boolean) => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  globalMemory: null,
  projectSharedMemory: null,
  memoryCount: null,
  lastUpdate: null,
  lastUpdateTime: 0,
  memoryEnabled: true,
  autoExtractEnabled: true,

  loadMemories: async (projectPath: string) => {
    try {
      const files = await invoke(IPC.MEMORY_GET_FILES, projectPath) as {
        global: string | null;
        projectShared: string | null;
      };
      set({
        globalMemory: files.global,
        projectSharedMemory: files.projectShared,
      });
    } catch {
      // Silently fail
    }
  },

  loadMemoryCount: async (projectPath: string) => {
    try {
      const count = await invoke(IPC.MEMORY_GET_COUNT, projectPath) as MemoryCount;
      set({ memoryCount: count });
    } catch {
      // Silently fail
    }
  },

  saveMemory: async (scope: string, projectPath: string, content: string) => {
    try {
      await invoke(IPC.MEMORY_SAVE_FILE, scope, projectPath, content);
    } catch {
      // Silently fail
    }
  },

  clearMemory: async (scope: string, projectPath: string) => {
    try {
      await invoke(IPC.MEMORY_CLEAR, scope, projectPath);
    } catch {
      // Silently fail
    }
  },

  setLastUpdate: (update) => {
    set({ lastUpdate: update, lastUpdateTime: Date.now() });
    // Auto-clear after 3 seconds
    setTimeout(() => {
      set((state) => {
        if (state.lastUpdateTime && Date.now() - state.lastUpdateTime >= 2900) {
          return { lastUpdate: null };
        }
        return state;
      });
    }, 3000);
  },

  clearLastUpdate: () => set({ lastUpdate: null }),

  setMemoryEnabled: (enabled) => {
    set({ memoryEnabled: enabled });
    invoke(IPC.MEMORY_SET_ENABLED, enabled).catch(() => {});
  },
  setAutoExtractEnabled: (enabled) => set({ autoExtractEnabled: enabled }),
}));
