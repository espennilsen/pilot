/**
 * @file Interactive rebase editor component.
 *
 * Allows users to reorder commits via drag-and-drop and assign actions
 * (pick, reword, edit, squash, fixup, drop) before executing the rebase.
 * Squash/fixup commits are visually grouped with the target commit above,
 * and users can edit the combined commit message for squash groups.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  GripVertical, Play, X, ChevronDown, AlertTriangle,
  ArrowUp, ArrowDown, MessageSquare, Layers,
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

/** Identifies groups of commits that will be squashed together. */
interface SquashGroup {
  /** Index of the target commit (pick/reword/edit) that absorbs the squashes */
  targetIndex: number;
  /** Indices of all commits in the group (target + squash/fixup) */
  memberIndices: number[];
}

/** Compute squash groups from the entries list. */
function computeSquashGroups(entries: RebaseTodoEntry[]): SquashGroup[] {
  const groups: SquashGroup[] = [];
  let currentGroup: SquashGroup | null = null;

  for (let i = 0; i < entries.length; i++) {
    const action = entries[i].action;
    if (action === 'squash' || action === 'fixup') {
      if (currentGroup) {
        currentGroup.memberIndices.push(i);
      }
    } else {
      if (currentGroup && currentGroup.memberIndices.length > 1) {
        groups.push(currentGroup);
      }
      currentGroup = { targetIndex: i, memberIndices: [i] };
    }
  }
  if (currentGroup && currentGroup.memberIndices.length > 1) {
    groups.push(currentGroup);
  }
  return groups;
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
  isSquashMember: boolean;
  isSquashGroupEnd: boolean;
}

