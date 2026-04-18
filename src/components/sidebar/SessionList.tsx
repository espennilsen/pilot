import { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useSessionStore } from '../../stores/session-store';
import { useTabStore, type TabState } from '../../stores/tab-store';
import { useProjectStore } from '../../stores/project-store';
import { useChatStore } from '../../stores/chat-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { SessionItem } from './SessionItem';
import { Icon } from '../shared/Icon';
import { openTabSession, useWiredSessionsStore } from '../../hooks/useWorkspacePersistence';
import { IPC } from '../../../shared/ipc';
import type { SessionExportOptions } from '../../../shared/types';
import { relativeTime, truncate } from '../../lib/utils';

type ChatStatus = 'idle' | 'empty' | 'streaming' | 'pending' | 'error';

const STATUS_COLORS: Record<ChatStatus, string> = {
  idle: 'bg-success',
  empty: 'bg-text-secondary/40',
  streaming: 'bg-warning',
  pending: 'bg-warning',
  error: 'bg-error',
};

const STATUS_LABELS: Record<ChatStatus, string> = {
  idle: 'Ready',
  empty: 'Empty',
  streaming: 'Working…',
  pending: 'Pending review',
  error: 'Error',
};

function useChatStatus(tabId: string): ChatStatus {
  // Primitive selectors returning stable values for shallow comparison
  const isStreaming = useChatStore(s => !!s.streamingByTab[tabId]);
  const messageCount = useChatStore(s => s.messagesByTab[tabId]?.length ?? 0);
  const hasError = useChatStore(s => {
    const msgs = s.messagesByTab[tabId];
    if (!msgs || msgs.length === 0) return false;
    const last = msgs[msgs.length - 1];
    if (last.isError) return true;
    if (last.role === 'assistant' && last.toolCalls?.some(tc => tc.status === 'error')) return true;
    return false;
  });
  const pendingCount = useSandboxStore(s => s.getPendingDiffs(tabId).length);

  if (isStreaming) return 'streaming';
  if (hasError) return 'error';
  if (pendingCount > 0) return 'pending';
  if (messageCount === 0) return 'empty';
  return 'idle';
}

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
  const { addWiredSession } = useWiredSessionsStore();

  const { activeTabId, tabs, switchTab, closeTab, updateTab } = useTabStore();
  const projectPath = useProjectStore(s => s.projectPath);

  // Load sessions for the active project only
  useEffect(() => {
    if (projectPath) {
      loadSessions([projectPath]);
    } else {
      loadSessions([]);
    }
  }, [loadSessions, projectPath]);

  // Active chat tabs for the current project
  const activeChats = useMemo(() =>
    tabs
      .filter(t => t.type === 'chat' && t.projectPath === projectPath)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt),
    [tabs, projectPath]
  );


  const sessionsRef = useSessionStore(s => s.sessions);

  // Historical sessions, excluding sessions that are currently open as active chats
  const filteredSessions = useMemo(() => {
    const activeSessionPaths = new Set(
      activeChats.map(t => t.sessionPath).filter(Boolean) as string[]
    );
    return getFilteredSessions().filter(s => !activeSessionPaths.has(s.path));
  }, [activeChats, getFilteredSessions, searchQuery, showArchived, sessionsRef]);

  // Apply search to active chats too
  const displayChats = useMemo(() => {
    if (!searchQuery.trim()) return activeChats;
    const q = searchQuery.toLowerCase();
    return activeChats.filter(t =>
      t.title.toLowerCase().includes(q) || t.projectPath?.toLowerCase().includes(q)
    );
  }, [activeChats, searchQuery]);

  const [exportError, setExportError] = useState<string | null>(null);
  const exportErrorTimer = useRef<NodeJS.Timeout | null>(null);

  const showExportError = useCallback((msg: string) => {
    setExportError(msg);
    if (exportErrorTimer.current) clearTimeout(exportErrorTimer.current);
    exportErrorTimer.current = setTimeout(() => setExportError(null), 4000);
  }, []);

  useEffect(() => {
    return () => { if (exportErrorTimer.current) clearTimeout(exportErrorTimer.current); };
  }, []);

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
    if (!newTabId) return;
    updateTab(newTabId, { title: session.title, sessionPath: session.path });

    try {
      await openTabSession(newTabId, { sessionPath: session.path, projectPath: session.projectPath });
      addWiredSession(`${newTabId}::${session.projectPath}`);
    } catch (err) {
      console.error('Failed to open session:', err);
    }
  }, [tabs, switchTab, addWiredSession]);

  const handleExportSession = useCallback(async (
    session: { path: string; title: string; projectPath: string },
    format: 'markdown' | 'json'
  ) => {
    const options: SessionExportOptions = {
      format,
      includeThinking: true,
      includeToolCalls: false,
      includeTimestamps: true,
    };
    const meta = { title: session.title, projectPath: session.projectPath };
    try {
      await window.api.invoke(IPC.SESSION_EXPORT_BY_PATH, session.path, options, meta);
    } catch (err) {
      showExportError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [showExportError]);

  const handleCopySession = useCallback(async (
    session: { path: string; title: string; projectPath: string }
  ) => {
    const options: SessionExportOptions = {
      format: 'markdown',
      includeThinking: false,
      includeToolCalls: false,
      includeTimestamps: true,
    };
    const meta = { title: session.title, projectPath: session.projectPath };
    try {
      await window.api.invoke(IPC.SESSION_EXPORT_CLIPBOARD_BY_PATH, session.path, options, meta);
    } catch (err) {
      showExportError(err instanceof Error ? err.message : 'Copy to clipboard failed');
    }
  }, [showExportError]);

  const hasContent = displayChats.length > 0 || filteredSessions.length > 0;
  const isEmpty = !isLoading && displayChats.length === 0 && filteredSessions.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Export error banner */}
      {exportError && (
        <div className="mx-2 mt-2 px-2.5 py-1.5 bg-error/10 border border-error/30 rounded text-xs text-error flex items-center justify-between">
          <span className="truncate">{exportError}</span>
          <button onClick={() => setExportError(null)} className="ml-1 text-error hover:text-error/80 flex-shrink-0">✕</button>
        </div>
      )}

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

      {/* Chat & session list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && activeChats.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-text-secondary">Loading sessions...</div>
          </div>
        ) : isEmpty ? (
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
          <>
            {/* Active chats */}
            {displayChats.length > 0 && (
              <div className="mb-2">
                <SectionHeader label="Active" count={displayChats.length} />
                <div className="space-y-0.5">
                  {displayChats.map(tab => (
                    <ActiveChatItem
                      key={tab.id}
                      tab={tab}
                      isActive={tab.id === activeTabId}
                      onSelect={() => switchTab(tab.id)}
                      onClose={() => closeTab(tab.id)}
                      onRename={(title) => updateTab(tab.id, { title })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Separator */}
            {displayChats.length > 0 && filteredSessions.length > 0 && (
              <div className="border-t border-border my-2" />
            )}

            {/* Historical sessions */}
            {filteredSessions.length > 0 && (
              <div>
                {displayChats.length > 0 && (
                  <SectionHeader label="Sessions" />
                )}
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
                      onExportMarkdown={() => handleExportSession(session, 'markdown')}
                      onExportJson={() => handleExportSession(session, 'json')}
                      onCopyClipboard={() => handleCopySession(session)}
                      onDelete={() => {
                        if (confirm(`Delete session "${session.title}"? This cannot be undone.`)) {
                          deleteSession(session.path);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider px-1 mb-1">
      {label}
      {count !== undefined && count > 1 && (
        <span className="ml-1 text-text-secondary/60">{count}</span>
      )}
    </div>
  );
}

interface ActiveChatItemProps {
  tab: TabState;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (title: string) => void;
}

function ActiveChatItem({ tab, isActive, onSelect, onClose, onRename }: ActiveChatItemProps) {
  const status = useChatStatus(tab.id);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tab.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(tab.title);
    setIsEditing(true);
  };

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors
        ${isActive ? 'bg-accent/10 border-l-2 border-accent' : 'hover:bg-bg-elevated'}
      `}
      onClick={isEditing ? undefined : onSelect}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[status]} ${
          status === 'streaming' ? 'animate-pulse' : ''
        }`}
        title={STATUS_LABELS[status]}
      />

      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setIsEditing(false);
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 text-sm bg-bg-base border border-accent rounded px-1 py-0 text-text-primary outline-none"
        />
      ) : (
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary truncate">
            {truncate(tab.title, 30)}
          </div>
        </div>
      )}

      <div className="flex items-center gap-0.5 flex-shrink-0">
        {tab.hasUnread && !isActive && (
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
        )}
        {(isHovered || isActive) && (
          <button
            className="p-1 rounded-sm text-text-secondary hover:text-text-primary transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Close chat"
          >
            <Icon name="X" className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}