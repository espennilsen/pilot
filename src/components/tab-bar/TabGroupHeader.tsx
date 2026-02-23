import { useState } from 'react';
import { Icon } from '../shared/Icon';
import { ContextMenu, type MenuEntry } from '../shared/ContextMenu';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';

interface TabGroupHeaderProps {
  projectName: string;
  projectPath: string | null;
  color: string;
  isCollapsed: boolean;
  tabCount: number;
  onToggleCollapse: () => void;
  onCloseAll: () => void;
}

export function TabGroupHeader({
  projectName,
  projectPath,
  color,
  isCollapsed,
  tabCount,
  onToggleCollapse,
  onCloseAll,
}: TabGroupHeaderProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const menuItems: MenuEntry[] = [
    {
      label: 'Close All Tabs',
      icon: <Icon name="X" size={14} />,
      action: onCloseAll,
    },
    'separator',
    {
      label: window.api.platform === 'darwin' ? 'Reveal in Finder' : 'Reveal in Explorer',
      icon: <Icon name="FolderSearch" size={14} />,
      action: () => {
        if (projectPath) {
          invoke(IPC.SHELL_REVEAL_IN_FINDER, projectPath);
        }
      },
      disabled: !projectPath,
    },
    {
      label: 'Copy Path',
      icon: <Icon name="Clipboard" size={14} />,
      action: () => {
        if (projectPath) navigator.clipboard.writeText(projectPath);
      },
      disabled: !projectPath,
    },
  ];

  return (
    <>
      <div
        className="h-full px-2 flex items-center gap-1.5 cursor-pointer select-none hover:bg-bg-surface/30 transition-colors border-l-2"
        style={{ borderColor: color }}
        onClick={onToggleCollapse}
        onContextMenu={handleContextMenu}
      >
        <Icon
          name={isCollapsed ? 'ChevronRight' : 'ChevronDown'}
          size={10}
          className="text-text-secondary"
        />
        <Icon name="Folder" size={12} style={{ color }} />
        <span className="text-xs text-text-secondary font-medium whitespace-nowrap">{projectName}</span>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
