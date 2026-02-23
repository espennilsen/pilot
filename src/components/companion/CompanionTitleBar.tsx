import { useState, useRef, useEffect } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { useUIStore } from '../../stores/ui-store';
import { useProjectStore } from '../../stores/project-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { Icon } from '../shared/Icon';
import appIcon from '../../assets/icon-48.png';

/**
 * Companion-mode title bar with a hamburger menu replacing the native app menu.
 * Provides access to all key actions: new tab, settings, panels, etc.
 */
export function CompanionTitleBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { addTab, activeTabId, closeTab } = useTabStore();
  const { toggleSidebar, toggleContextPanel, openSettings, toggleTerminal, addTerminalTab, terminalTabs, sidebarVisible, contextPanelVisible } = useUIStore();
  const { projectPath } = useProjectStore();
  const developerMode = useAppSettingsStore(s => s.developerMode);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
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

  const projectName = projectPath ? projectPath.split('/').pop() : null;

  return (
    <div className="h-[38px] bg-bg-surface border-b border-border flex items-center px-2 select-none relative">
      {/* Hamburger menu button */}
      <button
        ref={buttonRef}
        onClick={() => setMenuOpen(!menuOpen)}
        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg-elevated transition-colors"
        aria-label="Menu"
      >
        <Icon name="Menu" className="w-4 h-4 text-text-secondary" />
      </button>

      {/* Center - app title + project */}
      <div className="flex-1 flex items-center justify-center gap-1.5">
        <img src={appIcon} alt="" className="w-4 h-4" draggable={false} />
        <span className="text-text-secondary text-xs font-medium">Pilot</span>
        {projectName && (
          <>
            <span className="text-text-secondary/40 text-xs">—</span>
            <span className="text-text-primary text-xs font-medium truncate max-w-[200px]">{projectName}</span>
          </>
        )}
      </div>

      {/* Right side - quick actions */}
      <button
        onClick={() => openSettings()}
        className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-bg-elevated transition-colors"
        aria-label="Settings"
      >
        <Icon name="Settings" className="w-4 h-4 text-text-secondary" />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute top-[38px] left-1 z-50 w-56 bg-bg-elevated border border-border rounded-lg shadow-xl py-1 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          <MenuSection label="File">
            <MenuItem icon="Plus" label="New Conversation" onClick={() => act(() => addTab())} />
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
    </div>
  );
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary/50">{label}</div>
      {children}
    </div>
  );
}

function MenuItem({ icon, label, onClick, shortcut }: { icon: string; label: string; onClick: () => void; shortcut?: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 flex items-center gap-2.5 hover:bg-bg-surface transition-colors text-left"
    >
      <Icon name={icon} className="w-3.5 h-3.5 text-text-secondary" />
      <span className="text-sm text-text-primary flex-1">{label}</span>
      {shortcut && <span className="text-xs text-text-secondary/50">{shortcut}</span>}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-border" />;
}