function EntryRow({
  entry, index, totalCount,
  onActionChange, onRewordMessage, onMoveUp, onMoveDown,
  onDragStart, onDragOver, onDragEnd, isDragTarget,
  isSquashMember, isSquashGroupEnd,
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

  // Close action dropdown on click outside
  useEffect(() => {
    if (!showActionMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowActionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showActionMenu]);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`group flex flex-col transition-colors ${
        getActionBgColor(entry.action)
      } ${isDragTarget ? 'border-t-2 border-t-accent' : ''} ${
        isSquashMember ? '' : 'border-b border-border/30'
      } ${isSquashGroupEnd ? 'border-b border-border/30' : ''}`}
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        {/* Squash group indicator */}
        {isSquashMember ? (
          <div className="flex flex-col items-center flex-shrink-0 w-3.5">
            <div className="w-px h-full bg-info/40" />
          </div>
        ) : (
          <div className="cursor-grab active:cursor-grabbing text-text-secondary hover:text-text-primary flex-shrink-0">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
        )}

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

        {/* Reword button */}
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

/** Editable combined message panel for a squash group. */
function SquashGroupMessage({
  group,
  entries,
  onSquashMessageChange,
}: {
  group: SquashGroup;
  entries: RebaseTodoEntry[];
  onSquashMessageChange: (targetIndex: number, message: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const targetEntry = entries[group.targetIndex];

  // Build default combined message from all group members
  const defaultMessage = group.memberIndices
    .filter(i => entries[i].action !== 'fixup')
    .map(i => entries[i].message)
    .join('\n\n');

  const currentMessage = targetEntry.squashMessage ?? defaultMessage;
  const hasSquash = group.memberIndices.some(i => entries[i].action === 'squash');
  const fixupCount = group.memberIndices.filter(i => entries[i].action === 'fixup').length;
  const squashMemberCount = group.memberIndices.length - 1;

  return (
    <div className="mx-2 mb-1 border border-info/20 rounded bg-info/5">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-info/10 rounded transition-colors"
      >
        <Layers className="w-3.5 h-3.5 text-info flex-shrink-0" />
        <span className="text-info font-medium">
          Squash group: {squashMemberCount} commit{squashMemberCount !== 1 ? 's' : ''} → {targetEntry.hashShort}
        </span>
        <span className="text-text-secondary ml-auto">
          {fixupCount > 0 && `${fixupCount} fixup `}
          {hasSquash && 'combined message'}
        </span>
        <ChevronDown className={`w-3 h-3 text-text-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="px-2 pb-2">
          {hasSquash ? (
            <>
              <label className="text-xs text-text-secondary mb-1 block">
                Combined commit message (squash merges all messages):
              </label>
              <textarea
                value={currentMessage}
                onChange={(e) => onSquashMessageChange(group.targetIndex, e.target.value)}
                rows={Math.min(group.memberIndices.length + 2, 8)}
                className="w-full px-2 py-1.5 text-sm bg-bg-base border border-border rounded focus:border-info focus:outline-none text-text-primary font-mono resize-y"
                placeholder="Combined commit message..."
              />
            </>
          ) : (
            <p className="text-xs text-text-secondary py-1">
              All members use <span className="font-mono text-info">fixup</span> — only the target commit&apos;s message will be kept.
            </p>
          )}
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
    updateSquashMessage,
    executeInteractiveRebase,
    cancelInteractiveRebase,
    isLoading,
  } = useGitStore();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [confirmExecute, setConfirmExecute] = useState(false);

  const entries = interactiveRebaseEntries;

  const squashGroups = useMemo(() => computeSquashGroups(entries), [entries]);

  const squashMembership = useMemo(() => {
    const membership = new Map<number, { isSquashMember: boolean; isGroupEnd: boolean; group: SquashGroup }>();
    for (const group of squashGroups) {
      for (let i = 0; i < group.memberIndices.length; i++) {
        const idx = group.memberIndices[i];
        membership.set(idx, {
          isSquashMember: idx !== group.targetIndex,
          isGroupEnd: i === group.memberIndices.length - 1,
          group,
        });
      }
    }
    return membership;
  }, [squashGroups]);

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

  const pickCount = entries.filter(e => e.action === 'pick').length;
  const rewordCount = entries.filter(e => e.action === 'reword').length;
  const squashCount = entries.filter(e => e.action === 'squash' || e.action === 'fixup').length;
  const dropCount = entries.filter(e => e.action === 'drop').length;
  const editCount = entries.filter(e => e.action === 'edit').length;
  const hasOrphanedSquash = entries.length > 0 && (entries[0].action === 'squash' || entries[0].action === 'fixup');

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
        <button
          onClick={handleCancel}
          className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-surface rounded transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Summary bar */}
      <div className="px-3 py-1.5 border-b border-border bg-bg-surface flex items-center gap-3 text-xs text-text-secondary flex-wrap">
        <span>{entries.length} commit{entries.length !== 1 ? 's' : ''}</span>
        {pickCount > 0 && <span className="text-success">{pickCount} pick</span>}
        {rewordCount > 0 && <span className="text-accent">{rewordCount} reword</span>}
        {editCount > 0 && <span className="text-warning">{editCount} edit</span>}
        {squashCount > 0 && <span className="text-info">{squashCount} squash/fixup</span>}
        {dropCount > 0 && <span className="text-error">{dropCount} drop</span>}
        {squashGroups.length > 0 && (
          <span className="text-info">
            <Layers className="w-3 h-3 inline mr-0.5" />
            {squashGroups.length} group{squashGroups.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Orphaned squash/fixup warning */}
      {hasOrphanedSquash && (
        <div className="px-3 py-2 bg-error/10 border-b border-error/20 flex items-center gap-2 text-xs text-error">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            First commit cannot be squash/fixup — there is no previous commit to squash into.
          </span>
        </div>
      )}

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {entries.map((entry, idx) => {
          const membership = squashMembership.get(idx);
          const isLastInGroup = membership?.isGroupEnd ?? false;
          const isSquashMember = membership?.isSquashMember ?? false;

          return (
            <div key={entry.hash}>
              <EntryRow
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
                isSquashMember={isSquashMember}
                isSquashGroupEnd={isLastInGroup}
              />
              {isLastInGroup && membership?.group && (
                <SquashGroupMessage
                  group={membership.group}
                  entries={entries}
                  onSquashMessageChange={updateSquashMessage}
                />
              )}
            </div>
          );
        })}
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
          disabled={isLoading || hasOrphanedSquash}
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
