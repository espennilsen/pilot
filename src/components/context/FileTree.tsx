import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Folder, FolderOpen, File, FileCode, FileText,
  ChevronRight, ChevronDown,
  FolderSearch, Terminal, Copy, Clipboard, Pencil, Trash2,
  FilePlus, FolderPlus, ExternalLink,
} from 'lucide-react';
import type { FileNode } from '../../../shared/types';
import { useProjectStore } from '../../stores/project-store';
import { useTabStore } from '../../stores/tab-store';
import { useDetectedEditors, type DetectedEditor } from '../../hooks/useDetectedEditors';
import { ContextMenu, type MenuEntry } from '../shared/ContextMenu';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';

// ─── File icons ──────────────────────────────────────────

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (['ts', 'tsx', 'js', 'jsx'].includes(ext))
    return <FileCode className="w-4 h-4 text-blue-400" />;
  if (['json', 'yaml', 'yml'].includes(ext))
    return <FileText className="w-4 h-4 text-yellow-400" />;
  if (ext === 'md')
    return <FileText className="w-4 h-4 text-text-secondary" />;
  if (['css', 'scss', 'sass', 'less'].includes(ext))
    return <FileText className="w-4 h-4 text-purple-400" />;

  return <File className="w-4 h-4 text-text-secondary" />;
}

// ─── Context-menu state (lifted so only one menu shows at a time) ──

interface MenuState {
  x: number;
  y: number;
  node: FileNode;
}

// ─── FileTreeNode ────────────────────────────────────────

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  renamingPath: string | null;
  renameValue: string;
  onSelect: (path: string) => void;
  onDoubleClick: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
}

function FileTreeNode({
  node, depth, selectedPath, renamingPath, renameValue,
  onSelect, onDoubleClick, onContextMenu,
  onRenameChange, onRenameConfirm, onRenameCancel,
}: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      // Select the filename without extension
      const name = node.name;
      const dotIndex = name.lastIndexOf('.');
      if (dotIndex > 0 && node.type === 'file') {
        renameInputRef.current.setSelectionRange(0, dotIndex);
      } else {
        renameInputRef.current.select();
      }
    }
  }, [isRenaming, node.name, node.type]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.path);
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick(node);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (node.type === 'file') {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', node.path);
      e.dataTransfer.setData('application/pilot-file', JSON.stringify({ path: node.path, name: node.name }));
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        draggable={node.type === 'file'}
        onDragStart={handleDragStart}
        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-accent/15 text-accent'
            : 'hover:bg-bg-elevated text-text-primary'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.type === 'directory' ? (
          <>
            {isExpanded
              ? <ChevronDown className="w-3 h-3 text-text-secondary flex-shrink-0" />
              : <ChevronRight className="w-3 h-3 text-text-secondary flex-shrink-0" />}
            {isExpanded
              ? <FolderOpen className="w-4 h-4 text-accent flex-shrink-0" />
              : <Folder className="w-4 h-4 text-accent flex-shrink-0" />}
          </>
        ) : (
          <>
            <div className="w-3" />
            {getFileIcon(node.name)}
          </>
        )}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) {
                e.preventDefault();
                onRenameConfirm();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onRenameCancel();
              }
              e.stopPropagation();
            }}
            onBlur={() => onRenameCancel()}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-bg-base border border-accent rounded px-1 py-0 text-sm text-text-primary outline-none"
          />
        ) : (
          <span className="text-sm truncate">{node.name}</span>
        )}
      </div>

      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
              onRenameChange={onRenameChange}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inline input for new file/folder ────────────────────

