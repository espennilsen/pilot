import { ipcMain } from 'electron';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { IPC } from '../../shared/ipc';
import type { PilotSessionManager } from '../services/pi-session-manager';
import { loadProjectSettings } from '../services/project-settings';
import { resolveBashApproval } from '../services/sandboxed-tools';

function applyDiff(diff: { filePath: string; operation: string; proposedContent: string; originalContent?: string | null }) {
  if (diff.operation === 'bash') {
    // Bash diffs are handled via resolveBashApproval, not file writes
    return;
  }
  if (diff.operation === 'delete') {
    unlinkSync(diff.filePath);
    return;
  }

  let content = diff.proposedContent;

  // Handle legacy edit format where proposedContent is JSON.stringify(params)
  if (diff.operation === 'edit') {
    try {
      const parsed = JSON.parse(diff.proposedContent);
      if (parsed && typeof parsed.oldText === 'string' && typeof parsed.newText === 'string') {
        // Read current file content and apply the edit
        const filePath = parsed.path || diff.filePath;
        let current: string;
        try {
          current = readFileSync(filePath, 'utf-8');
        } catch {
          current = diff.originalContent ?? '';
        }
        if (current.includes(parsed.oldText)) {
          content = current.replace(parsed.oldText, parsed.newText);
        } else {
          throw new Error(`Edit target text not found in file: ${filePath}`);
        }
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        // Not JSON — proposedContent is the actual new file content (new format)
      } else {
        throw e;
      }
    }
  }

  mkdirSync(dirname(diff.filePath), { recursive: true });
  writeFileSync(diff.filePath, content, 'utf-8');
}

export function registerSandboxIpc(sessionManager: PilotSessionManager) {
  ipcMain.handle(IPC.SANDBOX_GET_SETTINGS, async (_event, projectPath: string) => {
    return loadProjectSettings(projectPath);
  });

  ipcMain.handle(IPC.SANDBOX_UPDATE_SETTINGS, async (_event, projectPath: string, overrides: Record<string, unknown>) => {
    const pilotDir = join(projectPath, '.pilot');
    const settingsPath = join(pilotDir, 'settings.json');
    const current = loadProjectSettings(projectPath);
    const merged = { ...current, ...overrides };
    if (!existsSync(pilotDir)) mkdirSync(pilotDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  });

  ipcMain.handle(IPC.SANDBOX_TOGGLE_YOLO, async (_event, tabId: string, projectPath: string) => {
    const current = loadProjectSettings(projectPath);
    const newYoloMode = !current.yoloMode;
    
    // Persist the toggled value
    const pilotDir = join(projectPath, '.pilot');
    const settingsPath = join(pilotDir, 'settings.json');
    if (!existsSync(pilotDir)) mkdirSync(pilotDir, { recursive: true });
    writeFileSync(settingsPath, JSON.stringify({ ...current, yoloMode: newYoloMode }, null, 2), 'utf-8');
    
    return { yoloMode: newYoloMode };
  });

  ipcMain.handle(IPC.SANDBOX_ACCEPT_DIFF, async (_event, tabId: string, diffId: string) => {
    const diff = sessionManager.stagedDiffs.getDiff(tabId, diffId);
    if (!diff) throw new Error(`Diff ${diffId} not found`);
    if (diff.operation === 'bash') {
      resolveBashApproval(diffId, true);
    } else {
      applyDiff(diff);
    }
    sessionManager.stagedDiffs.updateStatus(tabId, diffId, 'accepted');
  });

  ipcMain.handle(IPC.SANDBOX_REJECT_DIFF, async (_event, tabId: string, diffId: string) => {
    const diff = sessionManager.stagedDiffs.getDiff(tabId, diffId);
    if (diff?.operation === 'bash') {
      resolveBashApproval(diffId, false);
    }
    sessionManager.stagedDiffs.updateStatus(tabId, diffId, 'rejected');
  });

  ipcMain.handle(IPC.SANDBOX_ACCEPT_ALL, async (_event, tabId: string) => {
    const pending = sessionManager.stagedDiffs.getPending(tabId);
    for (const diff of pending) {
      if (diff.operation === 'bash') {
        resolveBashApproval(diff.id, true);
      } else {
        applyDiff(diff);
      }
      sessionManager.stagedDiffs.updateStatus(tabId, diff.id, 'accepted');
    }
  });
}
