import { useState } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { Icon } from '../shared/Icon';

export function WebView() {
  const activeTab = useTabStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [refreshKey, setRefreshKey] = useState(0);

  if (!activeTab || activeTab.type !== 'web' || !activeTab.filePath) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No URL loaded
      </div>
    );
  }

  const url = activeTab.filePath;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Navigation toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-surface">
        {/* URL display */}
        <div className="flex-1 min-w-0 px-2 py-1 text-xs font-mono text-text-secondary bg-bg-base rounded border border-border truncate">
          {url}
        </div>
        {/* Refresh */}
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="p-1 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          title="Refresh"
        >
          <Icon name="RefreshCw" size={14} />
        </button>
        {/* Open in browser */}
        <button
          onClick={() => window.api.openExternal(url)}
          className="p-1 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          title="Open in browser"
        >
          <Icon name="ExternalLink" size={14} />
        </button>
      </div>
      {/* iframe */}
      <iframe
        key={refreshKey}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="flex-1 w-full border-none bg-white"
        title={activeTab.title}
      />
    </div>
  );
}
