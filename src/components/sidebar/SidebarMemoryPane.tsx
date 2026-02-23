import { useEffect, useState, useCallback } from 'react';
import { useMemoryStore } from '../../stores/memory-store';
import { useProjectStore } from '../../stores/project-store';
import { useTabStore } from '../../stores/tab-store';
import { ExternalLink, Trash2, Save, RefreshCw, Brain } from 'lucide-react';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';

type MemoryScope = 'global' | 'project';

const SCOPE_TABS: { id: MemoryScope; label: string; shortDesc: string }[] = [
  { id: 'global', label: 'Global', shortDesc: '~/.config/.pilot/MEMORY.md' },
  { id: 'project', label: 'Project', shortDesc: '.pilot/MEMORY.md' },
];

export function SidebarMemoryPane() {
  const {
    globalMemory, projectSharedMemory,
    loadMemories, saveMemory, clearMemory,
    autoExtractEnabled, setAutoExtractEnabled,
    loadMemoryCount,
  } = useMemoryStore();
  const projectPath = useProjectStore(s => s.projectPath);
  const { addFileTab } = useTabStore();
  const [activeScope, setActiveScope] = useState<MemoryScope>('global');
  const [editContent, setEditContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (projectPath) loadMemories(projectPath);
  }, [projectPath, loadMemories]);

  // Sync edit content when scope changes or memories load
  useEffect(() => {
    const content =
      activeScope === 'global' ? globalMemory : projectSharedMemory;
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
    if (!window.confirm('Clear all memories in this scope?')) return;
    await clearMemory(activeScope, projectPath);
    await loadMemories(projectPath);
    await loadMemoryCount(projectPath);
  }, [projectPath, activeScope, clearMemory, loadMemories, loadMemoryCount]);

  const handleRefresh = useCallback(async () => {
    if (projectPath) await loadMemories(projectPath);
  }, [projectPath, loadMemories]);

  const handleOpenInTab = useCallback(async () => {
    if (!projectPath) return;
    try {
      const paths = await invoke(IPC.MEMORY_GET_PATHS, projectPath) as {
        global: string;
        projectShared: string;
      };
      const filePath =
        activeScope === 'global' ? paths.global : paths.projectShared;
      addFileTab(filePath, projectPath);
    } catch { /* silently fail */ }
  }, [projectPath, activeScope, addFileTab]);

  const handleOpenAllInTabs = useCallback(async () => {
    if (!projectPath) return;
    try {
      const paths = await invoke(IPC.MEMORY_GET_PATHS, projectPath) as {
        global: string;
        projectShared: string;
      };
      addFileTab(paths.global, projectPath);
      addFileTab(paths.projectShared, projectPath);
    } catch { /* silently fail */ }
  }, [projectPath, addFileTab]);

  const activeTabInfo = SCOPE_TABS.find(t => t.id === activeScope)!;

  const countBullets = (content: string | null): number => {
    if (!content) return 0;
    return content.split('\n').filter(l => l.startsWith('- ')).length;
  };

  const globalCount = countBullets(globalMemory);
  const projectCount = countBullets(projectSharedMemory);

  return (
    <div className="flex flex-col h-full">
      {/* Auto-extract toggle */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-accent" />
            <span className="text-[11px] text-text-primary font-medium">Auto-extract</span>
          </div>
          <button
            role="switch"
            aria-checked={autoExtractEnabled}
            onClick={() => setAutoExtractEnabled(!autoExtractEnabled)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0 ${
              autoExtractEnabled ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
              autoExtractEnabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
            }`} />
          </button>
        </div>
      </div>

      {/* Open All in Tabs button */}
      {projectPath && (
        <div className="px-3 py-2 border-b border-border">
          <button
            onClick={handleOpenAllInTabs}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] text-accent hover:bg-accent/10 border border-accent/20 rounded-md transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open All Memory Files in Tabs
          </button>
        </div>
      )}

      {/* Scope tabs */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex gap-0.5 bg-bg-base rounded-md p-0.5">
          {SCOPE_TABS.map(tab => {
            const count =
              tab.id === 'global' ? globalCount : projectCount;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveScope(tab.id)}
                className={`flex-1 px-2 py-1 text-[10px] rounded transition-colors ${
                  activeScope === tab.id
                    ? 'bg-accent/15 text-accent font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className="ml-1 opacity-60">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scope description + open in tab */}
      <div className="px-3 py-1 flex items-center justify-between">
        <span className="text-[10px] text-text-secondary truncate">{activeTabInfo.shortDesc}</span>
        {projectPath && (
          <button
            onClick={handleOpenInTab}
            className="flex items-center gap-1 text-[10px] text-accent hover:text-accent/80 transition-colors flex-shrink-0"
            title="Open this memory file in an editor tab"
          >
            <ExternalLink className="w-3 h-3" />
            Tab
          </button>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 px-2 pb-1 min-h-0">
        <textarea
          value={editContent}
          onChange={(e) => {
            setEditContent(e.target.value);
            setIsDirty(true);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
              e.preventDefault();
              handleSave();
            }
          }}
          className="w-full h-full bg-bg-base border border-border rounded-md p-2 text-[11px] font-mono text-text-primary resize-none focus:outline-none focus:border-accent/50"
          placeholder="# Memory&#10;&#10;- User prefers TypeScript strict mode"
          spellCheck={false}
        />
      </div>

      {/* Actions bar */}
      <div className="px-2 py-1.5 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={handleClear}
            className="p-1 text-text-secondary hover:text-error rounded transition-colors"
            title="Clear"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRefresh}
            className="p-1 text-text-secondary hover:text-text-primary rounded transition-colors"
            title="Reload from disk"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-accent text-white rounded-md hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-3 h-3" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
