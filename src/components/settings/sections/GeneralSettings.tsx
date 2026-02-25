import { useAppSettingsStore } from '../../../stores/app-settings-store';
import { useMemoryStore } from '../../../stores/memory-store';
import { useEffect, useState } from 'react';
import { FolderOpen, Monitor, Brain, Sparkles, ScrollText } from 'lucide-react';
import { SettingRow, Toggle } from '../settings-helpers';
import { IPC } from '../../../../shared/ipc';
import { invoke } from '../../../lib/ipc-client';

export function GeneralSettings() {
  const { piAgentDir, theme, setTheme, load: loadAppSettings, setPiAgentDir, commitMsgModel, commitMsgMaxTokens, update: updateAppSettings, logging, setLogLevel, setFileLogging, setSyslogConfig } = useAppSettingsStore();
  const { memoryEnabled, setMemoryEnabled } = useMemoryStore();
  const [dirInput, setDirInput] = useState(piAgentDir);
  const [dirDirty, setDirDirty] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ provider: string; id: string; name: string }>>([]);

  useEffect(() => {
    loadAppSettings();
    invoke(IPC.MODEL_GET_AVAILABLE).then((models: unknown) => {
      if (Array.isArray(models)) setAvailableModels(models);
    });
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
        icon={<Monitor className="w-4 h-4 text-accent" />}
        label="Theme"
        description="Choose dark, light, or follow your system preference."
      >
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as 'dark' | 'light' | 'system')}
          className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </SettingRow>

      <SettingRow
        icon={<Brain className="w-4 h-4 text-accent" />}
        label="Memory"
        description="When enabled, memory files are injected into the agent's system prompt. Manage memory contents in the sidebar Memory pane."
      >
        <Toggle checked={memoryEnabled} onChange={setMemoryEnabled} />
      </SettingRow>

      {/* ── AI Commit Messages ── */}
      <div className="border-t border-border pt-4 mt-2">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">AI Commit Messages</h3>

        <div className="space-y-6">
          <SettingRow
            icon={<Sparkles className="w-4 h-4 text-accent" />}
            label="Model"
            description="Model used for generating commit messages. 'Auto' picks the cheapest available."
          >
            <select
              value={commitMsgModel}
              onChange={(e) => updateAppSettings({ commitMsgModel: e.target.value || undefined })}
              className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent max-w-[200px]"
            >
              <option value="">Auto (cheapest)</option>
              {availableModels.map((m) => (
                <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            icon={<Sparkles className="w-4 h-4 text-text-secondary" />}
            label="Max Tokens"
            description="Maximum tokens for the generated commit message. Increase for large multi-file commits."
          >
            <input
              type="number"
              value={commitMsgMaxTokens}
              onChange={(e) => updateAppSettings({ commitMsgMaxTokens: parseInt(e.target.value) || 4096 })}
              className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary w-20 focus:outline-none focus:border-accent"
              min="256"
              max="16384"
              step="256"
            />
          </SettingRow>
        </div>
      </div>

      {/* ── Logging ── */}
      <div className="border-t border-border pt-4 mt-2">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">Logging</h3>

        <div className="space-y-6">
          <SettingRow
            icon={<ScrollText className="w-4 h-4 text-text-secondary" />}
            label="Log Level"
            description="Minimum severity to record. Debug is most verbose."
          >
            <select
              value={logging.level}
              onChange={(e) => setLogLevel(e.target.value as 'debug' | 'info' | 'warn' | 'error')}
              className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<ScrollText className="w-4 h-4 text-text-secondary" />}
            label="File Logging"
            description="Write logs to ~/.config/.pilot/logs/ with automatic rotation."
          >
            <Toggle checked={logging.file?.enabled ?? true} onChange={setFileLogging} />
          </SettingRow>

          <SettingRow
            icon={<ScrollText className="w-4 h-4 text-text-secondary" />}
            label="Syslog (UDP)"
            description="Forward logs to a remote syslog server via UDP."
          >
            <Toggle
              checked={logging.syslog?.enabled ?? false}
              onChange={(enabled) => setSyslogConfig({ enabled })}
            />
          </SettingRow>

          {logging.syslog?.enabled && (
            <div className="ml-7 space-y-4">
              <SettingRow
                icon={<div className="w-4 h-4" />}
                label="Host"
                description="Syslog server hostname or IP."
              >
                <input
                  type="text"
                  value={logging.syslog.host}
                  onChange={(e) => setSyslogConfig({ enabled: true, host: e.target.value })}
                  onBlur={(e) => setSyslogConfig({ enabled: true, host: e.target.value.trim() || 'localhost' })}
                  className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary w-36 focus:outline-none focus:border-accent"
                  placeholder="localhost"
                />
              </SettingRow>
              <SettingRow
                icon={<div className="w-4 h-4" />}
                label="Port"
                description="Syslog server UDP port."
              >
                <input
                  type="number"
                  value={logging.syslog.port}
                  onChange={(e) => setSyslogConfig({ enabled: true, port: parseInt(e.target.value) || 514 })}
                  className="text-xs bg-bg-surface border border-border rounded px-2 py-1 text-text-primary w-20 focus:outline-none focus:border-accent"
                  placeholder="514"
                  min="1"
                  max="65535"
                />
              </SettingRow>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
