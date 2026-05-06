import { useState } from 'react';
import { usePluginStore } from '../../stores/plugin-store';

export default function PluginSettingsView({ pluginId }: { pluginId: string }) {
  const installedPlugins = usePluginStore(s => s.installedPlugins);
  const plugin = installedPlugins.find(p => p.id === pluginId);

  if (!plugin) {
    return <div className="text-text-secondary p-4">Plugin not found</div>;
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold text-text-primary mb-4">{plugin.name}</h3>
      <p className="text-text-secondary mb-2">Version: {plugin.version}</p>
      <p className="text-text-secondary mb-4">{plugin.description}</p>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <span className="text-text-primary">Enabled</span>
          <button
            role="switch"
            aria-checked={plugin.enabled}
            onClick={() => usePluginStore.getState().togglePlugin(plugin.id)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
              plugin.enabled ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                plugin.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="border-t border-border mt-4 pt-4">
        <button
          onClick={() => usePluginStore.getState().removePlugin(plugin.id)}
          className="px-3 py-1.5 bg-error/15 text-error rounded-md hover:bg-error/25 transition-colors text-sm"
        >
          Remove Plugin
        </button>
      </div>
    </div>
  );
}
