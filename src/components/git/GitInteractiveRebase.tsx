/**
 * @file Interactive rebase editor component.
 *
 * Allows users to reorder commits via drag-and-drop and assign actions
 * (pick, reword, edit, squash, fixup, drop) before executing the rebase.
 */
import { useState, useCallback, useRef } from 'react';
import {
  GripVertical, Play, X, ChevronDown, AlertTriangle,
  ArrowUp, ArrowDown, MessageSquare,
} from 'lucide-react';
import { useGitStore } from '../../stores/git-store';
import type { RebaseTodoEntry, RebaseAction } from '../../../shared/types';

const REBASE_ACTIONS: { value: RebaseAction; label: string; shortLabel: string; description: string }[] = [
  { value: 'pick', label: 'Pick', shortLabel: 'pick', description: 'Use commit as-is' },
  { value: 'reword', label: 'Reword', shortLabel: 'reword', description: 'Edit commit message' },
  { value: 'edit', label: 'Edit', shortLabel: 'edit', description: 'Pause to amend commit' },
  { value: 'squash', label: 'Squash', shortLabel: 'squash', description: 'Meld into previous, keep message' },
  { value: 'fixup', label: 'Fixup', shortLabel: 'fixup', description: 'Meld into previous, discard message' },
  { value: 'drop', label: 'Drop', shortLabel: 'drop', description: 'Remove commit' },
];

function getActionColor(action: RebaseAction): string {
  switch (action) {
    case 'pick': return 'text-success';
    case 'reword': return 'text-accent';
    case 'edit': return 'text-warning';
    case 'squash': return 'text-info';
    case 'fixup': return 'text-info';
    case 'drop': return 'text-error';
  }
}

function getActionBgColor(action: RebaseAction): string {
  switch (action) {
    case 'pick': return 'bg-success/10';
    case 'reword': return 'bg-accent/10';
    case 'edit': return 'bg-warning/10';
    case 'squash': return 'bg-info/10';
    case 'fixup': return 'bg-info/10';
    case 'drop': return 'bg-error/10 opacity-60';
  }
}

