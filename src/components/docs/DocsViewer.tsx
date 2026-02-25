import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { useTabStore } from '../../stores/tab-store';
import { IPC } from '../../../shared/ipc';
import { MarkdownContent } from './docs-markdown';

// Page title map for breadcrumbs
const PAGE_TITLES: Record<string, string> = {
  index: 'Documentation',
  'getting-started': 'Getting Started',
  sessions: 'Sessions',
  memory: 'Memory',
  tasks: 'Tasks',
  agent: 'Agent',
  steering: 'Steering & Follow-up',
  'keyboard-shortcuts': 'Keyboard Shortcuts',
  settings: 'Settings',
  sidebar: 'Sidebar',
  'context-panel': 'Context Panel',
};

export function DocsViewer() {
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const { addDocsTab } = useTabStore();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const currentPage = activeTab?.filePath || 'index';

  // Load page content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.api
      .invoke(IPC.DOCS_READ, currentPage)
      .then((result) => {
        if (!cancelled) {
          setContent(result as string | null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  const navigateTo = useCallback(
    (page: string) => {
      setHistory((prev) => [...prev, currentPage]);
      addDocsTab(page);
    },
    [currentPage, addDocsTab]
  );

  const goBack = useCallback(() => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      addDocsTab(prev);
    }
  }, [history, addDocsTab]);

  // Handle clicks on internal links
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('data-doc-link');
      if (href) {
        e.preventDefault();
        navigateTo(href);
        return;
      }

      // External links
      const externalHref = anchor.getAttribute('href');
      if (externalHref && (externalHref.startsWith('http') || externalHref.startsWith('mailto:'))) {
        e.preventDefault();
        window.api.openExternal(externalHref);
      }
    },
    [navigateTo]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-text-secondary">Loading…</div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <BookOpen className="w-10 h-10 text-text-secondary opacity-40" />
        <p className="text-sm text-text-secondary">Page not found</p>
        <button
          onClick={() => navigateTo('index')}
          className="px-3 py-1.5 text-sm bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors"
        >
          Go to Documentation Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-base" onClick={handleClick}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-bg-surface">
        {history.length > 0 && (
          <button
            onClick={goBack}
            className="p-1 hover:bg-bg-elevated rounded transition-colors"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-text-secondary" />
          </button>
        )}
        <BookOpen className="w-4 h-4 text-accent" />
        <nav className="flex items-center gap-1 text-sm">
          {currentPage !== 'index' && (
            <>
              <button
                onClick={() => navigateTo('index')}
                className="text-accent hover:underline"
              >
                Docs
              </button>
              <span className="text-text-secondary">/</span>
            </>
          )}
          <span className="text-text-primary font-medium">
            {PAGE_TITLES[currentPage] || currentPage}
          </span>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <MarkdownContent content={content} currentPage={currentPage} />
        </div>
      </div>
    </div>
  );
}
