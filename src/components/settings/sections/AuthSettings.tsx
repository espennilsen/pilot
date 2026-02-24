import { useAuthStore } from '../../../stores/auth-store';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, LogOut, ChevronDown } from 'lucide-react';
import { IPC } from '../../../../shared/ipc';
import { invoke } from '../../../lib/ipc-client';

interface AvailableModel {
  provider: string;
  id: string;
  name: string;
}

export function AuthSettings() {
  const { providers, loadStatus, setApiKey, logout } = useAuthStore();
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [piSettings, setPiSettings] = useState<Record<string, unknown>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadStatus();
    invoke(IPC.MODEL_GET_AVAILABLE).then((models: any) => {
      if (Array.isArray(models)) setAvailableModels(models);
    });
    invoke(IPC.PI_SETTINGS_GET).then((settings: any) => {
      if (settings && typeof settings === 'object') setPiSettings(settings);
    });
  }, [loadStatus]);

  const handleSaveKey = async (provider: string) => {
    const key = apiKeyInputs[provider]?.trim();
    if (!key) return;
    setSaving(s => ({ ...s, [provider]: true }));
    const ok = await setApiKey(provider, key);
    setSaving(s => ({ ...s, [provider]: false }));
    if (ok) {
      setApiKeyInputs(s => ({ ...s, [provider]: '' }));
      // Refresh models after key change
      const models: any = await invoke(IPC.MODEL_GET_AVAILABLE);
      if (Array.isArray(models)) setAvailableModels(models);
    }
  };

  const handleLogout = async (provider: string) => {
    await logout(provider);
    const models: any = await invoke(IPC.MODEL_GET_AVAILABLE);
    if (Array.isArray(models)) setAvailableModels(models);
  };

  const handleSetDefaultModel = async (provider: string, modelId: string) => {
    const updates = { defaultProvider: provider, defaultModel: modelId };
    const merged: any = await invoke(IPC.PI_SETTINGS_UPDATE, updates);
    setPiSettings(merged);
  };

  // Group models by provider
  const modelsByProvider = availableModels.reduce<Record<string, AvailableModel[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  const currentDefault = piSettings.defaultModel as string | undefined;
  const currentDefaultProvider = piSettings.defaultProvider as string | undefined;

  const PROVIDER_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
  };

  return (
    <div className="p-5 space-y-6">
      {/* Provider auth cards */}
      {providers.map((p) => {
        const label = PROVIDER_LABELS[p.provider] || p.provider;
        const models = modelsByProvider[p.provider] || [];
        const isExpanded = true; // always show

        return (
          <div key={p.provider} className="bg-bg-surface rounded-lg border border-border overflow-hidden">
            {/* Provider header */}
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
              {/* API key input */}
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

              {/* Default model selector */}
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
