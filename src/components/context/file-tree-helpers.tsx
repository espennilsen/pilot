import type { FileNode } from '../../../shared/types';
import type { DetectedEditor } from '../../hooks/useDetectedEditors';
import type { MenuEntry } from '../shared/ContextMenu';

// ─── Context-menu state (lifted so only one menu shows at a time) ──

export interface MenuState {
  x: number;
  y: number;
  node: FileNode;
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
      icon: null,
      action: callbacks.onOpenAsTab,
    });
  }

  // Open in editor(s)
  if (editors.length > 0) {
    for (const editor of editors) {
      items.push({
        label: `Open in ${editor.name}`,
        icon: null,
        action: () => callbacks.onOpenInEditor(editor),
      });
    }
  }

  if (items.length > 0) items.push('separator');

  // OS integration
  items.push({
    label: window.api.platform === 'darwin' ? 'Reveal in Finder' : window.api.platform === 'win32' ? 'Reveal in Explorer' : 'Reveal in File Manager',
    icon: null,
    action: callbacks.onReveal,
  });
  items.push({
    label: 'Open in Terminal',
    icon: null,
    action: callbacks.onOpenTerminal,
  });

  items.push('separator');

  // Clipboard
  items.push({
    label: 'Copy Path',
    icon: null,
    action: callbacks.onCopyPath,
  });
  if (projectPath) {
    items.push({
      label: 'Copy Relative Path',
      icon: null,
      action: callbacks.onCopyRelativePath,
    });
  }
  items.push({
    label: 'Copy Name',
    icon: null,
    action: callbacks.onCopyName,
  });

  items.push('separator');

  // Create (directories only)
  if (isDir) {
    items.push({
      label: 'New File…',
      icon: null,
      action: callbacks.onNewFile,
    });
    items.push({
      label: 'New Folder…',
      icon: null,
      action: callbacks.onNewFolder,
    });
    items.push('separator');
  }

  // Rename & Delete
  items.push({
    label: 'Rename…',
    icon: null,
    action: callbacks.onRename,
    shortcut: '↵',
  });
  items.push({
    label: 'Delete',
    icon: null,
    action: callbacks.onDelete,
    danger: true,
  });

  return items;
}
