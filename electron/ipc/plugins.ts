import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { PluginBridge } from '../services/plugin-bridge';
import type { PluginInstaller } from '../services/plugin-installer';
import type { InstalledPlugin, PluginInstallResult } from '../../shared/types';

export function registerPluginsIpc(
  pluginBridge: PluginBridge,
  pluginInstaller: PluginInstaller
) {
  // List installed plugins
  ipcMain.handle(IPC.PLUGIN_LIST, (): InstalledPlugin[] => {
    const plugins = pluginInstaller.listPlugins();
    pluginBridge.setInstalledPlugins(plugins);
    return plugins;
  });

  // Install a plugin
  ipcMain.handle(
    IPC.PLUGIN_INSTALL,
    async (_event, source: string): Promise<PluginInstallResult> => {
      const result = await pluginInstaller.install(source);

      // If install succeeded, register the plugin with PluginBridge
      if (result.success && result.id) {
        const plugins = pluginInstaller.listPlugins();
        const installed = plugins.find(p => p.id === result.id);
        if (installed) {
          pluginBridge.registerPlugin(installed);
        }
      }

      return result;
    }
  );

  // Remove a plugin
  ipcMain.handle(IPC.PLUGIN_REMOVE, async (_event, pluginId: string): Promise<boolean> => {
    // Unregister from PluginBridge first
    pluginBridge.unregisterPlugin(pluginId);

    return pluginInstaller.remove(pluginId);
  });

  // Toggle a plugin
  ipcMain.handle(IPC.PLUGIN_TOGGLE, async (_event, pluginId: string): Promise<boolean> => {
    const result = pluginInstaller.toggle(pluginId);
    if (result) {
      const plugins = pluginInstaller.listPlugins();
      const plugin = plugins.find(p => p.id === pluginId);
      if (plugin) {
        if (plugin.enabled) {
          pluginBridge.registerPlugin(plugin);
        } else {
          pluginBridge.unregisterPlugin(pluginId);
        }
      }
    }
    return result;
  });

  // Get contributions
  ipcMain.handle(IPC.PLUGIN_GET_CONTRIBUTIONS, (_event) => {
    return {
      views: pluginBridge.getRegisteredViews(),
      statusBarItems: pluginBridge.getRegisteredStatusBarItems(),
      commands: pluginBridge.getRegisteredCommands(),
      plugins: pluginBridge.getRegisteredPlugins(),
    };
  });

  // Get tree children for a plugin view
  ipcMain.handle(
    IPC.PLUGIN_VIEW_GET_CHILDREN,
    async (_event, viewId: string, elementId: string | null) => {
      return pluginBridge.getViewChildren(viewId, elementId);
    }
  );

  // Execute a plugin command
  ipcMain.handle(
    IPC.PLUGIN_COMMAND_EXECUTE,
    async (_event, commandId: string, args: unknown[]) => {
      return pluginBridge.executeCommand(commandId, args);
    }
  );
}
