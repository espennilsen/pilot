import { useState } from 'react';
import {
  FolderSearch, Terminal, Copy, Clipboard, Pencil, Trash2,
  FilePlus, FolderPlus, ExternalLink,
} from 'lucide-react';
import type { FileNode } from '../../../shared/types';
import type { DetectedEditor } from '../../hooks/useDetectedEditors';
import type { MenuEntry } from '../shared/ContextMenu';

// ─── Context-menu state (lifted so only one menu shows at a time) ──

export interface MenuState {
  x: number;
  y: number;
  node: FileNode;
}

// ─── Inline input for new file/folder ────────────────────

export function InlineInput({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          onConfirm(value.trim());
        }
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onCancel()}
      className="w-full bg-bg-elevated border border-accent rounded px-2 py-0.5 text-sm text-text-primary outline-none"
    />
  );
}

// ─── Build menu items ────────────────────────────────────

export function buildMenuItems(
  node: FileNode,
  editors: DetectedEditor[],
  projectPath: string | null,
  callbacks: {
    onReveal: () => void;
    onOpenTerminal: () => void;
    onCopyPath: () => void;
    onCopyRelativePath: () => void;
    onCopyName: () => void;
    onRename: () => void;
    onDelete: () => void;
    onNewFile: () => void;
    onNewFolder: () => void;
    onOpenInEditor: (editor: DetectedEditor) => void;
    onOpenAsTab: () => void;
  },
): MenuEntry[] {
  const isDir = node.type === 'directory';
  const items: MenuEntry[] = [];

  // Open as tab (files only)
  if (!isDir) {
    items.push({
      label: 'Open in Tab',
      icon: <ExternalLink className="w-3.5 h-3.5" />,
      action: callbacks.onOpenAsTab,
    });
  }

  // Open in editor(s)
  if (editors.length > 0) {
    for (const editor of editors) {
      items.push({
        label: `Open in ${editor.name}`,
        icon: <ExternalLink className="w-3.5 h-3.5" />,
        action: () => callbacks.onOpenInEditor(editor),
      });
    }
  }

  if (items.length > 0) items.push('separator');

  // OS integration
  items.push({
    label: window.api.platform === 'darwin' ? 'Reveal in Finder' : window.api.platform === 'win32' ? 'Reveal in Explorer' : 'Reveal in File Manager',
    icon: <FolderSearch className="w-3.5 h-3.5" />,
    action: callbacks.onReveal,
  });
  items.push({
    label: 'Open in Terminal',
    icon: <Terminal className="w-3.5 h-3.5" />,
    action: callbacks.onOpenTerminal,
  });

  items.push('separator');

  // Clipboard
  items.push({
    label: 'Copy Path',
    icon: <Clipboard className="w-3.5 h-3.5" />,
    action: callbacks.onCopyPath,
  });
  if (projectPath) {
    items.push({
      label: 'Copy Relative Path',
      icon: <Copy className="w-3.5 h-3.5" />,
      action: callbacks.onCopyRelativePath,
    });
  }
  items.push({
    label: 'Copy Name',
    icon: <Copy className="w-3.5 h-3.5" />,
    action: callbacks.onCopyName,
  });

  items.push('separator');

  // Create (directories only)
  if (isDir) {
    items.push({
      label: 'New File…',
      icon: <FilePlus className="w-3.5 h-3.5" />,
      action: callbacks.onNewFile,
    });
    items.push({
      label: 'New Folder…',
      icon: <FolderPlus className="w-3.5 h-3.5" />,
      action: callbacks.onNewFolder,
    });
    items.push('separator');
  }

  // Rename & Delete
  items.push({
    label: 'Rename…',
    icon: <Pencil className="w-3.5 h-3.5" />,
    action: callbacks.onRename,
    shortcut: '↵',
  });
  items.push({
    label: 'Delete',
    icon: <Trash2 className="w-3.5 h-3.5" />,
    action: callbacks.onDelete,
    danger: true,
  });

  return items;
}
