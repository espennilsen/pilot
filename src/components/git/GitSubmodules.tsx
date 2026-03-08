import { useEffect } from 'react';
import {
  Package, RefreshCw, Download, Trash2, Link, Play,
  AlertTriangle, CheckCircle, MinusCircle, AlertCircle,
} from 'lucide-react';
import { useGitStore } from '../../stores/git-store';
import type { GitSubmodule, SubmoduleStatusCode } from '../../../shared/types';

function statusIcon(status: SubmoduleStatusCode, dirty: boolean) {
  if (status === 'conflict') return <AlertCircle className="w-4 h-4 text-error" />;
  if (status === 'uninitialized') return <MinusCircle className="w-4 h-4 text-text-secondary" />;
  if (status === 'modified' || dirty) return <AlertTriangle className="w-4 h-4 text-warning" />;
  return <CheckCircle className="w-4 h-4 text-success" />;
}

function SubmoduleRow({ sub }: { sub: GitSubmodule }) {
  const { initSubmodule, deinitSubmodule, updateSubmodule, syncSubmodule, isSubmoduleLoading } = useGitStore();

  return (
    <div className="px-3 py-2.5 border-b border-border hover:bg-bg-elevated transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {statusIcon(sub.status, sub.dirty)}
            <span className="text-sm font-medium text-text-primary truncate" title={sub.path}>
              {sub.name}
            </span>
          </div>
          <div className="ml-6 space-y-0.5">
            <p className="text-xs text-text-secondary font-mono truncate" title={sub.path}>
              {sub.path}
            </p>
            <p className="text-xs text-text-secondary truncate" title={sub.url}>
              {sub.url}
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className={`${
                sub.status === 'conflict' ? 'text-error' :
                sub.status === 'uninitialized' ? 'text-text-secondary' :
                sub.status === 'modified' || sub.dirty ? 'text-warning' :
                'text-success'
              }`}>
                {sub.statusLabel}
              </span>
              {sub.branch && (
                <span className="text-text-secondary">
                  → {sub.branch}
                </span>
              )}
              {sub.currentCommit && (
                <span className="font-mono text-text-secondary">
                  {sub.currentCommit.substring(0, 7)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {sub.status === 'uninitialized' ? (
            <button
              onClick={() => initSubmodule(sub.path)}
              disabled={isSubmoduleLoading}
              className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:text-accent/80 hover:bg-bg-surface rounded disabled:opacity-50 transition-colors"
              title="Initialize submodule"
            >
              <Play className="w-3.5 h-3.5" />
              Init
            </button>
          ) : (
            <>
              <button
                onClick={() => updateSubmodule(sub.path)}
                disabled={isSubmoduleLoading}
                className="p-1 text-text-secondary hover:text-accent hover:bg-bg-surface rounded disabled:opacity-50 transition-colors"
                title="Update to recorded commit"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => syncSubmodule(sub.path)}
                disabled={isSubmoduleLoading}
                className="p-1 text-text-secondary hover:text-accent hover:bg-bg-surface rounded disabled:opacity-50 transition-colors"
                title="Sync remote URL"
              >
                <Link className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Deinitialize submodule "${sub.name}"? This removes its working tree and any uncommitted changes will be lost.`)) {
                    deinitSubmodule(sub.path);
                  }
                }}
                disabled={isSubmoduleLoading}
                className="p-1 text-text-secondary hover:text-error hover:bg-bg-surface rounded disabled:opacity-50 transition-colors"
                title="Deinitialize submodule"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GitSubmodules() {
  const { submodules, isSubmoduleLoading, loadSubmodules, initSubmodule, updateSubmodule } = useGitStore();

  useEffect(() => {
    loadSubmodules();
  }, [loadSubmodules]);

  if (submodules.length === 0 && !isSubmoduleLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-4">
        <Package className="w-12 h-12 text-text-secondary" />
        <p className="text-sm text-text-secondary text-center">
          No submodules
        </p>
        <p className="text-xs text-text-secondary text-center">
          This repository has no .gitmodules file
        </p>
      </div>
    );
  }

  const uninitializedCount = submodules.filter(s => s.status === 'uninitialized').length;
  const modifiedCount = submodules.filter(s => s.status === 'modified' || s.dirty).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border bg-bg-elevated flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary">
            Submodules
          </span>
          <span className="text-xs text-text-secondary">
            ({submodules.length})
          </span>
          {uninitializedCount > 0 && (
            <span className="text-xs text-warning" title={`${uninitializedCount} uninitialized`}>
              {uninitializedCount} uninitialized
            </span>
          )}
          {modifiedCount > 0 && (
            <span className="text-xs text-warning" title={`${modifiedCount} modified/dirty`}>
              {modifiedCount} modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {uninitializedCount > 0 && (
            <button
              onClick={() => initSubmodule()}
              disabled={isSubmoduleLoading}
              className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:text-accent/80 hover:bg-bg-surface rounded disabled:opacity-50 transition-colors"
              title="Initialize all submodules"
            >
              <Play className="w-3.5 h-3.5" />
              Init All
            </button>
          )}
          <button
            onClick={() => updateSubmodule(undefined, { recursive: true, init: true })}
            disabled={isSubmoduleLoading}
            className="flex items-center gap-1 px-2 py-1 text-xs text-accent hover:text-accent/80 hover:bg-bg-surface rounded disabled:opacity-50 transition-colors"
            title="Update all submodules (--init --recursive)"
          >
            <Download className="w-3.5 h-3.5" />
            Update All
          </button>
          <button
            onClick={() => loadSubmodules()}
            disabled={isSubmoduleLoading}
            className="p-1 hover:bg-bg-surface rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-text-secondary ${isSubmoduleLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {submodules.map((sub) => (
          <SubmoduleRow key={sub.path} sub={sub} />
        ))}
      </div>
    </div>
  );
}
