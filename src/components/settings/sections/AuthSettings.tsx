import { useAuthStore } from '../../../stores/auth-store';
import { useEffect, useState } from 'react';
import {
  Eye, EyeOff, LogOut, ChevronDown, RefreshCw, Loader2, Wifi,
  Link, KeyRound, Plus, X, Cloud, Server,
} from 'lucide-react';
import { IPC } from '../../../../shared/ipc';
import { invoke } from '../../../lib/ipc-client';
import type { OllamaCloudModel } from '../../../../shared/types';

interface AvailableModel {
  provider: string;
  id: string;
  name: string;
}

export function AuthSettings() {
  const { providers, ollamaStatus, loadStatus, setApiKey, logout } = useAuthStore();
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [piSettings, setPiSettings] = useState<Record<string, unknown>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  // ─── Ollama state ──────────────────────────────────────────────
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434');
  const [ollamaApiKey, setOllamaApiKey] = useState('');
  const [showOllamaKey, setShowOllamaKey] = useState(false);
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);
  const [ollamaRefreshing, setOllamaRefreshing] = useState(false);
  const [cloudModels, setCloudModels] = useState<OllamaCloudModel[]>([]);
  const [defaultModel, setDefaultModel] = useState('');
  // Cloud model adder
  const [newCloudId, setNewCloudId] = useState('');
  const [newCloudName, setNewCloudName] = useState('');
  const [cloudModelError, setCloudModelError] = useState<string | null>(null);
  const [cloudModelValidating, setCloudModelValidating] = useState(false);

  useEffect(() => {
    loadStatus();
    invoke(IPC.MODEL_GET_AVAILABLE).then((models: any) => {
      if (Array.isArray(models)) setAvailableModels(models);
    });
    invoke(IPC.PI_SETTINGS_GET).then((settings: any) => {
      if (settings && typeof settings === 'object') setPiSettings(settings);
    });
    // Load Ollama settings
    invoke(IPC.APP_SETTINGS_GET).then((s: any) => {
      if (s?.ollama) {
        setOllamaEnabled(s.ollama.enabled ?? false);
        setOllamaEndpoint(s.ollama.endpoint || 'http://localhost:11434');
        setOllamaApiKey(s.ollama.apiKey || '');
        setCloudModels(s.ollama.cloudModels ?? []);
        setDefaultModel(s.ollama.defaultModel || '');
      }
    });
  }, [loadStatus]);

  const refreshModelList = async () => {
    const models: any = await invoke(IPC.MODEL_GET_AVAILABLE);
    if (Array.isArray(models)) setAvailableModels(models);
  };

  // ─── Cloud provider handlers ──────────────────────────────────

  const handleSaveKey = async (provider: string) => {
    const key = apiKeyInputs[provider]?.trim();
    if (!key) return;
    setSaving(s => ({ ...s, [provider]: true }));
    const ok = await setApiKey(provider, key);
    setSaving(s => ({ ...s, [provider]: false }));
    if (ok) {
      setApiKeyInputs(s => ({ ...s, [provider]: '' }));
      await refreshModelList();
    }
  };

  const handleLogout = async (provider: string) => {
    await logout(provider);
    await refreshModelList();
  };

  const handleSetDefaultModel = async (provider: string, modelId: string) => {
    const updates = { defaultProvider: provider, defaultModel: modelId };
    const merged: any = await invoke(IPC.PI_SETTINGS_UPDATE, updates);
    setPiSettings(merged);
  };

  // ─── Ollama handlers ──────────────────────────────────────────

  const ollamaSave = async (overrides: Record<string, any> = {}) => {
    await invoke(IPC.OLLAMA_SAVE_SETTINGS, {
      enabled: overrides.enabled ?? ollamaEnabled,
      endpoint: overrides.endpoint ?? ollamaEndpoint,
      apiKey: ollamaApiKey || null,
      cloudModels: overrides.cloudModels ?? cloudModels,
      defaultModel: overrides.defaultModel ?? (defaultModel || null),
    });
    await loadStatus();
    await refreshModelList();
  };

  const handleOllamaToggle = async (enabled: boolean) => {
    setOllamaEnabled(enabled);
    await ollamaSave({ enabled });
  };

  const handleOllamaTest = async () => {
    setOllamaTesting(true);
    setOllamaTestResult(null);
    try {
      const result = await invoke(IPC.OLLAMA_CHECK_CONNECTION, ollamaEndpoint, ollamaApiKey || null) as { ok: boolean; version?: string; error?: string };
      setOllamaTestResult(result);
    } catch (err: any) {
      setOllamaTestResult({ ok: false, error: err?.message || 'Unknown error' });
    }
    setOllamaTesting(false);
  };

  const handleOllamaRefresh = async () => {
    setOllamaRefreshing(true);
    await invoke(IPC.OLLAMA_REFRESH_MODELS);
    await refreshModelList();
    setOllamaRefreshing(false);
  };

  const handleAddCloudModel = async () => {
    const id = newCloudId.trim();
    if (!id) return;
    const existing = cloudModels.find(m => m.id === id);
    if (existing) return; // duplicate

    // Validate the model exists in Ollama before adding
    setCloudModelValidating(true);
    setCloudModelError(null);
    try {
      const result = await invoke(IPC.OLLAMA_VALIDATE_MODEL, id) as { valid: boolean; error?: string };
      if (!result.valid) {
        setCloudModelError(result.error || 'Model not found');
        setCloudModelValidating(false);
        return;
      }
    } catch {
      // Validation request failed (Ollama might be down) — add anyway, user will see error at chat time
    }
    setCloudModelValidating(false);

    const newModel: OllamaCloudModel = {
      id,
      name: newCloudName.trim() || undefined,
    };
    const updated = [...cloudModels, newModel];
    setCloudModels(updated);
    setNewCloudId('');
    setNewCloudName('');
    setCloudModelError(null);
    await ollamaSave({ cloudModels: updated });
  };

  const handleRemoveCloudModel = async (id: string) => {
    const updated = cloudModels.filter(m => m.id !== id);
    setCloudModels(updated);
    // Clear default if it was this model
    if (defaultModel === id) {
      setDefaultModel('');
      await ollamaSave({ cloudModels: updated, defaultModel: null });
    } else {
      await ollamaSave({ cloudModels: updated });
    }
  };

  const handleDefaultModelChange = async (modelId: string) => {
    setDefaultModel(modelId);
    await ollamaSave({ defaultModel: modelId || null });
  };

  // All Ollama models (local + cloud) for the default model dropdown
  const ollamaModels = availableModels.filter(m => m.provider === 'ollama');

  const currentDefault = piSettings.defaultModel as string | undefined;
  const currentDefaultProvider = piSettings.defaultProvider as string | undefined;

  const PROVIDER_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    ollama: 'Ollama',
  };

  return (
    <div className="p-5 space-y-6">
      {/* ─── Ollama card ──────────────────────────────────────────── */}
      <div className="bg-bg-surface rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${ollamaEnabled ? (ollamaStatus?.available ? 'bg-success' : 'bg-warning') : 'bg-border'}`} />
            <span className="text-sm font-medium text-text-primary">Ollama</span>
            <span className="text-[11px] text-text-secondary">
              {ollamaEnabled
                ? ollamaStatus?.available
                  ? `${ollamaStatus.modelCount} models at ${ollamaStatus.endpoint}`
                  : ollamaStatus?.error || 'Not reachable'
                : 'Not enabled'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleOllamaTest}
              disabled={ollamaTesting}
              className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
            >
              {ollamaTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
              Test
            </button>
            {ollamaEnabled && (
              <button
                onClick={handleOllamaRefresh}
                disabled={ollamaRefreshing}
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${ollamaRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
            <button
              onClick={() => handleOllamaToggle(!ollamaEnabled)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                ollamaEnabled
                  ? 'bg-error/15 text-error hover:bg-error/25'
                  : 'bg-success/15 text-success hover:bg-success/25'
              }`}
            >
              {ollamaEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Endpoint URL */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Endpoint URL</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Link className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-secondary" />
                <input
                  type="text"
                  value={ollamaEndpoint}
                  onChange={(e) => setOllamaEndpoint(e.target.value)}
                  onBlur={() => ollamaSave()}
                  onKeyDown={(e) => { if (e.key === 'Enter') ollamaSave(); }}
                  placeholder="http://localhost:11434"
                  className="w-full text-xs font-mono bg-bg-base border border-border rounded pl-7 pr-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* API Key (optional) */}
          <div>
            <label className="text-xs text-text-secondary mb-1 flex items-center gap-1">
              <KeyRound className="w-3 h-3" />
              API Key <span className="text-[10px] text-text-secondary/60">(optional — for remote/Ollama Cloud)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showOllamaKey ? 'text' : 'password'}
                  value={ollamaApiKey}
                  onChange={(e) => setOllamaApiKey(e.target.value)}
                  onBlur={() => ollamaSave()}
                  onKeyDown={(e) => { if (e.key === 'Enter') ollamaSave(); }}
                  placeholder="Leave empty for local Ollama"
                  className="w-full text-xs font-mono bg-bg-base border border-border rounded px-2 py-1.5 pr-8 text-text-primary focus:outline-none focus:border-accent"
                />
                <button
                  onClick={() => setShowOllamaKey(!showOllamaKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                >
                  {showOllamaKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Test result */}
          {ollamaTestResult && (
            <div className={`px-2.5 py-1.5 rounded text-xs ${
              ollamaTestResult.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
            }`}>
              {ollamaTestResult.ok
                ? `Connected — Ollama v${ollamaTestResult.version} at ${ollamaEndpoint}`
                : ollamaTestResult.error || 'Connection failed'}
            </div>
          )}

          {/* ─── Cloud Models ──────────────────────────────────────── */}
          <div className="pt-1">
            <label className="text-xs text-text-secondary mb-1.5 flex items-center gap-1">
              <Cloud className="w-3 h-3" />
              Cloud Models
              <span className="text-[10px] text-text-secondary/60">— manually added, not from local list</span>
            </label>

            {/* Cloud model list */}
            {cloudModels.length > 0 && (
              <div className="space-y-1 mb-2">
                {cloudModels.map((cm) => (
                  <div key={cm.id} className="flex items-center gap-2 px-2 py-1 bg-bg-base border border-border rounded text-xs group">
                    <Cloud className="w-3 h-3 text-accent flex-shrink-0" />
                    <span className="font-mono text-text-primary flex-1 truncate">{cm.id}</span>
                    {cm.name && cm.name !== cm.id && (
                      <span className="text-text-secondary truncate">{cm.name}</span>
                    )}
                    <button
                      onClick={() => handleRemoveCloudModel(cm.id)}
                      className="text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add cloud model */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newCloudId}
                onChange={(e) => setNewCloudId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCloudModel(); }}
                placeholder="Model ID, e.g. GLM-5.1:cloud"
                className="flex-1 text-xs font-mono bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent"
              />
              <input
                type="text"
                value={newCloudName}
                onChange={(e) => setNewCloudName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCloudModel(); }}
                placeholder="Display name (optional)"
                className="w-32 text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleAddCloudModel}
                disabled={!newCloudId.trim() || cloudModelValidating}
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded transition-colors disabled:opacity-40"
              >
                {cloudModelValidating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Plus className="w-3 h-3" />
                )}
                {cloudModelValidating ? 'Checking…' : 'Add'}
              </button>
            </div>
            {cloudModelError && (
              <p className="text-xs text-error mt-1">⚠️ {cloudModelError}</p>
            )}
          </div>

          {/* ─── Default Model ──────────────────────────────────────── */}
          {ollamaEnabled && ollamaModels.length > 0 && (
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Default Model</label>
              <div className="relative">
                <select
                  value={defaultModel}
                  onChange={(e) => handleDefaultModelChange(e.target.value)}
                  className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent appearance-none cursor-pointer"
                >
                  <option value="">— None —</option>
                  <optgroup label="Local">
                    {ollamaModels
                      .filter(m => !cloudModels.some(cm => cm.id === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name || m.id}</option>
                      ))
                    }
                  </optgroup>
                  {cloudModels.length > 0 && (
                    <optgroup label="Cloud">
                      {ollamaModels
                        .filter(m => cloudModels.some(cm => cm.id === m.id))
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            ☁ {m.name || m.id}
                          </option>
                        ))
                      }
                    </optgroup>
                  )}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
              </div>
              {defaultModel && (
                <p className="text-[11px] text-accent mt-1">Default: {defaultModel}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Cloud providers ───────────────────────────────────────── */}
      {providers.filter(p => p.provider !== 'ollama').map((p) => {
        const label = PROVIDER_LABELS[p.provider] || p.provider;
        const models = (availableModels as AvailableModel[]).filter(m => m.provider === p.provider);

        return (
          <div key={p.provider} className="bg-bg-surface rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${p.hasAuth ? 'bg-success' : 'bg-border'}`} />
                <span className="text-sm font-medium text-text-primary">{label}</span>
                <span className="text-[11px] text-text-secondary">
                  {p.hasAuth
                    ? p.authType === 'env' ? '(env var)' : p.authType === 'oauth' ? '(OAuth)' : '(API key)'
                    : 'Not configured'}
                </span>
              </div>
              {p.hasAuth && p.authType !== 'env' && (
                <button
                  onClick={() => handleLogout(p.provider)}
                  className="flex items-center gap-1 text-xs text-text-secondary hover:text-error transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                  Remove
                </button>
              )}
            </div>

            <div className="px-4 py-3 space-y-3">
              {!p.hasAuth || p.authType === 'api_key' ? (
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">
                    {p.hasAuth ? 'Update API Key' : 'API Key'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type={showKeys[p.provider] ? 'text' : 'password'}
                        value={apiKeyInputs[p.provider] || ''}
                        onChange={(e) => setApiKeyInputs(s => ({ ...s, [p.provider]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveKey(p.provider)}
                        placeholder={p.hasAuth ? '••••••••' : `Enter ${label} API key`}
                        className="w-full text-xs font-mono bg-bg-base border border-border rounded px-2 py-1.5 pr-8 text-text-primary focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => setShowKeys(s => ({ ...s, [p.provider]: !s[p.provider] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
                      >
                        {showKeys[p.provider]
                          ? <EyeOff className="w-3.5 h-3.5" />
                          : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSaveKey(p.provider)}
                      disabled={!apiKeyInputs[p.provider]?.trim() || saving[p.provider]}
                      className="text-xs px-2.5 py-1.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-40"
                    >
                      {saving[p.provider] ? '…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : null}

              {p.hasAuth && models.length > 0 && (
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Default Model</label>
                  <div className="relative">
                    <select
                      value={currentDefaultProvider === p.provider ? currentDefault || '' : ''}
                      onChange={(e) => {
                        if (e.target.value) handleSetDefaultModel(p.provider, e.target.value);
                      }}
                      className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent appearance-none cursor-pointer"
                    >
                      <option value="">
                        {currentDefaultProvider === p.provider && currentDefault
                          ? ''
                          : '— Select default —'}
                      </option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                          {currentDefaultProvider === p.provider && currentDefault === m.id ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
                  </div>
                  {currentDefaultProvider === p.provider && currentDefault && (
                    <p className="text-[11px] text-accent mt-1">
                      Active default: {currentDefault}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {providers.length === 0 && (
        <p className="text-sm text-text-secondary text-center py-8">Loading providers…</p>
      )}
    </div>
  );
}