/**
 * @file Docker sandbox store — per-project container state and tools toggle.
 */
import { create } from 'zustand';
import type { DockerSandboxState, DockerSandboxCheckResult } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

interface SandboxDockerStore {
  /** Per-project sandbox state, keyed by projectPath */
  stateByProject: Record<string, DockerSandboxState>;
  /** Per-project tools toggle state */
  toolsEnabledByProject: Record<string, boolean>;
  /** Whether Docker is available on the host (null = not yet checked) */
  isDockerAvailable: boolean | null;
  /** Human-readable message when Docker is not available */
  dockerUnavailableMessage: string | null;
  /** Loading states per project */
  loadingByProject: Record<string, boolean>;
  /** Error message (transient) */
  error: string | null;

  // Actions
  checkDockerAvailable: () => Promise<boolean>;
  startSandbox: (projectPath: string) => Promise<void>;
  stopSandbox: (projectPath: string) => Promise<void>;
  loadStatus: (projectPath: string) => Promise<void>;
  setToolsEnabled: (projectPath: string, enabled: boolean) => Promise<void>;
  loadToolsEnabled: (projectPath: string) => Promise<void>;

  /** Handle push events from main process */
  handleEvent: (payload: { projectPath: string } & Partial<DockerSandboxState>) => void;

  // Selectors (plain functions, not reactive)
  getSandboxState: (projectPath: string) => DockerSandboxState | null;
  isToolsEnabled: (projectPath: string) => boolean;
  isProjectLoading: (projectPath: string) => boolean;

  reset: () => void;
}

export const useSandboxDockerStore = create<SandboxDockerStore>((set, get) => ({
  stateByProject: {},
  toolsEnabledByProject: {},
  isDockerAvailable: null,
  dockerUnavailableMessage: null,
  loadingByProject: {},
  error: null,

  checkDockerAvailable: async () => {
    try {
      const result = await invoke(IPC.DOCKER_SANDBOX_CHECK) as DockerSandboxCheckResult;
      set({
        isDockerAvailable: result.available,
        dockerUnavailableMessage: result.message ?? null,
      });
      return result.available;
    } catch {
      set({ isDockerAvailable: false, dockerUnavailableMessage: null });
      return false;
    }
  },

  startSandbox: async (projectPath: string) => {
    set(state => ({
      loadingByProject: { ...state.loadingByProject, [projectPath]: true },
      error: null,
    }));
    try {
      const result = await invoke(IPC.DOCKER_SANDBOX_START, projectPath) as DockerSandboxState;
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

  stopSandbox: async (projectPath: string) => {
    set(state => ({
      loadingByProject: { ...state.loadingByProject, [projectPath]: true },
      error: null,
    }));
    try {
      await invoke(IPC.DOCKER_SANDBOX_STOP, projectPath);
      set(state => {
        const { [projectPath]: _, ...rest } = state.stateByProject;
        return {
          stateByProject: rest,
          loadingByProject: { ...state.loadingByProject, [projectPath]: false },
        };
      });
    } catch (err) {
      set(state => ({
        error: String(err),
        loadingByProject: { ...state.loadingByProject, [projectPath]: false },
      }));
    }
  },

  loadStatus: async (projectPath: string) => {
    try {
      const result = await invoke(IPC.DOCKER_SANDBOX_STATUS, projectPath) as DockerSandboxState | null;
      if (result) {
        set(state => ({
          stateByProject: { ...state.stateByProject, [projectPath]: result },
        }));
      } else {
        // No sandbox for this project — ensure we don't have stale state
        set(state => {
          const { [projectPath]: _, ...rest } = state.stateByProject;
          return { stateByProject: rest };
        });
      }
    } catch {
      // Docker not available or other error — fail silently
    }
  },

  setToolsEnabled: async (projectPath: string, enabled: boolean) => {
    try {
      await invoke(IPC.DOCKER_SANDBOX_SET_TOOLS_ENABLED, projectPath, enabled);
      set(state => ({
        toolsEnabledByProject: { ...state.toolsEnabledByProject, [projectPath]: enabled },
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadToolsEnabled: async (projectPath: string) => {
    try {
      const enabled = await invoke(IPC.DOCKER_SANDBOX_GET_TOOLS_ENABLED, projectPath) as boolean | null;
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
            [projectPath]: { ...existing, ...stateUpdate } as DockerSandboxState,
          },
        };
      });
    }
  },

  // Selectors
  getSandboxState: (projectPath: string) => get().stateByProject[projectPath] ?? null,
  isToolsEnabled: (projectPath: string) => get().toolsEnabledByProject[projectPath] ?? false,
  isProjectLoading: (projectPath: string) => get().loadingByProject[projectPath] ?? false,

  reset: () => {
    set({
      stateByProject: {},
      toolsEnabledByProject: {},
      isDockerAvailable: null,
      dockerUnavailableMessage: null,
      loadingByProject: {},
      error: null,
    });
  },
}));
