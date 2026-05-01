import { create } from 'zustand';
import { invoke, on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type {
  InstalledPlugin,
  PluginInstallResult,
  PluginTreeView,
  PluginStatusBarItem,
  PluginCommand,
  PluginEventPayload,
} from '../../shared/types';

interface PluginStore {
  // State
  installedPlugins: InstalledPlugin[];
  activeViews: PluginTreeView[];
  activeStatusBarItems: PluginStatusBarItem[];
  activeCommands: PluginCommand[];
  activePluginIds: string[];
  installing: boolean;
  installError: string | null;

  // Actions
  loadPlugins: () => Promise<void>;
  installPlugin: (source: string) => Promise<PluginInstallResult>;
  removePlugin: (pluginId: string) => Promise<boolean>;
  togglePlugin: (pluginId: string) => Promise<boolean>;
  refreshContributions: () => Promise<void>;
  getViewChildren: (viewId: string, elementId: string | null) => Promise<unknown[]>;
  executeCommand: (commandId: string, args?: unknown[]) => Promise<unknown>;
  startListening: () => () => void; // returns unsubscribe
}

export const usePluginStore = create<PluginStore>((set, get) => ({
  installedPlugins: [],
  activeViews: [],
  activeStatusBarItems: [],
  activeCommands: [],
  activePluginIds: [],
  installing: false,
  installError: null,

  loadPlugins: async () => {
    const plugins = await invoke(IPC.PLUGIN_LIST) as InstalledPlugin[];
    set({ installedPlugins: plugins });
    await get().refreshContributions();
  },

  installPlugin: async (source: string) => {
    set({ installing: true, installError: null });
    try {
      const result = await invoke(IPC.PLUGIN_INSTALL, source) as PluginInstallResult;
      if (result.success) {
        await get().loadPlugins();
      } else {
        set({ installError: result.error || 'Install failed' });
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      set({ installError: msg });
      return { success: false, error: msg };
    } finally {
      set({ installing: false });
    }
  },

  removePlugin: async (pluginId: string) => {
    const result = await invoke(IPC.PLUGIN_REMOVE, pluginId) as boolean;
    if (result) {
      set(state => ({
        installedPlugins: state.installedPlugins.filter(p => p.id !== pluginId),
        activePluginIds: state.activePluginIds.filter(id => id !== pluginId),
      }));
    }
    return result;
  },

  togglePlugin: async (pluginId: string) => {
    const result = await invoke(IPC.PLUGIN_TOGGLE, pluginId) as boolean;
    if (result) {
      set(state => ({
        installedPlugins: state.installedPlugins.map(p =>
          p.id === pluginId ? { ...p, enabled: !p.enabled } : p
        ),
      }));
      await get().refreshContributions();
    }
    return result;
  },

  refreshContributions: async () => {
    const contributions = await invoke(IPC.PLUGIN_GET_CONTRIBUTIONS) as {
      views: PluginTreeView[];
      statusBarItems: PluginStatusBarItem[];
      commands: PluginCommand[];
      plugins: InstalledPlugin[];
    };

    set({
      activeViews: contributions.views,
      activeStatusBarItems: contributions.statusBarItems,
      activeCommands: contributions.commands,
      activePluginIds: contributions.plugins.map(p => p.id),
    });
  },

  getViewChildren: async (viewId: string, elementId: string | null) => {
    return await invoke(IPC.PLUGIN_VIEW_GET_CHILDREN, viewId, elementId) as unknown[];
  },

  executeCommand: async (commandId: string, args?: unknown[]) => {
    return invoke(IPC.PLUGIN_COMMAND_EXECUTE, commandId, args || []);
  },

  startListening: () => {
    const unsub1 = on(IPC.PLUGIN_EVENT, (payload: unknown) => {
      const payload_ = payload as PluginEventPayload;
      if (payload_.type === 'plugin-activated') {
        set(state => ({
          activePluginIds: [...new Set([...state.activePluginIds, payload_.pluginId])],
        }));
      } else if (payload_.type === 'plugin-deactivated') {
        set(state => ({
          activePluginIds: state.activePluginIds.filter(id => id !== payload_.pluginId),
        }));
      }
      // Refresh contributions on any plugin event
      get().refreshContributions();
    });

    const unsub2 = on(IPC.PLUGIN_CONTRIBUTION_UPDATED, () => {
      get().refreshContributions();
    });

    return () => {
      unsub1();
      unsub2();
    };
  },
}));
