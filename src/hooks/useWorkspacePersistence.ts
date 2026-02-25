import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useTabStore, getProjectColor, type TabState } from '../stores/tab-store';
import { useUIStore } from '../stores/ui-store';
import { useProjectStore } from '../stores/project-store';
import { useChatStore } from '../stores/chat-store';
import { useSessionStore } from '../stores/session-store';
import { invoke } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type { WorkspaceState, SavedTabState } from '../../shared/types';

/**
 * Tiny store to track which sessions have been fully wired up (session opened,
 * history loaded, stats loaded). Shared between useWorkspacePersistence and App.tsx
 * to prevent redundant session initialization on tab switch.
 */
interface WiredSessionsStore {
  wiredSessions: Set<string>;
  addWiredSession: (key: string) => void;
}

export const useWiredSessionsStore = create<WiredSessionsStore>((set) => ({
  wiredSessions: new Set<string>(),
  addWiredSession: (key: string) =>
    set((state) => {
      const newSet = new Set(state.wiredSessions);
      newSet.add(key);
      return { wiredSessions: newSet };
    }),
}));

function serializeTab(tab: TabState): SavedTabState {
  return {
    id: tab.id,
    type: tab.type,
    filePath: tab.filePath,
    title: tab.title,
    projectPath: tab.projectPath,
    sessionPath: tab.sessionPath,
    isPinned: tab.isPinned,
    order: tab.order,
    inputDraft: tab.inputDraft,
    panelConfig: { ...tab.panelConfig },
  };
}

function collectWorkspaceState(): WorkspaceState {
  const tabStore = useTabStore.getState();
  const uiStore = useUIStore.getState();

  return {
    tabs: tabStore.tabs.map(serializeTab),
    activeTabId: tabStore.activeTabId,
    ui: {
      sidebarVisible: uiStore.sidebarVisible,
      contextPanelVisible: uiStore.contextPanelVisible,
      contextPanelTab: uiStore.contextPanelTab,
      focusMode: uiStore.focusMode,
      sidebarWidth: uiStore.sidebarWidth,
      contextPanelWidth: uiStore.contextPanelWidth,
      terminalVisible: uiStore.terminalVisible,
      terminalHeight: uiStore.terminalHeight,
    },
  };
}

function saveWorkspace() {
  const state = collectWorkspaceState();
  invoke(IPC.TABS_SAVE_STATE, state);
}

/**
 * Opens a session on the main process and loads its history and stats into stores.
 * 
 * This is the single canonical way to wire up a tab's session — used by both
 * workspace restore on app startup and tab switching. If the tab already has a
 * sessionPath, it opens that session file; otherwise it creates a new session
 * for the project.
 * 
 * Loads chat history, session stats (tokens, cost), context usage, and model info
 * into the chat store. Updates the tab with the session path.
 * 
 * @param tabId - ID of the tab to open the session for
 * @param tab - Tab state with sessionPath and projectPath
 */
export async function openTabSession(tabId: string, tab: { sessionPath: string | null; projectPath: string | null }): Promise<void> {
  if (!tab.projectPath) return;

  // Open existing session or create a new one
  const result: any = tab.sessionPath
    ? await invoke(IPC.SESSION_OPEN, tabId, tab.sessionPath, tab.projectPath)
    : await invoke(IPC.SESSION_ENSURE, tabId, tab.projectPath);

  const sessionPath = result?.sessionPath;
  const history = result?.history;

  // Store the session path on the tab
  if (sessionPath) {
    useTabStore.getState().updateTab(tabId, { sessionPath });
  }

  // Load chat history (skip if already populated — e.g. sidebar already loaded it)
  if (Array.isArray(history) && history.length > 0) {
    const currentMessages = useChatStore.getState().messagesByTab[tabId];
    if (!currentMessages || currentMessages.length === 0) {
      const { addMessage } = useChatStore.getState();
      for (const entry of history) {
        addMessage(tabId, {
          id: crypto.randomUUID(),
          role: entry.role,
          content: entry.content,
          timestamp: entry.timestamp,
          thinkingContent: entry.thinkingContent,
        });
      }
    }
  }

  // Fetch model info, tokens, context usage so the UI is fully populated
  const [stats, contextUsage, modelInfo] = await Promise.all([
    invoke(IPC.SESSION_GET_STATS, tabId).catch(() => null) as Promise<any>,
    invoke(IPC.SESSION_GET_CONTEXT_USAGE, tabId).catch(() => null) as Promise<any>,
    invoke(IPC.MODEL_GET_INFO, tabId).catch(() => null) as Promise<any>,
  ]);
  const { setTokens, setContextUsage, setCost, setModelInfo } = useChatStore.getState();
  if (stats?.tokens) {
    setTokens(tabId, stats.tokens);
    if (typeof stats.cost === 'number') setCost(tabId, stats.cost);
  }
  if (contextUsage) setContextUsage(tabId, contextUsage);
  if (modelInfo) setModelInfo(tabId, modelInfo);
}

/**
 * Restores workspace state from disk on app startup and auto-saves changes.
 * 
 * On mount, loads the saved workspace state (tabs, active tab, UI panel visibility,
 * panel widths) from disk and restores it. Opens sessions for all restored chat tabs
 * (active tab first, then others in parallel) and loads their chat history.
 * 
 * After restore completes, sets up auto-save with 500ms debounce that triggers
 * whenever tab state or UI state changes. Also saves on window beforeunload.
 * 
 * Maintains a Set of "tabId::projectPath" keys for tabs that have been fully wired
 * up with their sessions. This prevents redundant session initialization when
 * switching tabs.
 * 
 * Should be mounted once at the app root level.
 */
