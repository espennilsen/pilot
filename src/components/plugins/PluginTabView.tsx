import { usePluginStore } from '../../stores/plugin-store';

/**
 * Plugin tab view - renders plugin-provided tab content.
 * Phase 2 stub - Phase 3 will implement full webview-based rendering.
 */
export default function PluginTabView({ tab }: { tab: any }) {
  // Plugin tabs render as iframes for sandboxing
  // The plugin provides the HTML content for the iframe
  // Phase 3 will implement the full webview-based rendering
  
  return (
    <div className="flex-1 flex items-center justify-center text-text-secondary">
      <div className="text-center">
        <p className="text-lg mb-2">Plugin Tab</p>
        <p className="text-sm">Type: {tab.type}</p>
        <p className="text-sm">Plugin: {tab.pluginId}</p>
      </div>
    </div>
  );
}