interface EntryRowProps {
  entry: RebaseTodoEntry;
  index: number;
  totalCount: number;
  onActionChange: (index: number, action: RebaseAction) => void;
  onRewordMessage: (index: number, message: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragTarget: boolean;
}

function EntryRow({
  entry, index, totalCount,
  onActionChange, onRewordMessage, onMoveUp, onMoveDown,
  onDragStart, onDragOver, onDragEnd, isDragTarget,
}: EntryRowProps) {
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showRewordInput, setShowRewordInput] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleActionSelect = (action: RebaseAction) => {
    onActionChange(index, action);
    setShowActionMenu(false);
    if (action === 'reword') {
      setShowRewordInput(true);
    } else {
      setShowRewordInput(false);
    }
  };

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`group flex flex-col border-b border-border/30 transition-colors ${
        getActionBgColor(entry.action)
      } ${isDragTarget ? 'border-t-2 border-t-accent' : ''}`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Drag handle */}
        <div className="cursor-grab active:cursor-grabbing text-text-secondary hover:text-text-primary flex-shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Move up/down buttons */}
        <div className="flex flex-col flex-shrink-0">
          <button
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            className="p-0.5 hover:bg-bg-elevated rounded disabled:opacity-20 text-text-secondary hover:text-text-primary"
            title="Move up"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={() => onMoveDown(index)}
            disabled={index === totalCount - 1}
            className="p-0.5 hover:bg-bg-elevated rounded disabled:opacity-20 text-text-secondary hover:text-text-primary"
            title="Move down"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>

        {/* Action selector */}
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setShowActionMenu(!showActionMenu)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium ${getActionColor(entry.action)} hover:bg-bg-elevated transition-colors`}
          >
            {entry.action}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showActionMenu && (
            <div className="absolute top-full left-0 z-50 mt-1 bg-bg-elevated border border-border rounded-md shadow-lg py-1 min-w-[180px]">
              {REBASE_ACTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleActionSelect(opt.value)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-bg-surface flex items-center gap-2 ${
                    entry.action === opt.value ? 'bg-bg-surface' : ''
                  }`}
                >
                  <span className={`font-mono text-xs font-medium w-12 ${getActionColor(opt.value)}`}>
                    {opt.shortLabel}
                  </span>
                  <span className="text-text-secondary text-xs">{opt.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Commit hash */}
        <span className="font-mono text-xs text-accent flex-shrink-0">
          {entry.hashShort}
        </span>

        {/* Commit message */}
        <span className={`text-sm truncate flex-1 min-w-0 ${
          entry.action === 'drop' ? 'line-through text-text-secondary' : 'text-text-primary'
        }`} title={entry.message}>
          {entry.message}
        </span>

        {/* Reword button (if action is reword) */}
        {entry.action === 'reword' && (
          <button
            onClick={() => setShowRewordInput(!showRewordInput)}
            className="p-1 hover:bg-bg-elevated rounded text-accent flex-shrink-0"
            title="Edit new message"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Reword message input */}
      {entry.action === 'reword' && showRewordInput && (
        <div className="px-2 pb-2 pl-8">
          <input
            type="text"
            value={entry.newMessage ?? entry.message}
            onChange={(e) => onRewordMessage(index, e.target.value)}
            placeholder="New commit message..."
            className="w-full px-2 py-1 text-sm bg-bg-base border border-border rounded focus:border-accent focus:outline-none text-text-primary"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

export default function GitInteractiveRebase() {
  const {
    interactiveRebaseEntries,
    interactiveRebaseOnto,
    updateInteractiveRebaseEntries,
    executeInteractiveRebase,
    cancelInteractiveRebase,
    isLoading,
  } = useGitStore();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);

  const entries = interactiveRebaseEntries;

  const handleActionChange = useCallback((index: number, action: RebaseAction) => {
    const updated = entries.map((e, i) => i === index ? { ...e, action } : e);
    updateInteractiveRebaseEntries(updated);
  }, [entries, updateInteractiveRebaseEntries]);

  const handleRewordMessage = useCallback((index: number, message: string) => {
    const updated = entries.map((e, i) => i === index ? { ...e, newMessage: message } : e);
    updateInteractiveRebaseEntries(updated);
  }, [entries, updateInteractiveRebaseEntries]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const updated = [...entries];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    updateInteractiveRebaseEntries(updated);
  }, [entries, updateInteractiveRebaseEntries]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= entries.length - 1) return;
    const updated = [...entries];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updateInteractiveRebaseEntries(updated);
  }, [entries, updateInteractiveRebaseEntries]);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const updated = [...entries];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(dragOverIndex, 0, moved);
      updateInteractiveRebaseEntries(updated);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex, entries, updateInteractiveRebaseEntries]);

  const handleExecute = useCallback(async () => {
    if (!confirmExecute) {
      setConfirmExecute(true);
      return;
    }
    setConfirmExecute(false);
    await executeInteractiveRebase();
  }, [confirmExecute, executeInteractiveRebase]);

  const handleCancel = useCallback(() => {
    cancelInteractiveRebase();
  }, [cancelInteractiveRebase]);

  // Summary stats
  const pickCount = entries.filter(e => e.action === 'pick').length;
  const rewordCount = entries.filter(e => e.action === 'reword').length;
  const squashCount = entries.filter(e => e.action === 'squash' || e.action === 'fixup').length;
  const dropCount = entries.filter(e => e.action === 'drop').length;
  const editCount = entries.filter(e => e.action === 'edit').length;

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">Interactive Rebase</span>
          <span className="text-xs text-text-secondary font-mono">
            onto {interactiveRebaseOnto}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCancel}
            className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-3 py-1.5 border-b border-border bg-bg-surface flex items-center gap-3 text-xs text-text-secondary flex-wrap">
        <span>{entries.length} commit{entries.length !== 1 ? 's' : ''}</span>
        {pickCount > 0 && <span className="text-success">{pickCount} pick</span>}
        {rewordCount > 0 && <span className="text-accent">{rewordCount} reword</span>}
        {editCount > 0 && <span className="text-warning">{editCount} edit</span>}
        {squashCount > 0 && <span className="text-info">{squashCount} squash/fixup</span>}
        {dropCount > 0 && <span className="text-error">{dropCount} drop</span>}
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {entries.map((entry, idx) => (
          <EntryRow
            key={entry.hash}
            entry={entry}
            index={idx}
            totalCount={entries.length}
            onActionChange={handleActionChange}
            onRewordMessage={handleRewordMessage}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            isDragTarget={dragOverIndex === idx && dragIndex !== idx}
          />
        ))}
      </div>

      {/* Warning for edit action */}
      {editCount > 0 && (
        <div className="px-3 py-2 bg-warning/10 border-t border-warning/20 flex items-center gap-2 text-xs text-warning">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            {editCount} commit{editCount !== 1 ? 's' : ''} marked for edit — rebase will pause at {editCount !== 1 ? 'each' : 'that'} commit for you to amend.
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-3 py-2 border-t border-border bg-bg-elevated flex items-center justify-between">
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleExecute}
          disabled={isLoading}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded transition-colors disabled:opacity-50 ${
            confirmExecute
              ? 'bg-warning text-bg-base hover:bg-warning/90'
              : 'bg-accent text-bg-base hover:bg-accent/90'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          {isLoading ? 'Rebasing…' : confirmExecute ? 'Confirm Rebase' : 'Start Rebase'}
        </button>
      </div>
    </div>
  );
}
