/**
 * ollama-service.ts — Ollama integration service.
 *
 * Uses the official `ollama` JavaScript library for API communication.
 * Auto-detects a running Ollama instance, fetches local models,
 * and registers them in the pi-ai ModelRegistry using the OpenAI-compatible API.
 *
 * Supports:
 * - Configurable endpoint URL (default: http://localhost:11434)
 * - Optional API key (for remote/Ollama Cloud instances)
 * - Auto-detection on startup
 * - Periodic model list refresh
 * - Model capability detection via ollama.show()
 */

import { Ollama, type ListResponse, type ModelResponse, type ShowResponse } from 'ollama';
import type { ModelRegistry } from '@mariozechner/pi-coding-agent';
import { loadAppSettings, saveAppSettings, getPiAgentDir } from './app-settings';
import { broadcastToRenderer } from '../utils/broadcast';
import { IPC } from '../../shared/ipc';
import type { OllamaCloudModel } from '../../shared/types';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getLogger } from './logger';

const log = getLogger('ollama');

// ─── Types ─────────────────────────────────────────────────────────

export interface OllamaStatus {
  available: boolean;
  endpoint: string;
  modelCount: number;
  version?: string;
  error?: string;
}

// Approximate context windows and max tokens for common model families.
// Used as fallbacks when ollama.show() doesn't expose num_ctx.
const MODEL_FAMILY_DEFAULTS: Record<string, { contextWindow: number; maxTokens: number; reasoning: boolean }> = {
  'qwen3':            { contextWindow: 131072, maxTokens: 16384, reasoning: true },
  'qwen2.5':         { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'qwen2':           { contextWindow: 32768,  maxTokens: 8192,  reasoning: false },
  'llama4':           { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'llama3.3':        { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'llama3.2':        { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'llama3.1':        { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'llama3':          { contextWindow: 8192,   maxTokens: 4096,  reasoning: false },
  'codellama':       { contextWindow: 16384,  maxTokens: 4096,  reasoning: false },
  'mistral':         { contextWindow: 32768,  maxTokens: 8192,  reasoning: false },
  'mixtral':         { contextWindow: 32768,  maxTokens: 8192,  reasoning: false },
  'gemma3':          { contextWindow: 131072, maxTokens: 16384, reasoning: true },
  'gemma2':          { contextWindow: 8192,   maxTokens: 4096,  reasoning: false },
  'deepseek-r1':     { contextWindow: 131072, maxTokens: 16384, reasoning: true },
  'deepseek-coder':  { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'deepseek':        { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'phi4':            { contextWindow: 16384,  maxTokens: 4096,  reasoning: true },
  'phi3.5':          { contextWindow: 16384,  maxTokens: 4096,  reasoning: false },
  'phi3':            { contextWindow: 8192,   maxTokens: 4096,  reasoning: false },
  'command-r':       { contextWindow: 131072, maxTokens: 4096,  reasoning: false },
  'starcoder2':      { contextWindow: 16384,  maxTokens: 4096,  reasoning: false },
  'llava':           { contextWindow: 8192,   maxTokens: 4096,  reasoning: false },
  'yi':              { contextWindow: 32768,  maxTokens: 4096,  reasoning: false },
  'claude':          { contextWindow: 131072, maxTokens: 16384, reasoning: false },
  'falcon':          { contextWindow: 8192,   maxTokens: 4096,  reasoning: false },
};

const DEFAULT_MODEL_SETTINGS = {
  contextWindow: 8192,
  maxTokens: 4096,
  reasoning: false,
};

const PROVIDER_NAME = 'ollama';
const DEFAULT_ENDPOINT = 'http://localhost:11434';
// Ollama doesn't require a real key, but the pi-ai SDK needs one for dynamic providers.
// Use "ollama" as the sentinel (matches the working models.json convention).
// Ollama ignores the Authorization header for local requests.
const OLLAMA_LOCAL_KEY = 'ollama';

// ─── Service ───────────────────────────────────────────────────────

export class OllamaService {
  private modelRegistry: ModelRegistry | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private client: Ollama | null = null;
  private _status: OllamaStatus = {
    available: false,
    endpoint: DEFAULT_ENDPOINT,
    modelCount: 0,
  };

  /** Get current status (read-only snapshot) */
  get status(): OllamaStatus {
    return { ...this._status };
  }

  /** Create an Ollama client configured with the current settings */
  private createClient(endpoint?: string, apiKey?: string | null): Ollama {
    const host = endpoint || this.getSettings().endpoint;
    const key = apiKey !== undefined ? apiKey : this.getSettings().apiKey;

    const headers: Record<string, string> = {};
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    log.debug(`Creating Ollama client: host=${host}, hasApiKey=${!!key}`);
    return new Ollama({ host, headers });
  }

  /** Get current Ollama settings from app-settings */
  getSettings(): {
    enabled: boolean;
    endpoint: string;
    apiKey: string | null;
    cloudModels: OllamaCloudModel[];
    defaultModel: string | null;
  } {
    const settings = loadAppSettings();
    const ollama = settings.ollama;
    return {
      enabled: ollama?.enabled ?? false,
      endpoint: ollama?.endpoint || DEFAULT_ENDPOINT,
      apiKey: ollama?.apiKey || null,
      cloudModels: ollama?.cloudModels ?? [],
      defaultModel: ollama?.defaultModel || null,
    };
  }

  /** Save Ollama settings, rebuild client, and re-register models */
  async saveSettings(updates: {
    enabled?: boolean;
    endpoint?: string;
    apiKey?: string | null;
    cloudModels?: OllamaCloudModel[];
    defaultModel?: string | null;
  }): Promise<OllamaStatus> {
    const current = this.getSettings();
    const newEnabled = updates.enabled ?? current.enabled;
    const newEndpoint = updates.endpoint ?? current.endpoint;
    const newApiKey = updates.apiKey !== undefined ? updates.apiKey : current.apiKey;
    const newCloudModels = updates.cloudModels ?? current.cloudModels;
    const newDefaultModel = updates.defaultModel !== undefined ? updates.defaultModel : current.defaultModel;

    log.info(`Saving settings: enabled=${newEnabled}, endpoint=${newEndpoint}, apiKey=${newApiKey ? '***' : '(none)'}, cloudModels=${newCloudModels.length}, defaultModel=${newDefaultModel || '(none)'}`);

    saveAppSettings({
      ollama: {
        enabled: newEnabled,
        endpoint: newEndpoint,
        apiKey: newApiKey || '',
        cloudModels: newCloudModels,
        defaultModel: newDefaultModel || undefined,
      },
    } as any);

    // Rebuild the client with the new settings
    this.client = this.createClient(newEndpoint, newApiKey);

    // Re-register models with updated config
    await this.refreshModels();

    // Apply default model to pi settings if set
    this.applyDefaultModel(newDefaultModel);

    // Start or stop periodic refresh based on enabled state
    if (newEnabled) {
      if (!this.refreshTimer) this.startPeriodicRefresh();
    } else {
      this.stopPeriodicRefresh();
    }

    return { ...this._status };
  }

  /** Set the model registry and perform initial detection */
  init(modelRegistry: ModelRegistry): void {
    this.modelRegistry = modelRegistry;
    const settings = this.getSettings();
    this.client = this.createClient(settings.endpoint, settings.apiKey);

    log.info(`Initializing: enabled=${settings.enabled}, endpoint=${settings.endpoint}, cloudModels=${settings.cloudModels.length}`);

    if (settings.enabled) {
      this.refreshModels().catch(() => {});
      this.startPeriodicRefresh();
    }
  }

  /** Start periodic model list refresh */
  startPeriodicRefresh(intervalMs = 60_000): void {
    this.stopPeriodicRefresh();
    log.info(`Starting periodic refresh every ${intervalMs / 1000}s`);
    this.refreshTimer = setInterval(() => {
      this.refreshModels().catch(() => {});
    }, intervalMs);
  }

  /** Stop periodic refresh */
  stopPeriodicRefresh(): void {
    if (this.refreshTimer) {
      log.info('Stopping periodic refresh');
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Check if Ollama is reachable at the given (or configured) endpoint */
  async checkConnection(endpoint?: string, apiKey?: string | null): Promise<{ ok: boolean; version?: string; error?: string }> {
    const client = this.createClient(endpoint, apiKey);
    try {
      const versionResp = await client.version();
      log.info(`Connection check OK: version=${versionResp.version}`);
      return { ok: true, version: versionResp.version };
    } catch (err: any) {
      const msg = err?.message || String(err);
      log.warn(`Connection check failed: ${msg}`);
      if (/ECONNREFUSED/i.test(msg)) {
        return { ok: false, error: 'Connection refused — is Ollama running?' };
      }
      if (/fetch failed|ETIMEDOUT|Timeout/i.test(msg)) {
        return { ok: false, error: 'Connection timed out' };
      }
      return { ok: false, error: 'Connection failed' };
    }
  }

  /** Validate that a model exists in Ollama — works for both local and cloud models */
  async validateModel(modelId: string, endpoint?: string, apiKey?: string | null): Promise<{ valid: boolean; error?: string }> {
    const ep = (endpoint || this.getSettings().endpoint).replace(/\/+$/, '') + '/v1';
    const key = apiKey !== undefined ? apiKey : this.getSettings().apiKey;
    log.info(`Validating model "${modelId}" against ${ep}`);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const resp = await fetch(`${ep}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'ok' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (resp.status === 404) {
        const body = await resp.text().catch(() => '');
        const match = body.match(/model.*not found/i);
        const hint = `Model "${modelId}" not found in Ollama. Ollama treats colons as tag separators (e.g. "model:tag"), so check the name matches exactly. Run \`ollama list\` to see local models.`;
        log.warn(`Model validation failed: ${match ? body : resp.status}`);
        return { valid: false, error: hint };
      }

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        log.warn(`Model validation unexpected error: HTTP ${resp.status} ${body.slice(0, 200)}`);
        return { valid: false, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
      }

      log.info(`Model "${modelId}" validated successfully`);
      return { valid: true };
    } catch (err: any) {
      const msg = err?.message || String(err);
      log.warn(`Model validation request failed: ${msg}`);
      if (/ECONNREFUSED|fetch failed/i.test(msg)) {
        return { valid: false, error: 'Cannot connect to Ollama — is it running?' };
      }
      return { valid: false, error: 'Validation request failed' };
    }
  }

  private _isRefreshing = false;

  /** Fetch models from Ollama and register them in the ModelRegistry */
  async refreshModels(): Promise<OllamaStatus> {
    // Guard against concurrent refresh calls (e.g. periodic refresh + saveSettings)
    if (this._isRefreshing) {
      log.debug('refreshModels already in progress — skipping');
      return { ...this._status };
    }
    this._isRefreshing = true;
    try {
      return await this._doRefreshModels();
    } finally {
      this._isRefreshing = false;
    }
  }

  private async _doRefreshModels(): Promise<OllamaStatus> {
    if (!this.modelRegistry || !this.client) {
      this._status = { available: false, endpoint: this.getSettings().endpoint, modelCount: 0, error: 'Not initialized' };
      this.broadcastStatus();
      return { ...this._status };
    }

    const { enabled, endpoint, apiKey, cloudModels } = this.getSettings();

    if (!enabled) {
      this.unregisterModels();
      this._status = { available: false, endpoint, modelCount: 0 };
      this.broadcastStatus();
      return { ...this._status };
    }

    let localModels: ModelResponse[] = [];
    let version: string | undefined;
    let localAvailable = false;

    // Try to fetch local models (may fail if Ollama isn't running, that's fine — cloud still works)
    try {
      log.info('Fetching local model list from Ollama...');
      const listResponse: ListResponse = await this.client.list();
      localModels = listResponse.models || [];
      localAvailable = true;
      log.info(`Found ${localModels.length} local models: ${localModels.map(m => m.name).join(', ')}`);

      try {
        const v = await this.client.version();
        version = v.version;
        log.debug(`Ollama version: ${version}`);
      } catch { /* non-critical */ }
    } catch (err: any) {
      log.warn(`Local Ollama not reachable: ${err?.message || err}. Cloud models (${cloudModels.length}) will still be registered.`);
    }

    // Fetch capabilities for local models
    const modelCapabilities = localAvailable
      ? await this.fetchModelCapabilities(localModels)
      : new Map<string, ShowResponse>();

    // Register both local and cloud models
    this.registerModels(localModels, modelCapabilities, cloudModels, endpoint, apiKey);

    const totalModels = localModels.length + cloudModels.length;
    this._status = {
      available: localAvailable || cloudModels.length > 0,
      endpoint,
      modelCount: totalModels,
      version,
    };

    log.info(`Refresh complete: available=${this._status.available}, localModels=${localModels.length}, cloudModels=${cloudModels.length}, total=${totalModels}`);
    this.broadcastStatus();
    return { ...this._status };
  }

  /** Fetch capabilities for each model via ollama.show() in parallel (limited concurrency) */
  private async fetchModelCapabilities(models: ModelResponse[]): Promise<Map<string, ShowResponse>> {
    const capabilities = new Map<string, ShowResponse>();
    const CONCURRENCY = 3;

    log.debug(`Fetching capabilities for ${models.length} models (concurrency=${CONCURRENCY})`);

    // Process in batches
    for (let i = 0; i < models.length; i += CONCURRENCY) {
      const batch = models.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (m) => {
          const show = await this.client!.show({ model: m.name });
          return { name: m.name, show };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.show) {
          capabilities.set(r.value.name, r.value.show);
        } else if (r.status === 'rejected') {
          log.debug(`Failed to get capabilities for model: ${r.reason?.message || r.reason}`);
        }
      }
    }

    log.debug(`Got capabilities for ${capabilities.size}/${models.length} models`);
    return capabilities;
  }

  /** Register Ollama models with the pi-ai ModelRegistry */
  private registerModels(
    localModels: ModelResponse[],
    capabilities: Map<string, ShowResponse>,
    cloudModels: OllamaCloudModel[],
    endpoint: string,
    apiKey: string | null,
  ): void {
    if (!this.modelRegistry) return;

    // Build the OpenAI-compatible base URL (append /v1 for the completions API)
    const baseUrl = endpoint.replace(/\/+$/, '') + '/v1';

    // Use "ollama" as sentinel key (matches working Pi CLI models.json config).
    // Ollama ignores the Authorization header for local requests.
    const effectiveApiKey = apiKey || OLLAMA_LOCAL_KEY;

    // Ollama's OpenAI compat differs from standard OpenAI:
    // Match the proven models.json config that works with Pi CLI.
    const OLLAMA_COMPAT = {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    };

    // Build local model defs
    const localDefs = localModels.map((m) => {
      const showResp = capabilities.get(m.name);
      const familySettings = this.getModelFamilySettings(m, showResp);
      const supportsImages = this.modelSupportsImages(m, showResp);

      log.debug(`Local model: ${m.name} -> ctx=${familySettings.contextWindow}, maxTokens=${familySettings.maxTokens}, reasoning=${familySettings.reasoning}, vision=${supportsImages}`);

      return {
        id: m.name,
        name: this.formatModelName(m),
        baseUrl,
        reasoning: familySettings.reasoning,
        input: supportsImages ? ['text' as const, 'image' as const] : ['text' as const],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: familySettings.contextWindow,
        maxTokens: familySettings.maxTokens,
        compat: OLLAMA_COMPAT,
      };
    });

    // Build cloud model defs
    const cloudDefs = cloudModels.map((cm) => {
      log.info(`Cloud model: ${cm.id} (name=${cm.name || cm.id}, ctx=${cm.contextWindow ?? 131072}, vision=${cm.vision ?? false})`);
      return {
        id: cm.id,
        name: cm.name || cm.id,
        baseUrl,
        reasoning: cm.reasoning ?? false,
        input: cm.vision ? ['text' as const, 'image' as const] : ['text' as const],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: cm.contextWindow ?? 131072,
        maxTokens: cm.maxTokens ?? 16384,
        compat: OLLAMA_COMPAT,
      };
    });

    // Deduplicate: local models win over cloud models with the same id
    // (user may have pulled a local version of a cloud model with better latency)
    const localIds = new Set(localDefs.map(m => m.id));
    const merged = [...localDefs, ...cloudDefs.filter(cm => !localIds.has(cm.id))];

    log.info(`Registering ${merged.length} models with provider "${PROVIDER_NAME}": baseUrl=${baseUrl}, apiKey=${effectiveApiKey === OLLAMA_LOCAL_KEY ? '(local)' : '***'}, authHeader=true, api=openai-completions`);
    log.debug(`Model IDs: ${merged.map(m => m.id).join(', ')}`);

    try {
      this.modelRegistry.registerProvider(PROVIDER_NAME, {
        baseUrl,
        apiKey: effectiveApiKey,
        api: 'openai-completions',
        authHeader: true, // Always include Authorization header (Ollama ignores it locally)
        models: merged,
      });
      log.info(`Successfully registered ${merged.length} Ollama models`);
    } catch (err) {
      log.error(`Failed to register models: ${err}`);
    }
  }

  /** Unregister all Ollama models from the registry */
  private unregisterModels(): void {
    if (!this.modelRegistry) return;
    try {
      this.modelRegistry.unregisterProvider(PROVIDER_NAME);
      log.info('Unregistered Ollama models');
    } catch {
      // Provider may not be registered yet
    }
  }

  /** Broadcast status to renderer */
  private broadcastStatus(): void {
    broadcastToRenderer(IPC.OLLAMA_STATUS, this._status);
  }

  // ─── Model metadata helpers ──────────────────────────────────────

  /** Determine context window, max tokens, and reasoning from model metadata */
  private getModelFamilySettings(
    model: ModelResponse,
    showResp?: ShowResponse,
  ): { contextWindow: number; maxTokens: number; reasoning: boolean } {
    // Try to read num_ctx from model_info
    if (showResp?.model_info) {
      const info = showResp.model_info as Record<string, any>;
      // Ollama stores context length under various keys depending on the model
      const contextKeys = [
        `${model.name.split(':')[0]}.context_length`,  // e.g. llama3.1.context_length
        'general.context_length',
        `${showResp.details?.family}.context_length`,
      ];
      for (const key of contextKeys) {
        if (info[key] && typeof info[key] === 'number') {
          return {
            contextWindow: info[key],
            maxTokens: Math.min(info[key] / 4, 16384),
            reasoning: this.hasThinkingCapability(showResp),
          };
        }
      }
      // Fallback: scan all keys for context_length
      for (const [key, val] of Object.entries(info)) {
        if (key.endsWith('.context_length') && typeof val === 'number') {
          return {
            contextWindow: val,
            maxTokens: Math.min(val / 4, 16384),
            reasoning: this.hasThinkingCapability(showResp),
          };
        }
      }
    }

    // Fallback to family-based heuristics
    const family = (model.details?.family || '').toLowerCase();
    const modelId = model.name.toLowerCase();

    if (MODEL_FAMILY_DEFAULTS[family]) {
      return MODEL_FAMILY_DEFAULTS[family];
    }

    // Try matching model name prefix against known families
    for (const [key, settings] of Object.entries(MODEL_FAMILY_DEFAULTS)) {
      if (modelId.startsWith(key) || family.startsWith(key)) {
        return settings;
      }
    }

    return DEFAULT_MODEL_SETTINGS;
  }

  /** Check if a model has thinking/reasoning capability */
  private hasThinkingCapability(showResp: ShowResponse): boolean {
    if (!showResp) return false;
    const capabilities = showResp.capabilities || [];
    return capabilities.includes('thinking');
  }

  /** Format a user-friendly display name for a model */
  private formatModelName(model: ModelResponse): string {
    const name = model.name;
    const paramSize = model.details?.parameter_size;
    const quant = model.details?.quantization_level;

    if (paramSize) {
      const base = name.split(':')[0];
      const formatted = base
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      return quant ? `${formatted} (${paramSize} ${quant})` : `${formatted} (${paramSize})`;
    }

    return name;
  }

  /** Check if a model supports image input */
  private modelSupportsImages(model: ModelResponse, showResp?: ShowResponse): boolean {
    // Prefer capabilities from show() response
    if (showResp?.capabilities) {
      return showResp.capabilities.includes('vision');
    }

    // Fallback to known multimodal families
    const family = (model.details?.family || '').toLowerCase();
    const name = model.name.toLowerCase();
    const multimodalFamilies = ['llava', 'llama3.2-vision', 'gemma3', 'pixtral', 'minicpm-v'];
    return multimodalFamilies.some(f => family.includes(f) || name.includes(f));
  }

  /** Apply default Ollama model to pi settings (used by new sessions) */
  private applyDefaultModel(defaultModel: string | null): void {
    if (!defaultModel) return;
    log.info(`Applying default model: ${PROVIDER_NAME}/${defaultModel}`);
    try {
      const piAgentDir = getPiAgentDir();
      const settingsPath = join(piAgentDir, 'settings.json');
      let current: Record<string, unknown> = {};
      try {
        if (existsSync(settingsPath)) {
          current = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        }
      } catch { /* */ }
      const merged = { ...current, defaultProvider: PROVIDER_NAME, defaultModel };
      if (!existsSync(piAgentDir)) mkdirSync(piAgentDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
      log.info(`Default model written to ${settingsPath}`);
    } catch (err) {
      log.warn(`Failed to apply default model: ${err}`);
    }
  }

  /** Clean up on app quit */
  dispose(): void {
    log.info('Disposing Ollama service');
    this.stopPeriodicRefresh();
    this.unregisterModels();
  }
}