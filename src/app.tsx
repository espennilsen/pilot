import { useMemo, useEffect, useRef } from 'react';
import TitleBar from './components/shared/TitleBar';
import { CompanionTitleBar } from './components/companion/CompanionTitleBar';
import { TabBar } from './components/tab-bar/TabBar';
import MainLayout from './components/layout/MainLayout';
import { CommandPalette } from './components/command-palette/CommandPalette';
import StatusBar from './components/status-bar/StatusBar';
import Terminal from './components/terminal/Terminal';
import ScratchPad from './components/scratch-pad/ScratchPad';
import SettingsPanel from './components/settings/SettingsPanel';
import { AboutDialog } from './components/about/AboutDialog';
import { OutputWindowManager } from './components/command-center/OutputWindowManager';
import { useTabStore } from './stores/tab-store';
import { useUIStore } from './stores/ui-store';
import { useSandboxStore } from './stores/sandbox-store';
import { useCommandPaletteStore } from './stores/command-palette-store';
import { useProjectStore } from './stores/project-store';
import { useSessionStore } from './stores/session-store';
import { useAppSettingsStore } from './stores/app-settings-store';
import { useDevCommandStore } from './stores/dev-command-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcut';
import { useDefaultCommands } from './hooks/useDefaultCommands';
import { useSandboxEvents } from './hooks/useSandboxEvents';
import { useWorkspacePersistence, openTabSession, useWiredSessionsStore } from './hooks/useWorkspacePersistence';
import { useAuthEvents } from './hooks/useAuthEvents';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useSubagentEvents } from './hooks/useSubagentEvents';
import { DEFAULT_KEYBINDINGS, getEffectiveCombo, parseCombo } from './lib/keybindings';
import { isCompanionMode, invoke, on, send } from './lib/ipc-client';
import { useChatStore } from './stores/chat-store';
import { IPC } from '../shared/ipc';

