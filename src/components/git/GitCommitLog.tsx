import { useEffect, useState } from 'react';
import { Clock, User } from 'lucide-react';
import { useGitStore } from '../../stores/git-store';

export default function GitCommitLog() {
  const { commitLog, loadCommitLog, isLoading } = useGitStore();
  const [maxCount, setMaxCount] = useState(50);

  useEffect(() => {
    loadCommitLog({ maxCount });
  }, [loadCommitLog, maxCount]);

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years}y ago`;
    if (months > 0) return `${months}mo ago`;
    if (weeks > 0) return `${weeks}w ago`;
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  const getRefPills = (refs: string[]) => {
    if (refs.length === 0) return null;
    
    return refs.map((ref, idx) => {
      const isHead = ref.includes('HEAD');
      const isTag = ref.startsWith('tag: ');
      const isRemote = ref.includes('origin/') || ref.includes('upstream/');
      
      let bgColor = 'bg-accent/20 text-accent';
      if (isHead) bgColor = 'bg-success/20 text-success';
      else if (isTag) bgColor = 'bg-warning/20 text-warning';
      else if (isRemote) bgColor = 'bg-text-secondary/20 text-text-secondary';
      
      const displayRef = ref.replace('tag: ', '').replace('HEAD -> ', '');
      
      return (
        <span
          key={idx}
          className={`text-xs px-1.5 py-0.5 rounded ${bgColor} font-mono`}
        >
          {displayRef}
        </span>
      );
    });
  };

  const handleLoadMore = () => {
    setMaxCount((prev) => prev + 50);
  };

  if (commitLog.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <Clock className="w-12 h-12 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          No commits found
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border bg-bg-elevated">
        <span className="text-sm font-medium text-text-primary">Commit History</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {commitLog.map((commit, idx) => (
          <div
            key={commit.hash}
            className="px-2 py-1.5 hover:bg-bg-elevated border-b border-border/30 transition-colors"
          >
            <div className="flex items-start gap-2">
              {/* Graph dot */}
              <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-accent" />
                {idx < commitLog.length - 1 && (
                  <div className="w-0.5 h-full bg-border/50 mt-1" />
                )}
              </div>

              {/* Commit content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-1">
                  <span className="font-mono text-xs text-accent flex-shrink-0">
                    {commit.hashShort}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate" title={commit.message}>
                      {commit.message}
                    </p>
                  </div>
                </div>

                {commit.refs.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {getRefPills(commit.refs)}
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>{commit.author}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatRelativeTime(commit.date)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {commitLog.length >= maxCount && (
          <div className="p-3 text-center">
            <button
              onClick={handleLoadMore}
              disabled={isLoading}
              className="text-sm text-accent hover:text-accent/80 px-3 py-1.5 rounded hover:bg-bg-elevated disabled:opacity-50"
            >
              {isLoading ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
