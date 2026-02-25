import { useState } from 'react';
import { useAuthStore, type ProviderAuthInfo } from '../../../stores/auth-store';
import {
  Key, Globe, CheckCircle, AlertCircle, Loader2, ExternalLink,
} from 'lucide-react';

// ─── Provider definitions ────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models (Sonnet, Opus, Haiku)',
    envVar: 'ANTHROPIC_API_KEY',
    supportsOAuth: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o, o1, o3 models',
    envVar: 'OPENAI_API_KEY',
    supportsOAuth: false,
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini models',
    envVar: 'GOOGLE_API_KEY',
    supportsOAuth: false,
  },
];

// ─── OAuth Prompt Dialog ─────────────────────────────────────────────────

function OAuthPromptDialog({
  message,
  onSubmit,
  onCancel,
}: {
  message: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!value.trim()) return;
    setSubmitting(true);
    onSubmit(value.trim());
  };

  return (
    <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg space-y-2.5">
      <div className="flex items-start gap-2">
        <Key className="w-4 h-4 text-accent mt-0.5 flex-shrink-0" />
        <p className="text-sm text-text-primary">{message}</p>
      </div>
      <div className="flex gap-1.5">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Paste code here…"
          autoFocus
          className="flex-1 text-xs bg-bg-base border border-border rounded px-2.5 py-1.5 text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || submitting}
          className="px-2.5 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded transition-colors disabled:opacity-50"
        >
          {submitting ? '…' : 'Submit'}
        </button>
        <button
          onClick={onCancel}
          className="px-1.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Provider Card ───────────────────────────────────────────────────────

function ProviderCard({
  provider,
  authInfo,
  onSetApiKey,
  onLoginOAuth,
  oauthInProgress,
}: {
  provider: typeof PROVIDERS[number];
  authInfo?: ProviderAuthInfo;
  onSetApiKey: (key: string) => Promise<boolean>;
  onLoginOAuth: () => void;
  oauthInProgress: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const isConnected = authInfo?.hasAuth ?? false;

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    const ok = await onSetApiKey(apiKey.trim());
    setSaving(false);
    if (ok) { setApiKey(''); setExpanded(false); }
  };

  return (
    <div className={`border rounded-lg transition-colors ${
      isConnected ? 'border-success/30 bg-success/5' : 'border-border bg-bg-surface'
    }`}>
      <div className="flex items-center gap-3 p-3">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
          isConnected ? 'bg-success/20' : 'bg-bg-elevated'
        }`}>
          {isConnected
            ? <CheckCircle className="w-3.5 h-3.5 text-success" />
            : <Globe className="w-3.5 h-3.5 text-text-secondary" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-primary">{provider.name}</span>
          {isConnected && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success font-medium">
              Connected
            </span>
          )}
          <p className="text-xs text-text-secondary">{provider.description}</p>
        </div>
        {!isConnected && !expanded && (
          <div className="flex items-center gap-1.5">
            {provider.supportsOAuth && (
              <button
                onClick={onLoginOAuth}
                disabled={oauthInProgress}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded transition-colors disabled:opacity-50"
              >
                <ExternalLink className="w-3 h-3" />
                Login
              </button>
            )}
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-text-primary bg-bg-elevated border border-border hover:border-accent/50 rounded transition-colors"
            >
              <Key className="w-3 h-3" />
              API Key
            </button>
          </div>
        )}
      </div>
      {expanded && !isConnected && (
        <div className="px-3 pb-3 pt-0">
          <div className="flex gap-1.5">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey(); }}
              placeholder={provider.envVar}
              autoFocus
              className="flex-1 text-xs bg-bg-base border border-border rounded px-2.5 py-1.5 text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent"
            />
            <button
              onClick={handleSaveKey}
              disabled={!apiKey.trim() || saving}
              className="px-2.5 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded transition-colors disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
            <button
              onClick={() => { setExpanded(false); setApiKey(''); }}
              className="px-1.5 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AuthStep Component ──────────────────────────────────────────────────

export default function AuthStep() {
  const { providers, setApiKey, loginOAuth, oauthInProgress, oauthMessage, oauthPrompt, submitOAuthPrompt, cancelOAuthPrompt, error, clearError } = useAuthStore();

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-secondary">
        Connect at least one AI provider. You can add more later in Settings.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg">
          <AlertCircle className="w-4 h-4 text-error mt-0.5 flex-shrink-0" />
          <p className="text-xs text-error break-words flex-1">{error}</p>
          <button onClick={clearError} className="text-xs text-error/70 hover:text-error">✕</button>
        </div>
      )}

      {oauthInProgress && !oauthPrompt && (
        <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-lg">
          <Loader2 className="w-4 h-4 text-accent animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm text-text-primary font-medium">Authenticating…</p>
            <p className="text-xs text-text-secondary">{oauthMessage || 'Complete login in your browser'}</p>
          </div>
        </div>
      )}

      {oauthPrompt && (
        <OAuthPromptDialog
          message={oauthPrompt}
          onSubmit={submitOAuthPrompt}
          onCancel={cancelOAuthPrompt}
        />
      )}

      <div className="space-y-2">
        {PROVIDERS.map((provider) => {
          const authInfo = providers.find(p => p.provider === provider.id);
          return (
            <ProviderCard
              key={provider.id}
              provider={provider}
              authInfo={authInfo}
              onSetApiKey={(key) => setApiKey(provider.id, key)}
              onLoginOAuth={() => loginOAuth(provider.id)}
              oauthInProgress={oauthInProgress === provider.id}
            />
          );
        })}
      </div>

      <p className="text-[10px] text-text-secondary/40 text-center">
        Keys are stored locally in ~/.config/pilot/auth.json
      </p>
    </div>
  );
}
