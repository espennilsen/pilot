import { useEffect } from 'react';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import { useTabStore } from '../stores/tab-store';
import type { WebTabOpenPayload } from '../../shared/types';

/**
 * Listens for web tab open events from the main process (agent tool or other sources).
 */
export function useWebTabEvents() {
  useEffect(() => {
    const unsub = on(IPC.WEB_TAB_OPEN, (payload: WebTabOpenPayload) => {
      const { addWebTab } = useTabStore.getState();
      // Open in background so the agent's chat tab stays focused
      addWebTab(payload.url, payload.projectPath, payload.title, true);
    });

    return () => {
      unsub();
    };
  }, []);
}
