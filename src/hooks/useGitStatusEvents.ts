import { useEffect } from 'react';
import { useGitStore } from '../stores/git-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type { GitStatusChangedPayload } from '../../shared/types';

/**
 * Listens for GIT_STATUS_CHANGED push events from the main process
 * and refreshes git status (and optionally branches) when the event
 * matches the current project.
 *
 * This is the single driver for post-mutation refreshes — store actions
 * do not call refreshStatus()/refreshBranches() directly after IPC
 * mutations. This ensures uniform refresh across all windows and avoids
 * double-refresh on the initiating window.
 */
export function useGitStatusEvents() {
  const currentProjectPath = useGitStore(s => s.currentProjectPath);
  const refreshStatus = useGitStore(s => s.refreshStatus);
  const refreshBranches = useGitStore(s => s.refreshBranches);

  useEffect(() => {
    const unsub = on(IPC.GIT_STATUS_CHANGED, (...args: unknown[]) => {
      const payload = args[0] as GitStatusChangedPayload | undefined;
      // Refresh if the event is for our project or is a global notification
      if (!payload?.projectPath || payload.projectPath === currentProjectPath) {
        refreshStatus();
        if (payload?.branchChanged) {
          refreshBranches();
        }
      }
    });
    return unsub;
  }, [currentProjectPath, refreshStatus, refreshBranches]);
}
