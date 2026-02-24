import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check } from 'lucide-react';
import { IPC } from '../../../shared/ipc';
import { invoke } from '../../lib/ipc-client';
import type { ModelInfo } from './message-input-helpers';

// ─── Model Picker ────────────────────────────────────────────────────────

export function ModelPicker({
  currentModel,
  currentModelInfo,
  onSelect,
  onClose,
  anchorRef,
}: {
  currentModel: string | undefined;
  currentModelInfo: { provider: string; id: string } | undefined;
  onSelect: (provider: string, modelId: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [filter, setFilter] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const filterRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position relative to anchor button
  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.top,
      left: rect.right - 288, // 288 = w-72 (18rem)
    });
  }, [anchorRef]);

  // Fetch available models
  useEffect(() => {
    invoke(IPC.MODEL_GET_AVAILABLE).then((result: any) => {
      setModels(result as ModelInfo[]);
      setLoading(false);
    });
  }, []);

  // Focus filter input on open
  useEffect(() => {
    filterRef.current?.focus();
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  const filtered = models.filter((m) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    );
  });

  // Group by provider
  const grouped = filtered.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  // Flat list for keyboard nav
  const flatList = Object.values(grouped).flat();

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = flatList[highlightIndex];
      if (m) onSelect(m.provider, m.id);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!pos) return null;

  return createPortal(
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      style={{ position: 'fixed', bottom: `${window.innerHeight - pos.top + 8}px`, left: `${pos.left}px` }}
      className="w-72 bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden z-[9999]"
    >
      {/* Search */}
      <div className="p-2 border-b border-border">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-bg-surface rounded-md border border-border focus-within:border-accent/50">
          <Search className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />
          <input
            ref={filterRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search models…"
            className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-secondary/40 focus:outline-none"
          />
        </div>
      </div>

      {/* Model list */}
      <div className="max-h-64 overflow-y-auto py-1">
        {loading ? (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">Loading models…</div>
        ) : flatList.length === 0 ? (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">No models found</div>
        ) : (
          Object.entries(grouped).map(([provider, providerModels]) => (
            <div key={provider}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-text-secondary/60 uppercase tracking-wider">
                {provider}
              </div>
              {providerModels.map((m) => {
                const flatIdx = flatList.indexOf(m);
                const isActive = (currentModelInfo && currentModelInfo.provider === m.provider && currentModelInfo.id === m.id)
                  || currentModel === m.name || currentModel === m.id;
                const isHighlighted = flatIdx === highlightIndex;
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    onClick={() => onSelect(m.provider, m.id)}
                    onMouseEnter={() => setHighlightIndex(flatIdx)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                      isHighlighted ? 'bg-accent/15 text-text-primary' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <span className="flex-1 truncate font-mono">{m.name || m.id}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}
