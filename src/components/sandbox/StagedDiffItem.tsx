import { useState } from 'react';
import type { StagedDiff } from '../../../shared/types';
import { computeSimpleDiff, parseUnifiedDiff, formatDiffStats } from '../../lib/diff-utils';
import { useSandboxStore } from '../../stores/sandbox-store';

interface StagedDiffItemProps {
  diff: StagedDiff;
  tabId: string;
  defaultExpanded?: boolean;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const secs = d.getSeconds().toString().padStart(2, '0');
  const time = `${hours}:${mins}:${secs}`;

  // If it's today, just show time
  if (d.toDateString() === now.toDateString()) return time;

  // Otherwise show date + time
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${month}/${day} ${time}`;
}

/**
 * Detect if proposedContent is JSON edit params (legacy format)
 * and extract oldText/newText for a proper diff display.
 */
function resolveEditDiff(diff: StagedDiff) {
  if (diff.operation !== 'edit') {
    return { oldContent: diff.originalContent, newContent: diff.proposedContent };
  }

  // Try to detect JSON edit params in proposedContent
  try {
    const parsed = JSON.parse(diff.proposedContent);
    if (parsed && typeof parsed.oldText === 'string' && typeof parsed.newText === 'string') {
      // Legacy format: proposedContent is JSON.stringify(params)
      // Use originalContent (actual file) and apply the edit to get newContent
      const original = diff.originalContent ?? '';
      if (original.includes(parsed.oldText)) {
        return { oldContent: original, newContent: original.replace(parsed.oldText, parsed.newText) };
      }
      // If original doesn't contain oldText (maybe also corrupted), just show the edit fragment
      return { oldContent: parsed.oldText, newContent: parsed.newText };
    }
  } catch {
    // Not JSON — proposedContent is actual file content (new format), use as-is
  }

  return { oldContent: diff.originalContent, newContent: diff.proposedContent };
}

export function StagedDiffItem({ diff, tabId, defaultExpanded = true }: StagedDiffItemProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { acceptDiff, rejectDiff } = useSandboxStore();

  const isBash = diff.operation === 'bash';
  const { oldContent, newContent } = resolveEditDiff(diff);
  const diffLines = isBash
    ? []
    : diff.unifiedDiff
      ? parseUnifiedDiff(diff.unifiedDiff)
      : computeSimpleDiff(oldContent, newContent);
  const stats = isBash ? { added: 0, removed: 0 } : formatDiffStats(diffLines);

  const operationIcon = {
    edit: '✏️',
    create: '➕',
    delete: '🗑️',
    bash: '⚙️',
  }[diff.operation];

  const statusColor = {
    pending: 'text-warning',
    accepted: 'text-success',
    rejected: 'text-error',
  }[diff.status];

  const statusBg = {
    pending: 'bg-warning/10',
    accepted: 'bg-success/10',
    rejected: 'bg-error/10',
  }[diff.status];

  const handleAccept = async () => {
    await acceptDiff(tabId, diff.id);
  };

  const handleReject = async () => {
    await rejectDiff(tabId, diff.id);
  };

  const label = isBash ? diff.proposedContent : diff.filePath;

  return (
    <div className="border border-border rounded-md overflow-hidden bg-bg-surface">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-bg-elevated border-b border-border cursor-pointer hover:bg-bg-base/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base flex-shrink-0">{operationIcon}</span>
          <span className="font-mono text-sm text-text-primary truncate">{label}</span>
          {diff.status !== 'pending' && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusBg} ${statusColor} font-medium flex-shrink-0`}>
              {diff.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] text-text-secondary/50 tabular-nums">{formatTimestamp(diff.createdAt)}</span>
          {!isBash && (stats.added > 0 || stats.removed > 0) && (
            <span className="text-xs text-text-secondary">
              {stats.added > 0 && <span className="text-success">+{stats.added}</span>}
              {stats.added > 0 && stats.removed > 0 && ' / '}
              {stats.removed > 0 && <span className="text-error">-{stats.removed}</span>}
            </span>
          )}
          <span className="text-text-secondary text-sm">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {/* Diff Content */}
      {expanded && (
        <div className="p-3 space-y-3">
          {/* Bash command or Diff Lines */}
          {isBash ? (
            <div className="font-mono text-sm bg-bg-base border border-border rounded p-3 overflow-x-auto">
              <span className="text-text-secondary select-none mr-2">$</span>
              <span className="text-text-primary whitespace-pre-wrap">{diff.proposedContent}</span>
            </div>
          ) : (
            <div className="font-mono text-sm bg-bg-base border border-border rounded overflow-x-auto max-h-96 overflow-y-auto">
              {diffLines.map((line, index) => {
                const bgColor =
                  line.type === 'added'
                    ? 'bg-success/10'
                    : line.type === 'removed'
                    ? 'bg-error/10'
                    : '';

                const textColor =
                  line.type === 'added'
                    ? 'text-success'
                    : line.type === 'removed'
                    ? 'text-error'
                    : 'text-text-primary';

                const prefix =
                  line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

                return (
                  <div key={index} className={`flex ${bgColor}`}>
                    <span className="px-2 py-0.5 text-text-secondary select-none w-12 text-right flex-shrink-0">
                      {line.oldLineNumber || line.newLineNumber || ''}
                    </span>
                    <span className={`px-2 py-0.5 ${textColor} flex-1 whitespace-pre`}>
                      {prefix} {line.content}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Bar */}
          {diff.status === 'pending' && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleAccept}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-success/20 hover:bg-success/30 text-success rounded-md transition-colors font-medium text-sm"
              >
                <span>✓</span>
                <span>Accept</span>
              </button>
              <button
                onClick={handleReject}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-error/20 hover:bg-error/30 text-error rounded-md transition-colors font-medium text-sm"
              >
                <span>✕</span>
                <span>Reject</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
