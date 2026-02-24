import { useEffect } from 'react';
import { useSandboxStore } from '../stores/sandbox-store';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import type { SandboxDiffPayload } from '../../shared/types';

/**
 * Listens for sandbox diff staging events from the main process.
 * 
 * When the agent attempts a file operation (create, edit, delete), the sandboxed
 * tools system stages the diff for review (unless yolo mode is enabled). This hook
 * listens for those staged diff events and adds them to the sandbox store, where
 * they can be accepted or rejected by the user.
 * 
 * Should be mounted once at the app root level.
 */
export function useSandboxEvents() {
  const addDiff = useSandboxStore((s) => s.addDiff);

  useEffect(() => {
    // Listen for staged diff events from main process
    // Main sends { tabId, diff } — destructure the wrapper
    const unsub = on(IPC.SANDBOX_STAGED_DIFF, (payload: SandboxDiffPayload) => {
      const { tabId, diff } = payload;
      addDiff(tabId, diff);
    });

    return unsub;
  }, [addDiff]);
}
