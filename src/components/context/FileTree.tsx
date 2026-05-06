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
  // Note: Only include files - directories are inferred from path structure
  // Strip project root to show relative paths
  const paths = useMemo(() => {
    if (!fileTree || fileTree.length === 0 || !projectPath) return [];
    
    const flattenPaths = (nodes: FileNode[], result: string[] = []) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          // Strip project root to get relative path
          const relativePath = node.path.startsWith(projectPath + '/')
            ? node.path.slice(projectPath.length + 1)
            : node.path;
          result.push(relativePath);
        } else if (node.children) {
          flattenPaths(node.children, result);
        }
      }
      return result;
    };
    
    return flattenPaths(fileTree);
  }, [fileTree, projectPath]);

  const { model } = useFileTree({
    paths,
    initialExpansion: 'closed',
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
    // Custom styling to match app theme
    unsafeCSS: `
      :host {
        --trees-bg-override: transparent;
        --trees-fg-override: var(--text-primary);
        --trees-border-color-override: var(--border);
        --trees-selected-bg-override: var(--accent/0.15);
        --trees-selected-fg-override: var(--accent);
        --trees-hover-bg-override: var(--bg-elevated);
        --trees-row-height: 32px;
        --trees-indent: 16px;
        --trees-icon-size: 16px;
        --trees-font-family: inherit;
        --trees-font-size: 14px;
      }
      
      /* Remove default outline */
      [part="tree"] {
        outline: none !important;
      }
      
      /* Style rows */
      button[data-type="item"] {
        padding-left: calc(var(--trees-indent) * var(--depth) + 8px) !important;
        padding-right: 8px !important;
        transition: background-color 0.15s ease;
      }
      
      button[data-type="item"]:hover {
        background-color: var(--trees-hover-bg-override) !important;
      }
      
      button[data-type="item"][data-item-selected] {
        background-color: var(--trees-selected-bg-override) !important;
        color: var(--trees-selected-fg-override) !important;
      }
      
      /* Style chevron icons */
      [part="chevron"] {
        width: 12px;
        height: 12px;
        color: var(--text-secondary);
      }
      
      /* Style file icons */
      [part="icon"] {
        width: var(--trees-icon-size);
        height: var(--trees-icon-size);
      }
      
      /* Style text */
      [part="label"] {
        font-size: var(--trees-font-size);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      /* Search input styling */
      [part="search-input"] {
        background-color: var(--bg-elevated) !important;
        border: 1px solid var(--border) !important;
        border-radius: 6px !important;
        color: var(--text-primary) !important;
        padding: 6px 10px !important;
        font-size: 13px !important;
      }
      
      [part="search-input"]:focus {
        border-color: var(--accent) !important;
        outline: none !important;
      }
      
      /* Search container */
      [part="search"] {
        padding: 8px !important;
        border-bottom: 1px solid var(--border) !important;
      }
    `,
  });

  // ── Action callbacks ───────────────────────────────────

  // Helper to reconstruct full path from relative path
  const toFullPath = useCallback((relativePath: string) => {
    return projectPath ? `${projectPath}/${relativePath}` : relativePath;
  }, [projectPath]);

  const handleReveal = useCallback((relativePath: string) => {
    invoke(IPC.SHELL_REVEAL_IN_FINDER, toFullPath(relativePath));
  }, [toFullPath]);

  const handleOpenTerminal = useCallback((relativePath: string) => {
    invoke(IPC.SHELL_OPEN_IN_TERMINAL, toFullPath(relativePath));
  }, [toFullPath]);

  const handleOpenInEditor = useCallback((editor: DetectedEditor, relativePath: string) => {
    invoke(IPC.SHELL_OPEN_IN_EDITOR, editor.cli, toFullPath(relativePath));
  }, [toFullPath]);

  const handleCopyPath = useCallback((relativePath: string) => {
    navigator.clipboard.writeText(toFullPath(relativePath));
  }, [toFullPath]);

  const handleCopyRelativePath = useCallback((relativePath: string) => {
    navigator.clipboard.writeText(relativePath);
  }, []);

  const handleCopyName = useCallback((name: string) => {
    navigator.clipboard.writeText(name);
  }, []);

  const handleDelete = useCallback(async (relativePath: string, name: string, type: 'file' | 'directory') => {
    const fullPath = toFullPath(relativePath);
    const label = type === 'directory' ? 'folder' : 'file';
    const ok = window.confirm(`Delete ${label} "${name}"? This cannot be undone.`);
    if (!ok) return;

    const result = await invoke(IPC.PROJECT_DELETE_PATH, fullPath) as { ok?: boolean; error?: string };
    if (result.ok) {
      loadFileTree();
    } else {
      window.alert(`Delete failed: ${result.error}`);
    }
  }, [toFullPath, loadFileTree]);

  const handleRename = useCallback(async (oldRelativePath: string, newName: string) => {
    const oldFullPath = toFullPath(oldRelativePath);
    const dir = oldFullPath.substring(0, oldFullPath.lastIndexOf('/'));
    const newFullPath = `${dir}/${newName}`;
    
    if (newFullPath === oldFullPath) return true;

    const result = await invoke(IPC.PROJECT_RENAME_PATH, oldFullPath, newFullPath) as { ok?: boolean; error?: string };
    if (result.ok) {
      loadFileTree();
      return true;
    } else {
      window.alert(`Rename failed: ${result.error}`);
      return false;
    }
  }, [toFullPath, loadFileTree]);

  const handleCreate = useCallback(async (parentRelativePath: string, name: string, kind: 'file' | 'folder') => {
    const fullParentPath = toFullPath(parentRelativePath);
    const fullPath = `${fullParentPath}/${name}`;
    const channel = kind === 'file' ? IPC.PROJECT_CREATE_FILE : IPC.PROJECT_CREATE_DIRECTORY;
    const result = await invoke(channel, fullPath) as { ok?: boolean; error?: string };
    if (result.ok) {
      loadFileTree();
      return true;
    } else {
      window.alert(`Create failed: ${result.error}`);
      return false;
    }
  }, [toFullPath, loadFileTree]);

  const handleDoubleClick = useCallback((relativePath: string, type: 'file' | 'directory') => {
    if (type === 'file') {
      addFileTab(toFullPath(relativePath), projectPath);
    }
  }, [addFileTab, toFullPath, projectPath]);

  // ── Build menu items ───────────────────────────────────

  const buildContextMenu = useCallback((item: any, context: any) => {
    // item.path is relative, need to find the node with full path
    const fullPath = toFullPath(item.path);
    const node = findNodeByPath(fileTree, fullPath);
    if (!node) return null;
    
    const menuItemsBuilt = buildMenuItems(node, editors, projectPath, {
      onReveal: () => handleReveal(item.path),
      onOpenTerminal: () => handleOpenTerminal(item.path),
      onCopyPath: () => handleCopyPath(item.path),
      onCopyRelativePath: () => handleCopyRelativePath(item.path),
      onCopyName: () => handleCopyName(node.name),
      onRename: () => {
        model.startRename(item.path);
      },
      onDelete: () => handleDelete(item.path, node.name, node.type),
      onNewFile: () =>
        setInlineInput({ parentPath: item.path, kind: 'file' }),
      onNewFolder: () =>
        setInlineInput({ parentPath: item.path, kind: 'folder' }),
      onOpenInEditor: (editor) => handleOpenInEditor(editor, item.path),
      onOpenAsTab: () => {
        if (node.type === 'file') {
          addFileTab(fullPath, projectPath);
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
  }, [fileTree, editors, projectPath, toFullPath, handleReveal, handleOpenTerminal, handleCopyPath, handleCopyRelativePath, handleCopyName, handleDelete, handleCreate, addFileTab]);

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
