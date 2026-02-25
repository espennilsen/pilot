/**
 * @file Tab store — manages tabs, project grouping, and tab switching/ordering.
 */
import { create } from 'zustand';
import { useProjectStore } from './project-store';

/**
 * Represents a single tab (chat, file, tasks, docs, or web).
 */
export interface TabState {
  id: string;
  type: 'chat' | 'file' | 'tasks' | 'docs' | 'web';
  filePath: string | null; // for file tabs; URL for web tabs
  title: string;
  projectPath: string | null;
  sessionPath: string | null;
  projectColor: string;
  isPinned: boolean;
  order: number;
  scrollPosition: number;
  inputDraft: string;
  panelConfig: {
    sidebarVisible: boolean;
    contextPanelVisible: boolean;
    contextPanelTab: 'files' | 'git' | 'changes' | 'tasks';
  };
  lastActiveAt: number;
  hasUnread: boolean;
}

/**
 * A group of tabs for the same project (used for visual grouping in the UI).
 */
export interface TabGroup {
  projectPath: string | null;
  projectName: string;
  color: string;
  isCollapsed: boolean;
  tabs: TabState[];
}

interface TabStore {
  tabs: TabState[];
  activeTabId: string | null;
  closedTabStack: TabState[];
  projectColorMap: Map<string | null, string>;

  // Actions
  addTab: (projectPath?: string | null) => string;
  addFileTab: (filePath: string, projectPath: string | null) => string;
  addTasksTab: (projectPath: string) => string;
  addDocsTab: (page?: string) => string;
  addWebTab: (url: string, projectPath: string | null, title?: string, background?: boolean) => string;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  switchToTabByIndex: (index: number) => void;
  nextTab: () => void;
  prevTab: () => void;
  moveTab: (tabId: string, newOrder: number) => void;
  reopenClosedTab: () => void;
  pinTab: (tabId: string) => void;
  unpinTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<TabState>) => void;
  setActiveTabTitle: (title: string) => void;
  getGroupedTabs: () => TabGroup[];
}

const PROJECT_COLORS = [
  '#4fc3f7',
  '#66bb6a',
  '#ffa726',
  '#ef5350',
  '#ab47bc',
  '#26c6da',
  '#ff7043',
  '#9ccc65',
];

/**
 * Extract project name from project path.
 */
function getProjectName(projectPath: string | null): string {
  if (!projectPath) return 'General';
  const parts = projectPath.split('/');
  return parts[parts.length - 1] || 'General';
}

/**
 * Get or assign a color for a project. Colors are assigned in rotation and cached.
 */
export function getProjectColor(projectPath: string | null): string {
  const store = useTabStore.getState();
  const colorMap = store.projectColorMap;
  
  if (colorMap.has(projectPath)) {
    return colorMap.get(projectPath)!;
  }
  
  const color = PROJECT_COLORS[colorMap.size % PROJECT_COLORS.length];
  colorMap.set(projectPath, color);
  return color;
}

/**
 * Tab store — manages tabs, project grouping, and tab switching/ordering.
 * Supports pinned tabs, closed-tab stack for reopening, and keyboard navigation.
 */
