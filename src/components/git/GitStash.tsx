import { useEffect } from 'react';
import { Archive, Play } from 'lucide-react';
import { useGitStore } from '../../stores/git-store';

export default function GitStash() {
  const { stashes, loadStashes, applyStash, isLoading } = useGitStore();

  useEffect(() => {
    loadStashes();
  }, [loadStashes]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return 'Today';
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const handleApplyStash = async (stashId: string) => {
    await applyStash(stashId);
  };

  if (stashes.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <Archive className="w-12 h-12 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          No stashes
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border bg-bg-elevated">
        <span className="text-sm font-medium text-text-primary">Stash List</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {stashes.map((stash) => (
          <div
            key={stash.index}
            className="px-3 py-2 border-b border-border hover:bg-bg-elevated transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-accent">
                    stash@{'{' + stash.index + '}'}
                  </span>
                  <span className="text-xs text-text-secondary">
                    on {stash.branch}
                  </span>
                </div>
                <p className="text-sm text-text-primary truncate" title={stash.message}>
                  {stash.message}
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  {formatDate(stash.date)}
                </p>
              </div>

              <button
                onClick={() => handleApplyStash(`stash@{${stash.index}}`)}
                disabled={isLoading}
                className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:text-accent/80 hover:bg-bg-surface rounded disabled:opacity-50 transition-colors"
                title="Apply stash"
              >
                <Play className="w-3.5 h-3.5" />
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
