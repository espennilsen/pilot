import { useCallback, useRef, useState, useMemo, useEffect, KeyboardEvent } from 'react';
import { FileTree as PierreFileTree, useFileTree, useFileTreeSelection, useFileTreeSearch } from '@pierre/trees/react';
import { preparePresortedFileTreeInput } from '@pierre/trees';
import type { FileNode } from '../../../shared/types';
import { useProjectStore } from '../../stores/project-store';
import { useTabStore } from '../../stores/tab-store';
import { useUIStore } from '../../stores/ui-store';
import { useGitStore } from '../../stores/git-store';
import { useDetectedEditors, type DetectedEditor } from '../../hooks/useDetectedEditors';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import { type MenuState, buildMenuItems } from './file-tree-helpers';

// ─── FileTree (root) ─────────────────────────────────────

export default function FileTree() {
  const { fileTree, isLoadingTree, projectPath, loadFileTree, setExpandedPaths, setSelectedPath } = useProjectStore();
  const { addFileTab } = useTabStore();
  const { contextPanelTab } = useUIStore();
  const { status } = useGitStore();
  const editors = useDetectedEditors();

  const [menu, setMenu] = useState<MenuState | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const saveStateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Inline creation (new file / new folder — modal overlay)
  const [inlineInput, setInlineInput] = useState<{
    parentPath: string;
    kind: 'file' | 'folder';
  } | null>(null);

  // Convert FileNode[] to flat path array for @pierre/trees
  const paths = useMemo(() => {
    if (!fileTree || fileTree.length === 0 || !projectPath) return [];
    
    const flattenPaths = (nodes: FileNode[], result: string[] = []) => {
      for (const node of nodes) {
        if (node.type === 'file') {
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

  // Prepare optimized input for large tree handling
  const preparedInput = useMemo(() => {
    return preparePresortedFileTreeInput(paths);
  }, [paths]);

  // Build git status entries for the tree
  const gitStatusEntries = useMemo(() => {
    if (!projectPath || !status) return [];
    
    const entries: Array<{ path: string; status: 'M' | 'A' | 'D' | 'U' | 'R' }> = [];
    
    // Modified files
    if (status.modified) {
      for (const file of status.modified) {
        const relativePath = file.startsWith(projectPath + '/') 
          ? file.slice(projectPath.length + 1) 
          : file;
        entries.push({ path: relativePath, status: 'M' });
      }
    }
    
    // Added files
    if (status.added) {
      for (const file of status.added) {
        const relativePath = file.startsWith(projectPath + '/') 
          ? file.slice(projectPath.length + 1) 
          : file;
        entries.push({ path: relativePath, status: 'A' });
      }
    }
    
    // Deleted files
    if (status.deleted) {
      for (const file of status.deleted) {
        const relativePath = file.startsWith(projectPath + '/') 
          ? file.slice(projectPath.length + 1) 
          : file;
        entries.push({ path: relativePath, status: 'D' });
      }
    }
    
    // Untracked files
    if (status.untracked) {
      for (const file of status.untracked) {
        const relativePath = file.startsWith(projectPath + '/') 
          ? file.slice(projectPath.length + 1) 
          : file;
        entries.push({ path: relativePath, status: 'U' });
      }
    }
    
    return entries;
  }, [status, projectPath]);

  // ── Action callbacks ───────────────────────────────────

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

  const handleDragDrop = useCallback(async (draggedPaths: readonly string[], target: { path: string; kind: 'directory' | 'root' }, dropType: 'into' | 'before' | 'after') => {
    if (!projectPath) return;
    
    const targetPath = target.path;
    
    for (const draggedPath of draggedPaths) {
      const fullDraggedPath = toFullPath(draggedPath);
      const fullTargetPath = toFullPath(targetPath);
      
      let newPath: string;
      if (dropType === 'into') {
        const fileName = draggedPath.split('/').pop();
        newPath = `${fullTargetPath}/${fileName}`;
      } else {
        const parentDir = fullDraggedPath.substring(0, fullDraggedPath.lastIndexOf('/'));
        const fileName = draggedPath.split('/').pop();
        newPath = `${parentDir}/${fileName}`;
      }
      
      if (newPath !== fullDraggedPath) {
        const result = await invoke(IPC.PROJECT_RENAME_PATH, fullDraggedPath, newPath) as { ok?: boolean; error?: string };
        if (!result.ok) {
          window.alert(`Move failed: ${result.error}`);
          return;
        }
      }
    }
    
    loadFileTree();
  }, [projectPath, toFullPath, loadFileTree]);

  const { model } = useFileTree({
    preparedInput,
    initialExpansion: 'closed',
    search: false,
    flattenEmptyDirectories: false,
    initialVisibleRowCount: Math.min(30, paths.length),
    overscan: 15,
    stickyFolders: true,
    dragAndDrop: {
      enabled: true,
      canDrag: (draggedPaths) => draggedPaths.length > 0,
      canDrop: (dropContext) => !dropContext.draggedPaths.includes(dropContext.target.path),
      onDropComplete: (dropResult) => {
        console.log('Drop completed:', dropResult);
        handleDragDrop(dropResult.draggedPaths, dropResult.target, 'into');
      },
      onDropError: (error) => window.alert(`Move failed: ${error}`),
      openOnDropDelay: 300,
    },
    renaming: {
      enabled: true,
      canRename: () => true,
      onError: (error) => window.alert(`Rename failed: ${error}`),
      onRename: async (event) => {
        const oldFullPath = toFullPath(event.oldPath);
        const dir = oldFullPath.substring(0, oldFullPath.lastIndexOf('/'));
        const newFullPath = `${dir}/${event.newName}`;
        
        if (newFullPath === oldFullPath) return;
        
        const result = await invoke(IPC.PROJECT_RENAME_PATH, oldFullPath, newFullPath) as { ok?: boolean; error?: string };
        if (result.ok) {
          loadFileTree();
        } else {
          throw new Error(result.error || 'Rename failed');
        }
      },
    },
    gitStatus: gitStatusEntries,
    icons: {
      set: 'complete',
      colored: true,
      byFileExtension: {
        ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
        js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
        json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml',
        md: 'markdown', mdx: 'markdown',
        css: 'css', scss: 'scss', sass: 'scss', less: 'less',
        py: 'python', pyw: 'python', ipynb: 'python',
        rs: 'rust', toml: 'rust',
        gitignore: 'git', gitattributes: 'git', gitmodules: 'git',
        dockerfile: 'docker', dockerignore: 'docker',
        html: 'html', htm: 'html', xhtml: 'html',
        png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', ico: 'image', bmp: 'image',
        sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
        go: 'go', java: 'java', class: 'java',
        kt: 'kotlin', kts: 'kotlin', swift: 'swift',
        rb: 'ruby', erb: 'ruby', php: 'php',
        sql: 'database', db: 'database', sqlite: 'database',
        xml: 'xml', rss: 'xml',
        env: 'config', local: 'config', lock: 'lock',
        pdf: 'pdf', txt: 'text', log: 'text',
      },
      spriteSheet: `
        <svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
          <symbol id="typescript" viewBox="0 0 24 24"><path fill="#3178C6" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="9" font-weight="bold" fill="white">TS</text></symbol>
          <symbol id="javascript" viewBox="0 0 24 24"><path fill="#F7DF1E" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="9" font-weight="bold" fill="black">JS</text></symbol>
          <symbol id="json" viewBox="0 0 24 24"><path fill="#CB9D06" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="8" y="17" font-size="10" font-weight="bold" fill="white">{}</text></symbol>
          <symbol id="yaml" viewBox="0 0 24 24"><path fill="#CB9D06" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">YML</text></symbol>
          <symbol id="markdown" viewBox="0 0 24 24"><path fill="#519aba" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">MD</text></symbol>
          <symbol id="css" viewBox="0 0 24 24"><path fill="#563d7c" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="9" font-weight="bold" fill="white">CSS</text></symbol>
          <symbol id="scss" viewBox="0 0 24 24"><path fill="#c6538c" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">SCSS</text></symbol>
          <symbol id="less" viewBox="0 0 24 24"><path fill="#1d365d" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">LESS</text></symbol>
          <symbol id="python" viewBox="0 0 24 24"><path fill="#3776ab" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">PY</text></symbol>
          <symbol id="rust" viewBox="0 0 24 24"><path fill="#dea584" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="9" font-weight="bold" fill="black">RS</text></symbol>
          <symbol id="git" viewBox="0 0 24 24"><path fill="#f05032" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="9" font-weight="bold" fill="white">GIT</text></symbol>
          <symbol id="docker" viewBox="0 0 24 24"><path fill="#2496ed" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="10" fill="white">🐳</text></symbol>
          <symbol id="html" viewBox="0 0 24 24"><path fill="#e34f26" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="5" y="17" font-size="8" font-weight="bold" fill="white">HTML</text></symbol>
          <symbol id="image" viewBox="0 0 24 24"><path fill="#a8a8a8" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><circle cx="12" cy="12" r="3" fill="white"/></symbol>
          <symbol id="shell" viewBox="0 0 24 24"><path fill="#4eaa25" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="9" y="17" font-size="10" font-weight="bold" fill="white">$</text></symbol>
          <symbol id="go" viewBox="0 0 24 24"><path fill="#00ADD8" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="9" font-weight="bold" fill="white">GO</text></symbol>
          <symbol id="java" viewBox="0 0 24 24"><path fill="#5382a1" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">JAVA</text></symbol>
          <symbol id="kotlin" viewBox="0 0 24 24"><path fill="#7F52FF" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="5" y="17" font-size="7" font-weight="bold" fill="white">KT</text></symbol>
          <symbol id="swift" viewBox="0 0 24 24"><path fill="#F05138" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="5" y="17" font-size="8" font-weight="bold" fill="white">SWIFT</text></symbol>
          <symbol id="ruby" viewBox="0 0 24 24"><path fill="#CC342D" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">RB</text></symbol>
          <symbol id="php" viewBox="0 0 24 24"><path fill="#777BB4" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">PHP</text></symbol>
          <symbol id="database" viewBox="0 0 24 24"><path fill="#4479A1" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="5" y="17" font-size="8" font-weight="bold" fill="white">SQL</text></symbol>
          <symbol id="xml" viewBox="0 0 24 24"><path fill="#F16529" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="7" y="17" font-size="9" font-weight="bold" fill="white">&lt;</text></symbol>
          <symbol id="config" viewBox="0 0 24 24"><path fill="#6D8088" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><circle cx="12" cy="12" r="4" fill="white"/></symbol>
          <symbol id="lock" viewBox="0 0 24 24"><path fill="#E6B422" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M12 8a2 2 0 0 0-2 2v1a2 2 0 0 0 4 0v-1a2 2 0 0 0-2-2z" fill="white"/></symbol>
          <symbol id="pdf" viewBox="0 0 24 24"><path fill="#F04531" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><text x="6" y="17" font-size="8" font-weight="bold" fill="white">PDF</text></symbol>
          <symbol id="text" viewBox="0 0 24 24"><path fill="#A8B5C0" d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M8 10h8M8 14h6" stroke="white" stroke-width="1.5"/></symbol>
        </svg>
      `,
    },
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
      [part="tree"] { outline: none !important; }
      button[data-type="item"] {
        padding-left: calc(var(--trees-indent) * var(--depth) + 8px) !important;
        padding-right: 8px !important;
        transition: background-color 0.15s ease;
      }
      button[data-type="item"]:hover { background-color: var(--trees-hover-bg-override) !important; }
      button[data-type="item"][data-item-selected] {
        background-color: var(--trees-selected-bg-override) !important;
        color: var(--trees-selected-fg-override) !important;
      }
      [part="chevron"] { width: 12px; height: 12px; color: var(--text-secondary); }
      [part="icon"] { width: var(--trees-icon-size); height: var(--trees-icon-size); }
      [part="label"] { font-size: var(--trees-font-size); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      [part="search-input"] {
        background-color: var(--bg-elevated) !important;
        border: 1px solid var(--border) !important;
        border-radius: 6px !important;
        color: var(--text-primary) !important;
        padding: 6px 10px !important;
        font-size: 13px !important;
      }
      [part="search-input"]:focus { border-color: var(--accent) !important; outline: none !important; }
      [part="search"] { padding: 8px !important; border-bottom: 1px solid var(--border) !important; }
      [part="git-status"] { font-size: 10px; font-weight: bold; padding: 1px 4px; border-radius: 3px; margin-left: 4px; }
      [data-git-status="M"] { color: #f0a020; }
      [data-git-status="A"] { color: #2ea043; }
      [data-git-status="D"] { color: #d73a49; }
      [data-git-status="U"] { color: #6a737d; }
    `,
  });

  // ── Persist tree state ───────────────────────────────────

  useEffect(() => {
    if (!model) return;

    const saveState = () => {
      if (saveStateTimeoutRef.current) clearTimeout(saveStateTimeoutRef.current);
      saveStateTimeoutRef.current = setTimeout(() => {
        // Note: @pierre/trees doesn't expose getVisibleRows/getVisibleCount
        // We'll just save the selected path for now
        const selectedPath = model.getSelectedPaths()[0] ?? null;
        
        // For expanded paths, we'd need to track expansion events separately
        // For now, just save selection
        setExpandedPaths(new Set()); // TODO: Track expanded paths properly
        setSelectedPath(selectedPath);
      }, 300);
    };

    const unsubscribe = model.subscribe(() => {
      saveState();
    });

    return () => {
      unsubscribe();
      if (saveStateTimeoutRef.current) clearTimeout(saveStateTimeoutRef.current);
    };
  }, [model, setExpandedPaths, setSelectedPath]);

  // ── Keyboard shortcuts ───────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;
    
    if (modKey && e.key === 'f') {
      e.preventDefault();
      model.openSearch();
      return;
    }
    
    if (e.key === 'F2') {
      e.preventDefault();
      const focusedPath = model.getFocusedPath();
      if (focusedPath) {
        model.startRenaming(focusedPath);
      }
    }
    
    if (e.key === 'Delete' && modKey) {
      e.preventDefault();
      const selectedPaths = model.getSelectedPaths();
      if (selectedPaths.length > 0) {
        const path = selectedPaths[0];
        const fullPath = toFullPath(path);
        const node = findNodeByPath(fileTree, fullPath);
        if (node) {
          handleDelete(path, node.name, node.type);
        }
      }
    }
    
    if (e.key === 'Enter' && !model.getFocusedPath()?.endsWith('/')) {
      e.preventDefault();
      const focusedPath = model.getFocusedPath();
      if (focusedPath) {
        const fullPath = toFullPath(focusedPath);
        const node = findNodeByPath(fileTree, fullPath);
        if (node && node.type === 'file') {
          addFileTab(fullPath, projectPath);
        }
      }
    }
  }, [model, fileTree, projectPath, toFullPath, handleDelete, addFileTab]);

  const buildContextMenu = useCallback((item: { kind: 'directory' | 'file'; name: string; path: string }, context: { close: (opts?: { restoreFocus?: boolean }) => void; anchorElement: HTMLElement; anchorRect: any }) => {
    const fullPath = toFullPath(item.path);
    const node = findNodeByPath(fileTree, fullPath);
    if (!node) return null;
    
    const menuItemsBuilt = buildMenuItems(node, editors, projectPath, {
      onReveal: () => handleReveal(item.path),
      onOpenTerminal: () => handleOpenTerminal(item.path),
      onCopyPath: () => handleCopyPath(item.path),
      onCopyRelativePath: () => handleCopyRelativePath(item.path),
      onCopyName: () => handleCopyName(node.name),
      onRename: () => { model.startRenaming(item.path); },
      onDelete: () => handleDelete(item.path, node.name, node.type),
      onNewFile: () => setInlineInput({ parentPath: item.path, kind: 'file' }),
      onNewFolder: () => setInlineInput({ parentPath: item.path, kind: 'folder' }),
      onOpenInEditor: (editor) => handleOpenInEditor(editor, item.path),
      onOpenAsTab: () => {
        if (node.type === 'file') {
          addFileTab(fullPath, projectPath);
        }
      },
    });
    
    const menuEl = document.createElement('div');
    menuEl.className = 'bg-bg-elevated border border-border rounded-lg shadow-xl py-1 min-w-[200px] z-50';
    menuEl.setAttribute('data-file-tree-context-menu-root', 'true');
    
    menuItemsBuilt.forEach((entry) => {
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
      
      const iconContainer = document.createElement('span');
      iconContainer.style.display = 'flex';
      iconContainer.style.alignItems = 'center';
      iconContainer.style.justifyContent = 'center';
      iconContainer.style.width = '14px';
      iconContainer.style.height = '14px';
      
      if (entry.icon) {
        iconContainer.textContent = entry.label.split(' ')[0];
      }
      
      const labelEl = document.createElement('span');
      labelEl.textContent = entry.label;
      
      itemEl.appendChild(iconContainer);
      itemEl.appendChild(labelEl);
      
      itemEl.addEventListener('click', () => {
        entry.action();
        context.close({ restoreFocus: false });
      });
      
      menuEl.appendChild(itemEl);
    });
    
    return menuEl;
  }, [fileTree, editors, projectPath, toFullPath, handleReveal, handleOpenTerminal, handleCopyPath, handleCopyRelativePath, handleCopyName, handleDelete, handleCreate, addFileTab, model]);

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
    <div 
      ref={treeRef} 
      className="h-full w-full" 
      style={{ minHeight: 0, position: 'relative', height: '500px' }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <PierreFileTree
        model={model}
        style={{ height: '500px', width: '100%' }}
        initialViewportHeight={500}
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