export const useTabStore = create<TabStore>((set, get) => {
  /**
   * Helper to find an existing tab by predicate or create a new one.
   * If found, switches to it. If not found, creates it using the factory.
   */
  const findOrCreateTab = (
    predicate: (tab: TabState) => boolean,
    factory: () => Omit<TabState, 'id' | 'order' | 'lastActiveAt'>
  ): string => {
    const existing = get().tabs.find(predicate);
    if (existing) {
      get().switchTab(existing.id);
      return existing.id;
    }

    const newTabId = crypto.randomUUID();
    const tabs = get().tabs;
    const maxOrder = tabs.length > 0 ? Math.max(...tabs.map(t => t.order)) : -1;

    const newTab: TabState = {
      ...factory(),
      id: newTabId,
      order: maxOrder + 1,
      lastActiveAt: Date.now(),
    };

    set(state => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTabId,
    }));

    return newTabId;
  };

  return {
    tabs: [],
    activeTabId: null,
    closedTabStack: [],
    projectColorMap: new Map<string | null, string>(),

    addTab: (projectPath = undefined) => {
    const tabs = get().tabs;
    const maxOrder = tabs.length > 0 ? Math.max(...tabs.map(t => t.order)) : -1;

    // Resolve project: explicit param → active tab → closed tab stack → project store
    let resolvedProject = projectPath ?? null;
    if (resolvedProject === null) {
      const activeTab = tabs.find(t => t.id === get().activeTabId);
      if (activeTab?.projectPath) {
        resolvedProject = activeTab.projectPath;
      }
    }
    if (resolvedProject === null) {
      const lastClosed = get().closedTabStack.find(t => t.projectPath);
      if (lastClosed?.projectPath) {
        resolvedProject = lastClosed.projectPath;
      }
    }
    if (resolvedProject === null) {
      resolvedProject = useProjectStore.getState().projectPath;
    }

    // Tabs must be bound to a project — don't create orphan tabs
    if (!resolvedProject) return '';

    const newTabId = crypto.randomUUID();
    const newTab: TabState = {
      id: newTabId,
      type: 'chat',
      filePath: null,
      title: 'New Chat',
      projectPath: resolvedProject,
      sessionPath: null,
      projectColor: getProjectColor(resolvedProject),
      isPinned: false,
      order: maxOrder + 1,
      scrollPosition: 0,
      inputDraft: '',
      panelConfig: {
        sidebarVisible: true,
        contextPanelVisible: true,
        contextPanelTab: 'files',
      },
      lastActiveAt: Date.now(),
      hasUnread: false,
    };

    set(state => ({
      tabs: [...state.tabs, newTab],
      activeTabId: newTabId,
    }));

    return newTabId;
  },

    addFileTab: (filePath: string, projectPath: string | null) => {
      const fileName = filePath.split('/').pop() || 'Untitled';
      return findOrCreateTab(
        (t) => t.type === 'file' && t.filePath === filePath,
        () => ({
          type: 'file',
          filePath,
          title: fileName,
          projectPath,
          sessionPath: null,
          projectColor: getProjectColor(projectPath),
          isPinned: false,
          scrollPosition: 0,
          inputDraft: '',
          panelConfig: {
            sidebarVisible: true,
            contextPanelVisible: true,
            contextPanelTab: 'files',
          },
          hasUnread: false,
        })
      );
    },

    addTasksTab: (projectPath: string) => {
      return findOrCreateTab(
        (t) => t.type === 'tasks' && t.projectPath === projectPath,
        () => ({
          type: 'tasks',
          filePath: null,
          title: 'Task Board',
          projectPath,
          sessionPath: null,
          projectColor: getProjectColor(projectPath),
          isPinned: false,
          scrollPosition: 0,
          inputDraft: '',
          panelConfig: {
            sidebarVisible: true,
            contextPanelVisible: false,
            contextPanelTab: 'files',
          },
          hasUnread: false,
        })
      );
    },

    addDocsTab: (page = 'index') => {
      // Reuse existing docs tab if one exists — update its filePath to navigate
      const existing = get().tabs.find(t => t.type === 'docs');
      if (existing) {
        get().switchTab(existing.id);
        // Update file path to requested page
        set(state => ({
          tabs: state.tabs.map(t =>
            t.id === existing.id ? { ...t, filePath: page } : t
          ),
        }));
        return existing.id;
      }

      const newTabId = crypto.randomUUID();
      const tabs = get().tabs;
      const maxOrder = tabs.length > 0 ? Math.max(...tabs.map(t => t.order)) : -1;

      const newTab: TabState = {
        id: newTabId,
        type: 'docs',
        filePath: page,
        title: 'Documentation',
        projectPath: null,
        sessionPath: null,
        projectColor: '',
        isPinned: false,
        order: maxOrder + 1,
        scrollPosition: 0,
        inputDraft: '',
        panelConfig: {
          sidebarVisible: true,
          contextPanelVisible: false,
          contextPanelTab: 'files',
        },
        lastActiveAt: Date.now(),
        hasUnread: false,
      };

      set(state => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTabId,
      }));

      return newTabId;
    },

    addWebTab: (url: string, projectPath: string | null, title?: string, background = false) => {
      // Extract hostname or filename for default title
      let defaultTitle = 'Web';
      try {
        if (url.startsWith('pilot-html://')) {
          const filename = url.split('/').pop() || 'HTML';
          defaultTitle = filename.replace(/\.html$/, '');
        } else if (url.startsWith('http://') || url.startsWith('https://')) {
          const hostname = new URL(url).hostname;
          defaultTitle = hostname.replace(/^www\./, '');
        }
      } catch { /* Invalid URL — use fallback */ }

      // Deduplicate: if tab with same URL exists, just return its id (switch only if not background)
      const existing = get().tabs.find((t) => t.type === 'web' && t.filePath === url);
      if (existing) {
        if (!background) get().switchTab(existing.id);
        return existing.id;
      }

      // Create new tab — in background mode, don't switch to it
      const newTabId = crypto.randomUUID();
      const tabs = get().tabs;
      const maxOrder = tabs.length > 0 ? Math.max(...tabs.map(t => t.order)) : -1;

      const newTab: TabState = {
        id: newTabId,
        type: 'web',
        filePath: url,
        title: title || defaultTitle,
        projectPath,
        sessionPath: null,
        projectColor: getProjectColor(projectPath),
        isPinned: false,
        order: maxOrder + 1,
        scrollPosition: 0,
        inputDraft: '',
        panelConfig: {
          sidebarVisible: true,
          contextPanelVisible: false,
          contextPanelTab: 'files',
        },
        lastActiveAt: Date.now(),
        hasUnread: false,
      };

      set(state => ({
        tabs: [...state.tabs, newTab],
        ...(background ? {} : { activeTabId: newTabId }),
      }));

      return newTabId;
    },

  /** Close a tab. If it's the active tab, switches to the nearest remaining tab. Pushes to closed-tab stack. */
  closeTab: (tabId: string) => {
      const state = get();
      const tabIndex = state.tabs.findIndex(t => t.id === tabId);
      if (tabIndex === -1) return;

      const closedTab = state.tabs[tabIndex];
      const newClosedStack = [closedTab, ...state.closedTabStack].slice(0, 10);

      let newActiveTabId = state.activeTabId;
      
      // If closing the active tab, switch to the nearest one
      if (tabId === state.activeTabId) {
        const remainingTabs = state.tabs.filter(t => t.id !== tabId);
        if (remainingTabs.length > 0) {
          // Try next tab, or previous if closing the last tab
          const nextTab = remainingTabs[tabIndex] || remainingTabs[tabIndex - 1];
          newActiveTabId = nextTab.id;
        } else {
          newActiveTabId = null;
        }
      }

      set({
        tabs: state.tabs.filter(t => t.id !== tabId),
        activeTabId: newActiveTabId,
        closedTabStack: newClosedStack,
      });
    },

  /** Switch to a tab by ID. Clears unread flag and updates lastActiveAt. */
  switchTab: (tabId: string) => {
      const state = get();
      const tab = state.tabs.find(t => t.id === tabId);
      if (!tab) return;

      set(state => ({
        activeTabId: tabId,
        tabs: state.tabs.map(t =>
          t.id === tabId
            ? { ...t, lastActiveAt: Date.now(), hasUnread: false }
            : t
        ),
      }));
    },

    switchToTabByIndex: (index: number) => {
      const visualTabs = get().getGroupedTabs().flatMap(g => g.tabs);
      if (index >= 0 && index < visualTabs.length) {
        get().switchTab(visualTabs[index].id);
      }
    },

    nextTab: () => {
      const visualTabs = get().getGroupedTabs().flatMap(g => g.tabs);
      const currentIndex = visualTabs.findIndex(t => t.id === get().activeTabId);
      if (currentIndex !== -1) {
        const nextIndex = (currentIndex + 1) % visualTabs.length;
        get().switchTab(visualTabs[nextIndex].id);
      }
    },

    prevTab: () => {
      const visualTabs = get().getGroupedTabs().flatMap(g => g.tabs);
      const currentIndex = visualTabs.findIndex(t => t.id === get().activeTabId);
      if (currentIndex !== -1) {
        const prevIndex = (currentIndex - 1 + visualTabs.length) % visualTabs.length;
        get().switchTab(visualTabs[prevIndex].id);
      }
    },

    moveTab: (tabId: string, newOrder: number) => {
      set(state => {
        const tabToMove = state.tabs.find(t => t.id === tabId);
        if (!tabToMove) return state;

        const oldOrder = tabToMove.order;
        if (oldOrder === newOrder) return state;

        const tabs = state.tabs.map(t => {
          if (t.id === tabId) {
            return { ...t, order: newOrder };
          } else if (oldOrder < newOrder) {
            // Moving right
            if (t.order > oldOrder && t.order <= newOrder) {
              return { ...t, order: t.order - 1 };
            }
          } else {
            // Moving left
            if (t.order >= newOrder && t.order < oldOrder) {
              return { ...t, order: t.order + 1 };
            }
          }
          return t;
        });

        return { tabs };
      });
    },

    reopenClosedTab: () => {
      const state = get();
      if (state.closedTabStack.length === 0) return;

      const [tabToReopen, ...remainingStack] = state.closedTabStack;
      const maxOrder = state.tabs.length > 0 ? Math.max(...state.tabs.map(t => t.order)) : -1;

      const reopenedTab: TabState = {
        ...tabToReopen,
        id: crypto.randomUUID(), // New ID
        order: maxOrder + 1,
        lastActiveAt: Date.now(),
      };

      set({
        tabs: [...state.tabs, reopenedTab],
        activeTabId: reopenedTab.id,
        closedTabStack: remainingStack,
      });
    },

    pinTab: (tabId: string) => {
      set(state => ({
        tabs: state.tabs.map(t =>
          t.id === tabId ? { ...t, isPinned: true } : t
        ),
      }));
    },

    unpinTab: (tabId: string) => {
      set(state => ({
        tabs: state.tabs.map(t =>
          t.id === tabId ? { ...t, isPinned: false } : t
        ),
      }));
    },

    updateTab: (tabId: string, updates: Partial<TabState>) => {
      set(state => ({
        tabs: state.tabs.map(t =>
          t.id === tabId ? { ...t, ...updates } : t
        ),
      }));
    },

    setActiveTabTitle: (title: string) => {
      const activeTabId = get().activeTabId;
      if (!activeTabId) return;
      
      get().updateTab(activeTabId, { title });
    },

    getGroupedTabs: () => {
      const tabs = get().tabs;
      const sortedTabs = [...tabs].sort((a, b) => {
        // Pinned tabs first
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        return a.order - b.order;
      });

      const groupMap = new Map<string | null, TabState[]>();
      
      sortedTabs.forEach(tab => {
        const key = tab.projectPath;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(tab);
      });

      const groups: TabGroup[] = [];
      groupMap.forEach((tabs, projectPath) => {
        groups.push({
          projectPath,
          projectName: getProjectName(projectPath),
          color: getProjectColor(projectPath),
          isCollapsed: false,
          tabs,
        });
      });

    // Sort groups by the order of their first tab (insertion order).
      // New projects appear at the end since their tabs have the highest order values.
      groups.sort((a, b) => {
        const aMin = Math.min(...a.tabs.map(t => t.order));
        const bMin = Math.min(...b.tabs.map(t => t.order));
        return aMin - bMin;
      });

      return groups;
    },
  };
});
