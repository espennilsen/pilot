import { useRef, useState, useEffect, useMemo } from 'react';
import { useTabStore, type TabGroup } from '../../stores/tab-store';
import { useProjectStore } from '../../stores/project-store';
import { useChatStore } from '../../stores/chat-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';
import { ContextMenu, type MenuEntry } from '../shared/ContextMenu';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcut';
import { shortcutLabel } from '../../lib/keybindings';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';

type ProjectStatus = 'idle' | 'empty' | 'streaming' | 'pending' | 'error';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  idle: 'bg-success',
  empty: 'bg-text-secondary/40',
  streaming: 'bg-warning',
  pending: 'bg-warning',
  error: 'bg-error',
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  idle: 'Ready',
  empty: 'No chats',
  streaming: 'Working…',
  pending: 'Pending review',
  error: 'Error',
};

/**
 * Derive aggregate project status from stores — no per-render subscriptions.
 * Reads current state once, computes a status string. Called inside components
 * that already re-render on relevant store changes (tab list, streaming flags).
 */
function deriveProjectStatus(projectPath: string | null): ProjectStatus {
  const { tabs } = useTabStore.getState();
  const chatTabIds = tabs
    .filter(t => t.projectPath === projectPath && t.type === 'chat')
    .map(t => t.id);

  const { streamingByTab, messagesByTab } = useChatStore.getState();
  if (chatTabIds.some(id => !!streamingByTab[id])) return 'streaming';

  const { getPendingDiffs } = useSandboxStore.getState();
  if (chatTabIds.some(id => getPendingDiffs(id).length > 0)) return 'pending';

  for (const id of chatTabIds) {
    const msgs = messagesByTab[id];
    if (msgs && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      if (last.isError) return 'error';
      if (last.role === 'assistant' && last.toolCalls?.some(tc => tc.status === 'error')) return 'error';
    }
  }

  if (chatTabIds.length === 0) return 'empty';
  if (chatTabIds.every(id => { const m = messagesByTab[id]; return !m || m.length === 0; })) return 'empty';

  return 'idle';
}

/**
 * Hook that subscribes to the minimal set of Zustand selectors with stable values
 * so React's sync-external-store comparison doesn't loop.
 */
function useProjectStatus(projectPath: string | null): ProjectStatus {
  // Subscribe to tab list changes (stable array ref from Zustand shallow)
  const tabVersion = useTabStore(s => s.tabs.length);
  // Subscribe to streaming map changes
  const streamingKeys = useChatStore(s => Object.keys(s.streamingByTab).sort().join(','));
  // Subscribe to pending diffs existence (compact string for shallow compare)
  const pendingSig = useSandboxStore(s => {
    const ids = useTabStore.getState().tabs
      .filter(t => t.projectPath === projectPath && t.type === 'chat')
      .map(t => t.id);
    return ids.map(id => `${id}:${s.getPendingDiffs(id).length}`).join(',');
  });

  // Recompute only when any of the subscriptions fire
  return useMemo(
    () => deriveProjectStatus(projectPath),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectPath, tabVersion, streamingKeys, pendingSig]
  );
}

