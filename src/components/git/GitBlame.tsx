import { X } from 'lucide-react';
import { useGitStore } from '../../stores/git-store';

export default function GitBlame() {
  const { blameLines, blameFilePath, clearBlame, isLoading } = useGitStore();

  if (!blameFilePath) return null;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Group consecutive lines by commit for visual grouping
  const getCommitColor = (hash: string, index: number) => {
    const prevHash = index > 0 ? blameLines[index - 1]?.commitHash : null;
    if (hash !== prevHash) {
      // Alternate between two backgrounds
      const uniqueCommits = new Set(blameLines.slice(0, index + 1).map(l => l.commitHash));
      return uniqueCommits.size % 2 === 0 ? 'bg-bg-base' : 'bg-bg-surface';
    }
    return index > 0 ? getCommitColor(blameLines[index - 1].commitHash, index - 1) : 'bg-bg-base';
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary truncate">
            Blame: {blameFilePath}
          </span>
          <button
            onClick={clearBlame}
            className="p-1 hover:bg-bg-surface rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-secondary">Loading blame...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary truncate" title={blameFilePath}>
          Blame: {blameFilePath}
        </span>
        <button
          onClick={clearBlame}
          className="p-1 hover:bg-bg-surface rounded transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {/* Blame content */}
      <div className="flex-1 overflow-auto">
        <div className="flex font-mono text-sm">
          {/* Blame info column */}
          <div className="w-[200px] flex-shrink-0 border-r border-border">
            {blameLines.map((line, idx) => {
              const bgColor = getCommitColor(line.commitHash, idx);
              const showCommitInfo = idx === 0 || blameLines[idx - 1].commitHash !== line.commitHash;
              
              return (
                <div
                  key={idx}
                  className={`px-2 py-0.5 text-xs text-text-secondary border-b border-border/30 ${bgColor}`}
                  style={{ minHeight: '1.5rem' }}
                >
                  {showCommitInfo ? (
                    <div className="truncate" title={`${line.commitHash.substring(0, 8)} - ${line.author} - ${formatDate(line.date)}`}>
                      <span className="text-accent">{line.commitHash.substring(0, 8)}</span>
                      {' | '}
                      <span>{line.author}</span>
                      {' | '}
                      <span>{formatDate(line.date)}</span>
                    </div>
                  ) : (
                    <div>&nbsp;</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* File content column */}
          <div className="flex-1">
            {blameLines.map((line, idx) => (
              <div
                key={idx}
                className={`flex ${getCommitColor(line.commitHash, idx)} border-b border-border/30`}
                style={{ minHeight: '1.5rem' }}
              >
                {/* Line number */}
                <div className="px-2 py-0.5 text-xs text-text-secondary/50 w-12 text-right border-r border-border/30 flex-shrink-0">
                  {line.lineNumber}
                </div>
                {/* Code */}
                <pre className="px-2 py-0.5 text-sm text-text-primary overflow-x-auto">
                  {line.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
