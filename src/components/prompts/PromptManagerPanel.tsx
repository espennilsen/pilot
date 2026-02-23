import { useEffect, useState } from 'react';
import { Plus, Edit3, Trash2, Eye, EyeOff, RotateCw, FolderOpen } from 'lucide-react';
import { usePromptStore } from '../../stores/prompt-store';
import { useProjectStore } from '../../stores/project-store';
import PromptEditor from './PromptEditor';
import type { PromptTemplate } from '../../../shared/types';
import { IPC } from '../../../shared/ipc';
import { on } from '../../lib/ipc-client';

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

  // Organize prompts into sections
  const projectPrompts = prompts.filter(p => p.source === 'project' && !p.hidden);
  const globalBuiltIn = prompts.filter(p => p.source === 'builtin' && !p.hidden);
  const globalCustom = prompts.filter(p => p.source === 'user' && !p.hidden);
  const hiddenPrompts = prompts.filter(p => p.hidden);

  // Find overrides (by same ID/filename between project and global)
  const getOverrideInfo = (prompt: PromptTemplate) => {
    if (prompt.source === 'project') {
      // Check if there's a global prompt with the same ID that we override
      const globalMatch = prompts.find(
        p => p.id === prompt.id && p.source !== 'project'
      );
      if (globalMatch) {
        return { type: 'overrides' as const, targetTitle: globalMatch.title };
      }
    }
    if (prompt.source !== 'project') {
      // Check if there's a project prompt with the same ID that overrides us
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
    if (hiddenBuiltIns.length === 0) {
      return;
    }
    
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
                {prompt.category !== 'Custom' && (
                  <span className="text-xs text-text-secondary">
                    {prompt.category}
                  </span>
                )}
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
              <span>↳ overrides global "{overrideInfo.targetTitle}"</span>
            ) : (
              <span className="opacity-60">↳ overridden by project "{overrideInfo.targetTitle}"</span>
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
      {/* Project Prompts Section */}
      {projectPath && projectPrompts.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-md p-4">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">
              Project Prompts
            </h3>
            <span className="text-xs text-text-secondary ml-auto">
              {projectPath.split('/').pop()}
            </span>
          </div>
          <div className="space-y-2">
            {projectPrompts.map(renderPromptRow)}
          </div>
        </div>
      )}

      {/* Global Built-in Section */}
      {globalBuiltIn.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-md p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Global Built-in
          </h3>
          <div className="space-y-2">
            {globalBuiltIn.map(renderPromptRow)}
          </div>
        </div>
      )}

      {/* Global Custom Section */}
      {globalCustom.length > 0 && (
        <div className="bg-bg-surface border border-border rounded-md p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Global Custom
          </h3>
          <div className="space-y-2">
            {globalCustom.map(renderPromptRow)}
          </div>
        </div>
      )}

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
