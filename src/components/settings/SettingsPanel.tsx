import { useUIStore } from '../../stores/ui-store';
import { useDevCommandStore } from '../../stores/dev-command-store';
import { useProjectStore } from '../../stores/project-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { useExtensionStore } from '../../stores/extension-store';
import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useEffect, useState } from 'react';
import {
  X, Settings, FolderCog, Puzzle, BookOpen, Terminal, Keyboard,
  Shield, Zap, Code, Monitor, FolderOpen, RotateCcw,
  Plus, Trash2, Edit3, Check, XCircle, RotateCw,
  KeyRound, Eye, EyeOff, LogOut, ChevronDown, Brain, FileText,
  Smartphone, QrCode, Wifi, WifiOff, Globe, RefreshCw,
} from 'lucide-react';
import { useMemoryStore } from '../../stores/memory-store';
import { useAuthStore } from '../../stores/auth-store';
import ExtensionManager from '../extensions/ExtensionManager';
import SkillManager from '../extensions/SkillManager';
import ZipImporter from '../extensions/ZipImporter';
import PromptManagerPanel from '../prompts/PromptManagerPanel';
import type { DevCommand } from '../../../shared/types';
import { DEFAULT_KEYBINDINGS, getEffectiveCombo, comboToSymbol, comboToParts } from '../../lib/keybindings';
import { IPC } from '../../../shared/ipc';
import { invoke, on } from '../../lib/ipc-client';
import { useOutputWindowStore } from '../../stores/output-window-store';
import { TUNNEL_IDS, useTunnelOutputStore } from '../../stores/tunnel-output-store';

const TABS = [
  { id: 'general' as const, label: 'General', icon: Settings },
  { id: 'auth' as const, label: 'Auth & Models', icon: KeyRound },
  { id: 'project' as const, label: 'Project', icon: FolderCog },
  { id: 'files' as const, label: 'Files', icon: FolderOpen },
  { id: 'companion' as const, label: 'Companion', icon: Smartphone },
  { id: 'prompts' as const, label: 'Prompts', icon: FileText },
  { id: 'keybindings' as const, label: 'Keybindings', icon: Keyboard },
  { id: 'extensions' as const, label: 'Extensions', icon: Puzzle },
  { id: 'skills' as const, label: 'Skills', icon: BookOpen },
  { id: 'developer' as const, label: 'Developer', icon: Terminal },
];

export default function SettingsPanel() {
  const { settingsOpen, settingsTab, closeSettings, setSettingsTab } = useUIStore();

  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [settingsOpen, closeSettings]);

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSettings}
      />

      {/* Panel */}
      <div className="relative w-[700px] max-w-[90vw] h-[520px] max-h-[80vh] bg-bg-elevated border border-border rounded-lg shadow-2xl flex overflow-hidden">
        {/* Left nav */}
        <nav className="w-[180px] bg-bg-surface border-r border-border flex flex-col py-2">
          <div className="px-4 py-3 mb-1">
            <h2 className="text-sm font-semibold text-text-primary">Settings</h2>
          </div>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = settingsTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSettingsTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-2 mx-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
          <div className="mt-auto px-2 pb-1">
            <ReopenWelcomeButton onDone={closeSettings} />
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">
              {TABS.find((t) => t.id === settingsTab)?.label}
            </h3>
            <button
              onClick={closeSettings}
              className="p-1 hover:bg-bg-surface rounded-sm transition-colors"
            >
              <X className="w-4 h-4 text-text-secondary" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {settingsTab === 'general' && <GeneralSettings />}
            {settingsTab === 'auth' && <AuthSettings />}
            {settingsTab === 'project' && <ProjectSettings />}
            {settingsTab === 'files' && <FilesSettings />}
            {settingsTab === 'companion' && <CompanionSettings />}
            {settingsTab === 'prompts' && <PromptsSettings />}
            {settingsTab === 'keybindings' && <KeybindingsSettings />}
            {settingsTab === 'extensions' && <ExtensionsSettings />}
            {settingsTab === 'skills' && <SkillsSettings />}
            {settingsTab === 'developer' && <DeveloperSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── General ───────────────────────────────────── */
function GeneralSettings() {
  const { piAgentDir, load: loadAppSettings, setPiAgentDir } = useAppSettingsStore();
  const { memoryEnabled, setMemoryEnabled } = useMemoryStore();
  const [dirInput, setDirInput] = useState(piAgentDir);
  const [dirDirty, setDirDirty] = useState(false);

  useEffect(() => {
    loadAppSettings();
  }, [loadAppSettings]);

  useEffect(() => {
    setDirInput(piAgentDir);
    setDirDirty(false);
  }, [piAgentDir]);

  const handleDirChange = (value: string) => {
    setDirInput(value);
    setDirDirty(value !== piAgentDir);
  };

  const handleDirSave = () => {
    if (dirInput.trim()) {
      setPiAgentDir(dirInput.trim());
      setDirDirty(false);
    }
  };

  const handleDirKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && dirDirty) {
      handleDirSave();
    }
  };

  return (
    <div className="p-5 space-y-6">
      <SettingRow
        icon={<FolderOpen className="w-4 h-4 text-accent" />}
        label="Pi Config Directory"
        description="Path to the pi agent global config directory (settings.json, AGENTS.md, etc). Default: ~/.pi/agent"
      >
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={dirInput}
            onChange={(e) => handleDirChange(e.target.value)}
            onKeyDown={handleDirKeyDown}
            className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary w-48 focus:outline-none focus:border-accent"
            placeholder="~/.pi/agent"
          />
          {dirDirty && (
            <button
              onClick={handleDirSave}
              className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
            >
              Save
            </button>
          )}
        </div>
      </SettingRow>

      <SettingRow
        icon={<Monitor className="w-4 h-4 text-text-secondary" />}
        label="Theme"
        description="Pilot currently ships with a dark theme. Light theme coming soon."
      >
        <span className="text-xs text-text-secondary bg-bg-surface border border-border rounded px-2 py-1">
          Dark
        </span>
      </SettingRow>

      <SettingRow
        icon={<Brain className="w-4 h-4 text-accent" />}
        label="Memory"
        description="When enabled, memory files are injected into the agent's system prompt. Manage memory contents in the sidebar Memory pane."
      >
        <Toggle checked={memoryEnabled} onChange={setMemoryEnabled} />
      </SettingRow>
    </div>
  );
}

