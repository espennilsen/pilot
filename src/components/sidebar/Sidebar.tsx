import { useState, useRef, useEffect } from 'react';
import { useUIStore, type SidebarPane } from '../../stores/ui-store';
import { useProjectStore } from '../../stores/project-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useTaskStore } from '../../stores/task-store';
import { useMemoryStore } from '../../stores/memory-store';
import { useTabStore } from '../../stores/tab-store';
import { isCompanionMode } from '../../lib/ipc-client';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';
import { SessionList } from './SessionList';
import { SidebarMemoryPane } from './SidebarMemoryPane';
import { SidebarTasksPane } from './SidebarTasksPane';
import { CommandCenter } from '../command-center/CommandCenter';
import { Plus, ExternalLink, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const PANE_LABELS: Record<SidebarPane, string> = {
  sessions: 'Sessions',
  memory: 'Memory',
  tasks: 'Tasks',
};

export default function Sidebar() {
  const { sidebarVisible, sidebarWidth, sidebarPane, setSidebarPane, toggleSidebar, toggleContextPanel, contextPanelVisible, openSettings, toggleTerminal, addTerminalTab, terminalTabs } = useUIStore();
  const { projectPath } = useProjectStore();
  const { developerMode, setDeveloperMode } = useAppSettingsStore();
  const { tasksEnabled, setTasksEnabled, setShowCreateDialog } = useTaskStore();
  const { memoryEnabled, setMemoryEnabled } = useMemoryStore();
  const { addTab, addTasksTab } = useTabStore();
  const { openProjectDialog } = useProjectStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const companion = isCompanionMode();

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          menuButtonRef.current && !menuButtonRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen]);

  const act = (fn: () => void) => {
    fn();
    setMenuOpen(false);
  };

  const handlePaneClick = (pane: SidebarPane) => {
    if (sidebarPane === pane) return;
    setSidebarPane(pane);
  };

  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);

  return (
    <div className="flex flex-row flex-shrink-0">
      {/* Activity bar — always visible */}
      <div className="flex flex-col items-center w-10 flex-shrink-0 bg-bg-surface border-r border-border py-2 gap-1 relative">
        {/* Hamburger menu — companion mode only */}
        {companion && (
          <>
            <Tooltip content="Menu" position="right">
              <button
                ref={menuButtonRef}
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-2 rounded-md transition-colors hover:bg-bg-elevated text-text-secondary"
                aria-label="Menu"
              >
                <Icon name="Menu" className="w-4 h-4" />
              </button>
            </Tooltip>
            {menuOpen && (
              <div
                ref={menuRef}
                className="absolute left-10 top-1 z-50 w-56 bg-bg-elevated border border-border rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-left-1 duration-100"
              >
                <MenuSection label="File">
                  <MenuItem icon="Plus" label="New Conversation" onClick={() => act(() => { if (!addTab()) openProjectDialog(); })} />
                  {activeTabId && (
                    <MenuItem icon="X" label="Close Tab" onClick={() => act(() => closeTab(activeTabId))} />
                  )}
                </MenuSection>
                <MenuDivider />
                <MenuSection label="View">
                  <MenuItem
                    icon="PanelLeft"
                    label={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
                    onClick={() => act(toggleSidebar)}
                  />
                  <MenuItem
                    icon="PanelRight"
                    label={contextPanelVisible ? 'Hide Context Panel' : 'Show Context Panel'}
                    onClick={() => act(toggleContextPanel)}
                  />
                  {developerMode && (
                    <MenuItem
                      icon="Terminal"
                      label="Toggle Terminal"
                      onClick={() => act(() => {
                        if (terminalTabs.length === 0) addTerminalTab();
                        else toggleTerminal();
                      })}
                    />
                  )}
                </MenuSection>
                <MenuDivider />
                <MenuSection label="Help">
                  <MenuItem icon="Book" label="Documentation" onClick={() => act(() => {
                    useTabStore.getState().addDocsTab('index');
                  })} />
                  <MenuItem icon="Keyboard" label="Keyboard Shortcuts" onClick={() => act(() => openSettings('keybindings'))} />
                  <MenuItem icon="Settings" label="Settings" onClick={() => act(() => openSettings())} />
                  <MenuItem icon="Info" label="About Pilot" onClick={() => act(() => useUIStore.getState().openAbout())} />
                </MenuSection>
              </div>
            )}
          </>
        )}

        {/* Sessions */}
        <Tooltip content="Sessions" position="right">
          <button
            className={`p-2 rounded-md transition-colors ${
              sidebarVisible && sidebarPane === 'sessions'
                ? 'bg-accent/15 text-accent'
                : 'hover:bg-bg-elevated text-text-secondary'
            }`}
            onClick={() => {
              if (!sidebarVisible) toggleSidebar();
              handlePaneClick('sessions');
            }}
          >
            <Icon name="MessageSquare" className="w-4 h-4" />
          </button>
        </Tooltip>

        {/* Memory pane */}
        <Tooltip content="Memory" position="right">
          <button
            className={`p-2 rounded-md transition-colors ${
              sidebarVisible && sidebarPane === 'memory'
                ? 'bg-accent/15 text-accent'
                : 'hover:bg-bg-elevated text-text-secondary'
            }`}
            onClick={() => {
              if (!sidebarVisible) toggleSidebar();
              handlePaneClick('memory');
            }}
          >
            <Icon name="Brain" className="w-4 h-4" />
          </button>
        </Tooltip>

        {/* Tasks pane */}
        <Tooltip content="Tasks" position="right">
          <button
            className={`p-2 rounded-md transition-colors ${
              sidebarVisible && sidebarPane === 'tasks'
                ? 'bg-accent/15 text-accent'
                : 'hover:bg-bg-elevated text-text-secondary'
            }`}
            onClick={() => {
              if (!sidebarVisible) toggleSidebar();
              handlePaneClick('tasks');
            }}
          >
            <Icon name="ListTodo" className="w-4 h-4" />
          </button>
        </Tooltip>

        {/* Spacer pushes bottom icons down */}
        <div className="flex-1" />

        {/* Expand / Collapse sidebar */}
        <Tooltip content={sidebarVisible ? 'Collapse sidebar' : 'Expand sidebar'} position="right">
          <button
            className="p-2 hover:bg-bg-elevated rounded-md transition-colors text-text-secondary"
            onClick={toggleSidebar}
          >
            {sidebarVisible ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>
        </Tooltip>

        <Tooltip content={developerMode ? 'Developer Mode (on)' : 'Developer Mode (off)'} position="right">
          <button
            className={`p-2 rounded-md transition-colors ${developerMode ? 'bg-accent/15 text-accent' : 'hover:bg-bg-elevated text-text-secondary'}`}
            onClick={() => setDeveloperMode(!developerMode)}
          >
            <Icon name="Code" className="w-4 h-4" />
          </button>
        </Tooltip>

        <Tooltip content="Settings" position="right">
          <button
            className="p-2 hover:bg-bg-elevated rounded-md transition-colors"
            onClick={() => openSettings()}
          >
            <Icon name="Settings" className="w-4 h-4 text-text-secondary" />
          </button>
        </Tooltip>
      </div>

      {/* Sidebar panel — collapsible */}
      <div
        className="bg-bg-surface border-r border-border transition-[width] duration-200 ease-in-out overflow-hidden flex flex-col"
        style={{ width: sidebarVisible ? `${sidebarWidth - 40}px` : '0' }}
      >
        {/* Header */}
        <div className="h-10 px-3 flex items-center justify-between border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">{PANE_LABELS[sidebarPane]}</h2>
          {/* Pane-specific header actions */}
          {sidebarPane === 'sessions' && (
            <button
              onClick={() => { if (!addTab()) openProjectDialog(); }}
              className="p-1 hover:bg-bg-elevated rounded transition-colors"
              title="New session"
            >
              <Plus className="w-3.5 h-3.5 text-text-secondary" />
            </button>
          )}
          {sidebarPane === 'memory' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-secondary">{memoryEnabled ? 'On' : 'Off'}</span>
              <button
                role="switch"
                aria-checked={memoryEnabled}
                onClick={() => setMemoryEnabled(!memoryEnabled)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0 ${
                  memoryEnabled ? 'bg-accent' : 'bg-border'
                }`}
                title={memoryEnabled ? 'Disable memory' : 'Enable memory'}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                  memoryEnabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                }`} />
              </button>
            </div>
          )}
          {sidebarPane === 'tasks' && (
            <div className="flex items-center gap-1.5">
              {tasksEnabled && projectPath && (
                <>
                  <button
                    onClick={() => setShowCreateDialog(true)}
                    className="p-1 hover:bg-bg-elevated rounded transition-colors"
                    title="New task"
                  >
                    <Plus className="w-3.5 h-3.5 text-text-secondary" />
                  </button>
                  <button
                    onClick={() => addTasksTab(projectPath)}
                    className="p-1 hover:bg-bg-elevated rounded transition-colors"
                    title="Open task board in tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-text-secondary" />
                  </button>
                </>
              )}
              <span className="text-[10px] text-text-secondary">{tasksEnabled ? 'On' : 'Off'}</span>
              <button
                role="switch"
                aria-checked={tasksEnabled}
                onClick={() => setTasksEnabled(!tasksEnabled)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0 ${
                  tasksEnabled ? 'bg-accent' : 'bg-border'
                }`}
                title={tasksEnabled ? 'Disable tasks' : 'Enable tasks'}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
                  tasksEnabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                }`} />
              </button>
            </div>
          )}
        </div>

        {/* Pane content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {sidebarPane === 'sessions' && (
            <>
              <div className="flex-1 overflow-hidden">
                <SessionList />
              </div>
              <CommandCenter />
            </>
          )}
          {sidebarPane === 'memory' && <SidebarMemoryPane />}
          {sidebarPane === 'tasks' && <SidebarTasksPane />}
        </div>
      </div>
    </div>
  );
}

/* Menu helper components for companion hamburger menu */
function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/50">{label}</div>
      {children}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-surface transition-colors text-left"
    >
      <Icon name={icon} className="w-3.5 h-3.5 text-text-secondary" />
      <span className="text-sm text-text-primary flex-1">{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-border" />;
}
