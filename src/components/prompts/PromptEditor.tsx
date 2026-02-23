import { useState, useEffect, useCallback } from 'react';
import { X, ChevronDown, Check, XCircle } from 'lucide-react';
import { usePromptStore } from '../../stores/prompt-store';
import { useProjectStore } from '../../stores/project-store';
import type { PromptTemplate } from '../../../shared/types';

interface PromptEditorProps {
  /** If editing, the existing prompt. If null, creating new. */
  prompt: PromptTemplate | null;
  onClose: () => void;
}

const EMOJI_OPTIONS = ['📝', '🔍', '♻️', '🧪', '🏷️', '🛡️', '⚡', '🔄', '🐛', '🔧', '📖', '🏗️', '💬', '📋', '🚀', '📊', '🧹'];

const CATEGORIES = ['Code', 'Debug', 'Explain', 'Refactor', 'Writing', 'Custom'] as const;

export default function PromptEditor({ prompt, onClose }: PromptEditorProps) {
  const { createPrompt, updatePrompt, validateCommand } = usePromptStore();
  const { projectPath } = useProjectStore();

  const isEditing = !!prompt;
  const isProjectScope = prompt?.source === 'project';
  const canChangeScope = !isEditing;

  const [icon, setIcon] = useState(prompt?.icon || '📝');
  const [title, setTitle] = useState(prompt?.title || '');
  const [command, setCommand] = useState(prompt?.command || '');
  const [scope, setScope] = useState<'global' | 'project'>(isProjectScope ? 'project' : 'global');
  const [description, setDescription] = useState(prompt?.description || '');
  const [category, setCategory] = useState(prompt?.category || 'Custom');
  const [content, setContent] = useState(prompt?.content || '');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Validate slash command
  const [commandValidation, setCommandValidation] = useState<{ valid: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (command.trim()) {
      validateCommand(command, prompt?.id).then(setCommandValidation);
    } else {
      setCommandValidation(null);
    }
  }, [command, prompt?.id, validateCommand]);

  // Auto-detect variables from content
  const detectedVariables = useCallback(() => {
    const matches = Array.from(content.matchAll(/\{\{([^}]+)\}\}/g));
    const vars = new Map<string, string>();
    
    for (const match of matches) {
      const varName = match[1].trim();
      if (!vars.has(varName)) {
        // Infer type from variable name
        let type = 'text';
        if (varName.toLowerCase().includes('code') || varName.toLowerCase().includes('snippet')) {
          type = 'code';
        } else if (varName.toLowerCase().includes('file') || varName.toLowerCase().includes('path')) {
          type = 'file';
        } else if (varName.toLowerCase().includes('select') || varName.toLowerCase().includes('choice')) {
          type = 'select';
        }
        vars.set(varName, type);
      }
    }
    
    return Array.from(vars.entries()).map(([name, type]) => ({ name, type }));
  }, [content]);

  const variables = detectedVariables();

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      return;
    }

    if (isEditing && prompt) {
      const updateData: any = {
        icon,
        title: title.trim(),
        command: command.trim() || null,
        description: description.trim() || undefined,
        category,
        content: content.trim(),
      };
      await updatePrompt(prompt.id, updateData);
    } else {
      const createData: any = {
        icon,
        title: title.trim(),
        command: command.trim() || null,
        description: description.trim() || undefined,
        category,
        content: content.trim(),
        scope,
      };
      await createPrompt(createData, scope === 'project' ? projectPath || undefined : undefined);
    }

    onClose();
  };

  const isSaveDisabled = !title.trim() || !content.trim() || (!!command.trim() && commandValidation !== null && !commandValidation.valid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-bg-elevated border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg-elevated border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {isEditing ? 'Edit Prompt' : 'Create New Prompt'}
          </h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Icon Picker */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Icon
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="px-4 py-2 bg-bg-surface border border-border rounded text-2xl hover:bg-bg-elevated transition-colors flex items-center gap-2"
              >
                {icon}
                <ChevronDown size={16} className="text-text-secondary" />
              </button>
              {showEmojiPicker && (
                <div className="absolute z-10 mt-1 p-2 bg-bg-elevated border border-border rounded-lg shadow-lg grid grid-cols-6 gap-1">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setIcon(emoji);
                        setShowEmojiPicker(false);
                      }}
                      className="text-2xl p-2 hover:bg-bg-surface rounded transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Title <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Add Type Annotations"
              className="w-full px-3 py-2 bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Slash Command */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Slash Command <span className="text-text-secondary text-xs">(optional)</span>
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none">
                /
              </div>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="types"
                className="w-full pl-7 pr-10 py-2 bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
              />
              {command.trim() && commandValidation && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {commandValidation.valid ? (
                    <Check size={16} className="text-success" />
                  ) : (
                    <XCircle size={16} className="text-error" />
                  )}
                </div>
              )}
            </div>
            {command.trim() && commandValidation && !commandValidation.valid && (
              <p className="mt-1 text-xs text-error">{commandValidation.error}</p>
            )}
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Save to
            </label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 ${!canChangeScope && scope !== 'global' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="radio"
                  value="global"
                  checked={scope === 'global'}
                  onChange={(e) => setScope(e.target.value as 'global')}
                  disabled={!canChangeScope && scope !== 'global'}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-text-primary">Global (always available)</span>
              </label>
              <label className={`flex items-center gap-2 ${(!canChangeScope && scope !== 'project') || !projectPath ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="radio"
                  value="project"
                  checked={scope === 'project'}
                  onChange={(e) => setScope(e.target.value as 'project')}
                  disabled={(!canChangeScope && scope !== 'project') || !projectPath}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-text-primary">
                  Project {!projectPath && <span className="text-text-secondary text-xs">(no project open)</span>}
                </span>
              </label>
            </div>
            {!canChangeScope && (
              <p className="mt-1 text-xs text-text-secondary">Scope cannot be changed when editing</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this prompt does"
              className="w-full px-3 py-2 bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 bg-bg-surface border border-border rounded text-text-primary focus:outline-none focus:border-accent"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Prompt Content */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Prompt Content <span className="text-error">*</span>
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your prompt template here. Use {{variableName}} for dynamic values."
              rows={12}
              className="w-full px-3 py-2 bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-accent font-mono text-sm resize-y"
            />
          </div>

          {/* Detected Variables */}
          {variables.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Detected Variables
              </label>
              <div className="bg-bg-surface border border-border rounded p-3 space-y-2">
                {variables.map((v, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <code className="text-accent">{'{{' + v.name + '}}'}</code>
                    <span className="text-text-secondary">{v.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-bg-elevated border-t border-border px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaveDisabled}
            className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isEditing ? 'Update Prompt' : 'Create Prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}
