import { useEffect } from 'react';
import { useGitStore } from '../stores/git-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';

/**
 * Listens for GIT_STATUS_CHANGED push events from the main process
 * and refreshes git status + branches when the event matches the
 * current project.
 *
 * This ensures that status changes triggered by other windows,
 * companion clients, or background operations are reflected in
 * every renderer.
 */
export function useGitStatusEvents() {
  const currentProjectPath = useGitStore(s => s.currentProjectPath);
  const refreshStatus = useGitStore(s => s.refreshStatus);
  const refreshBranches = useGitStore(s => s.refreshBranches);

  useEffect(() => {
    const unsub = on(IPC.GIT_STATUS_CHANGED, (...args: unknown[]) => {
      const payload = args[0] as { projectPath?: string } | undefined;
      // Refresh if the event is for our project or is a global notification
      if (!payload?.projectPath || payload.projectPath === currentProjectPath) {
        refreshStatus();
        refreshBranches();
      }
    });
    return unsub;
  }, [currentProjectPath, refreshStatus, refreshBranches]);
}
