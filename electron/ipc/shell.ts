import { ipcMain, shell } from 'electron';
import { exec, execFile, execFileSync, execSync } from 'child_process';
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
    const bin = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(bin, [cmd], { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    // `where` on Windows may return multiple lines — take the first
    return result.split(/\r?\n/)[0] || null;
  } catch {
    /* Expected: command not found in PATH */
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

  // Platform-specific fallback detection for editors without CLI in PATH
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
        /* Expected: editor not installed or mdfind failed */
      }
    }
  } else if (process.platform === 'win32') {
    // Check common Windows install paths for editors not found via PATH
    const foundIds = new Set(found.map(e => e.id));
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const localAppData = process.env['LOCALAPPDATA'] || '';
    const winEditorPaths: { id: string; name: string; paths: string[] }[] = [
      { id: 'vscode', name: 'VS Code', paths: [
        `${programFiles}\\Microsoft VS Code\\Code.exe`,
        `${localAppData}\\Programs\\Microsoft VS Code\\Code.exe`,
      ]},
      { id: 'vscode-insiders', name: 'VS Code Insiders', paths: [
        `${programFiles}\\Microsoft VS Code Insiders\\Code - Insiders.exe`,
        `${localAppData}\\Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe`,
      ]},
      { id: 'cursor', name: 'Cursor', paths: [
        `${localAppData}\\Programs\\cursor\\Cursor.exe`,
      ]},
      { id: 'sublime', name: 'Sublime Text', paths: [
        `${programFiles}\\Sublime Text\\subl.exe`,
        `${programFiles}\\Sublime Text 3\\subl.exe`,
      ]},
    ];
    for (const def of winEditorPaths) {
      if (foundIds.has(def.id)) continue;
      for (const p of def.paths) {
        if (existsSync(p)) {
          found.push({ id: def.id, name: def.name, cli: p });
          foundIds.add(def.id);
          break;
        }
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

// Map terminal IDs to their working-directory flags (Linux/Windows open-in-terminal)
const TERMINAL_CWD_FLAGS: Record<string, (dir: string) => string[]> = {
  'gnome-terminal': (dir) => ['--working-directory=' + dir],
  'konsole':        (dir) => ['--workdir', dir],
  'kitty':          (dir) => ['--directory', dir],
  'alacritty':      (dir) => ['--working-directory', dir],
  'wezterm':        (dir) => ['start', '--cwd', dir],
  'ghostty':        (dir) => ['--working-directory=' + dir],
  'xterm':          (dir) => ['-e', `cd "${dir}" && $SHELL`],
  // Windows terminals
  'wt':             (dir) => ['-d', dir],
  'pwsh':           (dir) => ['-WorkingDirectory', dir],
  'powershell':     (dir) => ['-NoExit', '-Command', `Set-Location '${dir}'`],
  'cmd':            (dir) => ['/K', `cd /d "${dir}"`],
};

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
        /* Expected: terminal not installed or mdfind failed */
      }
    }
    // Terminal.app is always available on macOS
    if (!found.some(t => t.id === 'terminal')) {
      found.unshift({ id: 'terminal', name: 'Terminal', app: 'Terminal' });
    }
  } else if (process.platform === 'win32') {
    // Windows terminals
    const winTerminals = [
      { id: 'wt',         name: 'Windows Terminal', app: 'wt' },
      { id: 'pwsh',       name: 'PowerShell 7',     app: 'pwsh' },
      { id: 'powershell', name: 'PowerShell',       app: 'powershell' },
      { id: 'cmd',        name: 'Command Prompt',   app: 'cmd' },
      { id: 'alacritty',  name: 'Alacritty',        app: 'alacritty' },
      { id: 'wezterm',    name: 'WezTerm',          app: 'wezterm' },
      { id: 'kitty',      name: 'Kitty',            app: 'kitty' },
      { id: 'hyper',      name: 'Hyper',            app: 'hyper' },
    ];
    for (const def of winTerminals) {
      if (whichSync(def.app)) {
        found.push(def);
      }
    }
    // cmd.exe is always available on Windows
    if (!found.some(t => t.id === 'cmd')) {
      found.push({ id: 'cmd', name: 'Command Prompt', app: 'cmd' });
    }
  } else {
    // Linux: check for CLI commands
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
    } else {
      // Linux and Windows: use per-terminal working-directory flags
      const terminals = detectTerminals();
      const terminal = terminalApp
        ? terminals.find(t => t.app === terminalApp || t.name === terminalApp)
        : terminals[0];

      if (terminal) {
        const flagFn = TERMINAL_CWD_FLAGS[terminal.id];
        if (flagFn) {
          execFile(terminal.app, flagFn(dir));
        } else {
          // Unknown terminal — try generic --working-directory
          execFile(terminal.app, ['--working-directory=' + dir]);
        }
      } else if (process.platform === 'win32') {
        // Fallback: cmd.exe
        execFile('cmd', ['/K', `cd /d "${dir}"`]);
      } else {
        // Fallback: xdg-open
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
