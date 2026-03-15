/**
 * EditMessageOverlay — Inline editor for editing and resending a user message.
 *
 * Replaces the user message content with a textarea for editing.
 * On submit, the edited text is sent via the edit-and-resend flow.
 */

import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';

interface EditMessageOverlayProps {
  initialContent: string;
  onSubmit: (editedContent: string) => void;
  onCancel: () => void;
}

export default function EditMessageOverlay({ initialContent, onSubmit, onCancel }: EditMessageOverlayProps) {
  const [text, setText] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
      // Auto-resize
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (text.trim()) onSubmit(text.trim());
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  return (
    <div className="border-l-2 border-accent pl-4 py-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        className="w-full bg-bg-surface border border-border rounded-md p-3 text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent"
        rows={1}
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => text.trim() && onSubmit(text.trim())}
          disabled={!text.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/20 hover:bg-accent/30 text-accent rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-3 h-3" />
          Resend
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-elevated hover:bg-bg-surface text-text-secondary rounded-md text-xs font-medium transition-colors"
        >
          <X className="w-3 h-3" />
          Cancel
        </button>
        <span className="text-text-secondary text-[10px] ml-auto">
          {window.api?.platform === 'darwin' ? '⌘' : 'Ctrl'}+Enter to send · Esc to cancel
        </span>
      </div>
    </div>
  );
}
