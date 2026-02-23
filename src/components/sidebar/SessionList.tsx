import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../../stores/session-store';
import { useTabStore } from '../../stores/tab-store';
import { useProjectStore } from '../../stores/project-store';
import { SessionItem } from './SessionItem';
import { Icon } from '../shared/Icon';
import { openTabSession, getWiredSessions } from '../../hooks/useWorkspacePersistence';

export function SessionList() {
  const {
    searchQuery,
    isLoading,
    showArchived,
    loadSessions,
    setSearchQuery,
    setShowArchived,
    getFilteredSessions,
    pinSession,
    unpinSession,
    archiveSession,
    unarchiveSession,
    deleteSession,
  } = useSessionStore();

  const { activeTabId, tabs, switchTab } = useTabStore();
  const projectPath = useProjectStore(s => s.projectPath);

  // Load sessions for the active project only
  useEffect(() => {
    if (projectPath) {
      loadSessions([projectPath]);
    } else {
      loadSessions([]);
    }
  }, [loadSessions, projectPath]);

  const filteredSessions = getFilteredSessions();

  // Get current active tab's session path
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeSessionPath = activeTab?.sessionPath || null;

  /** Click a session: switch to its tab if open, otherwise open in a new tab */
  const handleSelectSession = useCallback(async (session: { path: string; projectPath: string; title: string }) => {
    // 1. Check if any existing tab already has this session open
    const existingTab = tabs.find(t => t.sessionPath === session.path);
    if (existingTab) {
      switchTab(existingTab.id);
      return;
    }

    // 2. Open session in a new tab — use the same path as workspace restore
    const { addTab, updateTab } = useTabStore.getState();
    const newTabId = addTab(session.projectPath);
    updateTab(newTabId, { title: session.title, sessionPath: session.path });

    try {
      await openTabSession(newTabId, { sessionPath: session.path, projectPath: session.projectPath });
      getWiredSessions().add(`${newTabId}::${session.projectPath}`);
    } catch (err) {
      console.error('Failed to open session:', err);
    }
  }, [tabs, switchTab]);

  return (
    <div className="flex flex-col h-full">
      {/* Search input + archive toggle */}
      <div className="px-3 py-2 border-b border-border space-y-2">
        <div className="relative">
          <Icon
            name="Search"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary"
          />
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-elevated border-none rounded-md pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            showArchived ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Icon name="Archive" className="w-3 h-3" />
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-text-secondary">Loading sessions...</div>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Icon name="MessageSquare" className="w-12 h-12 text-text-secondary/30 mb-3" />
            <p className="text-sm text-text-secondary">
              {searchQuery ? 'No matching sessions' : 'No sessions yet'}
            </p>
            {!searchQuery && (
              <p className="text-xs text-text-secondary/70 mt-1">
                Start a conversation!
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredSessions.map((session) => (
              <SessionItem
                key={session.path}
                session={session}
                isActive={session.path === activeSessionPath}
                onSelect={() => handleSelectSession({
                  path: session.path,
                  projectPath: session.projectPath,
                  title: session.title,
                })}
                onPin={() => pinSession(session.path)}
                onUnpin={() => unpinSession(session.path)}
                onArchive={() => session.isArchived
                  ? unarchiveSession(session.path)
                  : archiveSession(session.path)
                }
                onDelete={() => {
                  if (confirm(`Delete session "${session.title}"? This cannot be undone.`)) {
                    deleteSession(session.path);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
