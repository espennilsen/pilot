/**
 * List of conflicted files during a merge/rebase/cherry-pick/revert.
 * Each file shows its path, conflict count, and resolution actions:
 *   - Ask Agent: pre-fills a resolution prompt in the chat input
 *   - Keep Ours: checkout --ours + git add
 *   - Keep Theirs: checkout --theirs + git add
 *   - Mark Resolved: git add (user resolved manually)
 */
import { useState } from 'react';
import { FileWarning, ChevronDown, Bot, User, Users, CheckCircle } from 'lucide-react';
import { useGitStore } from '../../stores/git-store';
import type { ConflictFile } from '../../../shared/types';

interface GitConflictsListProps {
  onAskAgent: (file: ConflictFile) => void;
}

export default function GitConflictsList({ onAskAgent }: GitConflictsListProps) {
  const { conflictedFiles, resolveConflictWithStrategy, isConflictLoading } = useGitStore();
  const [openMenuPath, setOpenMenuPath] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  if (conflictedFiles.length === 0 && !isConflictLoading) {
    return null;
  }

  const handleResolve = async (file: ConflictFile, strategy: 'ours' | 'theirs' | 'mark-resolved') => {
    setResolving(file.path);
    try {
      await resolveConflictWithStrategy(file.path, strategy);
      setOpenMenuPath(null);
    } finally {
      setResolving(null);
    }
  };

  const handleAskAgent = (file: ConflictFile) => {
    setOpenMenuPath(null);
    onAskAgent(file);
  };

  return (
    <div className="border border-error/30 rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-error/10 flex items-center gap-2">
        <FileWarning className="w-4 h-4 text-error" />
        <span className="text-sm font-medium text-error">
          Conflicted Files
        </span>
        <span className="text-xs text-error/70">({conflictedFiles.length})</span>
      </div>

      <div className="bg-bg-base divide-y divide-border">
        {conflictedFiles.map((file) => (
          <div key={file.path} className="relative">
            {/* File row */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-bg-elevated transition-colors">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs font-mono font-semibold text-error w-4 text-center">!</span>
                <span className="text-sm text-text-primary truncate" title={file.path}>
                  {file.path}
                </span>
                {file.conflictCount > 0 && (
                  <span className="text-xs text-error/70 flex-shrink-0">
                    {file.conflictCount} region{file.conflictCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Resolve dropdown trigger */}
              <button
                onClick={() => setOpenMenuPath(openMenuPath === file.path ? null : file.path)}
                disabled={resolving === file.path}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded
                  bg-bg-surface hover:bg-bg-elevated text-text-secondary hover:text-text-primary
                  transition-colors disabled:opacity-40"
              >
                {resolving === file.path ? 'Resolving…' : 'Resolve'}
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Dropdown menu */}
            {openMenuPath === file.path && (
              <div className="absolute right-3 top-full z-10 mt-1 w-48 bg-bg-elevated border border-border rounded-md shadow-lg overflow-hidden">
                <button
                  onClick={() => handleAskAgent(file)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent/10 text-accent transition-colors"
                >
                  <Bot className="w-4 h-4" />
                  Ask Agent
                </button>
                <button
                  onClick={() => handleResolve(file, 'ours')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-bg-surface text-text-primary transition-colors"
                >
                  <User className="w-4 h-4 text-text-secondary" />
                  Keep Ours ({file.oursRef})
                </button>
                <button
                  onClick={() => handleResolve(file, 'theirs')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-bg-surface text-text-primary transition-colors"
                >
                  <Users className="w-4 h-4 text-text-secondary" />
                  Keep Theirs ({file.theirsRef})
                </button>
                <div className="border-t border-border" />
                <button
                  onClick={() => handleResolve(file, 'mark-resolved')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-bg-surface text-text-primary transition-colors"
                >
                  <CheckCircle className="w-4 h-4 text-success" />
                  Mark Resolved
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
