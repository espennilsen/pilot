import { useUIStore } from '../../stores/ui-store';
import { useEffect } from 'react';
import {
  X, Settings, FolderCog, Puzzle, BookOpen, Terminal, Keyboard,
  Shield, FolderOpen, KeyRound, FileText, Smartphone, MessageSquareText,
} from 'lucide-react';
import { ReopenWelcomeButton } from './settings-helpers';
import { GeneralSettings } from './sections/GeneralSettings';
import { AuthSettings } from './sections/AuthSettings';
import { ProjectSettings } from './sections/ProjectSettings';
import { FilesSettings } from './sections/FilesSettings';
import { CompanionSettings } from './sections/CompanionSettings';
import { PromptsSettings } from './sections/PromptsSettings';
import { KeybindingsSettings } from './sections/KeybindingsSettings';
import { ExtensionsSettings } from './sections/ExtensionsSettings';
import { SkillsSettings } from './sections/SkillsSettings';
import { DeveloperSettings } from './sections/DeveloperSettings';
import { SystemPromptSettings } from './sections/SystemPromptSettings';

const TABS = [
  { id: 'general' as const, label: 'General', icon: Settings },
  { id: 'auth' as const, label: 'Auth & Models', icon: KeyRound },
  { id: 'project' as const, label: 'Project', icon: FolderCog },
  { id: 'files' as const, label: 'Files', icon: FolderOpen },
  { id: 'companion' as const, label: 'Companion', icon: Smartphone },
  { id: 'system-prompt' as const, label: 'System Prompt', icon: MessageSquareText },
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
            {settingsTab === 'system-prompt' && <SystemPromptSettings />}
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
