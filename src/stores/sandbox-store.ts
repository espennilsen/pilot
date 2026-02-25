/**
 * @file Sandbox store — manages staged diffs, yolo mode, jail settings, and auto-accept per tool.
 */
import { create } from 'zustand';
import type { StagedDiff, ProjectSandboxSettings } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

interface SandboxStore {
  // Per-tab staged diffs
  diffsByTab: Record<string, StagedDiff[]>;
  // Project settings (loaded per-project via IPC)
  yoloMode: boolean;
  jailEnabled: boolean;
  allowedPaths: string[];
  // Diff view mode
  diffViewMode: 'unified' | 'side-by-side';
  // Per-tab, per-tool auto-accept (session-only, not persisted)
  // e.g. { "tab-1": { "write": true, "edit": true } }
  autoAcceptTools: Record<string, Record<string, boolean>>;

  // Actions
  addDiff: (tabId: string, diff: StagedDiff) => void;
  autoAcceptIfEnabled: (tabId: string, diff: StagedDiff) => void;
  updateDiffStatus: (tabId: string, diffId: string, status: StagedDiff['status']) => void;
  getPendingDiffs: (tabId: string) => StagedDiff[];
  clearDiffs: (tabId: string) => void;
  setDiffViewMode: (mode: 'unified' | 'side-by-side') => void;
  setAutoAcceptTool: (tabId: string, toolName: string, enabled: boolean) => void;
  isAutoAcceptTool: (tabId: string, toolName: string) => boolean;
  getAutoAcceptedTools: (tabId: string) => string[];

  // IPC actions — load/save per-project settings
  loadSettings: (projectPath: string) => Promise<void>;
  updateSettings: (projectPath: string, tabId: string, overrides: Record<string, unknown>) => Promise<void>;
  acceptDiff: (tabId: string, diffId: string) => Promise<void>;
  rejectDiff: (tabId: string, diffId: string) => Promise<void>;
  acceptAll: (tabId: string) => Promise<void>;
  toggleYolo: (tabId: string, projectPath: string) => Promise<void>;
}

/**
 * Sandbox store — manages staged diffs, yolo mode, jail settings, and auto-accept per tool.
 * Diffs are staged by the main process and accepted/rejected via IPC.
 */
export const useSandboxStore = create<SandboxStore>((set, get) => ({
  diffsByTab: {},
  yoloMode: false,
  jailEnabled: true,
  allowedPaths: [],
  diffViewMode: 'unified',
  autoAcceptTools: {},

  /**
   * Add a staged diff to the store.
   * Pure state mutation — does not trigger side effects.
   */
  addDiff: (tabId: string, diff: StagedDiff) => {
    set((state) => ({
      diffsByTab: {
        ...state.diffsByTab,
        [tabId]: [...(state.diffsByTab[tabId] || []), diff],
      },
    }));

    // Trigger auto-accept side effect if enabled for this tool
    get().autoAcceptIfEnabled(tabId, diff);
  },

  /**
   * Auto-accept a diff if auto-accept is enabled for its tool type.
   * Side effect — calls IPC to accept the diff.
   * Separated from addDiff for testability.
   */
  autoAcceptIfEnabled: (tabId: string, diff: StagedDiff) => {
    // Determine which tool produced this diff
    const toolName = diff.operation === 'bash' ? 'bash'
      : diff.operation === 'create' ? 'write'
      : diff.operation === 'edit' ? 'edit'
      : 'write';

    const autoAccepted = get().autoAcceptTools[tabId]?.[toolName] ?? false;

    // If auto-accept is on for this tool, immediately accept.
    // Jail enforcement for bash happens in the main process (findEscapingPaths)
    // before the diff is even staged, so auto-accept is safe here.
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

  loadSettings: async (projectPath: string) => {
    try {
      const settings = await invoke(IPC.SANDBOX_GET_SETTINGS, projectPath) as ProjectSandboxSettings;
      set({
        jailEnabled: settings.jail.enabled,
        yoloMode: settings.yoloMode,
        allowedPaths: settings.jail.allowedPaths,
      });
    } catch {
      // Default to safe values if settings can't be loaded
      set({ jailEnabled: true, yoloMode: false, allowedPaths: [] });
    }
  },

  updateSettings: async (projectPath: string, tabId: string, overrides: Record<string, unknown>) => {
    try {
      const updated = await invoke(IPC.SANDBOX_UPDATE_SETTINGS, projectPath, tabId, overrides) as ProjectSandboxSettings;
      set({
        jailEnabled: updated.jail.enabled,
        yoloMode: updated.yoloMode,
        allowedPaths: updated.jail.allowedPaths,
      });
    } catch (error) {
      console.error('Failed to update sandbox settings:', error);
    }
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

  /** Accept all pending diffs for a tab (applies them to disk via IPC). */
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

  /** Toggle yolo mode for a tab (auto-accept all diffs without review). */
  toggleYolo: async (tabId: string, projectPath: string) => {
    try {
      const result = await invoke(IPC.SANDBOX_TOGGLE_YOLO, tabId, projectPath) as { yoloMode: boolean };
      set({ yoloMode: result.yoloMode });
    } catch (error) {
      console.error('Failed to toggle yolo mode:', error);
    }
  },
}));
