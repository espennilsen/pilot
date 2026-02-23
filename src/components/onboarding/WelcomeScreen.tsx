import { useState, useEffect } from 'react';
import { useAuthStore, type ProviderAuthInfo } from '../../stores/auth-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useProjectStore } from '../../stores/project-store';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import {
  Key, Globe, CheckCircle, AlertCircle, Loader2, ExternalLink,
  Terminal, Code, FolderOpen, ChevronRight, ChevronLeft, Sparkles,
} from 'lucide-react';
import appIcon from '../../assets/icon.png';

// ─── Step definitions ────────────────────────────────────────────────────

type Step = 'auth' | 'tools' | 'project';

const STEPS: { id: Step; label: string }[] = [
  { id: 'auth', label: 'Connect Provider' },
  { id: 'tools', label: 'Tools' },
  { id: 'project', label: 'Open Project' },
];

// ─── Main component ─────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const { hasAnyAuth } = useAuthStore();
  const { onboardingComplete, completeOnboarding } = useAppSettingsStore();
  const { projectPath } = useProjectStore();
  const [currentStep, setCurrentStep] = useState<Step>('auth');

  const currentIndex = STEPS.findIndex(s => s.id === currentStep);

  const canProceed = (() => {
    if (currentStep === 'auth') return hasAnyAuth;
    return true;
  })();

  const handleNext = () => {
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  const handleFinish = async () => {
    await completeOnboarding();
  };

  const isLastStep = currentIndex === STEPS.length - 1;

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex flex-col items-center gap-3 mb-1">
            <img src={appIcon} alt="Pilot" className="w-16 h-16" draggable={false} />
            <h1 className="text-2xl font-bold text-text-primary">Welcome to Pilot</h1>
          </div>
          <p className="text-sm text-text-secondary">
            Let's get you set up in a few quick steps.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(step.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  step.id === currentStep
                    ? 'bg-accent text-white'
                    : i < currentIndex
                      ? 'bg-success/20 text-success'
                      : 'bg-bg-surface text-text-secondary'
                }`}
              >
                {i < currentIndex ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <span className="w-3 h-3 flex items-center justify-center text-[10px]">{i + 1}</span>
                )}
                {step.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="w-3 h-3 text-text-secondary/30" />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[300px]">
          {currentStep === 'auth' && <AuthStep />}
          {currentStep === 'tools' && <ToolsStep />}
          {currentStep === 'project' && <ProjectStep />}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {isLastStep ? (
            <button
              onClick={handleFinish}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors"
            >
              Get Started
              <Sparkles className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className="flex items-center gap-1 px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Auth ────────────────────────────────────────────────────────

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

function AuthStep() {
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
        Keys are stored locally in ~/.config/.pilot/auth.json
      </p>
    </div>
  );
}

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

// ─── Step 2: Tools ───────────────────────────────────────────────────────

interface DetectedTerminalInfo { id: string; name: string; app: string; }
interface DetectedEditorInfo { id: string; name: string; cli: string; }

function ToolsStep() {
  const { terminalApp, editorCli, developerMode, setTerminalApp, setEditorCli, setDeveloperMode } = useAppSettingsStore();
  const [terminals, setTerminals] = useState<DetectedTerminalInfo[]>([]);
  const [editors, setEditors] = useState<DetectedEditorInfo[]>([]);

  useEffect(() => {
    invoke(IPC.SHELL_DETECT_TERMINALS).then((result) => {
      setTerminals(result as DetectedTerminalInfo[]);
    });
    invoke(IPC.SHELL_DETECT_EDITORS).then((result) => {
      setEditors(result as DetectedEditorInfo[]);
    });
  }, []);

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-secondary">
        Tell us a bit about how you work so we can tailor the experience.
      </p>

      {/* Developer mode */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">Are you a developer?</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => setDeveloperMode(true)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors ${
              developerMode
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-surface text-text-primary hover:border-accent/40'
            }`}
          >
            {developerMode && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>Yes</span>
          </button>
          <button
            onClick={() => setDeveloperMode(false)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors ${
              !developerMode
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-surface text-text-primary hover:border-accent/40'
            }`}
          >
            {!developerMode && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
            <span>No</span>
          </button>
        </div>
        <p className="text-[10px] text-text-secondary/50">
          Enables the Command Center for running dev commands like build, test, and lint.
        </p>
      </div>

      {/* Terminal */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">Terminal</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {terminals.map((t) => (
            <button
              key={t.id}
              onClick={() => setTerminalApp(t.app === terminalApp ? null : t.app)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors ${
                terminalApp === t.app
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-bg-surface text-text-primary hover:border-accent/40'
              }`}
            >
              {terminalApp === t.app && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{t.name}</span>
            </button>
          ))}
          {terminals.length === 0 && (
            <p className="text-xs text-text-secondary col-span-2">Detecting terminals…</p>
          )}
        </div>
        {!terminalApp && terminals.length > 0 && (
          <p className="text-[10px] text-text-secondary/50">
            No preference set — will use system default
          </p>
        )}
      </div>

      {/* Editor */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">Code Editor</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {editors.map((e) => (
            <button
              key={e.id}
              onClick={() => setEditorCli(e.cli === editorCli ? null : e.cli)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-left text-sm transition-colors ${
                editorCli === e.cli
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-bg-surface text-text-primary hover:border-accent/40'
              }`}
            >
              {editorCli === e.cli && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
              <span className="truncate">{e.name}</span>
            </button>
          ))}
          {editors.length === 0 && (
            <p className="text-xs text-text-secondary col-span-2">Detecting editors…</p>
          )}
        </div>
        {!editorCli && editors.length > 0 && (
          <p className="text-[10px] text-text-secondary/50">
            No preference set — will use first detected editor
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Project ─────────────────────────────────────────────────────

function ProjectStep() {
  const { projectPath, openProjectDialog } = useProjectStore();

  return (
    <div className="space-y-6">
      <p className="text-xs text-text-secondary">
        Open a project to start working. The agent will have access to files and can run commands within the project directory.
      </p>

      <div className="flex flex-col items-center gap-4 py-8">
        {projectPath ? (
          <>
            <div className="w-14 h-14 rounded-xl bg-success/20 flex items-center justify-center">
              <CheckCircle className="w-7 h-7 text-success" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-text-primary">Project opened</p>
              <p className="text-xs text-text-secondary font-mono mt-1">{projectPath}</p>
            </div>
            <button
              onClick={openProjectDialog}
              className="text-xs text-accent hover:text-accent/80 transition-colors"
            >
              Choose a different project
            </button>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-xl bg-bg-surface border-2 border-dashed border-border flex items-center justify-center">
              <FolderOpen className="w-7 h-7 text-text-secondary" />
            </div>
            <button
              onClick={openProjectDialog}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Project
            </button>
            <p className="text-[10px] text-text-secondary/40">
              You can also use ⌘⇧N to open a project anytime
            </p>
          </>
        )}
      </div>
    </div>
  );
}
