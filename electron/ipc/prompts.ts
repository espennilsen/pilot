import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc';
import { CommandRegistry } from '../services/command-registry';
import type { PromptLibrary } from '../services/prompt-library';
import type { PromptCreateInput, PromptUpdateInput } from '../../shared/types';
import { companionBridge } from '../services/companion-ipc-bridge';

export function registerPromptsIpc(promptLibrary: PromptLibrary) {
  // Get all non-hidden prompts
  ipcMain.handle(IPC.PROMPTS_GET_ALL, async () => {
    return promptLibrary.getAllIncludingHidden();
  });

  // Get single prompt by ID
  ipcMain.handle(IPC.PROMPTS_GET, async (_event, id: string) => {
    return promptLibrary.getById(id);
  });

  // Get prompt by slash command
  ipcMain.handle(IPC.PROMPTS_GET_BY_COMMAND, async (_event, command: string) => {
    return promptLibrary.getByCommand(command);
  });

  // Get all available prompt commands for autocomplete
  ipcMain.handle(IPC.PROMPTS_GET_COMMANDS, async () => {
    return promptLibrary.getAllCommands();
  });

  // Get all registered system commands
  ipcMain.handle(IPC.PROMPTS_GET_SYSTEM_COMMANDS, async () => {
    return CommandRegistry.getAllSystemCommands();
  });

  // Validate a command string (for live editor feedback)
  ipcMain.handle(IPC.PROMPTS_VALIDATE_COMMAND, async (_event, command: string, excludePromptId?: string) => {
    return promptLibrary.validateCommand(command, excludePromptId);
  });

  // Create a new prompt
  ipcMain.handle(IPC.PROMPTS_CREATE, async (_event, input: PromptCreateInput, projectPath?: string) => {
    return promptLibrary.create(input, projectPath);
  });

  // Update an existing prompt
  ipcMain.handle(IPC.PROMPTS_UPDATE, async (_event, id: string, updates: PromptUpdateInput) => {
    return promptLibrary.update(id, updates);
  });

  // Delete a prompt (hides built-ins)
  ipcMain.handle(IPC.PROMPTS_DELETE, async (_event, id: string) => {
    return promptLibrary.delete(id);
  });

  // Unhide a hidden built-in
  ipcMain.handle(IPC.PROMPTS_UNHIDE, async (_event, id: string) => {
    return promptLibrary.unhide(id);
  });

  // Fill template variables
  ipcMain.handle(IPC.PROMPTS_FILL, async (_event, content: string, values: Record<string, string>) => {
    return promptLibrary.fillTemplate(content, values);
  });

  // Force reload
  ipcMain.handle(IPC.PROMPTS_RELOAD, async () => {
    await promptLibrary.reload();
  });

  // Listen for prompt changes and notify renderer + companion clients
  promptLibrary.onChange(() => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(IPC.PROMPTS_CHANGED);
    }
    try {
      companionBridge.forwardEvent(IPC.PROMPTS_CHANGED, undefined);
    } catch { /* Expected: companion bridge not initialized yet during startup */ }
  });
}
