/**
 * Banner shown at the top of the git panel when a merge/rebase/cherry-pick/revert
 * is in progress with conflicts. Shows operation type, progress, and action buttons.
 */
import { AlertTriangle, XCircle, Play, SkipForward } from 'lucide-react';
import { useState } from 'react';
import { useGitStore } from '../../stores/git-store';
import type { GitOperationState } from '../../../shared/types';

function operationLabel(op: GitOperationState): string {
  switch (op.type) {
    case 'merge': return `Merge of ${op.incoming}`;
    case 'rebase':
      if (op.step != null && op.totalSteps != null) {
        return `Rebase onto ${op.incoming} (${op.step}/${op.totalSteps})`;
      }
      return `Rebase onto ${op.incoming}`;
    case 'cherry-pick': return `Cherry-pick of ${op.currentCommit ?? op.incoming}`;
    case 'revert': return `Revert of ${op.currentCommit ?? op.incoming}`;
  }
}

export default function GitConflictBanner() {
  const { status, conflictedFiles, abortOperation, continueOperation, skipCommit, isLoading } = useGitStore();
  const [confirmAbort, setConfirmAbort] = useState(false);

  const op = status?.operationInProgress;
  if (!op) return null;

  const unresolvedCount = conflictedFiles.length;
  const hasConflicts = status?.conflicted?.length ?? 0;
  const canContinue = unresolvedCount === 0 && hasConflicts === 0;

  const handleAbort = async () => {
    await abortOperation();
    setConfirmAbort(false);
  };

  const handleContinue = async () => {
    await continueOperation();
  };

  const handleSkip = async () => {
    await skipCommit();
  };

  return (
    <div className="border border-warning/30 rounded-md overflow-hidden">
      {/* Status */}
      <div className="px-3 py-2 bg-warning/10 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-warning">
            {operationLabel(op)} in progress
          </span>
          {unresolvedCount > 0 && (
            <span className="text-xs text-warning/80 ml-2">
              — {unresolvedCount} conflict{unresolvedCount !== 1 ? 's' : ''} remaining
            </span>
          )}
          {canContinue && (
            <span className="text-xs text-success ml-2">
              — all conflicts resolved
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-3 py-2 bg-bg-surface flex items-center gap-2 flex-wrap">
        {/* Continue */}
        <button
          onClick={handleContinue}
          disabled={!canContinue || isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            bg-success/20 text-success hover:bg-success/30"
          title={canContinue ? `Continue ${op.type}` : 'Resolve all conflicts first'}
        >
          <Play className="w-3.5 h-3.5" />
          Continue
        </button>

        {/* Skip (rebase only) */}
        {op.type === 'rebase' && (
          <button
            onClick={handleSkip}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
              bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-40"
            title="Skip this commit"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip
          </button>
        )}

        {/* Abort */}
        {!confirmAbort ? (
          <button
            onClick={() => setConfirmAbort(true)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors
              bg-error/20 text-error hover:bg-error/30 disabled:opacity-40"
          >
            <XCircle className="w-3.5 h-3.5" />
            Abort
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-error">Abort {op.type}?</span>
            <button
              onClick={handleAbort}
              disabled={isLoading}
              className="px-2 py-1 text-xs font-medium rounded bg-error text-white hover:bg-error/90 disabled:opacity-40"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmAbort(false)}
              className="px-2 py-1 text-xs font-medium rounded bg-bg-elevated text-text-secondary hover:bg-bg-base"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
