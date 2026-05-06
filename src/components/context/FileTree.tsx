import { useCallback, useRef, useState, useMemo } from 'react';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import type { FileNode } from '../../../shared/types';
import { useProjectStore } from '../../stores/project-store';
import { useTabStore } from '../../stores/tab-store';
import { useDetectedEditors, type DetectedEditor } from '../../hooks/useDetectedEditors';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import { type MenuState, buildMenuItems } from './file-tree-helpers';

// ─── FileTree (root) ─────────────────────────────────────

export default function FileTree() {
  const { fileTree, isLoadingTree, projectPath, loadFileTree } = useProjectStore();
  const { addFileTab } = useTabStore();
  const editors = useDetectedEditors();

  const [menu, setMenu] = useState<MenuState | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  // Inline creation (new file / new folder — modal overlay)
  const [inlineInput, setInlineInput] = useState<{
    parentPath: string;
    kind: 'file' | 'folder';
  } | null>(null);

  // Convert FileNode[] to flat path array for @pierre/trees
  const paths = useMemo(() => {
    if (!fileTree || fileTree.length === 0) return [];
    
    const flattenPaths = (nodes: FileNode[], result: string[] = []) => {
      for (const node of nodes) {
        result.push(node.path);
        if (node.type === 'directory' && node.children) {
          flattenPaths(node.children, result);
        }
      }
      return result;
    };
    
    return flattenPaths(fileTree);
  }, [fileTree]);

  const { model } = useFileTree({
    paths,
    initialExpansion: 'open',
    search: true,
    flattenEmptyDirectories: false,
    icons: {
      // Use built-in icon set with custom colors
      set: 'standard',
      colored: true,
      // Custom icon remapping by extension
      byFileExtension: {
        ts: { name: 'typescript', viewBox: '0 0 24 24' },
        tsx: { name: 'typescript', viewBox: '0 0 24 24' },
        js: { name: 'javascript', viewBox: '0 0 24 24' },
        jsx: { name: 'javascript', viewBox: '0 0 24 24' },
        json: { name: 'json', viewBox: '0 0 24 24' },
        yaml: { name: 'yaml', viewBox: '0 0 24 24' },
        yml: { name: 'yaml', viewBox: '0 0 24 24' },
        md: { name: 'markdown', viewBox: '0 0 24 24' },
        css: { name: 'css', viewBox: '0 0 24 24' },
        scss: { name: 'scss', viewBox: '0 0 24 24' },
        sass: { name: 'scss', viewBox: '0 0 24 24' },
        less: { name: 'less', viewBox: '0 0 24 24' },
      },
    },
  });

  // ── Action callbacks ───────────────────────────────────

  const handleReveal = useCallback((path: string) => {
    invoke(IPC.SHELL_REVEAL_IN_FINDER, path);
  }, []);

  const handleOpenTerminal = useCallback((path: string) => {
    invoke(IPC.SHELL_OPEN_IN_TERMINAL, path);
  }, []);

  const handleOpenInEditor = useCallback((editor: DetectedEditor, path: string) => {
    invoke(IPC.SHELL_OPEN_IN_EDITOR, editor.cli, path);
  }, []);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
  }, []);

  const handleCopyRelativePath = useCallback((path: string) => {
    if (projectPath && path.startsWith(projectPath)) {
      navigator.clipboard.writeText(path.slice(projectPath.length + 1));
    } else {
      navigator.clipboard.writeText(path);
    }
  }, [projectPath]);

  const handleCopyName = useCallback((name: string) => {
    navigator.clipboard.writeText(name);
  }, []);

  const handleDelete = useCallback(async (path: string, name: string, type: 'file' | 'directory') => {
    const label = type === 'directory' ? 'folder' : 'file';
    const ok = window.confirm(`Delete ${label} "${name}"? This cannot be undone.`);
    if (!ok) return;

    const result = await invoke(IPC.PROJECT_DELETE_PATH, path) as { ok?: boolean; error?: string };
    if (result.ok) {
      loadFileTree();
    } else {
      window.alert(`Delete failed: ${result.error}`);
    }
  }, [loadFileTree]);

  const handleRename = useCallback(async (oldPath: string, newName: string) => {
    const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${dir}/${newName}`;
    
    if (newPath === oldPath) return true;

    const result = await invoke(IPC.PROJECT_RENAME_PATH, oldPath, newPath) as { ok?: boolean; error?: string };
    if (result.ok) {
      loadFileTree();
      return true;
    } else {
      window.alert(`Rename failed: ${result.error}`);
      return false;
    }
  }, [loadFileTree]);

  const handleCreate = useCallback(async (parentPath: string, name: string, kind: 'file' | 'folder') => {
    const fullPath = `${parentPath}/${name}`;
    const channel = kind === 'file' ? IPC.PROJECT_CREATE_FILE : IPC.PROJECT_CREATE_DIRECTORY;
    const result = await invoke(channel, fullPath) as { ok?: boolean; error?: string };
    if (result.ok) {
      loadFileTree();
      return true;
    } else {
      window.alert(`Create failed: ${result.error}`);
      return false;
    }
  }, [loadFileTree]);

  const handleDoubleClick = useCallback((path: string, type: 'file' | 'directory') => {
    if (type === 'file') {
      addFileTab(path, projectPath);
    }
  }, [addFileTab, projectPath]);

  // ── Build menu items ───────────────────────────────────

  const buildContextMenu = useCallback((item: any, context: any) => {
    const node = findNodeByPath(fileTree, item.path);
    if (!node) return null;
    
    const menuItemsBuilt = buildMenuItems(node, editors, projectPath, {
      onReveal: () => handleReveal(node.path),
      onOpenTerminal: () => handleOpenTerminal(node.path),
      onCopyPath: () => handleCopyPath(node.path),
      onCopyRelativePath: () => handleCopyRelativePath(node.path),
      onCopyName: () => handleCopyName(node.name),
      onRename: () => {
        model.startRename(item.path);
      },
      onDelete: () => handleDelete(node.path, node.name, node.type),
      onNewFile: () =>
        setInlineInput({ parentPath: node.path, kind: 'file' }),
      onNewFolder: () =>
        setInlineInput({ parentPath: node.path, kind: 'folder' }),
      onOpenInEditor: (editor) => handleOpenInEditor(editor, node.path),
      onOpenAsTab: () => {
        if (node.type === 'file') {
          addFileTab(node.path, projectPath);
        }
      },
    });
    
    // Create menu element
    const menuEl = document.createElement('div');
    menuEl.className = 'bg-bg-elevated border border-border rounded-lg shadow-xl py-1 min-w-[200px] z-50';
    menuEl.setAttribute('data-file-tree-context-menu-root', 'true');
    
    menuItemsBuilt.forEach((entry, idx) => {
      if (entry === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'my-1 border-t border-border';
        menuEl.appendChild(sep);
        return;
      }
      
      const itemEl = document.createElement('div');
      itemEl.className = `px-3 py-1.5 text-sm cursor-pointer flex items-center gap-2 ${
        entry.danger ? 'text-red-500 hover:bg-red-500/10' : 'hover:bg-bg-hover'
      }`;
      
      // Create icon container
      const iconContainer = document.createElement('span');
      iconContainer.style.display = 'flex';
      iconContainer.style.alignItems = 'center';
      iconContainer.style.justifyContent = 'center';
      iconContainer.style.width = '14px';
      iconContainer.style.height = '14px';
      
      if (entry.icon) {
        // Clone the icon into the container
        const iconClone = (entry.icon as React.ReactElement).type as any;
        // For lucide icons, we need to render them differently
        iconContainer.textContent = entry.label.split(' ')[0];
      }
      
      const labelEl = document.createElement('span');
      labelEl.textContent = entry.label;
      
      itemEl.appendChild(iconContainer);
      itemEl.appendChild(labelEl);
      
      itemEl.addEventListener('click', () => {
        entry.action();
        context.close();
      });
      
      menuEl.appendChild(itemEl);
    });
    
    return menuEl;
  }, [fileTree, editors, projectPath, handleReveal, handleOpenTerminal, handleCopyPath, handleCopyRelativePath, handleCopyName, handleDelete, handleCreate, addFileTab]);

  // ── Render ─────────────────────────────────────────────

  if (isLoadingTree) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
      </div>
    );
  }

  if (paths.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-text-secondary">No files found</p>
      </div>
    );
  }

  return (
    <div ref={treeRef} className="h-full">
      <PierreFileTree
        model={model}
        style={{ height: '100%' }}
        composition={{
          contextMenu: {
            enabled: true,
            triggerMode: 'right-click',
            render: buildContextMenu,
          },
        }}
        onItemActivate={(item) => {
          handleDoubleClick(item.path, item.kind as 'file' | 'directory');
        }}
      />

      {/* Inline input for new file / new folder (modal) */}
      {inlineInput && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-24" onClick={() => setInlineInput(null)}>
          <div
            className="bg-bg-elevated border border-border rounded-lg shadow-xl p-3 w-72"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs text-text-secondary mb-2">
              {inlineInput.kind === 'file' ? 'New file name' : 'New folder name'}
            </p>
            <input
              autoFocus
              defaultValue=""
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  handleCreate(inlineInput.parentPath, e.currentTarget.value.trim(), inlineInput.kind);
                }
                if (e.key === 'Escape') setInlineInput(null);
              }}
              onBlur={() => setInlineInput(null)}
              className="w-full bg-bg-elevated border border-accent rounded px-2 py-0.5 text-sm text-text-primary outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper to find node by path ─────────────────────────

function findNodeByPath(nodes: FileNode[], path: string): FileNode | null {
  if (!nodes) return null;
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const found = findNodeByPath(n.children, path);
      if (found) return found;
    }
  }
  return null;
}
