import { useEffect } from 'react';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import { useSubagentStore } from '../stores/subagent-store';
import type { SubagentEvent, SubagentPoolProgress, SubagentRecord } from '../../shared/types';

/**
 * Type guard for SubagentEvent payload.
 */
function isSubagentEvent(data: unknown): data is SubagentEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'parentTabId' in data &&
    'subId' in data &&
    'event' in data &&
    typeof (data as SubagentEvent).parentTabId === 'string' &&
    typeof (data as SubagentEvent).subId === 'string' &&
    typeof (data as SubagentEvent).event === 'object' &&
    (data as SubagentEvent).event !== null &&
    'type' in (data as SubagentEvent).event
  );
}

/**
 * Type guard for SubagentPoolProgress payload.
 */
function isSubagentPoolProgress(data: unknown): data is SubagentPoolProgress {
  return (
    typeof data === 'object' &&
    data !== null &&
    'parentTabId' in data &&
    'poolId' in data &&
    'completed' in data &&
    'total' in data &&
    'failures' in data &&
    typeof (data as SubagentPoolProgress).parentTabId === 'string' &&
    typeof (data as SubagentPoolProgress).poolId === 'string' &&
    typeof (data as SubagentPoolProgress).completed === 'number' &&
    typeof (data as SubagentPoolProgress).total === 'number' &&
    typeof (data as SubagentPoolProgress).failures === 'number'
  );
}

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
        if (!isSubagentEvent(data)) {
          console.warn('[useSubagentEvents] Invalid SubagentEvent payload:', data);
          return;
        }

        const { parentTabId, subId, event } = data;

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
        if (!isSubagentPoolProgress(data)) {
          console.warn('[useSubagentEvents] Invalid SubagentPoolProgress payload:', data);
          return;
        }

        setPoolProgress(data.parentTabId, data.poolId, data);
      }
    );

    return () => {
      unsubEvent();
      unsubPool();
    };
  }, [updateSubagent, setPoolProgress]);
}
