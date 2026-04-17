/**
 * ollama.ts — IPC handlers for Ollama integration.
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { OllamaService } from '../services/ollama-service';

export function registerOllamaIpc(ollamaService: OllamaService) {
  // Get current Ollama status
  ipcMain.handle(IPC.OLLAMA_GET_STATUS, async () => {
    return ollamaService.status;
  });

  // Check connection to an Ollama endpoint (supports custom endpoint for the "Test" button)
  ipcMain.handle(IPC.OLLAMA_CHECK_CONNECTION, async (_event, endpoint?: string, apiKey?: string | null) => {
    return ollamaService.checkConnection(endpoint, apiKey);
  });

  // Save Ollama settings
  ipcMain.handle(IPC.OLLAMA_SAVE_SETTINGS, async (_event, updates: {
    enabled?: boolean;
    endpoint?: string;
    apiKey?: string | null;
    cloudModels?: import('../../shared/types').OllamaCloudModel[];
    defaultModel?: string | null;
  }) => {
    return ollamaService.saveSettings(updates);
  });

  // Validate a model name against Ollama (checks if the model exists)
  ipcMain.handle(IPC.OLLAMA_VALIDATE_MODEL, async (_event, modelId: string, endpoint?: string, apiKey?: string | null) => {
    return ollamaService.validateModel(modelId, endpoint, apiKey);
  });

  // Manually refresh model list
  ipcMain.handle(IPC.OLLAMA_REFRESH_MODELS, async () => {
    return ollamaService.refreshModels();
  });
}