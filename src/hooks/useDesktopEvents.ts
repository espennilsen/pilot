/**
 * @file Hook to listen for Desktop push events from main process.
 */
import { useEffect } from 'react';
import { IPC } from '../../shared/ipc';
import { useDesktopStore } from '../stores/desktop-store';
import type { DesktopState } from '../../shared/types';

/**
 * Listen for DESKTOP_EVENT push events and update the store.
 * Mount once in app.tsx.
 */
export function useDesktopEvents() {
  useEffect(() => {
    const unsub = window.api.on(
      IPC.DESKTOP_EVENT,
      (payload: { projectPath: string } & Partial<DesktopState>) => {
        useDesktopStore.getState().handleEvent(payload);
      }
    );
    return unsub;
  }, []);
}
