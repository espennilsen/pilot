import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Settings } from 'lucide-react';
import { usePromptStore } from '../../stores/prompt-store';
import { useUIStore } from '../../stores/ui-store';
import PromptCard from './PromptCard';
import type { PromptTemplate } from '../../../shared/types';
import { IPC } from '../../../shared/ipc';
import { on } from '../../lib/ipc-client';

const CATEGORY_ORDER = ['Code', 'Refactor', 'Debug', 'Writing', 'Explain', 'Custom'];

interface PromptPickerProps {
  onSelect: (prompt: PromptTemplate) => void;
  onClose: () => void;
  onCreateNew: () => void;
}

export default function PromptPicker({ onSelect, onClose, onCreateNew }: PromptPickerProps) {
  const { prompts, loadPrompts } = usePromptStore();
  const { openSettings, setSettingsTab } = useUIStore();
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load prompts on mount
  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  // Listen for changes from main process
  useEffect(() => {
    const unsub = on(IPC.PROMPTS_CHANGED, () => {
      loadPrompts();
    });
    return unsub;
  }, [loadPrompts]);

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid closing on the same click that opened the picker
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleOpenManager = useCallback(() => {
    onClose();
    openSettings('prompts' as any);
  }, [onClose, openSettings]);

  // Filter and group prompts
  const visible = prompts.filter(p => !p.hidden);
  const filtered = search
    ? visible.filter(p => {
        const q = search.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.command?.toLowerCase().includes(q) ?? false)
        );
      })
    : visible;

  const grouped = CATEGORY_ORDER
    .map(cat => ({
      category: cat,
      prompts: filtered.filter(p => p.category === cat),
    }))
    .filter(g => g.prompts.length > 0);

  return (
    <div
      ref={containerRef}
      className="mb-1.5 bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-text-primary">📝 Prompts</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateNew}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-accent hover:bg-accent/10 transition-colors"
            title="Create new prompt"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
          <button
            onClick={handleOpenManager}
            className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors"
            title="Manage prompts"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-surface rounded-md border border-border focus-within:border-accent/50">
          <Search className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts…"
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Prompt grid */}
      <div className="max-h-[360px] overflow-y-auto py-2">
        {grouped.length === 0 ? (
          <div className="px-3 py-6 text-xs text-text-secondary text-center">
            {search ? 'No prompts match your search' : 'No prompts available'}
          </div>
        ) : (
          grouped.map(({ category, prompts: categoryPrompts }) => (
            <div key={category} className="mb-2 last:mb-0">
              {/* Category header */}
              <div className="px-3 py-1 text-[10px] font-semibold text-text-secondary/60 uppercase tracking-wider sticky top-0 bg-bg-elevated z-10">
                {category}
              </div>
              {/* Card grid */}
              <div className="grid grid-cols-3 gap-1.5 px-3">
                {categoryPrompts.map(prompt => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    onClick={onSelect}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-secondary/50">
        Type <kbd className="font-mono px-1 bg-bg-surface rounded">/command</kbd> in chat for quick access
      </div>
    </div>
  );
}
