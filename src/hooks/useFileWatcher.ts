import { useEffect } from 'react';
import { useProjectStore } from '../stores/project-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';

/**
 * Listens for filesystem change notifications from the main process
 * and refreshes the file tree automatically.
 */
export function useFileWatcher() {
  const loadFileTree = useProjectStore(s => s.loadFileTree);

  useEffect(() => {
    const unsub = on(IPC.PROJECT_FS_CHANGED, () => {
      loadFileTree();
    });
    return unsub;
  }, [loadFileTree]);
}
