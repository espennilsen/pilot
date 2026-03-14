/**
 * SuggestionChips — Clickable follow-up suggestion chips below the last message.
 *
 * After each assistant response, shows 2-3 contextual suggestions the user
 * can click to continue the conversation. Chips disappear when clicked or
 * when the user types a new message.
 */

import { Sparkles } from 'lucide-react';

interface SuggestionChipsProps {
  suggestions: Array<{ text: string; label: string }>;
  onSelect: (text: string) => void;
}

export default function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 mb-2">
      <Sparkles className="w-3 h-3 text-text-secondary/50 flex-shrink-0" />
      {suggestions.map((suggestion, idx) => (
        <button
          key={idx}
          onClick={() => onSelect(suggestion.text)}
          className="px-3 py-1.5 bg-bg-surface hover:bg-bg-elevated border border-border hover:border-accent/50 rounded-full text-xs text-text-secondary hover:text-text-primary transition-all duration-150 cursor-pointer"
          title={suggestion.text}
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}
