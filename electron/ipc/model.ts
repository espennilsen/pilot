import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { PilotSessionManager } from '../services/pi-session-manager';

export function registerModelIpc(sessionManager: PilotSessionManager) {
  ipcMain.handle(IPC.MODEL_GET_AVAILABLE, async () => {
    const registry = sessionManager.getModelRegistry();
    return registry.getAvailable().map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
    }));
  });

  ipcMain.handle(IPC.MODEL_SET, async (_event, tabId: string, provider: string, modelId: string) => {
    const session = sessionManager.getSession(tabId);
    const registry = sessionManager.getModelRegistry();
    const model = registry.find(provider, modelId);
    if (!model) throw new Error(`Model "${provider}/${modelId}" not found`);
    if (session) {
      await session.setModel(model);
    }
    return {
      provider,
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      reasoning: model.reasoning,
    };
  });

  ipcMain.handle(IPC.MODEL_CYCLE, async (_event, tabId: string) => {
    return sessionManager.cycleModel(tabId);
  });

  ipcMain.handle(IPC.MODEL_CYCLE_THINKING, async (_event, tabId: string) => {
    return sessionManager.cycleThinkingLevel(tabId);
  });

  // Get full model info for the active tab's session
  ipcMain.handle(IPC.MODEL_GET_INFO, async (_event, tabId: string) => {
    const session = sessionManager.getSession(tabId);
    if (!session) return null;
    const model = session.model;
    if (!model) return null;
    return {
      provider: model.provider,
      id: model.id,
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      reasoning: model.reasoning,
    };
  });

  // Get session stats (token usage, cost, message counts)
  ipcMain.handle(IPC.SESSION_GET_STATS, async (_event, tabId: string) => {
    const session = sessionManager.getSession(tabId);
    if (!session) return null;
    try {
      return session.getSessionStats();
    } catch (err) {
      console.warn('[IPC:model] Failed to get session stats:', err);
      return null;
    }
  });

  // Get context window usage (tokens used / context window size)
  ipcMain.handle(IPC.SESSION_GET_CONTEXT_USAGE, async (_event, tabId: string) => {
    const session = sessionManager.getSession(tabId);
    if (!session) return null;
    try {
      return session.getContextUsage();
    } catch (err) {
      console.warn('[IPC:model] Failed to get context usage:', err);
      return null;
    }
  });
}