/* ── Auth & Models ─────────────────────────────── */

interface AvailableModel {
  provider: string;
  id: string;
  name: string;
}

function AuthSettings() {
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

/* ── Project ───────────────────────────────────── */
function ProjectSettings() {
  const { jailEnabled, yoloMode, setJailEnabled, setYoloMode } = useSandboxStore();

  return (
    <div className="p-5 space-y-6">
      <SettingRow
        icon={<Shield className="w-4 h-4 text-success" />}
        label="Project Jail"
        description="When enabled, the agent can only read and write files within the project directory. Paths outside the project root are blocked."
      >
        <Toggle checked={jailEnabled} onChange={setJailEnabled} />
      </SettingRow>

      <SettingRow
        icon={<Zap className="w-4 h-4 text-warning" />}
        label="Yolo Mode"
        description="When enabled, file changes are applied immediately without review. Use with caution."
      >
        <Toggle
          checked={yoloMode}
          onChange={setYoloMode}
          activeColor="bg-warning"
        />
      </SettingRow>

      {yoloMode && (
        <div className="ml-9 p-3 bg-warning/10 border border-warning/30 rounded-md">
          <p className="text-xs text-warning">
            ⚠ Changes will be applied immediately without review. Make sure you have version control enabled.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Files ─────────────────────────────────────── */

const DEFAULT_HIDDEN_PATHS = [
  'node_modules', '.git', '.DS_Store', 'dist', 'out', 'build',
  '.next', '.nuxt', '.cache', 'coverage',
  '__pycache__', '.tox', '.mypy_cache', 'target', '.gradle', '*.pyc',
];

function FilesSettings() {
  const { hiddenPaths, setHiddenPaths, load: loadSettings } = useAppSettingsStore();
  const { loadFileTree } = useProjectStore();
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleAdd = () => {
    const pattern = inputValue.trim();
    if (pattern && !hiddenPaths.includes(pattern)) {
      const updated = [...hiddenPaths, pattern];
      setHiddenPaths(updated).then(() => loadFileTree());
      setInputValue('');
    }
  };

  const handleRemove = (pattern: string) => {
    const updated = hiddenPaths.filter(p => p !== pattern);
    setHiddenPaths(updated).then(() => loadFileTree());
  };

  const handleReset = () => {
    setHiddenPaths(DEFAULT_HIDDEN_PATHS).then(() => loadFileTree());
  };

  return (
    <div className="p-5 space-y-6">
      <SettingRow
        icon={<EyeOff className="w-4 h-4 text-text-secondary" />}
        label="Hidden Files"
        description="Glob patterns to hide in the file tree, using .gitignore syntax. One pattern per entry."
      >
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-warning hover:text-warning/80 transition-colors"
          title="Reset to defaults"
        >
          <RotateCw className="w-3 h-3" />
          Reset
        </button>
      </SettingRow>

      {/* Add pattern input */}
      <div className="ml-7 flex items-center gap-1.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. *.log, .env.local, tmp/"
          className="flex-1 text-xs font-mono bg-bg-surface border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
        />
        <button
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="text-xs px-2.5 py-1.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* Pattern list */}
      <div className="ml-7 space-y-1">
        {hiddenPaths.length === 0 ? (
          <p className="text-xs text-text-secondary italic py-2">
            No hidden patterns — all files are visible.
          </p>
        ) : (
          hiddenPaths.map((pattern) => (
            <div
              key={pattern}
              className="flex items-center justify-between px-3 py-1.5 bg-bg-surface border border-border rounded-md group"
            >
              <span className="text-xs font-mono text-text-primary">{pattern}</span>
              <button
                onClick={() => handleRemove(pattern)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-error/20 transition-all"
                title="Remove pattern"
              >
                <Trash2 className="w-3 h-3 text-error" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Prompts ───────────────────────────────────── */
function PromptsSettings() {
  return (
    <div className="p-5">
      <PromptManagerPanel />
    </div>
  );
}

/* ── Extensions ────────────────────────────────── */
function ExtensionsSettings() {
  return (
    <div className="flex flex-col h-full">
      <ExtensionManager />
      <div className="border-t border-border">
        <ZipImporter type="extension" scope="global" />
      </div>
    </div>
  );
}

/* ── Skills ────────────────────────────────────── */
function SkillsSettings() {
  return (
    <div className="flex flex-col h-full">
      <SkillManager />
      <div className="border-t border-border">
        <ZipImporter type="skill" scope="global" />
      </div>
    </div>
  );
}

/* ── Keybindings ───────────────────────────────── */
function KeybindingsSettings() {
  const { keybindOverrides, setKeybindOverride, clearKeybindOverride, load: loadSettings } = useAppSettingsStore();
  const [recordingId, setRecordingId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Capture keys when recording
  useEffect(() => {
    if (!recordingId) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore bare modifier keys
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

      const mods: string[] = [];
      if (e.metaKey || (!isMac() && e.ctrlKey)) mods.push('meta');
      if (isMac() && e.ctrlKey) mods.push('ctrl');
      if (e.altKey) mods.push('alt');
      if (e.shiftKey) mods.push('shift');

      // Escape cancels recording
      if (e.key === 'Escape' && mods.length === 0) {
        setRecordingId(null);
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const combo = [...mods, key].join('+');
      setKeybindOverride(recordingId, combo);
      setRecordingId(null);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingId, setKeybindOverride]);

  const hasAnyOverrides = Object.keys(keybindOverrides).length > 0;

  // Group by category
  const grouped = DEFAULT_KEYBINDINGS.reduce<Record<string, typeof DEFAULT_KEYBINDINGS>>((acc, def) => {
    (acc[def.category] ??= []).push(def);
    return acc;
  }, {});

  return (
    <div className="p-5 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary">
          Click a shortcut to rebind. Press <kbd className="px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-[10px] font-mono">Esc</kbd> to cancel.
        </p>
        {hasAnyOverrides && (
          <button
            onClick={async () => {
              const { update } = useAppSettingsStore.getState();
              await update({ keybindOverrides: {} });
            }}
            className="flex items-center gap-1.5 text-xs text-warning hover:text-warning/80 transition-colors"
            title="Reset all keybindings to defaults"
          >
            <RotateCw className="w-3 h-3" />
            Reset All
          </button>
        )}
      </div>

      {/* Keybinding groups */}
      {Object.entries(grouped).map(([category, defs]) => (
        <div key={category}>
          <h4 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1 px-3">{category}</h4>
          <div className="bg-bg-surface rounded-lg border border-border divide-y divide-border">
            {defs.map(def => {
              const isOverridden = def.id in keybindOverrides;
              const effectiveCombo = getEffectiveCombo(def.id, keybindOverrides);
              const isDisabled = effectiveCombo === null;
              const isRecording = recordingId === def.id;

              return (
                <div
                  key={def.id}
                  className={`flex items-center h-10 px-3 transition-colors ${
                    isRecording ? 'bg-accent/5' : 'hover:bg-bg-elevated/50'
                  }`}
                >
                  {/* Label — left aligned, fixed width */}
                  <span className={`flex-1 text-[13px] ${isDisabled ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                    {def.label}
                  </span>

                  {/* Shortcut + actions — right aligned */}
                  <div className="flex items-center gap-2 ml-4">
                    {isRecording ? (
                      <span className="text-xs text-accent animate-pulse font-mono px-2 py-1 bg-accent/10 border border-accent/30 rounded">
                        Press keys…
                      </span>
                    ) : (
                      <button
                        onClick={() => setRecordingId(def.id)}
                        className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
                          isDisabled
                            ? 'hover:border-accent/30'
                            : isOverridden
                              ? 'hover:bg-accent/5'
                              : 'hover:bg-bg-elevated/50'
                        }`}
                        title="Click to record new shortcut"
                      >
                        {isDisabled ? (
                          <span className="text-xs text-text-secondary/50 italic px-1">none</span>
                        ) : (
                          comboToParts(effectiveCombo!).map((part, i, arr) => (
                            <span key={i} className="flex items-center gap-1">
                              <kbd className={`inline-block px-1.5 py-0.5 text-[11px] font-mono rounded border shadow-[0_1px_0_0] ${
                                isOverridden
                                  ? 'bg-accent/10 text-accent border-accent/20 shadow-accent/10'
                                  : 'bg-bg-elevated text-text-primary border-border shadow-border/50'
                              }`}>
                                {part}
                              </kbd>
                              {i < arr.length - 1 && <span className="text-[10px] text-text-secondary">+</span>}
                            </span>
                          ))
                        )}
                      </button>
                    )}

                    {/* Action buttons — fixed width slot to prevent layout shift */}
                    <div className="flex items-center gap-0.5 w-[48px] justify-end">
                      {isOverridden && !isRecording && (
                        <button
                          onClick={() => clearKeybindOverride(def.id)}
                          className="p-1 hover:bg-bg-base rounded transition-colors"
                          title="Reset to default"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-text-secondary" />
                        </button>
                      )}
                      {!isDisabled && !isRecording && (
                        <button
                          onClick={() => setKeybindOverride(def.id, null)}
                          className="p-1 hover:bg-bg-base rounded transition-colors"
                          title="Disable shortcut"
                        >
                          <XCircle className="w-3.5 h-3.5 text-text-secondary hover:text-error" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function isMac(): boolean {
  return typeof window !== 'undefined' && window.api?.platform === 'darwin';
}

/* ── Developer ─────────────────────────────────── */
function DeveloperSettings() {
  const { developerMode, setDeveloperMode, autoStartDevServer, setAutoStartDevServer } = useAppSettingsStore();
  const { commands, loadCommands, saveCommands } = useDevCommandStore();
  const projectPath = useProjectStore(s => s.projectPath);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ label: string; command: string; icon: string }>({ label: '', command: '', icon: 'Terminal' });
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState<{ label: string; command: string; icon: string }>({ label: '', command: '', icon: 'Terminal' });

  useEffect(() => {
    if (developerMode && projectPath) {
      loadCommands(projectPath);
    }
  }, [developerMode, projectPath, loadCommands]);

  const handleSave = (updated: DevCommand[]) => {
    if (projectPath) {
      saveCommands(projectPath, updated);
    }
  };

  const startEdit = (cmd: DevCommand) => {
    setEditingId(cmd.id);
    setEditForm({ label: cmd.label, command: cmd.command, icon: cmd.icon });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const updated = commands.map(c =>
      c.id === editingId ? { ...c, label: editForm.label, command: editForm.command, icon: editForm.icon } : c
    );
    handleSave(updated);
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const deleteCommand = (id: string) => {
    handleSave(commands.filter(c => c.id !== id));
  };

  const addCommand = () => {
    if (!newForm.label.trim() || !newForm.command.trim()) return;
    const id = newForm.label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    const cmd: DevCommand = {
      id,
      label: newForm.label.trim(),
      command: newForm.command.trim(),
      icon: newForm.icon || 'Terminal',
      cwd: './',
      env: {},
      persistent: false,
    };
    handleSave([...commands, cmd]);
    setNewForm({ label: '', command: '', icon: 'Terminal' });
    setAddingNew(false);
  };

  return (
    <div className="p-5 space-y-6">
      <SettingRow
        icon={<Code className="w-4 h-4 text-accent" />}
        label="Developer Mode"
        description="Show the Command Center in the sidebar for quick access to dev server, tests, and lint commands."
      >
        <Toggle checked={developerMode} onChange={setDeveloperMode} />
      </SettingRow>

      {developerMode && (
        <>
          <SettingRow
            icon={<Zap className="w-4 h-4 text-accent" />}
            label="Auto-start dev server"
            description="Automatically start persistent dev commands when opening a project on launch."
          >
            <Toggle checked={autoStartDevServer} onChange={setAutoStartDevServer} />
          </SettingRow>

          {/* Commands list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-text-primary">Commands</span>
              </div>
              <button
                onClick={() => setAddingNew(true)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Command
              </button>
            </div>
            <p className="text-xs text-text-secondary ml-6">
              Configure commands shown in the Command Center. Saved per-project in <code className="text-[11px] bg-bg-surface px-1 rounded">.pilot/commands.json</code>.
            </p>

            <div className="ml-6 space-y-1.5">
              {commands.map((cmd) => (
                <div key={cmd.id} className="bg-bg-surface border border-border rounded-md">
                  {editingId === cmd.id ? (
                    /* Edit mode */
                    <div className="p-3 space-y-2">
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={(e) => setEditForm(f => ({ ...f, label: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                        placeholder="Label"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editForm.command}
                        onChange={(e) => setEditForm(f => ({ ...f, command: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                        className="w-full text-xs font-mono bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                        placeholder="Command (e.g. npm run dev)"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button onClick={cancelEdit} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                          <XCircle className="w-3.5 h-3.5 text-text-secondary" />
                        </button>
                        <button onClick={saveEdit} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                          <Check className="w-3.5 h-3.5 text-success" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display mode */
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary">{cmd.label}</div>
                        <div className="text-[11px] font-mono text-text-secondary truncate">{cmd.command}</div>
                      </div>
                      <button onClick={() => startEdit(cmd)} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                        <Edit3 className="w-3 h-3 text-text-secondary" />
                      </button>
                      <button onClick={() => deleteCommand(cmd.id)} className="p-1 hover:bg-bg-elevated rounded transition-colors">
                        <Trash2 className="w-3 h-3 text-error/60 hover:text-error" />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new command form */}
              {addingNew && (
                <div className="bg-bg-surface border border-accent/30 rounded-md p-3 space-y-2">
                  <input
                    type="text"
                    value={newForm.label}
                    onChange={(e) => setNewForm(f => ({ ...f, label: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addCommand()}
                    className="w-full text-xs bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                    placeholder="Label (e.g. Build)"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={newForm.command}
                    onChange={(e) => setNewForm(f => ({ ...f, command: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && addCommand()}
                    className="w-full text-xs font-mono bg-bg-base border border-border rounded px-2 py-1.5 text-text-primary focus:outline-none focus:border-accent"
                    placeholder="Command (e.g. npm run build)"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => { setAddingNew(false); setNewForm({ label: '', command: '', icon: 'Terminal' }); }}
                      className="text-xs px-2 py-1 text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={addCommand}
                      disabled={!newForm.label.trim() || !newForm.command.trim()}
                      className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {commands.length === 0 && !addingNew && (
                <p className="text-xs text-text-secondary italic py-2">No commands configured.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Companion ─────────────────────────────────── */
interface CompanionStatus {
  enabled: boolean;
  port: number;
  protocol: 'http' | 'https';
  running: boolean;
  connectedClients: number;
  remoteUrl: string | null;
  remoteType: 'tailscale' | 'cloudflare' | null;
  lanAddress: string | null;
  lanAddresses: Array<{ address: string; name: string }>;
}

interface PairedDevice {
  sessionId: string;
  deviceName: string;
  lastSeen: number;
}

interface RemoteAvailability {
  tailscale: boolean;
  tailscaleOnline: boolean;
  cloudflared: boolean;
}

function CompanionSettings() {
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [pin, setPin] = useState<string | null>(null);
  const [pinExpiry, setPinExpiry] = useState<number | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrHost, setQrHost] = useState<string | null>(null);
  const [qrPort, setQrPort] = useState<number | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [restartHint, setRestartHint] = useState(false);
  const [certRegenerated, setCertRegenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remoteAvail, setRemoteAvail] = useState<RemoteAvailability | null>(null);

  const loadStatus = async () => {
    try {
      const s = await invoke(IPC.COMPANION_GET_STATUS) as CompanionStatus;
      setStatus(s);
    } catch {
      // Companion not initialized yet
      setStatus({ enabled: false, port: 18088, protocol: 'https', running: false, connectedClients: 0, remoteUrl: null, remoteType: null, lanAddress: null, lanAddresses: [] });
    }
  };

  const loadDevices = async () => {
    try {
      const d = await invoke(IPC.COMPANION_GET_DEVICES) as PairedDevice[];
      setDevices(d);
    } catch {
      setDevices([]);
    }
  };

  useEffect(() => {
    loadStatus();
    loadDevices();
    // Check remote provider availability once
    invoke(IPC.COMPANION_CHECK_REMOTE)
      .then((r: any) => setRemoteAvail(r as RemoteAvailability))
      .catch(() => {});
    // Refresh status every 5 seconds
    const interval = setInterval(() => {
      loadStatus();
      loadDevices();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // PIN / QR countdown timer
  useEffect(() => {
    if (!pinExpiry) return;
    const interval = setInterval(() => {
      const remaining = pinExpiry - Date.now();
      if (remaining <= 0) {
        setPin(null);
        setPinExpiry(null);
        setQrDataUrl(null);
        setQrHost(null);
        setQrPort(null);
        setQrVisible(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pinExpiry]);

  const handleToggleServer = async () => {
    setLoading(true);
    try {
      if (status?.running) {
        await invoke(IPC.COMPANION_DISABLE);
      } else {
        await invoke(IPC.COMPANION_ENABLE);
      }
      await loadStatus();
      setRestartHint(false);
    } catch (err) {
      console.error('Failed to toggle companion server:', err);
    }
    setLoading(false);
  };

  const handleGeneratePIN = async () => {
    try {
      const result = await invoke(IPC.COMPANION_GENERATE_PIN) as { pin: string };
      setPin(result.pin);
      setPinExpiry(Date.now() + 5 * 60 * 1000);
    } catch (err) {
      console.error('Failed to generate PIN:', err);
    }
  };

  const generateQRForHost = async (host?: string) => {
    try {
      // Determine port: for tunnel hostnames use the port from the URL, for LAN IPs use server port.
      // Omit port for standard HTTPS (443) — companion defaults to 443 when no port is specified.
      let port: number | undefined;
      if (host && status?.remoteUrl) {
        try {
          const tunnelUrl = new URL(status.remoteUrl);
          if (host === tunnelUrl.hostname) {
            // Tunnel host — use explicit port if non-standard, omit for 443 (HTTPS default)
            const tunnelPort = tunnelUrl.port ? parseInt(tunnelUrl.port, 10) : 443;
            port = tunnelPort !== 443 ? tunnelPort : undefined;
          }
        } catch { /* not a tunnel host, use default */ }
      }

      const result = await invoke(IPC.COMPANION_GENERATE_QR, host || undefined, port) as {
        payload: { host?: string; port?: number };
        dataUrl: string | null;
      };
      if (result.dataUrl) {
        setQrDataUrl(result.dataUrl);
        setQrHost(result.payload?.host || null);
        setQrPort(result.payload?.port || null);
        setQrVisible(true);
        setPinExpiry(Date.now() + 5 * 60 * 1000);
      }
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  /** Resolve the effective host: selectedHost state, or the first option from the dropdown (tunnel > LAN). */
  const getEffectiveHost = (): string | undefined => {
    if (selectedHost) return selectedHost;
    // Mirror the dropdown's default: tunnel first, then LAN
    if (status?.remoteUrl) {
      try { return new URL(status.remoteUrl).hostname; } catch { /* ignore */ }
    }
    if (status?.lanAddresses?.length) {
      return status.lanAddresses[0].address;
    }
    return undefined;
  };

  const handleGenerateQR = async () => {
    if (qrVisible) {
      setQrVisible(false);
      return;
    }
    const host = getEffectiveHost();
    setSelectedHost(host || null);
    await generateQRForHost(host);
  };

  const handleHostChange = async (host: string) => {
    setSelectedHost(host);
    // Regenerate QR with the new host if currently visible
    if (qrVisible) {
      await generateQRForHost(host);
    }
  };

  const handleRevokeDevice = async (sessionId: string) => {
    try {
      await invoke(IPC.COMPANION_REVOKE_DEVICE, sessionId);
      await loadDevices();
    } catch (err) {
      console.error('Failed to revoke device:', err);
    }
  };

  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [activationUrl, setActivationUrl] = useState<string | null>(null);

  // Listen for funnel activation prompts pushed from main process
  // while tailscale serve is blocking and waiting for the user.
  useEffect(() => {
    const unsub = on(IPC.COMPANION_REMOTE_ACTIVATION, (payload: { activationUrl: string }) => {
      setActivationUrl(payload.activationUrl);
      setRemoteError(null);
    });
    return unsub;
  }, []);

  const handleEnableRemote = async (provider: 'tailscale' | 'cloudflare') => {
    setLoading(true);
    setRemoteError(null);
    setActivationUrl(null);
    // Clear previous output and open the output popup so the user sees live progress
    useTunnelOutputStore.getState().clearOutput(provider);
    try {
      // Disable existing tunnel first if switching providers
      if (status?.remoteUrl) {
        await invoke(IPC.COMPANION_DISABLE_REMOTE);
      }
      await invoke(IPC.COMPANION_ENABLE_REMOTE, provider === 'tailscale');
      setActivationUrl(null);
      const newStatus = await invoke(IPC.COMPANION_GET_STATUS) as CompanionStatus;
      setStatus(newStatus);

      // Switch QR to the tunnel address if QR is visible
      if (newStatus.remoteUrl && qrVisible) {
        try {
          const tunnelHost = new URL(newStatus.remoteUrl).hostname;
          setSelectedHost(tunnelHost);
          await generateQRForHost(tunnelHost);
        } catch { /* ignore parse errors */ }
      }
    } catch (err) {
      setActivationUrl(null);
      const msg = err instanceof Error ? err.message : String(err);
      setRemoteError(msg);
      console.error('Failed to enable remote access:', err);
    }
    setLoading(false);
  };

  const handleDisableRemote = async () => {
    setLoading(true);
    setRemoteError(null);
    try {
      await invoke(IPC.COMPANION_DISABLE_REMOTE);
      const newStatus = await invoke(IPC.COMPANION_GET_STATUS) as CompanionStatus;
      setStatus(newStatus);

      // If QR was showing a tunnel, fall back to LAN address
      if (qrVisible && selectedHost) {
        const lanAddr = newStatus.lanAddress || newStatus.lanAddresses[0]?.address;
        if (lanAddr) {
          setSelectedHost(lanAddr);
          await generateQRForHost(lanAddr);
        }
      }
    } catch (err) {
      console.error('Failed to disable remote access:', err);
    }
    setLoading(false);
  };

  const pinTimeRemaining = pinExpiry ? Math.max(0, Math.floor((pinExpiry - Date.now()) / 1000)) : 0;
  const pinMinutes = Math.floor(pinTimeRemaining / 60);
  const pinSeconds = pinTimeRemaining % 60;

  return (
    <div className="p-5 space-y-6">
      {/* Server toggle */}
      <SettingRow
        icon={<Smartphone className="w-4 h-4 text-accent" />}
        label="Companion Server"
        description="Enable the companion server to access Pilot from your iPhone, iPad, or any browser on the local network."
      >
        <div className="flex items-center gap-2">
          {status?.running && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <Wifi className="w-3 h-3" />
              {status.connectedClients} client{status.connectedClients !== 1 ? 's' : ''}
            </span>
          )}
          <Toggle
            checked={status?.running ?? false}
            onChange={handleToggleServer}
          />
        </div>
      </SettingRow>

      {/* Connection settings — always visible */}
      <div className="ml-7 space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Protocol:</label>
            <select
              value={status?.protocol ?? 'https'}
              onChange={async (e) => {
                const proto = e.target.value as 'http' | 'https';
                await invoke(IPC.APP_SETTINGS_UPDATE, { companionProtocol: proto });
                // Update local state immediately so the UI reflects the change
                if (status) setStatus({ ...status, protocol: proto });
                // Show restart hint since protocol change needs server restart
                setRestartHint(true);
              }}
              className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary"
              disabled={status?.running}
            >
              <option value="https">HTTPS (TLS)</option>
              <option value="http">HTTP (no encryption)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Port:</label>
            <input
              type="number"
              defaultValue={status?.port ?? 18088}
              onBlur={async (e) => {
                const port = parseInt(e.target.value, 10);
                if (port > 0 && port < 65536) {
                  await invoke(IPC.APP_SETTINGS_UPDATE, { companionPort: port });
                  setRestartHint(true);
                }
              }}
              className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary font-mono w-20"
              disabled={status?.running}
              min={1}
              max={65535}
            />
          </div>
        </div>
        {(status?.protocol === 'https') && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await invoke(IPC.COMPANION_REGEN_CERT);
                  setCertRegenerated(true);
                  setTimeout(() => setCertRegenerated(false), 3000);
                } catch (err) {
                  console.error('Failed to regenerate cert:', err);
                }
              }}
              className="text-xs px-2.5 py-1 bg-bg-surface border border-border text-text-secondary rounded hover:bg-bg-elevated hover:text-text-primary transition-colors"
            >
              Regenerate TLS Certificate
            </button>
            {certRegenerated && (
              <span className="text-xs text-success">✓ Certificate regenerated</span>
            )}
          </div>
        )}
        {restartHint && (
          <p className="text-[11px] text-warning">
            ⚠ Restart the companion server for changes to take effect.
          </p>
        )}
      </div>

      {status?.running && (
        <>
          <div className="ml-7 p-3 bg-bg-surface border border-border rounded-md text-xs space-y-1">
            <p className="text-text-secondary">
              Server running on port <span className="font-mono text-text-primary">{status.port}</span> ({status.protocol.toUpperCase()})
            </p>
            <p className="text-text-secondary">
              This Mac: <span className="font-mono text-accent">{status.protocol}://localhost:{status.port}</span>
            </p>
            {status.lanAddress && (
              <p className="text-text-secondary">
                Other devices: <span className="font-mono text-accent">{status.protocol}://{status.lanAddress}:{status.port}</span>
              </p>
            )}
          </div>

          {/* Pair new device */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-text-primary">Pair New Device</span>
            </div>

            <div className="ml-6 space-y-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={handleGeneratePIN}
                  className="text-xs px-3 py-1.5 bg-accent text-white rounded hover:bg-accent/90 transition-colors"
                >
                  Show PIN
                </button>
                <button
                  onClick={handleGenerateQR}
                  className="text-xs px-3 py-1.5 bg-bg-surface border border-border text-text-primary rounded hover:bg-bg-elevated transition-colors"
                >
                  {qrVisible ? 'Hide QR Code' : 'Show QR Code'}
                </button>
                {pin && (
                  <div className="text-center">
                    <div className="font-mono text-2xl font-bold text-text-primary tracking-widest">
                      {pin}
                    </div>
                    <p className="text-[11px] text-text-secondary mt-1">
                      Expires in {pinMinutes}:{pinSeconds.toString().padStart(2, '0')}
                    </p>
                  </div>
                )}
              </div>

              {qrVisible && qrDataUrl && (
                <div className="space-y-2">
                  {(() => {
                    // Build address options: tunnel (if active) + LAN interfaces
                    const options: Array<{ value: string; label: string }> = [];
                    if (status.remoteUrl) {
                      // Extract host from tunnel URL (e.g. "https://foo.tailnet.ts.net" → "foo.tailnet.ts.net")
                      try {
                        const url = new URL(status.remoteUrl);
                        options.push({
                          value: url.hostname,
                          label: `${url.hostname} (${status.remoteType || 'tunnel'})`,
                        });
                      } catch {
                        options.push({ value: status.remoteUrl, label: `${status.remoteUrl} (tunnel)` });
                      }
                    }
                    for (const a of status.lanAddresses) {
                      options.push({ value: a.address, label: `${a.address} (${a.name})` });
                    }
                    // Only show dropdown if there are multiple options
                    if (options.length <= 1) return null;
                    return (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-text-secondary whitespace-nowrap">Address:</label>
                        <select
                          value={selectedHost || options[0]?.value || ''}
                          onChange={(e) => handleHostChange(e.target.value)}
                          className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary font-mono min-w-0 flex-1"
                        >
                          {options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                  <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg w-fit">
                    <img
                      src={qrDataUrl}
                      alt="Companion QR code"
                      width={200}
                      height={200}
                      className="block"
                    />
                    <p className="text-[11px] text-gray-500">
                      Scan with Pilot Companion
                      {pinExpiry && ` · ${pinMinutes}:${pinSeconds.toString().padStart(2, '0')}`}
                    </p>
                    {qrHost && (
                      <p className="text-[10px] font-mono text-gray-400">
                        https://{qrHost}{qrPort ? `:${qrPort}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Paired devices */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-text-secondary" />
              <span className="text-sm font-medium text-text-primary">Paired Devices</span>
            </div>

            <div className="ml-6 space-y-1.5">
              {devices.length === 0 && (
                <p className="text-xs text-text-secondary italic">No paired devices.</p>
              )}
              {devices.map((device) => {
                const lastSeenAgo = Math.floor((Date.now() - device.lastSeen) / 1000);
                let lastSeenText = 'just now';
                if (lastSeenAgo > 86400) lastSeenText = `${Math.floor(lastSeenAgo / 86400)} days ago`;
                else if (lastSeenAgo > 3600) lastSeenText = `${Math.floor(lastSeenAgo / 3600)} hours ago`;
                else if (lastSeenAgo > 60) lastSeenText = `${Math.floor(lastSeenAgo / 60)} min ago`;

                return (
                  <div
                    key={device.sessionId}
                    className="flex items-center justify-between bg-bg-surface border border-border rounded-md px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-medium text-text-primary flex items-center gap-1.5">
                        📱 {device.deviceName}
                      </div>
                      <div className="text-[11px] text-text-secondary">
                        Last seen: {lastSeenText}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeDevice(device.sessionId)}
                      className="text-xs text-error/70 hover:text-error transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Remote access */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5"><Globe className="w-4 h-4 text-text-secondary" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">Remote Access</p>
                <p className="text-xs text-text-secondary mt-0.5">Access Pilot from outside your local network.</p>
              </div>
            </div>

            {status.remoteUrl ? (
              <div className="ml-7 space-y-2">
                <div className="p-3 bg-bg-surface border border-border rounded-md text-xs space-y-1">
                  <p className="text-text-secondary">
                    Connected via <span className="text-text-primary font-medium capitalize">{status.remoteType}</span>
                  </p>
                  <p className="font-mono text-accent break-all select-all">{status.remoteUrl}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDisableRemote}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-secondary hover:text-error transition-colors disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                  <button
                    onClick={() => {
                      const tunnelId = status.remoteType === 'tailscale'
                        ? TUNNEL_IDS.tailscale
                        : TUNNEL_IDS.cloudflare;
                      useOutputWindowStore.getState().openOutput(tunnelId);
                    }}
                    className="px-3 py-1.5 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5"
                  >
                    <Terminal className="w-3 h-3" />
                    View Output
                  </button>
                </div>
              </div>
            ) : (
              <div className="ml-7 flex gap-2">
                <button
                  onClick={() => handleEnableRemote('tailscale')}
                  disabled={loading || (remoteAvail !== null && !remoteAvail.tailscale)}
                  className="flex-1 px-3 py-2 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-primary transition-colors disabled:opacity-50 space-y-0.5 text-left"
                >
                  <div className="font-medium">Tailscale</div>
                  <div className={remoteAvail?.tailscale === false ? 'text-warning' : 'text-text-secondary'}>
                    {remoteAvail === null ? 'Checking…' :
                     !remoteAvail.tailscale ? 'Not installed' :
                     !remoteAvail.tailscaleOnline ? 'Installed but offline' :
                     'Ready'}
                  </div>
                </button>
                <button
                  onClick={() => handleEnableRemote('cloudflare')}
                  disabled={loading || (remoteAvail !== null && !remoteAvail.cloudflared)}
                  className="flex-1 px-3 py-2 text-xs bg-bg-elevated hover:bg-bg-surface border border-border rounded-md text-text-primary transition-colors disabled:opacity-50 space-y-0.5 text-left"
                >
                  <div className="font-medium">Cloudflare Tunnel</div>
                  <div className={remoteAvail?.cloudflared === false ? 'text-warning' : 'text-text-secondary'}>
                    {remoteAvail === null ? 'Checking…' :
                     !remoteAvail.cloudflared ? 'Not installed' :
                     'Ready — no account needed'}
                  </div>
                </button>
              </div>
            )}

            {activationUrl && (
              <div className="ml-7 text-xs text-text-secondary space-y-1">
                <p>Tailscale Funnel needs to be enabled on your tailnet.</p>
                <p>
                  Click to enable:{' '}
                  <a
                    href={activationUrl}
                    className="underline text-accent hover:text-accent/80 cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault();
                      window.api?.openExternal?.(activationUrl);
                    }}
                  >
                    {activationUrl}
                  </a>
                </p>
                <p className="text-text-tertiary italic">Waiting for activation…</p>
              </div>
            )}

            {remoteError && !activationUrl && (
              <p className="ml-7 text-xs text-error whitespace-pre-line">
                {remoteError.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a
                      key={i}
                      href={part}
                      className="underline text-accent hover:text-accent/80 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        window.api?.openExternal?.(part);
                      }}
                    >
                      {part}
                    </a>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Shared pieces ─────────────────────────────── */
function SettingRow({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">{label}</span>
          {children}
        </div>
        <p className="text-xs text-text-secondary mt-1">{description}</p>
      </div>
    </div>
  );
}

function ReopenWelcomeButton({ onDone }: { onDone: () => void }) {
  const { update } = useAppSettingsStore();

  const handleClick = async () => {
    await update({ onboardingComplete: false });
    onDone();
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 w-full px-4 py-2 rounded-md text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
    >
      <RotateCcw className="w-3.5 h-3.5" />
      Setup Wizard
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  activeColor = 'bg-accent',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  activeColor?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
        checked ? activeColor : 'bg-border'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}
