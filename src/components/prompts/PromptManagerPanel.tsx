import { useEffect, useState, useMemo } from 'react';
import { Plus, Edit3, Trash2, Eye, EyeOff, RotateCw, FolderOpen } from 'lucide-react';
import { usePromptStore } from '../../stores/prompt-store';
import { useProjectStore } from '../../stores/project-store';
import PromptEditor from './PromptEditor';
import type { PromptTemplate } from '../../../shared/types';
import { IPC } from '../../../shared/ipc';
import { on } from '../../lib/ipc-client';

/** Display order for categories */
const CATEGORY_ORDER = ['Code', 'Debug', 'Refactor', 'Explain', 'Writing', 'Custom'];

/** Source priority for sorting within a category (project first) */
const SOURCE_PRIORITY: Record<string, number> = { project: 0, user: 1, builtin: 2 };

/** Compact source label */
function sourceLabel(source: string): { text: string; className: string } {
  switch (source) {
    case 'project': return { text: 'project', className: 'bg-accent/15 text-accent' };
    case 'builtin': return { text: 'built-in', className: 'bg-bg-elevated text-text-secondary' };
    default: return { text: 'custom', className: 'bg-warning/15 text-warning' };
  }
}

export default function PromptManagerPanel() {
  const {
    prompts,
    loading,
    loadPrompts,
    deletePrompt,
    updatePrompt,
    unhidePrompt,
  } = usePromptStore();
  const { projectPath } = useProjectStore();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);

  // Load prompts on mount
  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  // Listen for prompt changes
  useEffect(() => {
    const unsubscribe = on(IPC.PROMPTS_CHANGED, () => {
      loadPrompts();
    });
    return unsubscribe;
  }, [loadPrompts]);

  // Group visible prompts by category
  const { categoryGroups, hiddenPrompts } = useMemo(() => {
    const visible = prompts.filter(p => !p.hidden);
    const hidden = prompts.filter(p => p.hidden);

    const grouped = new Map<string, PromptTemplate[]>();
    for (const prompt of visible) {
      const cat = prompt.category || 'Custom';
      const list = grouped.get(cat) ?? [];
      list.push(prompt);
      grouped.set(cat, list);
    }

    // Sort within each category: project first, then by title
    for (const [, list] of grouped) {
      list.sort((a, b) => {
        const sp = (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9);
        if (sp !== 0) return sp;
        return a.title.localeCompare(b.title);
      });
    }

    // Return categories in display order, only those with prompts
    const ordered: { category: string; prompts: PromptTemplate[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const list = grouped.get(cat);
      if (list && list.length > 0) ordered.push({ category: cat, prompts: list });
    }
    // Include any extra categories not in CATEGORY_ORDER
    for (const [cat, list] of grouped) {
      if (!CATEGORY_ORDER.includes(cat) && list.length > 0) {
        ordered.push({ category: cat, prompts: list });
      }
    }

    return { categoryGroups: ordered, hiddenPrompts: hidden };
  }, [prompts]);

  // Find overrides (by same ID/filename between project and global)
  const getOverrideInfo = (prompt: PromptTemplate) => {
    if (prompt.source === 'project') {
      const globalMatch = prompts.find(
        p => p.id === prompt.id && p.source !== 'project'
      );
      if (globalMatch) {
        return { type: 'overrides' as const, targetTitle: globalMatch.title };
      }
    }
    if (prompt.source !== 'project') {
      const projectMatch = prompts.find(
        p => p.id === prompt.id && p.source === 'project'
      );
      if (projectMatch) {
        return { type: 'overridden' as const, targetTitle: projectMatch.title };
      }
    }
    return null;
  };

  const handleEdit = (prompt: PromptTemplate) => {
    setEditingPrompt(prompt);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingPrompt(null);
    setEditorOpen(true);
  };

  const handleDelete = async (prompt: PromptTemplate) => {
    const confirmed = window.confirm(
      `Delete prompt "${prompt.title}"?\n\nThis action cannot be undone.`
    );
    if (confirmed) {
      await deletePrompt(prompt.id);
    }
  };

  const handleToggleHide = async (prompt: PromptTemplate) => {
    if (prompt.hidden) {
      await unhidePrompt(prompt.id);
    } else {
      await updatePrompt(prompt.id, { hidden: true });
    }
  };

  const handleResetBuiltIns = async () => {
    const hiddenBuiltIns = prompts.filter(p => p.source === 'builtin' && p.hidden);
    if (hiddenBuiltIns.length === 0) return;

    const confirmed = window.confirm(
      `Unhide ${hiddenBuiltIns.length} built-in prompt(s)?`
    );
    if (confirmed) {
      for (const prompt of hiddenBuiltIns) {
        await unhidePrompt(prompt.id);
      }
    }
  };

  const renderPromptRow = (prompt: PromptTemplate) => {
    const overrideInfo = getOverrideInfo(prompt);
    const hasConflict = !!prompt.commandConflict;
    const isBuiltIn = prompt.source === 'builtin';
    const isUserOrProject = prompt.source === 'user' || prompt.source === 'project';
    const sl = sourceLabel(prompt.source);

    return (
      <div key={prompt.id} className="space-y-1">
        <div className="flex items-center justify-between p-3 bg-bg-base rounded hover:bg-bg-surface/50 transition-colors group">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-2xl flex-shrink-0">{prompt.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-primary font-medium truncate">{prompt.title}</span>
                {prompt.command && (
                  <code
                    className={`text-xs px-2 py-0.5 rounded ${
                      hasConflict ? 'bg-error/20 text-error line-through' : 'bg-accent/20 text-accent'
                    }`}
                    title={prompt.commandConflict?.reason}
                  >
                    /{prompt.command}
                  </code>
                )}
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${sl.className}`}>
                  {sl.text}
                </span>
              </div>
              {prompt.description && (
                <p className="text-sm text-text-secondary truncate mt-0.5">
                  {prompt.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isBuiltIn && (
              <>
                <button
                  onClick={() => handleToggleHide(prompt)}
                  className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
                  title="Hide prompt"
                >
                  <EyeOff size={16} />
                </button>
                <button
                  onClick={() => handleEdit(prompt)}
                  className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
                  title="Edit prompt"
                >
                  <Edit3 size={16} />
                </button>
              </>
            )}
            {isUserOrProject && (
              <>
                <button
                  onClick={() => handleEdit(prompt)}
                  className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
                  title="Edit prompt"
                >
                  <Edit3 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(prompt)}
                  className="p-2 text-text-secondary hover:text-error hover:bg-bg-elevated rounded transition-colors"
                  title="Delete prompt"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {overrideInfo && (
          <div className="ml-12 text-xs text-text-secondary">
            {overrideInfo.type === 'overrides' ? (
              <span>↳ overrides global &ldquo;{overrideInfo.targetTitle}&rdquo;</span>
            ) : (
              <span className="opacity-60">↳ overridden by project &ldquo;{overrideInfo.targetTitle}&rdquo;</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderHiddenPromptRow = (prompt: PromptTemplate) => {
    return (
      <div key={prompt.id} className="flex items-center justify-between p-3 bg-bg-base rounded opacity-60">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-2xl flex-shrink-0">{prompt.icon}</span>
          <div className="flex-1 min-w-0">
            <span className="text-text-primary font-medium truncate">{prompt.title}</span>
          </div>
        </div>
        <button
          onClick={() => handleToggleHide(prompt)}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded transition-colors"
          title="Show prompt"
        >
          <Eye size={16} />
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-text-secondary">
        Loading prompts...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category-grouped prompts */}
      {categoryGroups.map(({ category, prompts: catPrompts }) => (
        <div key={category} className="bg-bg-surface border border-border rounded-md p-4">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-text-primary">{category}</h3>
            <span className="text-xs text-text-secondary">
              {catPrompts.length} {catPrompts.length === 1 ? 'prompt' : 'prompts'}
            </span>
          </div>
          <div className="space-y-2">
            {catPrompts.map(renderPromptRow)}
          </div>
        </div>
      ))}

      {/* Hidden Prompts Section */}
      {hiddenPrompts.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-md p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Hidden ({hiddenPrompts.length})
          </h3>
          <div className="space-y-2">
            {hiddenPrompts.map(renderHiddenPromptRow)}
          </div>
        </div>
      )}

      {/* Empty State */}
      {prompts.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          <p>No prompts yet.</p>
          <p className="text-sm mt-2">Create your first prompt to get started.</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={handleCreate}
          className="w-full px-4 py-3 bg-accent text-white rounded hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Create New Prompt
        </button>

        {hiddenPrompts.some(p => p.source === 'builtin') && (
          <button
            onClick={handleResetBuiltIns}
            className="w-full px-4 py-2 bg-bg-surface border border-border text-text-secondary rounded hover:bg-bg-elevated hover:text-text-primary transition-colors flex items-center justify-center gap-2"
          >
            <RotateCw size={16} />
            Reset Built-ins
          </button>
        )}
      </div>

      {/* Editor Modal */}
      {editorOpen && (
        <PromptEditor
          prompt={editingPrompt}
          onClose={() => {
            setEditorOpen(false);
            setEditingPrompt(null);
          }}
        />
      )}
    </div>
  );
}
