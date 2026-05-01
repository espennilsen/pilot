import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';

interface Match {
  start: number;
  end: number;
}

export interface FindReplacePanelProps {
  content: string;
  onReplace: (newContent: string, selectionStart: number, selectionEnd: number) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onScrollSync: () => void;
  visible: boolean;
  onClose: () => void;
  replaceMode?: boolean;
  focusTrigger?: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatches(content: string, query: string, caseSensitive: boolean, regexMode: boolean): Match[] {
  if (!query) return [];
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    const pattern = regexMode ? query : escapeRegex(query);
    const regex = new RegExp(pattern, flags);
    const matches: Match[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
    return matches;
  } catch {
    return [];
  }
}

export default function FindReplacePanel({
  content,
  onReplace,
  textareaRef,
  onScrollSync,
  visible,
  onClose,
  replaceMode = false,
  focusTrigger = 0,
}: FindReplacePanelProps) {
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexMode, setRegexMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showReplace, setShowReplace] = useState(replaceMode);
  const findInputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(
    () => findMatches(content, query, caseSensitive, regexMode),
    [content, query, caseSensitive, regexMode]
  );

  // Clamp current index when match count changes
  useEffect(() => {
    if (matches.length > 0 && currentIndex >= matches.length) {
      setCurrentIndex(0);
    }
  }, [matches.length, currentIndex]);

  // Focus find input when visible or focusTrigger changes
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    }
  }, [visible, focusTrigger]);

  // Scroll to current match and set selection
  useEffect(() => {
    if (!textareaRef.current || matches.length === 0) return;
    const idx = Math.min(currentIndex, matches.length - 1);
    const match = matches[idx];
    if (!match) return;

    const ta = textareaRef.current;
    ta.setSelectionRange(match.start, match.end);
    ta.focus();

    // Scroll into view: estimate line height at 24px
    const textBefore = content.substring(0, match.start);
    const linesBefore = textBefore.split('\n').length - 1;
    const lineHeight = 24;
    const targetScroll = linesBefore * lineHeight - ta.clientHeight / 3;
    ta.scrollTop = Math.max(0, targetScroll);
    onScrollSync();
  }, [currentIndex, matches, content, textareaRef, onScrollSync]);

  const goToNext = () => {
    if (matches.length === 0) return;
    setCurrentIndex(i => (i + 1) % matches.length);
  };

  const goToPrev = () => {
    if (matches.length === 0) return;
    setCurrentIndex(i => (i - 1 + matches.length) % matches.length);
  };

  const replaceCurrent = () => {
    if (matches.length === 0) return;
    const idx = Math.min(currentIndex, matches.length - 1);
    const match = matches[idx];
    const newContent = content.substring(0, match.start) + replaceText + content.substring(match.end);
    const newCursor = match.start + replaceText.length;
    onReplace(newContent, newCursor, newCursor);
  };

  const replaceAll = () => {
    if (matches.length === 0) return;
    const pattern = regexMode ? query : escapeRegex(query);
    const flags = caseSensitive ? 'g' : 'gi';
    try {
      const newContent = content.replace(new RegExp(pattern, flags), replaceText);
      onReplace(newContent, 0, 0);
    } catch {
      // Invalid regex — silently ignore
    }
  };

  if (!visible) return null;

  const matchCounter = matches.length > 0
    ? `${Math.min(currentIndex + 1, matches.length)}/${matches.length}`
    : '0/0';

  return (
    <div className="absolute top-2 right-2 z-50 bg-bg-elevated border border-border rounded-lg shadow-lg p-2 flex flex-col gap-1.5 w-[340px]">
      {/* Find row */}
      <div className="flex items-center gap-1.5">
        <input
          ref={findInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) goToPrev(); else goToNext();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Find"
          className="flex-1 min-w-0 bg-bg-base border border-border rounded px-2 py-1 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent"
        />
        <button
          onClick={() => setCaseSensitive(v => !v)}
          className={`px-1.5 py-1 rounded text-xs font-medium transition-colors ${caseSensitive ? 'text-accent bg-accent/10' : 'text-text-secondary hover:bg-bg-base'}`}
          title="Match case"
        >
          Aa
        </button>
        <button
          onClick={() => setRegexMode(v => !v)}
          className={`px-1.5 py-1 rounded text-xs font-medium transition-colors ${regexMode ? 'text-accent bg-accent/10' : 'text-text-secondary hover:bg-bg-base'}`}
          title="Use regular expressions"
        >
          .*
        </button>
        <button
          onClick={goToPrev}
          disabled={matches.length === 0}
          className="p-1 rounded text-text-secondary hover:bg-bg-base disabled:opacity-30 transition-colors"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={goToNext}
          disabled={matches.length === 0}
          className="p-1 rounded text-text-secondary hover:bg-bg-base disabled:opacity-30 transition-colors"
          title="Next match (Enter)"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <span className="text-xs text-text-secondary font-mono w-10 text-right tabular-nums">{matchCounter}</span>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-secondary hover:bg-bg-base transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                replaceCurrent();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder="Replace with"
            className="flex-1 min-w-0 bg-bg-base border border-border rounded px-2 py-1 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent"
          />
          <button
            onClick={replaceCurrent}
            disabled={matches.length === 0}
            className="px-2 py-1 text-xs font-medium rounded bg-bg-base border border-border text-text-primary hover:bg-bg-surface disabled:opacity-30 transition-colors whitespace-nowrap"
          >
            Replace
          </button>
          <button
            onClick={replaceAll}
            disabled={matches.length === 0}
            className="px-2 py-1 text-xs font-medium rounded bg-bg-base border border-border text-text-primary hover:bg-bg-surface disabled:opacity-30 transition-colors whitespace-nowrap"
          >
            All
          </button>
        </div>
      )}

      {!showReplace && (
        <button
          onClick={() => setShowReplace(true)}
          className="self-start text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          Replace →
        </button>
      )}
    </div>
  );
}
