/**
 * @file Hook to listen for Docker sandbox push events from main process.
 */
import { useEffect } from 'react';
import { IPC } from '../../shared/ipc';
import { useSandboxDockerStore } from '../stores/sandbox-docker-store';
import type { DockerSandboxState } from '../../shared/types';

/**
 * Listen for DOCKER_SANDBOX_EVENT push events and update the store.
 * Mount once in app.tsx.
 */
export function useSandboxDockerEvents() {
  useEffect(() => {
    const unsub = window.api.on(
      IPC.DOCKER_SANDBOX_EVENT,
      (payload: { projectPath: string } & Partial<DockerSandboxState>) => {
        useSandboxDockerStore.getState().handleEvent(payload);
      }
    );
    return unsub;
  }, []);
}
