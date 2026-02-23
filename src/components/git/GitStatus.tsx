import { useState } from 'react';
import { ChevronDown, ChevronRight, Minus, Plus, X } from 'lucide-react';
import type { GitFileChange } from '../../../shared/types';
import { useGitStore } from '../../stores/git-store';

export default function GitStatus() {
  const { status, stageFiles, unstageFiles } = useGitStore();
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [untrackedExpanded, setUntrackedExpanded] = useState(true);

  if (!status) return null;

  const handleStageAll = () => {
    const allPaths = [...status.unstaged.map(f => f.path), ...status.untracked];
    if (allPaths.length > 0) {
      stageFiles(allPaths);
    }
  };

  const handleUnstageAll = () => {
    if (status.staged.length > 0) {
      unstageFiles(status.staged.map(f => f.path));
    }
  };

  const getStatusBadge = (statusType: GitFileChange['status']) => {
    const badges = {
      modified: { label: 'M', color: 'text-warning' },
      added: { label: 'A', color: 'text-success' },
      deleted: { label: 'D', color: 'text-error' },
      renamed: { label: 'R', color: 'text-accent' },
      copied: { label: 'C', color: 'text-accent' },
    };
    const badge = badges[statusType];
    return (
      <span className={`text-xs font-mono font-semibold ${badge.color} w-4 text-center`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Staged Changes */}
      {status.staged.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setStagedExpanded(!stagedExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-success/10 hover:bg-success/20 transition-colors text-sm font-medium"
          >
            <div className="flex items-center gap-2">
              {stagedExpanded ? (
                <ChevronDown className="w-4 h-4 text-success" />
              ) : (
                <ChevronRight className="w-4 h-4 text-success" />
              )}
              <span className="text-success">Staged Changes</span>
              <span className="text-xs text-text-secondary">({status.staged.length})</span>
            </div>
            {stagedExpanded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnstageAll();
                }}
                className="text-xs text-success hover:text-success/80 px-2 py-0.5 rounded hover:bg-success/10"
              >
                Unstage All
              </button>
            )}
          </button>
          {stagedExpanded && (
            <div className="bg-bg-base">
              {status.staged.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-bg-elevated group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getStatusBadge(file.status)}
                    <span className="text-sm text-text-primary truncate" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                  <button
                    onClick={() => unstageFiles([file.path])}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-bg-surface rounded"
                    title="Unstage"
                  >
                    <Minus className="w-3.5 h-3.5 text-warning" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unstaged Changes */}
      {status.unstaged.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setChangesExpanded(!changesExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-warning/10 hover:bg-warning/20 transition-colors text-sm font-medium"
          >
            <div className="flex items-center gap-2">
              {changesExpanded ? (
                <ChevronDown className="w-4 h-4 text-warning" />
              ) : (
                <ChevronRight className="w-4 h-4 text-warning" />
              )}
              <span className="text-warning">Changes</span>
              <span className="text-xs text-text-secondary">({status.unstaged.length})</span>
            </div>
            {changesExpanded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  stageFiles(status.unstaged.map(f => f.path));
                }}
                className="text-xs text-warning hover:text-warning/80 px-2 py-0.5 rounded hover:bg-warning/10"
              >
                Stage All
              </button>
            )}
          </button>
          {changesExpanded && (
            <div className="bg-bg-base">
              {status.unstaged.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-bg-elevated group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getStatusBadge(file.status)}
                    <span className="text-sm text-text-primary truncate" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                  <button
                    onClick={() => stageFiles([file.path])}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-bg-surface rounded"
                    title="Stage"
                  >
                    <Plus className="w-3.5 h-3.5 text-success" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Untracked Files */}
      {status.untracked.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setUntrackedExpanded(!untrackedExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 bg-bg-surface hover:bg-bg-elevated transition-colors text-sm font-medium"
          >
            <div className="flex items-center gap-2">
              {untrackedExpanded ? (
                <ChevronDown className="w-4 h-4 text-text-secondary" />
              ) : (
                <ChevronRight className="w-4 h-4 text-text-secondary" />
              )}
              <span className="text-text-secondary">Untracked Files</span>
              <span className="text-xs text-text-secondary">({status.untracked.length})</span>
            </div>
            {untrackedExpanded && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  stageFiles(status.untracked);
                }}
                className="text-xs text-text-secondary hover:text-text-primary px-2 py-0.5 rounded hover:bg-bg-surface"
              >
                Stage All
              </button>
            )}
          </button>
          {untrackedExpanded && (
            <div className="bg-bg-base">
              {status.untracked.map((path) => (
                <div
                  key={path}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-bg-elevated group"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-mono font-semibold text-text-secondary w-4 text-center">
                      ?
                    </span>
                    <span className="text-sm text-text-primary truncate" title={path}>
                      {path}
                    </span>
                  </div>
                  <button
                    onClick={() => stageFiles([path])}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-bg-surface rounded"
                    title="Stage"
                  >
                    <Plus className="w-3.5 h-3.5 text-success" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clean state */}
      {status.isClean && (
        <div className="text-center py-6 text-sm text-text-secondary">
          Working tree clean
        </div>
      )}
    </div>
  );
}
