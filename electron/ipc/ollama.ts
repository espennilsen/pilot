/**
 * ollama.ts — IPC handlers for Ollama integration.
 */

import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { OllamaService } from '../services/ollama-service';

/** Validate that an endpoint URL uses http or https scheme only (prevents non-HTTP protocol smuggling). Does NOT block private/internal IPs — this is acceptable for a desktop app where the user explicitly configures the endpoint. */
function isValidEndpoint(endpoint: string): boolean {
  return /^https?:\/\//.test(endpoint);
}

export function registerOllamaIpc(ollamaService: OllamaService) {
  // Get current Ollama status
  ipcMain.handle(IPC.OLLAMA_GET_STATUS, async () => {
    return ollamaService.status;
  });

  // Check connection to an Ollama endpoint (supports custom endpoint for the "Test" button)
  ipcMain.handle(IPC.OLLAMA_CHECK_CONNECTION, async (_event, endpoint?: string, apiKey?: string | null) => {
    // Validate endpoint to prevent SSRF — only http/https allowed
    if (endpoint && !isValidEndpoint(endpoint)) {
      return { ok: false, error: 'Invalid endpoint URL — only http:// and https:// are allowed' };
    }
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
    // Validate endpoint — reject non-HTTP schemes and return an explicit error object
    // so the renderer can surface feedback to the user.
    if (updates.endpoint && !isValidEndpoint(updates.endpoint)) {
      return { ...ollamaService.status, error: 'Invalid endpoint URL — only http:// and https:// are allowed' };
    }
    return ollamaService.saveSettings(updates);
  });

  // Validate a model name against Ollama (checks if the model exists)
  ipcMain.handle(IPC.OLLAMA_VALIDATE_MODEL, async (_event, modelId: string, endpoint?: string, apiKey?: string | null) => {
    // Validate endpoint to prevent SSRF
    if (endpoint && !isValidEndpoint(endpoint)) {
      return { valid: false, error: 'Invalid endpoint URL — only http:// and https:// are allowed' };
    }
    return ollamaService.validateModel(modelId, endpoint, apiKey);
  });

  // Manually refresh model list
  ipcMain.handle(IPC.OLLAMA_REFRESH_MODELS, async () => {
    return ollamaService.refreshModels();
  });
}