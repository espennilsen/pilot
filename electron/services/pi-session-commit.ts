/**
 * pi-session-commit.ts — Commit message generation using a cheap/fast model.
 *
 * Extracted from PilotSessionManager to isolate the model selection,
 * prompt building, and API call logic for generating git commit messages.
 */

import type { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import type { TextContent, Context } from '@mariozechner/pi-ai';
import { completeSimple } from '@mariozechner/pi-ai';
import { loadAppSettings } from './app-settings';

/**
 * Generate a commit message from a git diff using a cheap/fast model.
 * Uses the Pi SDK's completeSimple() — handles all providers, auth (API key + OAuth), retries.
 */
export async function generateCommitMessage(
  diff: string,
  modelRegistry: ModelRegistry,
  authStorage: AuthStorage
): Promise<string> {
  const settings = loadAppSettings();
  const availableModels = modelRegistry.getAvailable();

  // User override: "provider/model-id" format
  let cheapModel = undefined as typeof availableModels[0] | undefined;
  if (settings.commitMsgModel) {
    const [provider, ...rest] = settings.commitMsgModel.split('/');
    const modelId = rest.join('/');
    cheapModel = availableModels.find(m => m.provider === provider && m.id === modelId);
    if (!cheapModel) {
      console.warn(`[commit-msg] Configured model "${settings.commitMsgModel}" not found or not authenticated, falling back to auto-select`);
    }
  }

  // Auto-select: prefer cheap/fast models
  if (!cheapModel) {
    cheapModel = availableModels.find(m =>
      m.id.includes('claude-haiku-4') || m.id.includes('gpt-5.1-codex-mini') || m.id.includes('flash')
    ) || availableModels.find(m =>
      m.id.includes('haiku') || m.id.includes('mini') || m.id.includes('flash')
    ) || availableModels[0];
  }

  if (!cheapModel) throw new Error('No models available');
  console.log(`[commit-msg] Using model: ${cheapModel.provider}/${cheapModel.id}`);

  const apiKey = await authStorage.getApiKey(cheapModel.provider);
  if (!apiKey) {
    throw new Error('No API key configured — add an API key or login via OAuth in Settings → Auth');
  }

  const maxTokens = loadAppSettings().commitMsgMaxTokens ?? 4096;

  const context: Context = {
    systemPrompt: `You generate concise git commit messages following Conventional Commits format.
Output ONLY the commit message — no quotes, no markdown fences, no explanation.`,
    messages: [{
      role: 'user' as const,
      content: [{
        type: 'text' as const,
        text: `Write a commit message for this diff:

Rules:
- First line: type(optional scope): short description (max 72 chars)
- If multiple unrelated changes, use the most significant one for the first line
- Add a blank line and bullet points for additional changes only if truly needed
- Be specific about what changed, not why

Diff:
${diff.slice(0, 50000)}`,
      }],
      timestamp: Date.now(),
    }],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await completeSimple(cheapModel, context, {
      apiKey,
      maxTokens,
      signal: controller.signal,
    });

    if (response.errorMessage) {
      throw new Error(`Model error: ${response.errorMessage}`);
    }

    const text = response.content
      .filter((c): c is TextContent => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim();

    if (!text) {
      throw new Error(
        `Empty response from ${cheapModel.provider}/${cheapModel.id} (stop: ${response.stopReason}, content types: ${response.content.map(c => c.type).join(',')})`
      );
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
