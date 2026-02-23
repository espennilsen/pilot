import { useState } from 'react';
import { Icon } from '../shared/Icon';
import { ContextMenu, type MenuEntry } from '../shared/ContextMenu';
import { relativeTime, truncate } from '../../lib/utils';
import { SessionBranchIndicator } from './SessionBranchIndicator';
import type { SessionInfo } from '../../stores/session-store';

interface SessionItemProps {
  session: SessionInfo;
  isActive: boolean;
  onSelect: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onArchive: () => void;
  onDelete?: () => void;
}

export function SessionItem({
  session,
  isActive,
  onSelect,
  onPin,
  onUnpin,
  onArchive,
  onDelete,
}: SessionItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const menuItems: MenuEntry[] = [
    session.isPinned
      ? { label: 'Unpin', icon: <Icon name="PinOff" size={14} />, action: onUnpin }
      : { label: 'Pin', icon: <Icon name="Pin" size={14} />, action: onPin },
    {
      label: 'Archive',
      icon: <Icon name="Archive" size={14} />,
      action: onArchive,
    },
    'separator',
    {
      label: 'Delete',
      icon: <Icon name="Trash2" size={14} />,
      action: onDelete ?? (() => {}),
      danger: true,
      disabled: !onDelete,
    },
  ];

  return (
    <>
      <div
        className={`
          flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors
          ${isActive ? 'bg-accent/10 border-l-2 border-accent' : 'hover:bg-bg-elevated'}
        `}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Icon name="MessageSquare" className="w-4 h-4 text-text-secondary flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary truncate">
            {truncate(session.title, 30)}
          </div>
          <div className="text-xs text-text-secondary">
            {relativeTime(session.lastActive)}
            {session.messageCount > 0 && ` · ${session.messageCount} msgs`}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <SessionBranchIndicator branchCount={1} />

          {(session.isPinned || isHovered) && (
            <button
              className={`
                p-1 rounded-sm transition-colors
                ${session.isPinned ? 'text-accent' : 'text-text-secondary hover:text-text-primary'}
              `}
              onClick={(e) => {
                e.stopPropagation();
                session.isPinned ? onUnpin() : onPin();
              }}
              title={session.isPinned ? 'Unpin session' : 'Pin session'}
            >
              <Icon name="Pin" className="w-3.5 h-3.5" />
            </button>
          )}

          {isHovered && !session.isPinned && (
            <button
              className="p-1 rounded-sm text-text-secondary hover:text-text-primary transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              title="Archive session"
            >
              <Icon name="Archive" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
