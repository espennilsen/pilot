/**
 * pi-session-memory.ts — Background memory extraction after agent responses.
 *
 * Extracted from PilotSessionManager to isolate the async background logic
 * that picks a cheap model, calls it with an extraction prompt, and processes
 * the result into memory entries.
 */

import type { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import type { MemoryManager } from './memory-manager';
import { callCheapModel } from './pi-session-helpers';

export interface MemoryExtractionContext {
  tabId: string;
  projectPath: string;
  userMessage: string;
  agentResponseText: string;
  memoryManager: MemoryManager;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  /** Callback to notify the renderer that memories were updated. */
  onMemoryUpdated: (count: number, preview: string) => void;
}

/**
 * Run memory extraction in background after an agent response.
 * Must never throw — all errors are caught and logged.
 */
export async function extractMemoriesInBackground(
  ctx: MemoryExtractionContext
): Promise<void> {
  try {
    const {
      projectPath,
      userMessage,
      agentResponseText,
      memoryManager,
      modelRegistry,
      authStorage,
      onMemoryUpdated,
    } = ctx;

    // Skip if memory is disabled
    if (!memoryManager.enabled) return;

    // Check debounce
    if (memoryManager.shouldSkipExtraction()) return;
    memoryManager.markExtractionRun();

    const existingMemories = await memoryManager.getMemoryContext(projectPath);

    // Build extraction prompt
    const extractionPrompt = memoryManager.buildExtractionPrompt(
      userMessage,
      agentResponseText,
      existingMemories
    );

    // Use the cheapest available model for extraction
    let extractionResult: string | null = null;
    try {
      const availableModels = modelRegistry.getAvailable();
      // Prefer haiku-class models for cost efficiency
      const cheapModel = availableModels.find(m =>
        m.id.includes('haiku') || m.id.includes('gpt-4o-mini') || m.id.includes('flash')
      ) || availableModels[0];

      if (!cheapModel) return;

      const auth = authStorage.get(cheapModel.provider);
      if (!auth || auth.type !== 'api_key' || !auth.key) return;
      const apiKey = auth.key;

      // Direct API call with 10s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        extractionResult = await callCheapModel(
          cheapModel.provider, apiKey, cheapModel.id, extractionPrompt, controller.signal
        );
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.debug('[PilotSession] Memory extraction API call failed:', err);
      return;
    }

    if (!extractionResult) return;

    const result = await memoryManager.processExtractionResult(
      extractionResult,
      projectPath
    );

    if (result.shouldSave) {
      onMemoryUpdated(result.memories.length, result.memories[0]?.text ?? '');
    }
  } catch (err) {
    console.debug('[PilotSession] Memory extraction failed:', err);
  }
}
