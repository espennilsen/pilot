import { useEffect, useState, useRef, useCallback } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { on, invoke } from '../../lib/ipc-client';
import { IPC } from '../../../shared/ipc';
import { Icon } from '../shared/Icon';
import FindBar from '../shared/FindBar';

export function WebView() {
  const activeTab = useTabStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [refreshKey, setRefreshKey] = useState(0);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);

  // In-page find state
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findCurrentIndex, setFindCurrentIndex] = useState(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Listen for found-in-page results from main process
  useEffect(() => {
    return on(IPC.WEBVIEW_FOUND_IN_PAGE, (result: { activeMatchOrdinal: number; matches: number }) => {
      setFindMatchCount(result.matches);
      if (result.activeMatchOrdinal > 0) {
        setFindCurrentIndex(result.activeMatchOrdinal - 1);
      }
    });
  }, []);

  // Debounced search via main-process findInPage
  const handleQueryChange = useCallback((query: string) => {
    setFindQuery(query);
    setFindMatchCount(-1);
    setFindCurrentIndex(0);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!query) {
      invoke(IPC.WEBVIEW_STOP_FIND_IN_PAGE, 'clearSelection').catch(() => {});
      setFindMatchCount(0);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      invoke(IPC.WEBVIEW_FIND_IN_PAGE, query, {
        forward: true,
        findNext: false,
        matchCase: findCaseSensitive,
      }).catch(() => {});
    }, 150);
  }, [findCaseSensitive]);

  const handlePrev = useCallback(() => {
    if (!findQuery) return;
    invoke(IPC.WEBVIEW_FIND_IN_PAGE, findQuery, {
      forward: false,
      findNext: true,
      matchCase: findCaseSensitive,
    }).catch(() => {});
  }, [findQuery, findCaseSensitive]);

  const handleNext = useCallback(() => {
    if (!findQuery) return;
    invoke(IPC.WEBVIEW_FIND_IN_PAGE, findQuery, {
      forward: true,
      findNext: true,
      matchCase: findCaseSensitive,
    }).catch(() => {});
  }, [findQuery, findCaseSensitive]);

  const handleClose = useCallback(() => {
    setFindVisible(false);
    setFindQuery('');
    setFindMatchCount(0);
    setFindCurrentIndex(0);
    invoke(IPC.WEBVIEW_STOP_FIND_IN_PAGE, 'clearSelection').catch(() => {});
  }, []);

  // Close find and stop search when URL changes
  useEffect(() => {
    if (findVisible) {
      handleClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      invoke(IPC.WEBVIEW_STOP_FIND_IN_PAGE, 'clearSelection').catch(() => {});
    };
  }, []);

  if (!activeTab || activeTab.type !== 'web' || !url) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        No URL loaded
      </div>
    );
  }

  // Extract local file path from pilot-html:// URLs
  const localFilePath = url?.startsWith('pilot-html://localhost')
    ? decodeURIComponent(new URL(url).pathname)
    : null;

  const showError = errorUrl && url.startsWith(errorUrl.replace(/\/$/, ''));

  const openInEditor = () => {
    if (!localFilePath) return;
    useTabStore.getState().addFileTab(localFilePath, activeTab.projectPath);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
      {/* Navigation toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-bg-surface">
        <div className="flex-1 min-w-0 px-2 py-1 text-xs font-mono text-text-secondary bg-bg-base rounded border border-border truncate">
          {localFilePath || url}
        </div>
        {localFilePath && (
          <button
            onClick={openInEditor}
            className="p-1 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
            title="Edit source"
          >
            <Icon name="Pencil" size={14} />
          </button>
        )}
        <button
          onClick={() => setFindVisible(v => !v)}
          className={`p-1 rounded hover:bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors ${findVisible ? 'text-accent bg-accent/10' : ''}`}
          title="Find in page"
        >
          <Icon name="Search" size={14} />
        </button>
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

      {/* Find bar overlay */}
      <FindBar
        query={findQuery}
        onQueryChange={handleQueryChange}
        caseSensitive={findCaseSensitive}
        onCaseSensitiveChange={setFindCaseSensitive}
        matchCount={findMatchCount}
        currentIndex={findCurrentIndex}
        onPrev={handlePrev}
        onNext={handleNext}
        onClose={handleClose}
        visible={findVisible}
      />

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
