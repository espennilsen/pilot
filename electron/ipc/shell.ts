import { ipcMain, shell } from 'electron';
import { exec, execFile, execSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { dirname } from 'path';
import { IPC } from '../../shared/ipc';
import { getAppSettings } from '../services/app-settings';

export interface DetectedEditor {
  id: string;
  name: string;
  cli: string;
}

export interface DetectedTerminal {
  id: string;
  name: string;
  app: string; // macOS app name or CLI command
}

// Editor definitions: id, display name, CLI command(s) to probe, macOS bundle ID
const EDITOR_DEFS = [
  { id: 'vscode',          name: 'VS Code',              clis: ['code'],                   bundleId: 'com.microsoft.VSCode' },
  { id: 'vscode-insiders', name: 'VS Code Insiders',     clis: ['code-insiders'],           bundleId: 'com.microsoft.VSCodeInsiders' },
  { id: 'cursor',          name: 'Cursor',                clis: ['cursor'],                  bundleId: 'com.todesktop.230313mzl4w4u92' },
  { id: 'windsurf',        name: 'Windsurf',              clis: ['windsurf'],                bundleId: 'com.codeium.windsurf' },
  { id: 'antigravity',     name: 'Antigravity',           clis: ['antigravity'],             bundleId: null },
  { id: 'zed',             name: 'Zed',                   clis: ['zed'],                     bundleId: 'dev.zed.Zed' },
  { id: 'sublime',         name: 'Sublime Text',          clis: ['subl'],                    bundleId: 'com.sublimetext.4' },
  { id: 'webstorm',        name: 'WebStorm',              clis: ['webstorm', 'wstorm'],      bundleId: 'com.jetbrains.WebStorm' },
  { id: 'intellij',        name: 'IntelliJ IDEA',         clis: ['idea'],                    bundleId: 'com.jetbrains.intellij' },
  { id: 'fleet',           name: 'Fleet',                 clis: ['fleet'],                   bundleId: 'com.jetbrains.fleet' },
  { id: 'nova',            name: 'Nova',                  clis: ['nova'],                    bundleId: 'com.panic.Nova' },
  { id: 'atom',            name: 'Atom',                  clis: ['atom'],                    bundleId: 'com.github.atom' },
  { id: 'vim',             name: 'Neovim',                clis: ['nvim'],                    bundleId: null },
  { id: 'emacs',           name: 'Emacs',                 clis: ['emacs'],                   bundleId: null },
];

function whichSync(cmd: string): string | null {
  try {
    return execSync(`which ${cmd}`, { encoding: 'utf-8', timeout: 2000 }).trim() || null;
  } catch {
    return null;
  }
}

let cachedEditors: DetectedEditor[] | null = null;

function detectEditors(): DetectedEditor[] {
  if (cachedEditors) return cachedEditors;

  const found: DetectedEditor[] = [];

  for (const def of EDITOR_DEFS) {
    for (const cli of def.clis) {
      const resolved = whichSync(cli);
      if (resolved) {
        found.push({ id: def.id, name: def.name, cli });
        break; // first matching CLI is enough
      }
    }
  }

  // Fallback: on macOS, check for .app bundles without CLI installed
  if (process.platform === 'darwin') {
    const foundIds = new Set(found.map(e => e.id));
    for (const def of EDITOR_DEFS) {
      if (foundIds.has(def.id) || !def.bundleId) continue;
      try {
        const result = execSync(
          `mdfind "kMDItemCFBundleIdentifier == '${def.bundleId}'" 2>/dev/null`,
          { encoding: 'utf-8', timeout: 3000 },
        ).trim();
        if (result) {
          // Use `open -b` as fallback CLI
          found.push({ id: def.id, name: def.name, cli: `open -b ${def.bundleId}` });
        }
      } catch {
        // skip
      }
    }
  }

  cachedEditors = found;
  return found;
}

// Terminal definitions for macOS (app name), linux (CLI), windows (exe)
const TERMINAL_DEFS = [
  { id: 'terminal',    name: 'Terminal',         app: 'Terminal',            bundleId: 'com.apple.Terminal' },
  { id: 'iterm',       name: 'iTerm2',           app: 'iTerm',              bundleId: 'com.googlecode.iterm2' },
  { id: 'warp',        name: 'Warp',             app: 'Warp',               bundleId: 'dev.warp.Warp-Stable' },
  { id: 'kitty',       name: 'Kitty',            app: 'kitty',              bundleId: 'net.kovidgoyal.kitty' },
  { id: 'alacritty',   name: 'Alacritty',        app: 'Alacritty',          bundleId: 'org.alacritty' },
  { id: 'hyper',       name: 'Hyper',            app: 'Hyper',              bundleId: 'co.zeit.hyper' },
  { id: 'ghostty',     name: 'Ghostty',          app: 'Ghostty',            bundleId: 'com.mitchellh.ghostty' },
  { id: 'rio',         name: 'Rio',              app: 'Rio',                bundleId: 'com.raphaelamorim.rio' },
  { id: 'wezterm',     name: 'WezTerm',          app: 'WezTerm',            bundleId: 'com.github.wez.wezterm' },
];

let cachedTerminals: DetectedTerminal[] | null = null;

function detectTerminals(): DetectedTerminal[] {
  if (cachedTerminals) return cachedTerminals;

  const found: DetectedTerminal[] = [];

  if (process.platform === 'darwin') {
    for (const def of TERMINAL_DEFS) {
      try {
        const result = execSync(
          `mdfind "kMDItemCFBundleIdentifier == '${def.bundleId}'" 2>/dev/null`,
          { encoding: 'utf-8', timeout: 3000 },
        ).trim();
        if (result) {
          found.push({ id: def.id, name: def.name, app: def.app });
        }
      } catch {
        // skip
      }
    }
    // Terminal.app is always available on macOS
    if (!found.some(t => t.id === 'terminal')) {
      found.unshift({ id: 'terminal', name: 'Terminal', app: 'Terminal' });
    }
  } else {
    // Linux/Windows: check for CLI commands
    const linuxTerminals = [
      { id: 'gnome-terminal', name: 'GNOME Terminal', app: 'gnome-terminal' },
      { id: 'konsole',        name: 'Konsole',        app: 'konsole' },
      { id: 'kitty',          name: 'Kitty',          app: 'kitty' },
      { id: 'alacritty',      name: 'Alacritty',      app: 'alacritty' },
      { id: 'wezterm',        name: 'WezTerm',        app: 'wezterm' },
      { id: 'ghostty',        name: 'Ghostty',        app: 'ghostty' },
      { id: 'xterm',          name: 'XTerm',          app: 'xterm' },
    ];
    for (const def of linuxTerminals) {
      if (whichSync(def.app)) {
        found.push(def);
      }
    }
  }

  cachedTerminals = found;
  return found;
}

export function registerShellIpc() {
  ipcMain.handle(IPC.SHELL_REVEAL_IN_FINDER, async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC.SHELL_OPEN_IN_TERMINAL, async (_event, dirPath: string) => {
    const dir = existsSync(dirPath) && !statSync(dirPath).isDirectory()
      ? dirname(dirPath)
      : dirPath;

    const { terminalApp } = getAppSettings();

    if (process.platform === 'darwin') {
      const app = terminalApp || 'Terminal';
      execFile('open', ['-a', app, dir]);
    } else if (process.platform === 'win32') {
      if (terminalApp) {
        exec(`start "" "${terminalApp}" /d "${dir}"`);
      } else {
        exec(`start cmd /K "cd /d ${dir}"`);
      }
    } else {
      if (terminalApp) {
        execFile(terminalApp, ['--working-directory=' + dir]);
      } else {
        execFile('xdg-open', [dir]);
      }
    }
  });

  ipcMain.handle(IPC.SHELL_DETECT_EDITORS, async () => {
    return detectEditors();
  });

  ipcMain.handle(IPC.SHELL_DETECT_TERMINALS, async () => {
    return detectTerminals();
  });

  ipcMain.handle(IPC.SHELL_OPEN_IN_EDITOR, async (_event, editorCli: string, filePath: string) => {
    try {
      // Handle `open -b <bundleId>` style commands
      if (editorCli.startsWith('open -b ')) {
        const bundleId = editorCli.slice('open -b '.length).trim();
        execFile('open', ['-b', bundleId, filePath]);
      } else {
        execFile(editorCli, [filePath]);
      }
    } catch (e) {
      console.warn('[shell] failed to open editor:', e);
    }
  });
}
