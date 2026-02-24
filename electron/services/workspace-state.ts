import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { PILOT_APP_DIR, PILOT_WORKSPACE_FILE } from './pilot-paths';
import type { SavedTabState, SavedUIState, WorkspaceState } from '../../shared/types';

export class WorkspaceStateService {
  async save(state: WorkspaceState): Promise<void> {
    try {
      await mkdir(PILOT_APP_DIR, { recursive: true });
      await writeFile(PILOT_WORKSPACE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[workspace-state] failed to save:', e);
    }
  }

  async load(): Promise<WorkspaceState | null> {
    try {
      const data = await readFile(PILOT_WORKSPACE_FILE, 'utf-8');
      return JSON.parse(data) as WorkspaceState;
    } catch {
      /* Expected: workspace.json may not exist on first launch */
      return null;
    }
  }
}
