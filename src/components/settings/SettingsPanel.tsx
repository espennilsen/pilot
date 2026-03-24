import { useUIStore } from '../../stores/ui-store';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  X, Settings, FolderCog, Puzzle, BookOpen, Terminal, Keyboard,
  Shield, FolderOpen, KeyRound, FileText, Smartphone, MessageSquareText, Plug,
  Palette,
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
import { McpSettings } from './sections/McpSettings';
import { AppearanceSettings } from './sections/AppearanceSettings';

const TABS = [
  { id: 'general' as const, label: 'General', icon: Settings },
  { id: 'appearance' as const, label: 'Appearance', icon: Palette },
  { id: 'auth' as const, label: 'Auth & Models', icon: KeyRound },
  { id: 'project' as const, label: 'Project', icon: FolderCog },
  { id: 'files' as const, label: 'Files', icon: FolderOpen },
  { id: 'companion' as const, label: 'Companion', icon: Smartphone },
  { id: 'system-prompt' as const, label: 'System Prompt', icon: MessageSquareText },
  { id: 'prompts' as const, label: 'Prompts', icon: FileText },
  { id: 'keybindings' as const, label: 'Keybindings', icon: Keyboard },
  { id: 'extensions' as const, label: 'Extensions', icon: Puzzle },
  { id: 'skills' as const, label: 'Skills', icon: BookOpen },
  { id: 'mcp' as const, label: 'MCP Servers', icon: Plug },
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

  // ─── Resizable panel state ───────────────────────────────────────────
  const MIN_W = 600;
  const MIN_H = 400;
  const MAX_W_RATIO = 0.92;
  const MAX_H_RATIO = 0.90;

  const [size, setSize] = useState<{ w: number; h: number }>(() => {
    try {
      const saved = localStorage.getItem('pilot-settings-size');
      if (saved) {
        const { w, h } = JSON.parse(saved);
        if (typeof w === 'number' && typeof h === 'number') {
          return {
            w: Math.max(MIN_W, Math.min(w, window.innerWidth * MAX_W_RATIO)),
            h: Math.max(MIN_H, Math.min(h, window.innerHeight * MAX_H_RATIO)),
          };
        }
      }
    } catch { /* ignore */ }
    return { w: 780, h: 560 };
  });

  const resizing = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const { startX, startY, startW, startH } = resizing.current;
      const newW = Math.max(MIN_W, Math.min(startW + (ev.clientX - startX) * 2, window.innerWidth * MAX_W_RATIO));
      const newH = Math.max(MIN_H, Math.min(startH + (ev.clientY - startY) * 2, window.innerHeight * MAX_H_RATIO));
      setSize({ w: newW, h: newH });
    };

    const onMouseUp = () => {
      if (resizing.current) {
        // Persist on release
        setSize(prev => {
          try { localStorage.setItem('pilot-settings-size', JSON.stringify(prev)); } catch { /* ignore */ }
          return prev;
        });
      }
      resizing.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  }, [size.w, size.h]);

  if (!settingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeSettings}
      />

      {/* Panel */}
      <div
        className="relative bg-bg-elevated border border-border rounded-lg shadow-2xl flex overflow-hidden"
        style={{ width: size.w, height: size.h }}
      >
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
            {settingsTab === 'appearance' && <AppearanceSettings />}
            {settingsTab === 'auth' && <AuthSettings />}
            {settingsTab === 'project' && <ProjectSettings />}
            {settingsTab === 'files' && <FilesSettings />}
            {settingsTab === 'companion' && <CompanionSettings />}
            {settingsTab === 'system-prompt' && <SystemPromptSettings />}
            {settingsTab === 'prompts' && <PromptsSettings />}
            {settingsTab === 'keybindings' && <KeybindingsSettings />}
            {settingsTab === 'extensions' && <ExtensionsSettings />}
            {settingsTab === 'skills' && <SkillsSettings />}
            {settingsTab === 'mcp' && <McpSettings />}
            {settingsTab === 'developer' && <DeveloperSettings />}
          </div>
        </div>

        {/* Resize handle — bottom-right corner */}
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10 group"
          title="Drag to resize"
        >
          <svg
            className="w-3 h-3 absolute bottom-0.5 right-0.5 text-text-secondary/40 group-hover:text-text-secondary/70 transition-colors"
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <circle cx="9" cy="9" r="1.2" />
            <circle cx="5" cy="9" r="1.2" />
            <circle cx="9" cy="5" r="1.2" />
          </svg>
        </div>
      </div>
    </div>
  );
}
