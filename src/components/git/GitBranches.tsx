import { useState } from 'react';
import { GitBranch as GitBranchIcon, Plus, Check, X } from 'lucide-react';
import { useGitStore } from '../../stores/git-store';

export default function GitBranches() {
  const { branches, checkout, createBranch, status } = useGitStore();
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const currentBranch = branches.find((b) => b.current);

  const handleCheckout = async (branchName: string) => {
    if (branchName !== currentBranch?.name) {
      await checkout(branchName);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    setIsCreating(true);
    try {
      await createBranch(newBranchName.trim());
      setNewBranchName('');
      setShowNewBranch(false);
    } catch (error) {
      console.error('Failed to create branch:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateBranch();
    } else if (e.key === 'Escape') {
      setShowNewBranch(false);
      setNewBranchName('');
    }
  };

  // Sort branches: current first, then by last commit date
  const sortedBranches = [...branches].sort((a, b) => {
    if (a.current) return -1;
    if (b.current) return 1;
    return b.lastCommitDate - a.lastCommitDate;
  });

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="w-4 h-4 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">Branches</span>
        </div>
        <button
          onClick={() => setShowNewBranch(!showNewBranch)}
          className="text-xs text-accent hover:text-accent/80 flex items-center gap-1 px-2 py-0.5 rounded hover:bg-bg-elevated"
          title="New branch"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      <div className="bg-bg-base max-h-64 overflow-y-auto">
        {/* Current branch prominently shown */}
        {currentBranch && (
          <div className="px-3 py-2 bg-accent/10 border-b border-border">
            <div className="flex items-center gap-2">
              <GitBranchIcon className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-accent">{currentBranch.name}</span>
              {(currentBranch.ahead > 0 || currentBranch.behind > 0) && (
                <span className="text-xs text-text-secondary">
                  {currentBranch.ahead > 0 && `↑${currentBranch.ahead}`}
                  {currentBranch.ahead > 0 && currentBranch.behind > 0 && ' '}
                  {currentBranch.behind > 0 && `↓${currentBranch.behind}`}
                </span>
              )}
            </div>
            {currentBranch.upstream && (
              <div className="text-xs text-text-secondary mt-1">
                tracking {currentBranch.upstream}
              </div>
            )}
          </div>
        )}

        {/* New branch input */}
        {showNewBranch && (
          <div className="px-3 py-2 bg-bg-elevated border-b border-border">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Branch name..."
                className="flex-1 bg-bg-base border border-border rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-accent"
                autoFocus
                disabled={isCreating}
              />
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || isCreating}
                className="p-1 hover:bg-bg-surface rounded disabled:opacity-50"
                title="Create"
              >
                <Check className="w-4 h-4 text-success" />
              </button>
              <button
                onClick={() => {
                  setShowNewBranch(false);
                  setNewBranchName('');
                }}
                className="p-1 hover:bg-bg-surface rounded"
                title="Cancel"
              >
                <X className="w-4 h-4 text-error" />
              </button>
            </div>
          </div>
        )}

        {/* Other branches */}
        {sortedBranches
          .filter((b) => !b.current)
          .map((branch) => (
            <button
              key={branch.name}
              onClick={() => handleCheckout(branch.name)}
              className="w-full px-3 py-2 hover:bg-bg-elevated transition-colors text-left border-b border-border last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-secondary truncate">{branch.name}</span>
                {(branch.ahead > 0 || branch.behind > 0) && (
                  <span className="text-xs text-text-secondary flex-shrink-0">
                    {branch.ahead > 0 && `↑${branch.ahead}`}
                    {branch.ahead > 0 && branch.behind > 0 && ' '}
                    {branch.behind > 0 && `↓${branch.behind}`}
                  </span>
                )}
              </div>
              {branch.lastCommitMessage && (
                <div className="text-xs text-text-secondary/70 truncate mt-0.5">
                  {branch.lastCommitMessage}
                </div>
              )}
            </button>
          ))}

        {branches.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-text-secondary">
            No branches found
          </div>
        )}
      </div>
    </div>
  );
}
