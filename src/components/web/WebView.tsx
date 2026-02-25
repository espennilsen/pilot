import { useEffect, useState } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { on } from '../../lib/ipc-client';
import { IPC } from '../../../shared/ipc';
import { Icon } from '../shared/Icon';

export function WebView() {
  const activeTab = useTabStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);

  const url = activeTab?.type === 'web' ? activeTab.filePath : null;

  // Reset error when URL or refresh changes
  useEffect(() => {
    setErrorUrl(null);
  }, [url, refreshKey]);

  // Listen for iframe load failures from the main process
  useEffect(() => {
    return on(IPC.WEB_TAB_LOAD_FAILED, (payload: { url: string }) => {
      setErrorUrl(payload.url);
    });
  }, []);

  if (!activeTab || activeTab.type !== 'web' || !url) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No URL loaded
      </div>
    );
  }

  const showError = errorUrl && url.startsWith(errorUrl.replace(/\/$/, ''));

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Navigation toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-surface">
        <div className="flex-1 min-w-0 px-2 py-1 text-xs font-mono text-text-secondary bg-bg-base rounded border border-border truncate">
          {url}
        </div>
        <button
          onClick={() => { setErrorUrl(null); setRefreshKey(k => k + 1); }}
          className="p-1 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          title="Refresh"
        >
          <Icon name="RefreshCw" size={14} />
        </button>
        <button
          onClick={() => window.api.openExternal(url)}
          className="p-1 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          title="Open in browser"
        >
          <Icon name="ExternalLink" size={14} />
        </button>
      </div>
      {/* Content */}
      {showError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-text-secondary">
          <Icon name="ShieldAlert" size={32} className="text-text-secondary/50" />
          <div className="text-center space-y-1">
            <div className="text-sm font-medium text-text-primary">This site can&apos;t be displayed in a web tab</div>
            <div className="text-xs">The site blocks embedding via X-Frame-Options or CSP headers.</div>
          </div>
          <button
            onClick={() => window.api.openExternal(url)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
          >
            <Icon name="ExternalLink" size={14} />
            Open in Browser
          </button>
        </div>
      ) : (
        <iframe
          key={refreshKey}
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          className="flex-1 w-full border-none bg-white"
          title={activeTab.title}
        />
      )}
    </div>
  );
}
