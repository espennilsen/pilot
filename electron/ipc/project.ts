import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc';
import { readdirSync, readFileSync, writeFileSync, statSync, renameSync, mkdirSync, rmSync, existsSync, appendFileSync, watch, type FSWatcher } from 'fs';
import { join, relative, resolve, sep } from 'path';
import type { FileNode } from '../../shared/types';
import { companionBridge } from '../services/companion-ipc-bridge';

// Directories/files to skip
const IGNORED = new Set([
  'node_modules', '.git', '.DS_Store', 'dist', 'out', 'build',
  '.next', '.nuxt', '.cache', 'coverage', '.pilot', '.pi',
  '__pycache__', '.tox', '.mypy_cache', 'target', '.gradle',
]);

function buildFileTree(dirPath: string, depth = 0, maxDepth = 5): FileNode[] {
  if (depth >= maxDepth) return [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !IGNORED.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(entry => {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: fullPath,
            type: 'directory' as const,
            children: buildFileTree(fullPath, depth + 1, maxDepth),
          };
        }
        return {
          name: entry.name,
          path: fullPath,
          type: 'file' as const,
        };
      });
  } catch {
    return [];
  }
}

export function registerProjectIpc() {
  let currentProjectPath: string | null = null;
  let fsWatcher: FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function assertWithinProject(targetPath: string): void {
    if (!currentProjectPath) throw new Error('No project directory set');
    const resolved = resolve(targetPath);
    const projectResolved = resolve(currentProjectPath);
    if (!resolved.startsWith(projectResolved + sep) && resolved !== projectResolved) {
      throw new Error(`Path "${targetPath}" is outside the project directory`);
    }
  }

  function notifyFsChanged() {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.PROJECT_FS_CHANGED);
    }
    // Forward to companion clients
    try {
      companionBridge.forwardEvent(IPC.PROJECT_FS_CHANGED, undefined);
    } catch { /* not initialized */ }
  }

  function startWatching(projectPath: string) {
    stopWatching();
    try {
      fsWatcher = watch(projectPath, { recursive: true }, (_eventType, filename) => {
        // Ignore changes in directories we don't show in the tree
        if (filename) {
          const topDir = filename.split(/[/\\]/)[0];
          if (IGNORED.has(topDir)) return;
          if (topDir.startsWith('.')) return;
        }
        // Debounce — batch rapid changes into one notification
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(notifyFsChanged, 300);
      });
    } catch {
      // fs.watch may fail on some platforms/paths — degrade gracefully
    }
  }

  function stopWatching() {
    if (fsWatcher) {
      fsWatcher.close();
      fsWatcher = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  ipcMain.handle(IPC.PROJECT_SET_DIRECTORY, async (_event, path: string) => {
    currentProjectPath = path;
    startWatching(path);
  });

  ipcMain.handle(IPC.PROJECT_FILE_TREE, async () => {
    if (!currentProjectPath) return [];
    return buildFileTree(currentProjectPath);
  });

  ipcMain.handle(IPC.PROJECT_FILE_SEARCH, async (_event, query: string, includeDirs?: boolean) => {
    if (!currentProjectPath || !query) return [];
    const results: Array<{ name: string; path: string; relativePath: string; type: 'file' | 'directory' }> = [];
    const q = query.toLowerCase();
    const maxResults = 20;

    function searchDir(dirPath: string) {
      if (results.length >= maxResults) return;
      try {
        const entries = readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= maxResults) return;
          if (IGNORED.has(entry.name) || entry.name.startsWith('.')) continue;
          const fullPath = join(dirPath, entry.name);
          const relPath = relative(currentProjectPath!, fullPath);
          if (entry.isDirectory()) {
            if (includeDirs && (entry.name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q))) {
              results.push({ name: entry.name, path: fullPath, relativePath: relPath, type: 'directory' });
            }
            searchDir(fullPath);
          } else {
            if (entry.name.toLowerCase().includes(q) || relPath.toLowerCase().includes(q)) {
              results.push({ name: entry.name, path: fullPath, relativePath: relPath, type: 'file' });
            }
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    searchDir(currentProjectPath);
    return results;
  });

  ipcMain.handle(IPC.PROJECT_READ_FILE, async (_event, filePath: string) => {
    try {
      const stat = statSync(filePath);
      if (stat.size > 1024 * 1024) { // 1MB limit
        return { error: 'File too large to preview (>1MB)' };
      }
      const content = readFileSync(filePath, 'utf-8');
      return { content };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IPC.PROJECT_WRITE_FILE, async (_event, filePath: string, content: string) => {
    try {
      assertWithinProject(filePath);
      if (content.length > 10 * 1024 * 1024) throw new Error('Content exceeds 10MB limit');
      writeFileSync(filePath, content, 'utf-8');
      return { ok: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IPC.PROJECT_DELETE_PATH, async (_event, targetPath: string) => {
    try {
      assertWithinProject(targetPath);
      rmSync(targetPath, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IPC.PROJECT_RENAME_PATH, async (_event, oldPath: string, newPath: string) => {
    try {
      assertWithinProject(oldPath);
      assertWithinProject(newPath);
      renameSync(oldPath, newPath);
      return { ok: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IPC.PROJECT_CREATE_FILE, async (_event, filePath: string) => {
    try {
      assertWithinProject(filePath);
      writeFileSync(filePath, '', 'utf-8');
      return { ok: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IPC.PROJECT_CREATE_DIRECTORY, async (_event, dirPath: string) => {
    try {
      assertWithinProject(dirPath);
      mkdirSync(dirPath, { recursive: true });
      return { ok: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  // Open directory dialog
  ipcMain.handle(IPC.PROJECT_OPEN_DIALOG, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Open Project',
    });
    if (!result.canceled && result.filePaths[0]) {
      currentProjectPath = result.filePaths[0];
      return currentProjectPath;
    }
    return null;
  });

  // Check if project is a git repo that needs .pilot in .gitignore
  ipcMain.handle(IPC.PROJECT_CHECK_GITIGNORE, async (_event, projectPath: string) => {
    try {
      const gitDir = join(projectPath, '.git');
      if (!existsSync(gitDir)) return { needsUpdate: false }; // Not a git repo

      const pilotDir = join(projectPath, '.pilot');
      if (existsSync(pilotDir)) return { needsUpdate: false }; // .pilot already exists, too late to suggest

      const gitignorePath = join(projectPath, '.gitignore');
      if (existsSync(gitignorePath)) {
        const content = readFileSync(gitignorePath, 'utf-8');
        // Check if .pilot is already covered (exact line match, with or without trailing slash)
        const lines = content.split(/\r?\n/);
        const alreadyIgnored = lines.some(line => {
          const trimmed = line.trim();
          return trimmed === '.pilot' || trimmed === '.pilot/' || trimmed === '/.pilot' || trimmed === '/.pilot/';
        });
        if (alreadyIgnored) return { needsUpdate: false };
      }

      return { needsUpdate: true };
    } catch {
      return { needsUpdate: false };
    }
  });

  // Add .pilot to .gitignore
  ipcMain.handle(IPC.PROJECT_ADD_GITIGNORE, async (_event, projectPath: string) => {
    try {
      const gitignorePath = join(projectPath, '.gitignore');
      if (existsSync(gitignorePath)) {
        const content = readFileSync(gitignorePath, 'utf-8');
        // Ensure we add on a new line
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        appendFileSync(gitignorePath, `${separator}.pilot\n`, 'utf-8');
      } else {
        writeFileSync(gitignorePath, '.pilot\n', 'utf-8');
      }
      return { ok: true };
    } catch (err) {
      return { error: String(err) };
    }
  });
}