export function TabBar() {
  const { tabs, activeTabId, addTab, closeTab, reopenClosedTab, switchTab } = useTabStore();
  const { openProjectDialog } = useProjectStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // getGroupedTabs reads from store state, so call via getState() inside the memo
  // to avoid an unstable function reference in the dependency array.
  const groups = useMemo(
    () => useTabStore.getState().getGroupedTabs(),
    [tabs] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeProjectPath = activeTab?.projectPath ?? null;

  const switchToProjectByIndex = (index: number) => {
    if (index >= 0 && index < groups.length) {
      const group = groups[index];
      const projectTabs = tabs
        .filter(t => t.projectPath === group.projectPath)
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      if (projectTabs.length > 0) {
        switchTab(projectTabs[0].id);
      }
    }
  };

  const nextProject = () => {
    const currentIndex = groups.findIndex(g => g.projectPath === activeProjectPath);
    if (groups.length === 0) return;
    if (currentIndex !== -1) {
      switchToProjectByIndex((currentIndex + 1) % groups.length);
    } else if (groups.length > 0) {
      switchToProjectByIndex(0);
    }
  };

  const prevProject = () => {
    const currentIndex = groups.findIndex(g => g.projectPath === activeProjectPath);
    if (groups.length === 0) return;
    if (currentIndex !== -1) {
      switchToProjectByIndex((currentIndex - 1 + groups.length) % groups.length);
    } else if (groups.length > 0) {
      switchToProjectByIndex(0);
    }
  };

  useKeyboardShortcuts([
    {
      key: 't',
      modifiers: ['meta'],
      action: () => { if (!addTab()) openProjectDialog(); },
    },
    {
      key: 'w',
      modifiers: ['meta'],
      action: () => {
        if (activeTabId) closeTab(activeTabId);
      },
    },
    {
      key: 't',
      modifiers: ['meta', 'shift'],
      action: () => reopenClosedTab(),
    },
    {
      key: ']',
      modifiers: ['meta', 'shift'],
      action: () => nextProject(),
    },
    {
      key: '[',
      modifiers: ['meta', 'shift'],
      action: () => prevProject(),
    },
    {
      key: 'Tab',
      modifiers: ['ctrl'],
      action: () => nextProject(),
    },
    {
      key: 'Tab',
      modifiers: ['ctrl', 'shift'],
      action: () => prevProject(),
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      modifiers: ['meta'] as const,
      action: () => switchToProjectByIndex(i),
    })),
  ]);

  // Check scroll overflow
  useEffect(() => {
    const checkOverflow = () => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const isOverflowing = container.scrollWidth > container.clientWidth;
      const isScrolledRight = container.scrollLeft > 0;
      const isScrolledLeft = container.scrollLeft < container.scrollWidth - container.clientWidth - 1;
      setShowLeftArrow(isOverflowing && isScrolledRight);
      setShowRightArrow(isOverflowing && isScrolledLeft);
    };

    checkOverflow();
    const container = scrollContainerRef.current;
    container?.addEventListener('scroll', checkOverflow);
    window.addEventListener('resize', checkOverflow);
    return () => {
      container?.removeEventListener('scroll', checkOverflow);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [groups]);

  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  };

  const handleProjectClick = (projectPath: string | null) => {
    const projectTabs = tabs
      .filter(t => t.projectPath === projectPath)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    if (projectTabs.length > 0) {
      switchTab(projectTabs[0].id);
    }
  };

  const handleCloseProject = (projectPath: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    tabs.filter(t => t.projectPath === projectPath).forEach(t => closeTab(t.id));
  };

  return (
    <div className="h-9 bg-bg-base border-b border-border flex items-center relative select-none">
      {showLeftArrow && (
        <button
          onClick={scrollLeft}
          className="absolute left-0 z-10 w-8 h-full bg-gradient-to-r from-bg-base to-transparent flex items-center justify-start pl-1 hover:from-bg-surface transition-colors"
          aria-label="Scroll left"
        >
          <Icon name="ChevronLeft" size={16} className="text-text-secondary" />
        </button>
      )}

      <div
        ref={scrollContainerRef}
        className="flex-1 flex overflow-x-auto overflow-y-hidden scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {groups.map(group => (
          <ProjectPill
            key={group.projectPath || 'general'}
            group={group}
            isActive={group.projectPath === activeProjectPath}
            onClick={() => handleProjectClick(group.projectPath)}
            onClose={(e) => handleCloseProject(group.projectPath, e)}
          />
        ))}
      </div>

      {showRightArrow && (
        <button
          onClick={scrollRight}
          className="absolute right-12 z-10 w-8 h-full bg-gradient-to-l from-bg-base to-transparent flex items-center justify-end pr-1 hover:from-bg-surface transition-colors"
          aria-label="Scroll right"
        >
          <Icon name="ChevronRight" size={16} className="text-text-secondary" />
        </button>
      )}

      <Tooltip content="Open Project" position="bottom">
        <button
          onClick={() => openProjectDialog()}
          className="w-10 h-full flex items-center justify-center border-l border-border hover:bg-bg-surface transition-colors"
          aria-label="Open Project"
        >
          <Icon name="Plus" size={16} className="text-text-secondary" />
        </button>
      </Tooltip>
    </div>
  );
}

interface ProjectPillProps {
  group: TabGroup;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function ProjectPill({ group, isActive, onClick, onClose }: ProjectPillProps) {
  const status = useProjectStatus(group.projectPath);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const chatCount = group.tabs.filter(t => t.type === 'chat').length;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const menuItems: MenuEntry[] = [
    {
      label: 'Close All Tabs',
      icon: <Icon name="X" size={14} />,
      action: () => group.tabs.forEach(t => useTabStore.getState().closeTab(t.id)),
    },
    {
      label: 'Close Other Projects',
      action: () => {
        const { tabs, closeTab } = useTabStore.getState();
        tabs.filter(t => t.projectPath !== group.projectPath).forEach(t => closeTab(t.id));
      },
    },
    'separator',
    {
      label: window.api.platform === 'darwin' ? 'Reveal in Finder' : window.api.platform === 'win32' ? 'Reveal in Explorer' : 'Reveal in File Manager',
      icon: <Icon name="FolderSearch" size={14} />,
      action: () => {
        if (group.projectPath) invoke(IPC.SHELL_REVEAL_IN_FINDER, group.projectPath);
      },
      disabled: !group.projectPath,
    },
    {
      label: 'Copy Path',
      icon: <Icon name="Clipboard" size={14} />,
      action: () => {
        if (group.projectPath) navigator.clipboard.writeText(group.projectPath).catch(() => {});
      },
      disabled: !group.projectPath,
    },
  ];

  const tooltipContent = (
    <div className="text-xs space-y-1">
      <div className="font-medium">{group.projectName}</div>
      {group.projectPath && (
        <div className="text-text-secondary">{group.projectPath}</div>
      )}
      <div className="text-text-secondary">
        Status: {STATUS_LABELS[status]}
      </div>
      {chatCount > 0 && (
        <div className="text-text-secondary">
          {chatCount} chat{chatCount !== 1 ? 's' : ''} open
        </div>
      )}
    </div>
  );

  return (
    <>
      <Tooltip content={tooltipContent} position="bottom">
        <div
          onClick={onClick}
          onContextMenu={handleContextMenu}
          className={`
            h-9 px-3 flex items-center gap-1.5 cursor-pointer
            border-b-2 transition-colors select-none group
            ${isActive
              ? 'bg-bg-surface border-accent text-text-primary'
              : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-surface/50'
            }
          `}
        >
          <Icon name="Folder" size={14} style={{ color: group.color }} className="flex-shrink-0" />
          <span className="text-sm whitespace-nowrap">{group.projectName}</span>
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[status]} ${
              status === 'streaming' ? 'animate-pulse' : ''
            }`}
            title={STATUS_LABELS[status]}
          />
          <button
            onClick={onClose}
            className={`
              flex-shrink-0 w-4 h-4 flex items-center justify-center rounded
              hover:bg-bg-elevated transition-opacity
              ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            `}
            aria-label="Close project"
          >
            <Icon name="X" size={12} />
          </button>
        </div>
      </Tooltip>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  );
}