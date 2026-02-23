import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import { homedir } from 'os';
import { IPC } from '../../shared/ipc';

export class TerminalService {
  private terminals: Map<string, pty.IPty> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  create(id: string, cwd: string, shell?: string): void {
    // Dispose existing terminal with same ID if any
    this.close(id);

    // Resolve ~ to home directory
    if (cwd === '~') {
      cwd = homedir();
    } else if (cwd.startsWith('~/')) {
      cwd = homedir() + cwd.slice(1);
    }

    // Determine the default shell based on platform
    const defaultShell = shell ||
      (process.platform === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/zsh');

    // Spawn PTY
    const term = pty.spawn(defaultShell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    this.terminals.set(id, term);

    // Forward PTY output to renderer (tagged with terminal ID)
    term.onData((data) => {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC.TERMINAL_OUTPUT, { id, data });
      }
      // Forward to companion clients
      try {
        const { companionBridge } = require('./companion-ipc-bridge');
        companionBridge.forwardEvent(IPC.TERMINAL_OUTPUT, { id, data });
      } catch { /* not initialized */ }
    });

    // Handle PTY exit
    term.onExit(({ exitCode, signal }) => {
      console.log(`Terminal ${id} exited with code ${exitCode}, signal ${signal}`);
      this.terminals.delete(id);
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC.TERMINAL_OUTPUT, {
          id,
          data: `\r\n\x1b[33mTerminal process exited with code ${exitCode}\x1b[0m\r\n`,
        });
        this.mainWindow.webContents.send(IPC.TERMINAL_EXITED, id);
      }
      // Forward to companion clients
      try {
        const { companionBridge } = require('./companion-ipc-bridge');
        companionBridge.forwardEvent(IPC.TERMINAL_OUTPUT, {
          id,
          data: `\r\n\x1b[33mTerminal process exited with code ${exitCode}\x1b[0m\r\n`,
        });
        companionBridge.forwardEvent(IPC.TERMINAL_EXITED, id);
      } catch { /* not initialized */ }
    });

    console.log(`Terminal ${id} created: shell=${defaultShell}, cwd=${cwd}`);
  }

  write(id: string, data: string): void {
    const term = this.terminals.get(id);
    if (!term) {
      console.warn(`Attempted to write to terminal ${id}, but PTY is not initialized`);
      return;
    }
    term.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const term = this.terminals.get(id);
    if (!term) {
      return;
    }
    try {
      term.resize(cols, rows);
    } catch (error) {
      console.error(`Failed to resize terminal ${id}:`, error);
    }
  }

  close(id: string): void {
    const term = this.terminals.get(id);
    if (term) {
      try {
        term.kill();
      } catch (error) {
        console.error(`Failed to kill PTY ${id}:`, error);
      }
      this.terminals.delete(id);
    }
  }

  disposeAll(): void {
    for (const [id] of this.terminals) {
      this.close(id);
    }
  }
}