export function useWorkspacePersistence() {
  const startedRef = useRef(false);
  const restoredRef = useRef(false);
  const { addWiredSession } = useWiredSessionsStore();

  // ── Restore on mount (once) ─────────────────────────────
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const saved = await invoke(IPC.TABS_RESTORE_STATE) as WorkspaceState | null;
      if (!saved || !saved.tabs || saved.tabs.length === 0) {
        // No saved workspace — try to create a tab (requires a project).
        // If no project is known yet, the user will see the empty state
        // and can open a project via the project dialog.
        if (useTabStore.getState().tabs.length === 0) {
          useTabStore.getState().addTab();
        }
        restoredRef.current = true;
        return;
      }

      // ── 1. Rebuild tab state ──────────────────────────────
      const { tabs, activeTabId } = saved;
      const restoredTabs: TabState[] = tabs.map((t) => ({
        id: t.id,
        type: t.type ?? 'chat',
        filePath: t.filePath ?? null,
        title: t.title,
        projectPath: t.projectPath,
        sessionPath: t.sessionPath ?? null,
        projectColor: getProjectColor(t.projectPath),
        isPinned: t.isPinned,
        order: t.order,
        scrollPosition: 0,
        inputDraft: t.inputDraft || '',
        panelConfig: t.panelConfig ?? {
          sidebarVisible: true,
          contextPanelVisible: true,
          contextPanelTab: 'files' as const,
        },
        lastActiveAt: Date.now(),
        hasUnread: false,
      }));

      const resolvedActiveId = activeTabId && restoredTabs.some((t) => t.id === activeTabId)
        ? activeTabId
        : restoredTabs[0]?.id ?? null;

      useTabStore.setState({ tabs: restoredTabs, activeTabId: resolvedActiveId });

      // ── 2. Restore UI state ───────────────────────────────
      if (saved.ui) {
        useUIStore.setState({
          sidebarVisible: saved.ui.sidebarVisible ?? true,
          contextPanelVisible: saved.ui.contextPanelVisible ?? true,
          contextPanelTab: saved.ui.contextPanelTab ?? 'files',
          focusMode: saved.ui.focusMode ?? false,
          sidebarWidth: saved.ui.sidebarWidth ?? 260,
          contextPanelWidth: saved.ui.contextPanelWidth ?? 320,
          terminalVisible: saved.ui.terminalVisible ?? false,
          terminalHeight: saved.ui.terminalHeight ?? 250,
        });
      }

      // ── 3. Restore project path for active tab ────────────
      const activeTab = restoredTabs.find((t) => t.id === resolvedActiveId);
      if (activeTab?.projectPath) {
        useProjectStore.getState().setProjectPath(activeTab.projectPath);
      }

      // ── 4. Open sessions for ALL chat tabs ────────────────
      // Active tab first (so the user sees it immediately), then the rest in parallel.
      const chatTabs = restoredTabs.filter(t => t.type === 'chat' && t.projectPath);

      // Wire up each tab, active first
      const sorted = [...chatTabs].sort((a, b) => {
        if (a.id === resolvedActiveId) return -1;
        if (b.id === resolvedActiveId) return 1;
        return 0;
      });

      // Load active tab first (await), then parallelize the rest
      const [firstTab, ...restTabs] = sorted;
      if (firstTab) {
        try {
          await openTabSession(firstTab.id, firstTab);
          addWiredSession(`${firstTab.id}::${firstTab.projectPath}`);
        } catch {
          // Session file may have been deleted — tab will lazy-init on first message
        }
      }

      if (restTabs.length > 0) {
        const results = await Promise.allSettled(
          restTabs.map(async (tab) => {
            await openTabSession(tab.id, tab);
            addWiredSession(`${tab.id}::${tab.projectPath}`);
          })
        );
      }

      // ── 5. Refresh sidebar session list ───────────────────
      const projectPaths = [...new Set(restoredTabs.map(t => t.projectPath).filter(Boolean))] as string[];
      useSessionStore.getState().loadSessions(projectPaths);

      restoredRef.current = true;
    })();
  }, []);

  // ── Auto-save on tab/UI changes (debounced) ──────────────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const guardedSave = () => {
      if (restoredRef.current) saveWorkspace();
    };

    const debouncedSave = () => {
      if (!restoredRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(guardedSave, 500);
    };

    const unsubTabs = useTabStore.subscribe(debouncedSave);
    const unsubUI = useUIStore.subscribe(debouncedSave);

    window.addEventListener('beforeunload', guardedSave);

    return () => {
      unsubTabs();
      unsubUI();
      window.removeEventListener('beforeunload', guardedSave);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}

/**
 * Returns the set of session keys ("tabId::projectPath") that have been fully
 * wired up by workspace persistence.
 * 
 * Used by App.tsx and SessionList.tsx to skip redundant session initialization
 * when switching tabs. A tab is considered "wired" if its session has been opened
 * and its chat history, stats, and model info have been loaded into the stores.
 * 
 * @returns Set of "tabId::projectPath" keys for wired sessions
 */
export function getWiredSessions(): Set<string> {
  return useWiredSessionsStore.getState().wiredSessions;
}
