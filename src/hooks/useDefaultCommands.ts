import { useEffect } from 'react';
import { useCommandPaletteStore, type CommandAction } from '../stores/command-palette-store';
import { useUIStore } from '../stores/ui-store';
import { useTabStore } from '../stores/tab-store';
import { useSandboxStore } from '../stores/sandbox-store';
import { useProjectStore } from '../stores/project-store';
import { useAppSettingsStore } from '../stores/app-settings-store';
import { useMemoryStore } from '../stores/memory-store';
import { useTaskStore } from '../stores/task-store';
import { DEFAULT_KEYBINDINGS, getEffectiveCombo, comboToSymbol } from '../lib/keybindings';

/**
 * Registers default command palette commands.
 * 
 * Builds and registers all built-in commands (UI toggles, navigation, tabs, memory, tasks)
 * with the command palette store. Commands include keyboard shortcuts derived from
 * DEFAULT_KEYBINDINGS and user overrides. Re-registers whenever keybind overrides or
 * relevant UI state changes.
 * 
 * Should be mounted once at the app root level.
 */
export function useDefaultCommands() {
  const registerCommands = useCommandPaletteStore(s => s.registerCommands);
  const { toggleSidebar, toggleContextPanel, setContextPanelTab, contextPanelVisible, toggleFocusMode, toggleTerminal, toggleScratchPad, openSettings, setSidebarPane, sidebarVisible } = useUIStore();
  const { addTab, closeTab, activeTabId } = useTabStore();
  const { toggleYolo } = useSandboxStore();
  const { openProjectDialog } = useProjectStore();
  const { keybindOverrides, developerMode, setDeveloperMode } = useAppSettingsStore();

  useEffect(() => {
    // Map IDs to actions, icons, and keywords
    const commandMeta: Record<string, { icon: string; action: () => void; keywords: string[] }> = {
      'toggle-sidebar':       { icon: 'PanelLeft',      action: toggleSidebar,     keywords: ['sidebar', 'panel', 'left'] },
      'toggle-context-panel': { icon: 'PanelRight',     action: toggleContextPanel, keywords: ['context', 'panel', 'right', 'files', 'git'] },
      'toggle-focus-mode':    { icon: 'Maximize',       action: toggleFocusMode,   keywords: ['focus', 'fullscreen', 'zen'] },
      'toggle-terminal':      { icon: 'Terminal',       action: toggleTerminal,    keywords: ['terminal', 'console', 'shell'] },
      'toggle-scratch-pad':   { icon: 'StickyNote',     action: toggleScratchPad,  keywords: ['scratch', 'pad', 'notes', 'notepad'] },
      'toggle-git-panel':     { icon: 'GitBranch',      action: () => { setContextPanelTab('git'); if (!contextPanelVisible) toggleContextPanel(); }, keywords: ['git', 'version', 'control', 'panel'] },
      'new-tab':              { icon: 'Plus',           action: () => addTab(),    keywords: ['tab', 'new', 'create'] },
      'close-tab':            { icon: 'X',              action: () => { if (activeTabId) closeTab(activeTabId); }, keywords: ['tab', 'close', 'remove'] },
      'new-conversation':     { icon: 'MessageSquare',  action: () => addTab(),    keywords: ['new', 'conversation', 'chat', 'tab'] },
      'toggle-yolo-mode':     { icon: 'Zap',            action: () => { if (activeTabId) toggleYolo(activeTabId); }, keywords: ['yolo', 'sandbox', 'auto', 'accept'] },
      'developer-settings':   { icon: 'Code',           action: () => openSettings('developer'), keywords: ['dev', 'developer', 'mode', 'debug', 'commands'] },
      'open-project':         { icon: 'FolderOpen',     action: openProjectDialog, keywords: ['open', 'project', 'folder', 'directory'] },
      'open-settings':        { icon: 'Settings',       action: () => openSettings(), keywords: ['settings', 'preferences', 'config', 'options'] },
      'command-palette':      { icon: 'Search',         action: () => {},          keywords: ['command', 'palette', 'search'] },
      'open-memory':          { icon: 'Brain',           action: () => { setSidebarPane('memory'); if (!sidebarVisible) toggleSidebar(); }, keywords: ['memory', 'remember', 'forget', 'brain'] },
      'open-tasks':           { icon: 'ListTodo',        action: () => { const pp = useProjectStore.getState().projectPath; if (pp) useTabStore.getState().addTasksTab(pp); }, keywords: ['tasks', 'kanban', 'board', 'issues', 'todo'] },
    };

    const commands: CommandAction[] = DEFAULT_KEYBINDINGS
      .filter(def => commandMeta[def.id])
      .map(def => {
        const meta = commandMeta[def.id];
        const combo = getEffectiveCombo(def.id, keybindOverrides);
        return {
          id: def.id,
          label: def.label,
          icon: meta.icon,
          shortcut: combo ? comboToSymbol(combo) : undefined,
          category: def.category,
          action: meta.action,
          keywords: meta.keywords,
        };
      });

    const openMemoryPane = () => {
      setSidebarPane('memory');
      if (!sidebarVisible) toggleSidebar();
    };

    // Memory commands (not keybinding-driven, always registered)
    const memoryCommands: CommandAction[] = [
      {
        id: 'memory-open-panel',
        label: 'Memory: Open Memory Panel',
        icon: 'Brain',
        shortcut: '⌘⇧M',
        category: 'Memory',
        action: openMemoryPane,
        keywords: ['memory', 'remember', 'forget', 'brain'],
      },
      {
        id: 'memory-edit-global',
        label: 'Memory: Edit Global Memory',
        icon: 'Brain',
        category: 'Memory',
        action: openMemoryPane,
        keywords: ['memory', 'global', 'edit'],
      },
      {
        id: 'memory-toggle-auto',
        label: 'Memory: Toggle Auto-Extract',
        icon: 'Brain',
        category: 'Memory',
        action: () => {
          const { autoExtractEnabled, setAutoExtractEnabled } = useMemoryStore.getState();
          setAutoExtractEnabled(!autoExtractEnabled);
        },
        keywords: ['memory', 'auto', 'extract', 'toggle'],
      },
    ];

    const openTaskBoardTab = () => {
      const pp = useProjectStore.getState().projectPath;
      if (pp) useTabStore.getState().addTasksTab(pp);
    };

    const taskCommands: CommandAction[] = [
      {
        id: 'tasks-open-board',
        label: 'Tasks: Open Task Board',
        icon: 'ListTodo',
        shortcut: '⌘⇧T',
        category: 'Tasks',
        action: openTaskBoardTab,
        keywords: ['tasks', 'kanban', 'board', 'todo'],
      },
      {
        id: 'tasks-create',
        label: 'Tasks: Create New Task',
        icon: 'Plus',
        category: 'Tasks',
        action: () => {
          useTaskStore.getState().setShowCreateDialog(true);
        },
        keywords: ['tasks', 'create', 'new', 'add'],
      },
      {
        id: 'tasks-show-ready',
        label: 'Tasks: Show Ready Tasks',
        icon: 'ListTodo',
        category: 'Tasks',
        action: () => {
          setSidebarPane('tasks');
          if (!sidebarVisible) toggleSidebar();
        },
        keywords: ['tasks', 'ready', 'unblocked'],
      },
      {
        id: 'tasks-kanban-view',
        label: 'Tasks: Switch to Kanban View',
        icon: 'LayoutGrid',
        category: 'Tasks',
        action: () => {
          useTaskStore.getState().setViewMode('kanban');
          openTaskBoardTab();
        },
        keywords: ['tasks', 'kanban', 'board', 'columns'],
      },
      {
        id: 'tasks-table-view',
        label: 'Tasks: Switch to Table View',
        icon: 'List',
        category: 'Tasks',
        action: () => {
          useTaskStore.getState().setViewMode('table');
          openTaskBoardTab();
        },
        keywords: ['tasks', 'table', 'list', 'rows'],
      },
    ];

    registerCommands([...commands, ...memoryCommands, ...taskCommands]);
  }, [registerCommands, toggleSidebar, toggleContextPanel, setContextPanelTab, contextPanelVisible, toggleFocusMode, toggleTerminal, toggleScratchPad, openSettings, addTab, closeTab, activeTabId, toggleYolo, setDeveloperMode, developerMode, openProjectDialog, keybindOverrides, setSidebarPane, sidebarVisible]);
}
