import { useState, useEffect } from 'react';
import { useAppSettingsStore } from '../../../stores/app-settings-store';
import { IPC } from '../../../../shared/ipc';
import { invoke } from '../../../lib/ipc-client';
import { Terminal, Code, CheckCircle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────

interface DetectedTerminalInfo { 
  id: string; 
  name: string; 
  app: string; 
}

interface DetectedEditorInfo { 
  id: string; 
  name: string; 
  cli: string; 
}

// ─── ToolsStep Component ─────────────────────────────────────────────────

export default function ToolsStep() {
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
