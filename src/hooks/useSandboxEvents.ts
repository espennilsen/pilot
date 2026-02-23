import { useEffect } from 'react';
import { useSandboxStore } from '../stores/sandbox-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type { StagedDiff } from '../../shared/types';

export function useSandboxEvents() {
  const addDiff = useSandboxStore((s) => s.addDiff);

  useEffect(() => {
    // Listen for staged diff events from main process
    // Main sends { tabId, diff } — destructure the wrapper
    const unsub = on(IPC.SANDBOX_STAGED_DIFF, (payload: any) => {
      const { tabId, diff } = payload as { tabId: string; diff: StagedDiff };
      addDiff(tabId, diff);
    });

    return unsub;
  }, [addDiff]);
}
