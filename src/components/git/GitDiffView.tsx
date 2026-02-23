import { X } from 'lucide-react';
import { useGitStore } from '../../stores/git-store';

export default function GitDiffView() {
  const { diffContent, clearDiff, isLoading } = useGitStore();

  if (!diffContent) return null;

  const parseDiffLines = (diff: string) => {
    const lines = diff.split('\n');
    return lines.map((line, idx) => {
      let className = 'text-text-primary';
      let bgColor = '';
      
      if (line.startsWith('+++') || line.startsWith('---')) {
        className = 'text-text-secondary font-semibold';
        bgColor = 'bg-bg-surface';
      } else if (line.startsWith('@@')) {
        className = 'text-accent';
        bgColor = 'bg-accent/10';
      } else if (line.startsWith('+')) {
        className = 'text-success';
        bgColor = 'bg-success/10';
      } else if (line.startsWith('-')) {
        className = 'text-error';
        bgColor = 'bg-error/10';
      } else if (line.startsWith('diff --git')) {
        className = 'text-text-primary font-semibold';
        bgColor = 'bg-bg-elevated';
      } else if (line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
        className = 'text-text-secondary text-xs';
      }

      return (
        <div key={idx} className={`px-3 py-0.5 ${bgColor} ${className} font-mono text-sm`}>
          {line || ' '}
        </div>
      );
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">Diff</span>
          <button
            onClick={clearDiff}
            className="p-1 hover:bg-bg-surface rounded transition-colors"
            title="Close"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-text-secondary">Loading diff...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Diff</span>
        <button
          onClick={clearDiff}
          className="p-1 hover:bg-bg-surface rounded transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto bg-bg-base">
        {parseDiffLines(diffContent)}
      </div>
    </div>
  );
}
