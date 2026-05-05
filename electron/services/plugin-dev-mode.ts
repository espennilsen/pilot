import { watch, type FSWatcher } from 'chokidar';
import { pluginBridge } from './plugin-bridge';
import type { InstalledPlugin } from '../../shared/types';

/**
 * PluginDevMode — watches a plugin directory for changes and triggers
 * hot-reload by deactivating and reactivating the plugin in the Extension Host.
 */

export class PluginDevMode {
  private watchers = new Map<string, FSWatcher>();
  private reloadTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private pluginPaths = new Map<string, string>();
  private pluginManifests = new Map<string, InstalledPlugin>();

  /**
   * Start watching a plugin directory.
   * On file changes, deactivate then reactivate after a 300ms debounce.
   */
  startWatching(pluginId: string, pluginPath: string, manifest: InstalledPlugin): void {
    if (this.watchers.has(pluginId)) {
      this.stopWatching(pluginId);
    }

    this.pluginPaths.set(pluginId, pluginPath);
    if (manifest) {
      this.pluginManifests.set(pluginId, manifest);
    }

    const watcher = watch(pluginPath, {
      ignored: ['**/node_modules/**', '**/.git/**'],
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on('change', (filePath) => {
      console.log(`[PluginDevMode] Change detected in ${pluginId}: ${filePath}`);
      this.scheduleReload(pluginId);
    });

    watcher.on('add', (filePath) => {
      console.log(`[PluginDevMode] File added in ${pluginId}: ${filePath}`);
      this.scheduleReload(pluginId);
    });

    watcher.on('unlink', (filePath) => {
      console.log(`[PluginDevMode] File removed in ${pluginId}: ${filePath}`);
      this.scheduleReload(pluginId);
    });

    this.watchers.set(pluginId, watcher);
    console.log(`[PluginDevMode] Watching ${pluginId} at ${pluginPath}`);
  }

  stopWatching(pluginId: string): void {
    const watcher = this.watchers.get(pluginId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(pluginId);
    }

    const timeout = this.reloadTimeouts.get(pluginId);
    if (timeout) {
      clearTimeout(timeout);
      this.reloadTimeouts.delete(pluginId);
    }

    this.pluginPaths.delete(pluginId);
    this.pluginManifests.delete(pluginId);
  }

  stopAll(): void {
    for (const pluginId of this.watchers.keys()) {
      this.stopWatching(pluginId);
    }
  }

  private scheduleReload(pluginId: string): void {
    const existing = this.reloadTimeouts.get(pluginId);
    if (existing) clearTimeout(existing);

    this.reloadTimeouts.set(pluginId, setTimeout(async () => {
      this.reloadTimeouts.delete(pluginId);
      console.log(`[PluginDevMode] Hot-reloading plugin ${pluginId}...`);

      try {
        // Unregister (deactivate) the plugin
        await pluginBridge.unregisterPlugin(pluginId);

        // Small delay to ensure cleanup completes
        await new Promise(r => setTimeout(r, 200));

        // Re-register the plugin using stored manifest
        const manifest = this.pluginManifests.get(pluginId);
        if (manifest) {
          await pluginBridge.registerPlugin(manifest);
          console.log(`[PluginDevMode] Plugin ${pluginId} hot-reloaded successfully`);
        } else {
          console.error(`[PluginDevMode] No manifest found for ${pluginId}, cannot reload`);
        }
      } catch (err) {
        console.error(`[PluginDevMode] Failed to reload ${pluginId}:`, err);
      }
    }, 300));
  }
}

export const pluginDevMode = new PluginDevMode();
