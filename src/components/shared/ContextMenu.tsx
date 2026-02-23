import { useEffect, useRef, type ReactNode } from 'react';

export interface MenuItemDef {
  label: string;
  icon?: ReactNode;
  action?: () => void;
  disabled?: boolean;
  shortcut?: string;
  danger?: boolean;
}

export type MenuEntry = MenuItemDef | 'separator';

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Use capture so we close before anything else handles the click
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${Math.max(4, x - rect.width)}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${Math.max(4, y - rect.height)}px`;
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] py-1 bg-bg-elevated border border-border rounded-lg shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        if (item === 'separator') {
          return <div key={i} className="my-1 border-t border-border" />;
        }

        const { label, icon, action, disabled, shortcut, danger } = item;
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => {
              if (!disabled && action) {
                action();
                onClose();
              }
            }}
            className={`
              w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors
              ${disabled
                ? 'text-text-secondary/50 cursor-default'
                : danger
                  ? 'text-error hover:bg-error/10'
                  : 'text-text-primary hover:bg-bg-surface'
              }
            `}
          >
            {icon && <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">{icon}</span>}
            <span className="flex-1 truncate">{label}</span>
            {shortcut && (
              <span className="text-xs text-text-secondary ml-4 flex-shrink-0">{shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