function InlineInput({
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

function buildMenuItems(
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

// ─── FileTree (root) ─────────────────────────────────────

export default function FileTree() {
  const { fileTree, isLoadingTree, projectPath, loadFileTree } = useProjectStore();
  const { addFileTab } = useTabStore();
  const editors = useDetectedEditors();

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Renaming state — inline in the tree row itself
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Inline creation (new file / new folder — modal overlay)
  const [inlineInput, setInlineInput] = useState<{
    parentPath: string;
    kind: 'file' | 'folder';
  } | null>(null);

  const treeRef = useRef<HTMLDivElement>(null);

  // ── Helpers to find nodes ──────────────────────────────

  const findNodeByPath = useCallback((nodes: FileNode[], path: string): FileNode | null => {
    for (const n of nodes) {
      if (n.path === path) return n;
      if (n.children) {
        const found = findNodeByPath(n.children, path);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // ── Selection ──────────────────────────────────────────

  const handleSelect = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  // ── Double-click opens file as tab ─────────────────────

  const handleDoubleClick = useCallback((node: FileNode) => {
    if (node.type === 'file') {
      addFileTab(node.path, projectPath);
    }
  }, [addFileTab, projectPath]);

  // ── Keyboard: Enter = rename, Delete = delete ──────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Only respond if the file tree is focused (or the tree container is)
      if (!treeRef.current?.contains(document.activeElement) && document.activeElement !== treeRef.current) {
        return;
      }
      if (!selectedPath || renamingPath) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const node = findNodeByPath(fileTree, selectedPath);
        if (node) {
          setRenamingPath(node.path);
          setRenameValue(node.name);
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          const node = findNodeByPath(fileTree, selectedPath);
          if (node) handleDelete(node);
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedPath, renamingPath, fileTree, findNodeByPath]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPath(node.path);
    setMenu({ x: e.clientX, y: e.clientY, node });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  // ── Action callbacks ───────────────────────────────────

  const handleReveal = (path: string) => {
    invoke(IPC.SHELL_REVEAL_IN_FINDER, path);
  };

  const handleOpenTerminal = (path: string) => {
    invoke(IPC.SHELL_OPEN_IN_TERMINAL, path);
  };

  const handleOpenInEditor = (editor: DetectedEditor, path: string) => {
    invoke(IPC.SHELL_OPEN_IN_EDITOR, editor.cli, path);
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
  };

  const handleCopyRelativePath = (path: string) => {
    if (projectPath && path.startsWith(projectPath)) {
      navigator.clipboard.writeText(path.slice(projectPath.length + 1));
    } else {
      navigator.clipboard.writeText(path);
    }
  };

  const handleCopyName = (name: string) => {
    navigator.clipboard.writeText(name);
  };

  const handleDelete = async (node: FileNode) => {
    const label = node.type === 'directory' ? 'folder' : 'file';
    const ok = window.confirm(`Delete ${label} "${node.name}"? This cannot be undone.`);
    if (!ok) return;

    const result = await invoke(IPC.PROJECT_DELETE_PATH, node.path) as { ok?: boolean; error?: string };
    if (result.ok) {
      if (selectedPath === node.path) setSelectedPath(null);
      loadFileTree();
    } else {
      window.alert(`Delete failed: ${result.error}`);
    }
  };

  // ── Inline rename (in the tree row) ────────────────────

  const startRename = useCallback((node: FileNode) => {
    setRenamingPath(node.path);
    setRenameValue(node.name);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    const dir = renamingPath.substring(0, renamingPath.lastIndexOf('/'));
    const newPath = `${dir}/${renameValue.trim()}`;
    if (newPath === renamingPath) {
      setRenamingPath(null);
      return;
    }

    const result = await invoke(IPC.PROJECT_RENAME_PATH, renamingPath, newPath) as { ok?: boolean; error?: string };
    setRenamingPath(null);
    if (result.ok) {
      setSelectedPath(newPath);
      loadFileTree();
    } else {
      window.alert(`Rename failed: ${result.error}`);
    }
  }, [renamingPath, renameValue, loadFileTree]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
  }, []);

  // ── Inline create (new file / folder — modal) ─────────

  const handleCreateConfirm = async (parentPath: string, name: string, kind: 'file' | 'folder') => {
    const fullPath = `${parentPath}/${name}`;
    const channel = kind === 'file' ? IPC.PROJECT_CREATE_FILE : IPC.PROJECT_CREATE_DIRECTORY;
    const result = await invoke(channel, fullPath) as { ok?: boolean; error?: string };
    setInlineInput(null);
    if (result.ok) {
      setSelectedPath(fullPath);
      loadFileTree();
    } else {
      window.alert(`Create failed: ${result.error}`);
    }
  };

  // ── Build menu when open ───────────────────────────────

  const menuItems = menu
    ? buildMenuItems(menu.node, editors, projectPath, {
        onReveal: () => handleReveal(menu.node.path),
        onOpenTerminal: () => handleOpenTerminal(menu.node.path),
        onCopyPath: () => handleCopyPath(menu.node.path),
        onCopyRelativePath: () => handleCopyRelativePath(menu.node.path),
        onCopyName: () => handleCopyName(menu.node.name),
        onRename: () => startRename(menu.node),
        onDelete: () => handleDelete(menu.node),
        onNewFile: () =>
          setInlineInput({ parentPath: menu.node.path, kind: 'file' }),
        onNewFolder: () =>
          setInlineInput({ parentPath: menu.node.path, kind: 'folder' }),
        onOpenInEditor: (editor) => handleOpenInEditor(editor, menu.node.path),
        onOpenAsTab: () => {
          if (menu.node.type === 'file') {
            addFileTab(menu.node.path, projectPath);
          }
        },
      })
    : [];

  // ── Render ─────────────────────────────────────────────

  if (isLoadingTree) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
      </div>
    );
  }

  if (fileTree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">No files found</p>
      </div>
    );
  }

  return (
    <div ref={treeRef} className="overflow-y-auto h-full focus:outline-none" tabIndex={0}>
      {fileTree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          renamingPath={renamingPath}
          renameValue={renameValue}
          onSelect={handleSelect}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onRenameChange={setRenameValue}
          onRenameConfirm={handleRenameConfirm}
          onRenameCancel={handleRenameCancel}
        />
      ))}

      {/* Inline input for new file / new folder (modal) */}
      {inlineInput && (
        <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-24" onClick={() => setInlineInput(null)}>
          <div
            className="bg-bg-elevated border border-border rounded-lg shadow-xl p-3 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-text-secondary mb-2">
              {inlineInput.kind === 'file' ? 'New file name' : 'New folder name'}
            </p>
            <InlineInput
              initial=""
              onConfirm={(name) => handleCreateConfirm(inlineInput.parentPath, name, inlineInput.kind)}
              onCancel={() => setInlineInput(null)}
            />
          </div>
        </div>
      )}

      {/* Context menu */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />}
    </div>
  );
}
