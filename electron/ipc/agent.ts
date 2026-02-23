import { ipcMain, BrowserWindow } from 'electron';
import type { ImageContent } from '@mariozechner/pi-ai';
import { IPC } from '../../shared/ipc';
import type { PilotSessionManager } from '../services/pi-session-manager';
import type { PromptLibrary } from '../services/prompt-library';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../services/orchestrator-prompt';
import { companionBridge } from '../services/companion-ipc-bridge';

let promptLibraryRef: PromptLibrary | null = null;

/** Allow the prompt library to inject itself for slash command merging */
export function setPromptLibraryRef(lib: PromptLibrary): void {
  promptLibraryRef = lib;
}

export function registerAgentIpc(sessionManager: PilotSessionManager) {
  ipcMain.handle(IPC.AGENT_CREATE_SESSION, async (_event, tabId: string, projectPath: string) => {
    await sessionManager.createSession(tabId, projectPath);
  });

  ipcMain.handle(IPC.AGENT_PROMPT, async (_event, tabId: string, text: string, projectPath?: string, images?: ImageContent[], sessionPath?: string | null) => {
    // Check for task commands BEFORE memory and agent
    if (projectPath) {
      const taskResult = sessionManager.handlePossibleTaskCommand(tabId, text, projectPath);
      if (taskResult) {
        let eventChannel: string | null = null;
        let eventPayload: Record<string, unknown> | null = null;
        if (taskResult.action === 'show_panel') {
          eventChannel = IPC.TASKS_SHOW_PANEL;
          eventPayload = { tabId };
        } else if (taskResult.action === 'show_create') {
          eventChannel = IPC.TASKS_SHOW_CREATE;
          eventPayload = { tabId };
        } else if (taskResult.action === 'show_ready') {
          eventChannel = IPC.AGENT_EVENT;
          eventPayload = {
            tabId,
            event: {
              type: 'system_message',
              content: taskResult.readyText || 'No ready tasks.',
            },
          };
        }
        if (eventChannel) {
          const windows = BrowserWindow.getAllWindows();
          for (const win of windows) {
            win.webContents.send(eventChannel, eventPayload);
          }
          try {
            companionBridge.forwardEvent(eventChannel, eventPayload);
          } catch { /* not initialized */ }
        }
        return;
      }
    }

    // Check for /orchestrate command
    const trimmedText = text.trim();
    if (trimmedText.toLowerCase().startsWith('/orchestrate')) {
      const description = trimmedText.slice('/orchestrate'.length).trim();
      // Notify renderer of orchestrator mode activation
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send(IPC.AGENT_EVENT, {
          tabId,
          event: {
            type: 'system_message',
            content: '🎭 Orchestrator mode activated. The agent will coordinate subagents instead of implementing directly.',
          },
        });
      }

      // If no session yet, create or open one
      if (!sessionManager.getSession(tabId)) {
        if (!projectPath) {
          throw new Error('No project selected. Open a project before sending messages.');
        }
        if (sessionPath) {
          await sessionManager.openSession(tabId, sessionPath, projectPath);
        } else {
          await sessionManager.createSession(tabId, projectPath);
        }
      }

      // Steer the agent with orchestrator system prompt + task description
      const orchestratorPrompt = description
        ? `${ORCHESTRATOR_SYSTEM_PROMPT}\n\n---\n\nTask to orchestrate: ${description}`
        : ORCHESTRATOR_SYSTEM_PROMPT;

      await sessionManager.prompt(tabId, orchestratorPrompt);
      return;
    }

    // Check for /spawn command
    if (trimmedText.toLowerCase().startsWith('/spawn ')) {
      const spawnArgs = trimmedText.slice('/spawn '.length).trim();
      const firstSpace = spawnArgs.indexOf(' ');
      const role = firstSpace > -1 ? spawnArgs.slice(0, firstSpace) : spawnArgs;
      const prompt = firstSpace > -1 ? spawnArgs.slice(firstSpace + 1) : '';

      if (!role || !prompt) {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          win.webContents.send(IPC.AGENT_EVENT, {
            tabId,
            event: {
              type: 'system_message',
              content: '⚠️ Usage: /spawn [role] [prompt]\nExample: /spawn Dev "Write unit tests for auth.ts"',
            },
          });
        }
        return;
      }

      if (!projectPath) {
        throw new Error('No project selected. Open a project before spawning subagents.');
      }

      // Spawn a quick single-shot subagent
      try {
        const subId = await sessionManager.subagentManager.spawn(tabId, projectPath, {
          role,
          prompt,
        });
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          win.webContents.send(IPC.AGENT_EVENT, {
            tabId,
            event: {
              type: 'system_message',
              content: `🤖 Spawned subagent "${role}" (${subId}). Check the Agents panel for progress.`,
            },
          });
        }
      } catch (err: any) {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          win.webContents.send(IPC.AGENT_EVENT, {
            tabId,
            event: {
              type: 'system_message',
              content: `❌ Failed to spawn subagent: ${err.message}`,
            },
          });
        }
      }
      return;
    }

    // Check for memory command BEFORE sending to agent
    if (projectPath) {
      const memResult = await sessionManager.handlePossibleMemoryCommand(tabId, text, projectPath);
      if (memResult) {
        // It was a memory command — send result back to renderer, don't prompt agent
        let eventChannel: string;
        let eventPayload: Record<string, unknown>;
        if (memResult.action === 'show_panel') {
          eventChannel = IPC.MEMORY_SHOW_PANEL;
          eventPayload = { tabId };
        } else {
          eventChannel = IPC.AGENT_EVENT;
          eventPayload = {
            tabId,
            event: {
              type: 'system_message',
              content: memResult.action === 'saved'
                ? `💾 Remembered: "${memResult.text}"`
                : `🗑️ Forgot: "${memResult.text}"`,
            },
          };
        }
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          win.webContents.send(eventChannel, eventPayload);
        }
        try {
          companionBridge.forwardEvent(eventChannel, eventPayload);
        } catch { /* not initialized */ }
        return;
      }
    }

    // Lazily create or open session on first prompt
    if (!sessionManager.getSession(tabId)) {
      if (!projectPath) {
        throw new Error('No project selected. Open a project before sending messages.');
      }
      if (sessionPath) {
        // Tab has an existing session (e.g. restored from workspace) — continue it
        await sessionManager.openSession(tabId, sessionPath, projectPath);
      } else {
        // Brand new chat — create a fresh session
        await sessionManager.createSession(tabId, projectPath);
      }
    }
    // Broadcast user message to all renderers so companion ↔ desktop stay in sync.
    // The sending client already adds it optimistically; handleEvent deduplicates.
    if (!text.startsWith('/')) {
      const userMessageEvent = {
        tabId,
        event: {
          type: 'user_message',
          content: text,
          images,
          timestamp: Date.now(),
        },
      };
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents.send(IPC.AGENT_EVENT, userMessageEvent);
      }
      companionBridge.forwardEvent(IPC.AGENT_EVENT, userMessageEvent);
    }

    await sessionManager.prompt(tabId, text, images);
  });

  ipcMain.handle(IPC.AGENT_STEER, async (_event, tabId: string, text: string) => {
    await sessionManager.steer(tabId, text);
  });

  ipcMain.handle(IPC.AGENT_FOLLOW_UP, async (_event, tabId: string, text: string) => {
    const session = sessionManager.getSession(tabId);
    if (session) await session.followUp(text);
  });

  ipcMain.handle(IPC.AGENT_GET_QUEUED, async (_event, tabId: string) => {
    const session = sessionManager.getSession(tabId);
    if (!session) return { steering: [], followUp: [] };
    return {
      steering: [...session.getSteeringMessages()],
      followUp: [...session.getFollowUpMessages()],
    };
  });

  ipcMain.handle(IPC.AGENT_CLEAR_QUEUE, async (_event, tabId: string) => {
    const session = sessionManager.getSession(tabId);
    if (!session) return { steering: [], followUp: [] };
    return session.clearQueue();
  });

  ipcMain.handle(IPC.AGENT_ABORT, async (_event, tabId: string) => {
    await sessionManager.abort(tabId);
  });

  ipcMain.handle(IPC.AGENT_DISPOSE, async (_event, tabId: string) => {
    sessionManager.dispose(tabId);
  });

  // Get available slash commands for a tab's session (merged with prompt library commands)
  ipcMain.handle(IPC.AGENT_GET_SLASH_COMMANDS, async (_event, tabId: string) => {
    const commands = sessionManager.getSlashCommands(tabId);

    // Merge prompt library commands
    if (promptLibraryRef) {
      const promptCommands = promptLibraryRef.getAllCommands();
      const existingNames = new Set(commands.map(c => c.name));
      for (const pc of promptCommands) {
        if (!existingNames.has(pc.command)) {
          commands.push({
            name: pc.command,
            description: pc.description || pc.title,
            source: 'prompt',
          });
        }
      }
    }

    return commands;
  });

  // Ensure a session exists for a tab (create/continue without prompting).
  // Returns { history, sessionPath } from the continued session.
  ipcMain.handle(IPC.SESSION_ENSURE, async (_event, tabId: string, projectPath: string) => {
    if (!sessionManager.getSession(tabId)) {
      await sessionManager.createSession(tabId, projectPath);
    }
    return {
      history: sessionManager.getSessionHistory(tabId),
      sessionPath: sessionManager.getSessionPath(tabId) || null,
    };
  });

  // Get chat history from an existing session
  ipcMain.handle(IPC.SESSION_GET_HISTORY, async (_event, tabId: string) => {
    return sessionManager.getSessionHistory(tabId);
  });

  // Open a specific session file in a tab
  ipcMain.handle(IPC.SESSION_OPEN, async (_event, tabId: string, sessionPath: string, projectPath: string) => {
    await sessionManager.openSession(tabId, sessionPath, projectPath);
    return {
      history: sessionManager.getSessionHistory(tabId),
      sessionPath: sessionManager.getSessionPath(tabId) || null,
    };
  });
}