function App() {
  const { tabs, addTab, activeTabId } = useTabStore();
  const { toggleSidebar, toggleContextPanel, setContextPanelTab, contextPanelVisible, toggleFocusMode, toggleTerminal, addTerminalTab, closeTerminalTab, terminalTabs, toggleScratchPad, terminalVisible, scratchPadVisible, openSettings, setSidebarPane, sidebarVisible } = useUIStore();
  const { toggleYolo } = useSandboxStore();
  const { toggle: toggleCommandPalette } = useCommandPaletteStore();
  const developerMode = useAppSettingsStore(s => s.developerMode);
  const { openProjectDialog } = useProjectStore();
  const projectPath = useProjectStore(s => s.projectPath);
  const keybindOverrides = useAppSettingsStore(s => s.keybindOverrides);
  const { wiredSessions, addWiredSession } = useWiredSessionsStore();

  // Load app settings (developer mode, keybinds, etc.) from disk on startup
  useEffect(() => {
    useAppSettingsStore.getState().load();
  }, []);

  // Guard against concurrent in-flight session opens
  const inFlightRef = useRef<Set<string>>(new Set());

  // Sync project path and open session when active tab changes.
  // On startup, useWorkspacePersistence opens all sessions first and registers them
  // in the wired sessions store. This effect only handles subsequent tab switches.
  useEffect(() => {
    if (!activeTabId) return;
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    // Sync project path from the active tab to the global project store
    const currentProjectPath = useProjectStore.getState().projectPath;
    if (tab.projectPath && tab.projectPath !== currentProjectPath) {
      useProjectStore.getState().setProjectPath(tab.projectPath);
    } else if (!tab.projectPath && currentProjectPath) {
      useProjectStore.setState({ projectPath: null, fileTree: [], selectedFilePath: null });
    }

    // Only chat tabs with a project need sessions
    if (tab.type !== 'chat' || !tab.projectPath) return;

    const sessionKey = `${activeTabId}::${tab.projectPath}`;

    // Already wired (by workspace restore or a previous switch) — skip
    if (wiredSessions.has(sessionKey)) return;
    // Already in flight — skip
    if (inFlightRef.current.has(sessionKey)) return;
    inFlightRef.current.add(sessionKey);

    openTabSession(activeTabId, tab)
      .then(() => {
        addWiredSession(sessionKey);
        // Refresh sidebar session list
        const paths = [...new Set(tabs.map(t => t.projectPath).filter(Boolean))] as string[];
        useSessionStore.getState().loadSessions(paths);
      })
      .catch(() => { /* session will lazy-init on first message */ })
      .finally(() => { inFlightRef.current.delete(sessionKey); });
  }, [activeTabId, tabs, wiredSessions, addWiredSession]);

  // Restore workspace (tabs, UI layout, project) from last session
  // Falls back to creating an empty tab if no saved state exists
  useWorkspacePersistence();

  // Register default commands
  useDefaultCommands();

  // Listen for sandbox events
  useSandboxEvents();

  // Listen for auth/OAuth events
  useAuthEvents();

  // Watch filesystem for external changes
  useFileWatcher();

  // Listen for subagent events from main process
  useSubagentEvents();

  // Auto-start persistent dev commands on launch
  const autoStartDevServer = useAppSettingsStore(s => s.autoStartDevServer);
  const autoStartedRef = useRef<string | null>(null);

  useEffect(() => {
    // Only run if auto-start is enabled, developer mode is on, and we have a project
    if (!autoStartDevServer || !developerMode || !projectPath) return;

    // Prevent running multiple times for the same project
    if (autoStartedRef.current === projectPath) return;
    autoStartedRef.current = projectPath;

    // Load commands and run persistent ones
    const autoStart = async () => {
      try {
        const { loadCommands, commands: currentCommands, runCommand } = useDevCommandStore.getState();
        await loadCommands(projectPath);
        
        // Get the freshly loaded commands
        const commands = useDevCommandStore.getState().commands;
        
        // Run each command that is marked as persistent
        for (const cmd of commands) {
          if (cmd.persistent) {
            await runCommand(cmd.id);
          }
        }
      } catch (error) {
        console.error('Failed to auto-start dev commands:', error);
      }
    };

    autoStart();
  }, [autoStartDevServer, developerMode, projectPath]);

  // Listen for File menu commands
  useEffect(() => {
    const unsub = on('menu:new-conversation', () => {
      useTabStore.getState().addTab();
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = on('menu:open-project', () => {
      useProjectStore.getState().openProjectDialog();
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = on('menu:close-tab', () => {
      const { activeTabId, closeTab } = useTabStore.getState();
      if (activeTabId) closeTab(activeTabId);
    });
    return unsub;
  }, []);

  // Listen for menu toggle terminal command
  useEffect(() => {
    const unsub = on('menu:toggle-terminal', () => {
      const { terminalTabs, terminalVisible } = useUIStore.getState();
      if (terminalTabs.length === 0) {
        addTerminalTab();
      } else {
        toggleTerminal();
      }
    });
    return unsub;
  }, [toggleTerminal, addTerminalTab]);

  // Listen for menu new terminal command
  useEffect(() => {
    const unsub = on('menu:new-terminal', () => {
      addTerminalTab();
    });
    return unsub;
  }, [addTerminalTab]);

  // Listen for terminal exited events (PTY died)
  useEffect(() => {
    const unsub = on(IPC.TERMINAL_EXITED, (id: string) => {
      // Keep the tab around so the user sees the exit message — don't auto-close
    });
    return unsub;
  }, []);

  // Listen for Help menu commands
  useEffect(() => {
    const unsub = on('menu:documentation', () => {
      useTabStore.getState().addDocsTab('index');
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = on('menu:keyboard-shortcuts', () => {
      useUIStore.getState().openSettings('keybindings');
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = on('menu:about', () => {
      useUIStore.getState().openAbout();
    });
    return unsub;
  }, []);

  // Send developer mode changes to main process (for menu visibility)
  useEffect(() => {
    send(IPC.TERMINAL_SET_MENU_VISIBLE, developerMode);
  }, [developerMode]);

  // Auto-hide terminal when developer mode is turned off
  useEffect(() => {
    if (!developerMode && terminalVisible) {
      toggleTerminal();
    }
  }, [developerMode, terminalVisible, toggleTerminal]);

  // Dynamic window title
  useEffect(() => {
    if (projectPath) {
      const projectName = projectPath.split('/').pop() || projectPath;
      document.title = `Pilot — [${projectName}]`;
    } else {
      document.title = 'Pilot';
    }
  }, [projectPath]);

  // Map shortcut IDs to actions
  const actionMap: Record<string, () => void> = useMemo(() => ({
    'command-palette':      toggleCommandPalette,
    'toggle-sidebar':       toggleSidebar,
    'toggle-context-panel': toggleContextPanel,
    'toggle-focus-mode':    toggleFocusMode,
    'toggle-scratch-pad':   toggleScratchPad,
    'toggle-terminal':      () => {
      const { terminalTabs } = useUIStore.getState();
      if (terminalTabs.length === 0) {
        addTerminalTab();
      } else {
        toggleTerminal();
      }
    },
    'toggle-yolo-mode':     () => { if (activeTabId) toggleYolo(activeTabId); },
    'toggle-git-panel':     () => { setContextPanelTab('git'); if (!contextPanelVisible) toggleContextPanel(); },
    'new-tab':              () => addTab(),
    'new-conversation':     () => addTab(),
    'developer-settings':   () => openSettings('developer'),
    'open-project':         openProjectDialog,
    'open-settings':        () => openSettings(),
    'open-memory':          () => {
      setSidebarPane('memory');
      if (!sidebarVisible) toggleSidebar();
    },
    'open-prompts':         () => window.dispatchEvent(new CustomEvent('pilot:toggle-prompt-picker')),
    'stop-agent':           () => {
      const tabId = useTabStore.getState().activeTabId;
      if (tabId && useChatStore.getState().streamingByTab[tabId]) {
        invoke(IPC.AGENT_ABORT, tabId).catch(() => {});
        useChatStore.getState().setQueued(tabId, { steering: [], followUp: [] });
      }
    },
  }), [toggleCommandPalette, toggleSidebar, toggleContextPanel, toggleFocusMode, toggleScratchPad, toggleTerminal, addTerminalTab, activeTabId, toggleYolo, setContextPanelTab, contextPanelVisible, addTab, openSettings, openProjectDialog, setSidebarPane, sidebarVisible]);

  // Build shortcut configs from keybinding defs + overrides
  const shortcuts = useMemo(() => {
    return DEFAULT_KEYBINDINGS
      .map(def => {
        const combo = getEffectiveCombo(def.id, keybindOverrides);
        const action = actionMap[def.id];
        if (!combo || !action) return null;
        // Only enable terminal shortcut in developer mode
        if (def.id === 'toggle-terminal' && !developerMode) return null;
        const { key, modifiers } = parseCombo(combo);
        return { key, modifiers, action };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [keybindOverrides, actionMap, developerMode]);

  useKeyboardShortcuts(shortcuts);

  const companion = isCompanionMode();

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {companion ? <CompanionTitleBar /> : <TitleBar />}
      <TabBar />
      <MainLayout />
      {developerMode && terminalTabs.length > 0 && <Terminal />}
      <StatusBar />
      {scratchPadVisible && <ScratchPad />}
      <SettingsPanel />
      <AboutDialog />
      <CommandPalette />
      <OutputWindowManager />
    </div>
  );
}

export default App;
