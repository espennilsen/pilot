import { useCallback, useEffect, useRef, useState } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { Icon } from '../shared/Icon';

export function WebView() {
  const activeTab = useTabStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const url = activeTab?.type === 'web' ? activeTab.filePath : null;
  const isExternal = url ? /^https?:\/\//.test(url) : false;

  // Reset status when URL or refresh key changes
  useEffect(() => {
    if (!url) return;
    setStatus('loading');

    // For external URLs, start a timeout — if load doesn't fire, the site likely blocked embedding
    if (isExternal) {
      timerRef.current = setTimeout(() => {
        setStatus(prev => prev === 'loading' ? 'error' : prev);
      }, 5000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [url, refreshKey, isExternal]);

  const handleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('loaded');
  }, []);

  if (!activeTab || activeTab.type !== 'web' || !url) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No URL loaded
      </div>
    );
  }

  const handleRefresh = () => {
    setStatus('loading');
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Navigation toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-surface">
        <div className="flex-1 min-w-0 px-2 py-1 text-xs font-mono text-text-secondary bg-bg-base rounded border border-border truncate">
          {url}
        </div>
        {status === 'loading' && (
          <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        )}
        <button
          onClick={handleRefresh}
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
      {/* Error state */}
      {status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-text-secondary">
          <Icon name="ShieldAlert" size={32} className="text-text-secondary/50" />
          <div className="text-center space-y-1">
            <div className="text-sm font-medium text-text-primary">This site can&apos;t be displayed in a web tab</div>
            <div className="text-xs">The site may block embedding via X-Frame-Options or CSP headers.</div>
          </div>
          <button
            onClick={() => window.api.openExternal(url)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors"
          >
            <Icon name="ExternalLink" size={14} />
            Open in Browser
          </button>
        </div>
      )}
      {/* iframe — always mounted so load event fires, hidden when error */}
      <iframe
        ref={iframeRef}
        key={refreshKey}
        src={url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className={`flex-1 w-full border-none bg-white ${status === 'error' ? 'hidden' : ''}`}
        title={activeTab.title}
        onLoad={handleLoad}
      />
    </div>
  );
}
