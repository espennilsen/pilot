import React, { useState } from 'react';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { useTabStore } from '../../stores/tab-store';
import { useProjectStore } from '../../stores/project-store';

/** Handle link clicks — external URLs open in system browser, others are suppressed */
function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string): void {
  e.preventDefault();
  if (/^https?:\/\//.test(href)) {
    window.api.openExternal(href);
  }
  // Relative paths and anchors (#) are intentionally no-ops in the markdown preview
}

export default function ChatLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (/^https?:\/\//.test(href)) {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const menuItems: MenuEntry[] = [
    {
      label: 'Open in Web Tab',
      action: () => {
        const projectPath = useProjectStore.getState().projectPath;
        useTabStore.getState().addWebTab(href, projectPath);
      },
    },
    {
      label: 'Copy Link',
      action: () => {
        navigator.clipboard.writeText(href);
      },
    },
  ];

  return (
    <>
      <a
        href={href}
        className="text-accent hover:underline cursor-pointer"
        onClick={(e) => handleLinkClick(e, href)}
        onContextMenu={handleContextMenu}
      >
        {children}
      </a>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
