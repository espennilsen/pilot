/**
 * @file Desktop store — per-project container state and tools toggle.
 */
import { create } from 'zustand';
import type { DesktopState, DesktopCheckResult } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

interface DesktopStore {
  /** Per-project desktop state, keyed by projectPath */
  stateByProject: Record<string, DesktopState>;
  /** Per-project tools toggle state */
  toolsEnabledByProject: Record<string, boolean>;
  /** Whether Desktop is available on the host (null = not yet checked) */
  isDesktopAvailable: boolean | null;
  /** Human-readable message when Desktop is not available */
  desktopUnavailableMessage: string | null;
  /** Loading states per project */
  loadingByProject: Record<string, boolean>;
  /** Error message (transient) */
  error: string | null;

  // Actions
  checkDesktopAvailable: () => Promise<boolean>;
  startDesktop: (projectPath: string) => Promise<void>;
  stopDesktop: (projectPath: string) => Promise<void>;
  rebuildDesktop: (projectPath: string) => Promise<void>;
  loadStatus: (projectPath: string) => Promise<void>;
  setToolsEnabled: (projectPath: string, enabled: boolean) => Promise<void>;
  loadToolsEnabled: (projectPath: string) => Promise<void>;

  /** Handle push events from main process */
  handleEvent: (payload: { projectPath: string } & Partial<DesktopState>) => void;

  // Selectors (plain functions, not reactive)
  getDesktopState: (projectPath: string) => DesktopState | null;
  isToolsEnabled: (projectPath: string) => boolean;
  isProjectLoading: (projectPath: string) => boolean;

  reset: () => void;
}

export const useDesktopStore = create<DesktopStore>((set, get) => ({
  stateByProject: {},
  toolsEnabledByProject: {},
  isDesktopAvailable: null,
  desktopUnavailableMessage: null,
  loadingByProject: {},
  error: null,

  checkDesktopAvailable: async () => {
    try {
      const result = await invoke(IPC.DESKTOP_CHECK) as DesktopCheckResult;
      set({
        isDesktopAvailable: result.available,
        desktopUnavailableMessage: result.message ?? null,
      });
      return result.available;
    } catch {
      set({ isDesktopAvailable: false, desktopUnavailableMessage: null });
      return false;
    }
  },

  startDesktop: async (projectPath: string) => {
    set(state => ({
      loadingByProject: { ...state.loadingByProject, [projectPath]: true },
      error: null,
    }));
    try {
      const result = await invoke(IPC.DESKTOP_START, projectPath) as DesktopState;
      set(state => ({
        stateByProject: { ...state.stateByProject, [projectPath]: result },
        loadingByProject: { ...state.loadingByProject, [projectPath]: false },
      }));
    } catch (err) {
      set(state => ({
        error: String(err),
        loadingByProject: { ...state.loadingByProject, [projectPath]: false },
      }));
    }
  },

  stopDesktop: async (projectPath: string) => {
    set(state => ({
      loadingByProject: { ...state.loadingByProject, [projectPath]: true },
      error: null,
    }));
    try {
      await invoke(IPC.DESKTOP_STOP, projectPath);
      // State update comes via DESKTOP_EVENT push (handleEvent sets status to 'stopped')
      set(state => ({
        loadingByProject: { ...state.loadingByProject, [projectPath]: false },
      }));
    } catch (err) {
      set(state => ({
        error: String(err),
        loadingByProject: { ...state.loadingByProject, [projectPath]: false },
      }));
    }
  },

  rebuildDesktop: async (projectPath: string) => {
    set(state => ({
      loadingByProject: { ...state.loadingByProject, [projectPath]: true },
      error: null,
    }));
    try {
      const result = await invoke(IPC.DESKTOP_REBUILD, projectPath) as DesktopState;
      set(state => ({
        stateByProject: { ...state.stateByProject, [projectPath]: result },
        loadingByProject: { ...state.loadingByProject, [projectPath]: false },
      }));
    } catch (err) {
      set(state => ({
        error: String(err),
        loadingByProject: { ...state.loadingByProject, [projectPath]: false },
      }));
    }
  },

  loadStatus: async (projectPath: string) => {
    try {
      const result = await invoke(IPC.DESKTOP_STATUS, projectPath) as DesktopState | null;
      if (result) {
        set(state => ({
          stateByProject: { ...state.stateByProject, [projectPath]: result },
        }));
      } else {
        // No desktop for this project — ensure we don't have stale state
        set(state => {
          const { [projectPath]: _, ...rest } = state.stateByProject;
          return { stateByProject: rest };
        });
      }
    } catch {
      // Desktop not available or other error — fail silently
    }
  },

  setToolsEnabled: async (projectPath: string, enabled: boolean) => {
    try {
      await invoke(IPC.DESKTOP_SET_TOOLS_ENABLED, projectPath, enabled);
      set(state => ({
        toolsEnabledByProject: { ...state.toolsEnabledByProject, [projectPath]: enabled },
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadToolsEnabled: async (projectPath: string) => {
    try {
      const enabled = await invoke(IPC.DESKTOP_GET_TOOLS_ENABLED, projectPath) as boolean | null;
      if (enabled === null) {
        // No project-level override — remove any stale entry so global setting is used
        set(state => {
          const { [projectPath]: _, ...rest } = state.toolsEnabledByProject;
          return { toolsEnabledByProject: rest };
        });
      } else {
        set(state => ({
          toolsEnabledByProject: { ...state.toolsEnabledByProject, [projectPath]: enabled },
        }));
      }
    } catch {
      // fail silently
    }
  },

  handleEvent: (payload) => {
    const { projectPath, ...stateUpdate } = payload;
    if (!projectPath) return;

    if (stateUpdate.status === 'stopped') {
      set(state => {
        const { [projectPath]: _, ...rest } = state.stateByProject;
        return { stateByProject: rest };
      });
    } else {
      set(state => {
        const existing = state.stateByProject[projectPath];
        return {
          stateByProject: {
            ...state.stateByProject,
            [projectPath]: { ...existing, ...stateUpdate } as DesktopState,
          },
        };
      });
    }
  },

  // Selectors
  getDesktopState: (projectPath: string) => get().stateByProject[projectPath] ?? null,
  isToolsEnabled: (projectPath: string) => get().toolsEnabledByProject[projectPath] ?? false,
  isProjectLoading: (projectPath: string) => get().loadingByProject[projectPath] ?? false,

  reset: () => {
    set({
      stateByProject: {},
      toolsEnabledByProject: {},
      isDesktopAvailable: null,
      desktopUnavailableMessage: null,
      loadingByProject: {},
      error: null,
    });
  },
}));
