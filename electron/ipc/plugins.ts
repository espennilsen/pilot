import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { PluginBridge } from '../services/plugin-bridge';
import type { PluginInstaller } from '../services/plugin-installer';
import type { InstalledPlugin, PluginInstallResult } from '../../shared/types';
import { scaffoldPlugin } from '../services/plugin-scaffolder';
import { pluginDevMode } from '../services/plugin-dev-mode';

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
          try {
            await pluginBridge.registerPlugin(installed);
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : 'Failed to activate plugin',
            };
          }
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
        try {
          if (plugin.enabled) {
            await pluginBridge.registerPlugin(plugin);
          } else {
            await pluginBridge.unregisterPlugin(pluginId);
          }
        } catch (err) {
          console.error('[PLUGIN_TOGGLE] Failed:', err);
          return false;
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

  // Approve/deny agent capability request
  ipcMain.handle(
    IPC.PLUGIN_APPROVE_AGENT_CAPABILITY,
    async (_event, approvalId: string, approved: boolean) => {
      const pending = pluginBridge.getPendingApproval(approvalId);
      if (!pending) {
        return { ok: false, error: 'Invalid approval ID' };
      }
      pluginBridge.resolveApproval(approvalId, approved);
      return { ok: true };
    }
  );

  // Scaffold a new plugin
  ipcMain.handle(
    IPC.PLUGIN_INIT,
    async (_event, name: string, targetDir: string, description?: string) => {
      return scaffoldPlugin(name, targetDir, description);
    }
  );

  // Start plugin dev mode (hot-reload)
  ipcMain.handle(
    IPC.PLUGIN_DEV_START,
    async (_event, pluginId: string, pluginPath: string) => {
      pluginDevMode.startWatching(pluginId, pluginPath);
    }
  );

  // Stop plugin dev mode
  ipcMain.handle(
    IPC.PLUGIN_DEV_STOP,
    async (_event, pluginId: string) => {
      pluginDevMode.stopWatching(pluginId);
    }
  );
}
