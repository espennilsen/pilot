import { useEffect, useState, useCallback } from 'react';
import { useMemoryStore } from '../../stores/memory-store';
import { useProjectStore } from '../../stores/project-store';
import { useTabStore } from '../../stores/tab-store';
import { useUIStore } from '../../stores/ui-store';
import { Brain, Trash2, Save, RefreshCw, ExternalLink } from 'lucide-react';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';

type MemoryScope = 'global' | 'project';

const SCOPE_TABS: { id: MemoryScope; label: string; description: string }[] = [
  { id: 'global', label: 'Global', description: 'Applies to all projects and sessions (~/.config/.pilot/MEMORY.md)' },
  { id: 'project', label: 'Project', description: 'Shared project memory, can be checked into git (.pilot/MEMORY.md)' },
];

export default function MemorySettings() {
  const { globalMemory, projectSharedMemory, loadMemories, saveMemory, clearMemory, autoExtractEnabled, setAutoExtractEnabled, loadMemoryCount } = useMemoryStore();
  const projectPath = useProjectStore(s => s.projectPath);
  const { addFileTab } = useTabStore();
  const { closeSettings } = useUIStore();
  const [activeScope, setActiveScope] = useState<MemoryScope>('global');
  const [editContent, setEditContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load memories on mount
  useEffect(() => {
    if (projectPath) {
      loadMemories(projectPath);
    }
  }, [projectPath, loadMemories]);

  // Sync edit content when scope changes or memories load
  useEffect(() => {
    const content = activeScope === 'global'
      ? globalMemory
      : projectSharedMemory;
    setEditContent(content || '# Memory\n');
    setIsDirty(false);
  }, [activeScope, globalMemory, projectSharedMemory]);

  const handleSave = useCallback(async () => {
    if (!projectPath || !isDirty) return;
    setSaving(true);
    await saveMemory(activeScope, projectPath, editContent);
    await loadMemories(projectPath);
    await loadMemoryCount(projectPath);
    setIsDirty(false);
    setSaving(false);
  }, [projectPath, activeScope, editContent, isDirty, saveMemory, loadMemories, loadMemoryCount]);

  const handleClear = useCallback(async () => {
    if (!projectPath) return;
    await clearMemory(activeScope, projectPath);
    await loadMemories(projectPath);
    await loadMemoryCount(projectPath);
  }, [projectPath, activeScope, clearMemory, loadMemories, loadMemoryCount]);

  const handleRefresh = useCallback(async () => {
    if (projectPath) {
      await loadMemories(projectPath);
    }
  }, [projectPath, loadMemories]);

  const handleOpenFile = useCallback(async () => {
    if (!projectPath) return;
    try {
      const paths = await invoke(IPC.MEMORY_GET_PATHS, projectPath) as {
        global: string;
        projectShared: string;
      };
      const filePath = activeScope === 'global'
        ? paths.global
        : paths.projectShared;
      addFileTab(filePath, projectPath);
      closeSettings();
    } catch { /* Expected: file tab creation may fail if project not loaded */
      // Silently fail
    }
  }, [projectPath, activeScope, addFileTab, closeSettings]);

  const activeTabInfo = SCOPE_TABS.find(t => t.id === activeScope)!;

  return (
    <div className="p-5 space-y-4 flex flex-col h-full">
      {/* Auto-extract toggle */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <Brain className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-primary">Auto-extract memories</span>
            <button
              role="switch"
              aria-checked={autoExtractEnabled}
              onClick={() => setAutoExtractEnabled(!autoExtractEnabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                autoExtractEnabled ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  autoExtractEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Agent learns from conversations automatically. Uses a lightweight API call after each response.
          </p>
        </div>
      </div>

      {/* Quick reference */}
      <div className="bg-bg-surface rounded-lg border border-border px-4 py-3">
        <p className="text-[11px] text-text-secondary font-medium mb-1.5">Quick reference</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span className="text-text-secondary"><code className="bg-bg-base px-1 rounded font-mono"># remember &lt;text&gt;</code></span>
          <span className="text-text-secondary">Save a memory</span>
          <span className="text-text-secondary"><code className="bg-bg-base px-1 rounded font-mono"># forget &lt;text&gt;</code></span>
          <span className="text-text-secondary">Remove a memory</span>
          <span className="text-text-secondary"><code className="bg-bg-base px-1 rounded font-mono">/memory</code></span>
          <span className="text-text-secondary">Open this panel</span>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 bg-bg-surface rounded-lg p-1 border border-border">
        {SCOPE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveScope(tab.id)}
            className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
              activeScope === tab.id
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Description + Open File button */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-text-secondary">{activeTabInfo.description}</p>
        {projectPath && (
          <button
            onClick={handleOpenFile}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-accent hover:text-accent/80 hover:bg-accent/5 rounded transition-colors flex-shrink-0"
            title="Open this memory file in a tab"
          >
            <ExternalLink className="w-3 h-3" />
            Open File
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <textarea
          value={editContent}
          onChange={(e) => {
            setEditContent(e.target.value);
            setIsDirty(true);
          }}
          className="w-full h-full min-h-[180px] max-h-[220px] bg-bg-surface border border-border rounded-lg p-3 text-xs font-mono text-text-primary resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
          placeholder="# Memory\n\n## User Preferences\n- Prefers TypeScript strict mode\n- Uses pnpm, never npm"
          spellCheck={false}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-error/70 hover:text-error hover:bg-error/5 rounded-md transition-colors"
            title="Clear all memories in this scope"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-md transition-colors"
            title="Reload from disk"
          >
            <RefreshCw className="w-3 h-3" />
            Reload
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-3 h-3" />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
