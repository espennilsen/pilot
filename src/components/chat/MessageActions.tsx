/**
 * MessageActions — Hover action bar for individual chat messages.
 *
 * Shows contextual actions (copy, regenerate, edit & resend) when hovering
 * over a message. Actions differ by message role:
 * - User messages: copy, edit & resend
 * - Assistant messages: copy, regenerate
 */

import { useState, useCallback } from 'react';
import { Copy, Check, RefreshCw, Pencil } from 'lucide-react';

interface MessageActionsProps {
  role: 'user' | 'assistant';
  content: string;
  messageIndex: number;
  isStreaming?: boolean;
  onRegenerate?: (messageIndex: number) => void;
  onEditAndResend?: (messageIndex: number, content: string) => void;
}

export default function MessageActions({
  role,
  content,
  messageIndex,
  isStreaming,
  onRegenerate,
  onEditAndResend,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  const handleRegenerate = useCallback(() => {
    onRegenerate?.(messageIndex);
  }, [messageIndex, onRegenerate]);

  const handleEdit = useCallback(() => {
    onEditAndResend?.(messageIndex, content);
  }, [messageIndex, content, onEditAndResend]);

  // Don't show actions while streaming
  if (isStreaming) return null;

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {/* Copy */}
      <ActionButton
        icon={copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
        label={copied ? 'Copied!' : 'Copy'}
        onClick={handleCopy}
      />

      {/* Role-specific actions */}
      {role === 'assistant' && onRegenerate && (
        <ActionButton
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          label="Regenerate"
          onClick={handleRegenerate}
        />
      )}

      {role === 'user' && onEditAndResend && (
        <ActionButton
          icon={<Pencil className="w-3.5 h-3.5" />}
          label="Edit &amp; resend"
          onClick={handleEdit}
        />
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded hover:bg-bg-elevated transition-colors text-text-secondary hover:text-text-primary"
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}
