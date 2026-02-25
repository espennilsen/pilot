import { useEffect } from 'react';
import { on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';
import { useTabStore } from '../stores/tab-store';
import { useUIStore } from '../stores/ui-store';
import type { EditorOpenFilePayload, EditorOpenUrlPayload } from '../../shared/types';

/**
 * Listens for agent-triggered editor events:
 * - EDITOR_OPEN_FILE: opens a file in an editor tab with optional line highlighting
 * - EDITOR_OPEN_URL: prompts user before opening a URL in the browser
 */
export function useEditorEvents() {
  useEffect(() => {
    const unsubFile = on(IPC.EDITOR_OPEN_FILE, (payload: EditorOpenFilePayload) => {
      const { addFileTab } = useTabStore.getState();
      const tabId = addFileTab(payload.filePath, payload.projectPath);

      // Store highlight range for the FileEditor to pick up
      if (payload.startLine) {
        useUIStore.getState().setFileHighlight(tabId, {
          startLine: payload.startLine,
          endLine: payload.endLine ?? payload.startLine,
        });
      }
    });

    const unsubUrl = on(IPC.EDITOR_OPEN_URL, (payload: EditorOpenUrlPayload) => {
      useUIStore.getState().showUrlConfirmation(payload.url, payload.title);
    });

    return () => {
      unsubFile();
      unsubUrl();
    };
  }, []);
}
