import { useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';

export interface FindBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  caseSensitive: boolean;
  onCaseSensitiveChange: (v: boolean) => void;
  /** Total number of matches. -1 means unknown/counting. */
  matchCount: number;
  /** 0-based current index. */
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  visible: boolean;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Optional extra controls rendered after the counter */
  extraControls?: React.ReactNode;
}

export default function FindBar({
  query,
  onQueryChange,
  caseSensitive,
  onCaseSensitiveChange,
  matchCount,
  currentIndex,
  onPrev,
  onNext,
  onClose,
  visible,
  placeholder = 'Find',
  extraControls,
}: FindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [visible]);

  if (!visible) return null;

  const counterText =
    matchCount < 0
      ? '…'
      : matchCount === 0
        ? '0/0'
        : `${Math.min(currentIndex + 1, matchCount)}/${matchCount}`;

  return (
    <div className="absolute top-2 right-2 z-50 bg-bg-elevated border border-border rounded-lg shadow-lg p-2 flex items-center gap-1.5 w-[300px]">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-bg-base border border-border rounded px-2 py-1 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent"
      />
      <button
        onClick={() => onCaseSensitiveChange(!caseSensitive)}
        className={`px-1.5 py-1 rounded text-xs font-medium transition-colors ${caseSensitive ? 'text-accent bg-accent/10' : 'text-text-secondary hover:bg-bg-base'}`}
        title="Match case"
      >
        Aa
      </button>
      <button
        onClick={onPrev}
        disabled={matchCount <= 0}
        className="p-1 rounded text-text-secondary hover:bg-bg-base disabled:opacity-30 transition-colors"
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        onClick={onNext}
        disabled={matchCount <= 0}
        className="p-1 rounded text-text-secondary hover:bg-bg-base disabled:opacity-30 transition-colors"
        title="Next match (Enter)"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
      <span className="text-xs text-text-secondary font-mono w-10 text-right tabular-nums">
        {counterText}
      </span>
      {extraControls}
      <button
        onClick={onClose}
        className="p-1 rounded text-text-secondary hover:bg-bg-base transition-colors"
        title="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
