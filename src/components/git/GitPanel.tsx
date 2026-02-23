import { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, GitBranch, History, Archive } from 'lucide-react';
import { useGitStore } from '../../stores/git-store';
import { useProjectStore } from '../../stores/project-store';
import GitStatus from './GitStatus';
import GitBranches from './GitBranches';
import GitCommitInput from './GitCommitInput';
import GitCommitLog from './GitCommitLog';
import GitStash from './GitStash';

type GitView = 'status' | 'history' | 'stash';

export default function GitPanel() {
  const { projectPath } = useProjectStore();
  const { isAvailable, isRepo, initGit, initRepo, refreshStatus, refreshBranches, loadStashes, isLoading, error } = useGitStore();
  const [currentView, setCurrentView] = useState<GitView>('status');

  // Initialize git when project changes
  useEffect(() => {
    if (projectPath) {
      initGit(projectPath);
    }
  }, [projectPath, initGit]);

  const handleRefresh = () => {
    refreshStatus();
    refreshBranches();
    if (currentView === 'stash') {
      loadStashes();
    }
  };

  // If no project is selected
  if (!projectPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <GitBranch className="w-12 h-12 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          Open a project to view Git status
        </p>
        <button
          onClick={() => useProjectStore.getState().openProjectDialog()}
          className="px-4 py-2 bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors text-sm font-medium"
        >
          Open Project
        </button>
      </div>
    );
  }

  // If Git is not available
  if (!isAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <AlertCircle className="w-12 h-12 text-warning" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary mb-1">Git not found</p>
          <p className="text-xs text-text-secondary">
            Git is not available on your PATH
          </p>
        </div>
      </div>
    );
  }

  // If not a git repository
  if (!isRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <GitBranch className="w-12 h-12 text-text-secondary" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary mb-1">Not a git repository</p>
          <p className="text-xs text-text-secondary mb-3">
            This project is not initialized with Git
          </p>
          <button
            onClick={initRepo}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Initializing…' : 'Initialize Git Repository'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with refresh button */}
      <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Git</span>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1 hover:bg-bg-surface rounded transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-text-secondary ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-border bg-bg-surface">
        <button
          onClick={() => setCurrentView('status')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors ${
            currentView === 'status'
              ? 'text-accent border-b-2 border-accent bg-bg-elevated'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          Status
        </button>
        <button
          onClick={() => setCurrentView('history')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors ${
            currentView === 'history'
              ? 'text-accent border-b-2 border-accent bg-bg-elevated'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
        >
          <History className="w-4 h-4" />
          History
        </button>
        <button
          onClick={() => setCurrentView('stash')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm transition-colors ${
            currentView === 'stash'
              ? 'text-accent border-b-2 border-accent bg-bg-elevated'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
          }`}
        >
          <Archive className="w-4 h-4" />
          Stash
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 bg-error/10 border-b border-error/20 text-xs text-error">
          {error}
        </div>
      )}

      {/* Content - scrollable */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'status' && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            <GitStatus />
            <GitBranches />
            <GitCommitInput />
          </div>
        )}
        {currentView === 'history' && <GitCommitLog />}
        {currentView === 'stash' && <GitStash />}
      </div>
    </div>
  );
}
