import { create } from 'zustand';
import type { StagedDiff, ProjectSandboxSettings } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

interface SandboxStore {
  // Per-tab staged diffs
  diffsByTab: Record<string, StagedDiff[]>;
  // Global settings
  yoloMode: boolean;
  jailEnabled: boolean;
  // Diff view mode
  diffViewMode: 'unified' | 'side-by-side';
  // Per-tab, per-tool auto-accept (session-only, not persisted)
  // e.g. { "tab-1": { "write": true, "edit": true } }
  autoAcceptTools: Record<string, Record<string, boolean>>;

  // Actions
  addDiff: (tabId: string, diff: StagedDiff) => void;
  updateDiffStatus: (tabId: string, diffId: string, status: StagedDiff['status']) => void;
  getPendingDiffs: (tabId: string) => StagedDiff[];
  clearDiffs: (tabId: string) => void;
  setYoloMode: (enabled: boolean) => void;
  setJailEnabled: (enabled: boolean) => void;
  setDiffViewMode: (mode: 'unified' | 'side-by-side') => void;
  setAutoAcceptTool: (tabId: string, toolName: string, enabled: boolean) => void;
  isAutoAcceptTool: (tabId: string, toolName: string) => boolean;
  getAutoAcceptedTools: (tabId: string) => string[];

  // IPC actions (call main process)
  acceptDiff: (tabId: string, diffId: string) => Promise<void>;
  rejectDiff: (tabId: string, diffId: string) => Promise<void>;
  acceptAll: (tabId: string) => Promise<void>;
  toggleYolo: (tabId: string) => Promise<void>;
}

export const useSandboxStore = create<SandboxStore>((set, get) => ({
  diffsByTab: {},
  yoloMode: false,
  jailEnabled: true,
  diffViewMode: 'unified',
  autoAcceptTools: {},

  addDiff: (tabId: string, diff: StagedDiff) => {
    // Determine which tool produced this diff
    const toolName = diff.operation === 'bash' ? 'bash'
      : diff.operation === 'create' ? 'write'
      : diff.operation === 'edit' ? 'edit'
      : 'write';

    const autoAccepted = get().autoAcceptTools[tabId]?.[toolName] ?? false;

    // Always add the diff to the store first
    set((state) => ({
      diffsByTab: {
        ...state.diffsByTab,
        [tabId]: [...(state.diffsByTab[tabId] || []), diff],
      },
    }));

    // If auto-accept is on for this tool, immediately accept
    if (autoAccepted && diff.status === 'pending') {
      get().acceptDiff(tabId, diff.id);
    }
  },

  updateDiffStatus: (tabId: string, diffId: string, status: StagedDiff['status']) => {
    set((state) => ({
      diffsByTab: {
        ...state.diffsByTab,
        [tabId]: (state.diffsByTab[tabId] || []).map((diff) =>
          diff.id === diffId ? { ...diff, status } : diff
        ),
      },
    }));
  },

  getPendingDiffs: (tabId: string) => {
    const diffs = get().diffsByTab[tabId] || [];
    return diffs.filter((d) => d.status === 'pending');
  },

  clearDiffs: (tabId: string) => {
    set((state) => {
      const newDiffsByTab = { ...state.diffsByTab };
      delete newDiffsByTab[tabId];
      return { diffsByTab: newDiffsByTab };
    });
  },

  setYoloMode: (enabled: boolean) => {
    set({ yoloMode: enabled });
  },

  setJailEnabled: (enabled: boolean) => {
    set({ jailEnabled: enabled });
  },

  setDiffViewMode: (mode: 'unified' | 'side-by-side') => {
    set({ diffViewMode: mode });
  },

  setAutoAcceptTool: (tabId: string, toolName: string, enabled: boolean) => {
    set((state) => {
      const tabTools = { ...(state.autoAcceptTools[tabId] || {}) };
      if (enabled) {
        tabTools[toolName] = true;
      } else {
        delete tabTools[toolName];
      }
      return {
        autoAcceptTools: { ...state.autoAcceptTools, [tabId]: tabTools },
      };
    });
  },

  isAutoAcceptTool: (tabId: string, toolName: string) => {
    return get().autoAcceptTools[tabId]?.[toolName] ?? false;
  },

  getAutoAcceptedTools: (tabId: string) => {
    const tabTools = get().autoAcceptTools[tabId] || {};
    return Object.keys(tabTools).filter(k => tabTools[k]);
  },

  acceptDiff: async (tabId: string, diffId: string) => {
    try {
      await invoke(IPC.SANDBOX_ACCEPT_DIFF, tabId, diffId);
      get().updateDiffStatus(tabId, diffId, 'accepted');
    } catch (error) {
      console.error('Failed to accept diff:', error);
    }
  },

  rejectDiff: async (tabId: string, diffId: string) => {
    try {
      await invoke(IPC.SANDBOX_REJECT_DIFF, tabId, diffId);
      get().updateDiffStatus(tabId, diffId, 'rejected');
    } catch (error) {
      console.error('Failed to reject diff:', error);
    }
  },

  acceptAll: async (tabId: string) => {
    try {
      await invoke(IPC.SANDBOX_ACCEPT_ALL, tabId);
      const diffs = get().diffsByTab[tabId] || [];
      set((state) => ({
        diffsByTab: {
          ...state.diffsByTab,
          [tabId]: diffs.map((d) => (d.status === 'pending' ? { ...d, status: 'accepted' as const } : d)),
        },
      }));
    } catch (error) {
      console.error('Failed to accept all diffs:', error);
    }
  },

  toggleYolo: async (tabId: string) => {
    try {
      const result = await invoke(IPC.SANDBOX_TOGGLE_YOLO, tabId);
      set({ yoloMode: result.yoloMode });
    } catch (error) {
      console.error('Failed to toggle yolo mode:', error);
    }
  },
}));
