import { useEffect } from 'react';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import { useSubagentStore } from '../stores/subagent-store';
import type { SubagentEvent, SubagentPoolProgress, SubagentRecord } from '../../shared/types';

/**
 * Hook that listens for subagent events from the main process
 * and updates the subagent store.
 */
export function useSubagentEvents() {
  const { updateSubagent, setPoolProgress } = useSubagentStore();

  useEffect(() => {
    // Listen for individual subagent events
    const unsubEvent = on(
      IPC.SUBAGENT_EVENT,
      (data: unknown) => {
        const payload = data as SubagentEvent;
        const { parentTabId, subId, event } = payload;

        if (event.type === 'subagent_start') {
          updateSubagent(parentTabId, subId, {
            id: subId,
            parentTabId,
            poolId: null,
            status: 'running',
            role: (event.role as string) || 'Worker',
            prompt: '',
            result: null,
            error: null,
            modifiedFiles: [],
            createdAt: Date.now(),
            completedAt: null,
            tokenUsage: { input: 0, output: 0 },
          } as SubagentRecord);
        } else if (event.type === 'subagent_end') {
          const status = event.status as string;
          updateSubagent(parentTabId, subId, {
            status: status as SubagentRecord['status'],
            result: (event.result as string) || null,
            error: (event.error as string) || null,
            completedAt: Date.now(),
            tokenUsage: (event.tokenUsage as { input: number; output: number }) || { input: 0, output: 0 },
            modifiedFiles: (event.modifiedFiles as string[]) || [],
          });
        }
      }
    );

    // Listen for pool progress updates
    const unsubPool = on(
      IPC.SUBAGENT_POOL_PROGRESS,
      (data: unknown) => {
        const payload = data as SubagentPoolProgress;
        setPoolProgress(payload.parentTabId, payload.poolId, payload);
      }
    );

    return () => {
      unsubEvent();
      unsubPool();
    };
  }, [updateSubagent, setPoolProgress]);
}
