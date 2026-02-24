import { useState, useCallback, useRef, useEffect } from 'react';
import type { FileNode } from '../../../shared/types';
import { useProjectStore } from '../../stores/project-store';
import { useTabStore } from '../../stores/tab-store';
import { useDetectedEditors, type DetectedEditor } from '../../hooks/useDetectedEditors';
import { ContextMenu } from '../shared/ContextMenu';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import FileTreeNode from './FileTreeNode';
import { type MenuState, InlineInput, buildMenuItems } from './file-tree-helpers';

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
