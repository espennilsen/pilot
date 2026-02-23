import { create } from 'zustand';

// Load scratch pad content from localStorage
const loadScratchPadContent = (): string => {
  try {
    return localStorage.getItem('scratchPadContent') || '';
  } catch {
    return '';
  }
};

// Save scratch pad content to localStorage
const saveScratchPadContent = (content: string) => {
  try {
    localStorage.setItem('scratchPadContent', content);
  } catch {
    // Ignore errors
  }
};

export type SidebarPane = 'sessions' | 'memory' | 'tasks';
export type ContextPanelTab = 'files' | 'git' | 'changes' | 'tasks' | 'agents';

interface UIStore {
  sidebarVisible: boolean;
  sidebarPane: SidebarPane;
  contextPanelVisible: boolean;
  contextPanelTab: ContextPanelTab;
  focusMode: boolean;
  sidebarWidth: number;
  contextPanelWidth: number;
  settingsOpen: boolean;
  settingsTab: 'general' | 'auth' | 'project' | 'extensions' | 'skills' | 'developer' | 'keybindings' | 'prompts' | 'companion';
  terminalVisible: boolean;
  terminalHeight: number;
  terminalTabs: { id: string; name: string }[];
  activeTerminalId: string | null;
  scratchPadVisible: boolean;
  scratchPadContent: string;
  aboutOpen: boolean;

  toggleSidebar: () => void;
  setSidebarPane: (pane: SidebarPane) => void;
  toggleContextPanel: () => void;
  setContextPanelTab: (tab: ContextPanelTab) => void;
  toggleFocusMode: () => void;
  setSidebarWidth: (width: number) => void;
  setContextPanelWidth: (width: number) => void;
  openSettings: (tab?: 'general' | 'project' | 'extensions' | 'skills' | 'developer' | 'keybindings' | 'prompts' | 'companion') => void;
  closeSettings: () => void;
  setSettingsTab: (tab: 'general' | 'auth' | 'project' | 'extensions' | 'skills' | 'developer' | 'keybindings' | 'prompts' | 'companion') => void;
  toggleTerminal: () => void;
  setTerminalHeight: (height: number) => void;
  addTerminalTab: () => string;
  closeTerminalTab: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  renameTerminalTab: (id: string, name: string) => void;
  toggleScratchPad: () => void;
  setScratchPadContent: (content: string) => void;
  openAbout: () => void;
  closeAbout: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarVisible: true,
  sidebarPane: 'sessions' as SidebarPane,
  contextPanelVisible: true,
  contextPanelTab: 'files',
  focusMode: false,
  sidebarWidth: 260,
  contextPanelWidth: 320,
  settingsOpen: false,
  settingsTab: 'general',
  terminalVisible: false,
  terminalHeight: 250,
  terminalTabs: [],
  activeTerminalId: null,
  scratchPadVisible: false,
  scratchPadContent: loadScratchPadContent(),
  aboutOpen: false,
  
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  setSidebarPane: (pane) => set({ sidebarPane: pane }),
  toggleContextPanel: () => set((s) => ({ contextPanelVisible: !s.contextPanelVisible })),
  setContextPanelTab: (tab) => set({ contextPanelTab: tab }),
  toggleFocusMode: () => set((s) => {
    if (s.focusMode) {
      return { focusMode: false, sidebarVisible: true, contextPanelVisible: true };
    }
    return { focusMode: true, sidebarVisible: false, contextPanelVisible: false };
  }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(200, Math.min(400, w)) }),
  setContextPanelWidth: (w) => set({ contextPanelWidth: Math.max(250, Math.min(500, w)) }),
  openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? 'general' }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  toggleTerminal: () => set((s) => ({ terminalVisible: !s.terminalVisible })),
  setTerminalHeight: (h) => set({ terminalHeight: Math.max(150, Math.min(600, h)) }),
  
  addTerminalTab: () => {
    let newId = '';
    set((s) => {
      // Generate sequential name based on existing tabs
      const count = s.terminalTabs.length;
      const name = count === 0 ? 'zsh' : `zsh (${count + 1})`;
      
      // Generate unique ID
      newId = `term-${Date.now()}`;
      
      return {
        terminalTabs: [...s.terminalTabs, { id: newId, name }],
        activeTerminalId: newId,
        terminalVisible: true,
      };
    });
    return newId;
  },
  
  closeTerminalTab: (id: string) => set((s) => {
    const newTabs = s.terminalTabs.filter(tab => tab.id !== id);
    let newActiveId = s.activeTerminalId;
    let newVisible = s.terminalVisible;
    
    // If closing the active tab, switch to the last remaining tab
    if (s.activeTerminalId === id) {
      newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }
    
    // If no tabs remain, hide terminal
    if (newTabs.length === 0) {
      newVisible = false;
    }
    
    return {
      terminalTabs: newTabs,
      activeTerminalId: newActiveId,
      terminalVisible: newVisible,
    };
  }),
  
  setActiveTerminal: (id: string) => set({ activeTerminalId: id }),
  
  renameTerminalTab: (id: string, name: string) => set((s) => ({
    terminalTabs: s.terminalTabs.map(tab =>
      tab.id === id ? { ...tab, name } : tab
    ),
  })),
  
  toggleScratchPad: () => set((s) => ({ scratchPadVisible: !s.scratchPadVisible })),
  setScratchPadContent: (content) => {
    saveScratchPadContent(content);
    set({ scratchPadContent: content });
  },
  openAbout: () => set({ aboutOpen: true }),
  closeAbout: () => set({ aboutOpen: false }),
}));
