import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { TerminalService } from '../services/terminal-service';
import { registerSendHandler } from '../services/companion-ipc-bridge';

export function registerTerminalIpc(terminalService: TerminalService) {
  // Create a new terminal instance
  ipcMain.handle(IPC.TERMINAL_CREATE, (event, id: string, cwd: string, shell?: string) => {
    terminalService.create(id, cwd, shell);
  });

  // Write data to terminal (user input) — fire-and-forget
  ipcMain.on(IPC.TERMINAL_DATA, (event, id: string, data: string) => {
    terminalService.write(id, data);
  });

  // Also register for companion bridge (fire-and-forget, no event object)
  registerSendHandler(IPC.TERMINAL_DATA, (id: string, data: string) => {
    terminalService.write(id, data);
  });

  // Resize terminal
  ipcMain.handle(IPC.TERMINAL_RESIZE, (event, id: string, cols: number, rows: number) => {
    terminalService.resize(id, cols, rows);
  });

  // Dispose terminal
  ipcMain.handle(IPC.TERMINAL_DISPOSE, (event, id: string) => {
    terminalService.close(id);
  });
}
