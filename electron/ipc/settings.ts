import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import { loadProjectSettings } from '../services/project-settings';
import { loadAppSettings, saveAppSettings, getPiAgentDir } from '../services/app-settings';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getLogger } from '../services/logger';

export function registerSettingsIpc() {

  // ── App Settings (Pilot-level, ~/.config/.pilot/) ──────────────────────

  ipcMain.handle(IPC.APP_SETTINGS_GET, async () => {
    return loadAppSettings();
  });

  ipcMain.handle(IPC.APP_SETTINGS_UPDATE, async (_event, updates: Record<string, unknown>) => {
    return saveAppSettings(updates as any);
  });

  // ── Pi Agent Settings (piAgentDir/settings.json — default model, provider, etc.) ──

  ipcMain.handle(IPC.PI_SETTINGS_GET, async () => {
    const piAgentDir = getPiAgentDir();
    const settingsPath = join(piAgentDir, 'settings.json');
    try {
      if (existsSync(settingsPath)) {
        return JSON.parse(readFileSync(settingsPath, 'utf-8'));
      }
    } catch { /* Expected: settings file may not exist or be malformed JSON */ }
    return {};
  });

  ipcMain.handle(IPC.PI_SETTINGS_UPDATE, async (_event, updates: Record<string, unknown>) => {
    const piAgentDir = getPiAgentDir();
    const settingsPath = join(piAgentDir, 'settings.json');
    let current: Record<string, unknown> = {};
    try {
      if (existsSync(settingsPath)) {
        current = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      }
    } catch { /* Expected: settings file may not exist or be malformed JSON */ }
    const merged = { ...current, ...updates };
    if (!existsSync(piAgentDir)) {
      mkdirSync(piAgentDir, { recursive: true });
    }
    writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
    return merged;
  });

  // ── Project Settings (per-project, <project>/.pilot/) ──────────────────

  ipcMain.handle(IPC.SETTINGS_GET, async (_event, projectPath: string) => {
    if (!projectPath) return {};
    return loadProjectSettings(projectPath);
  });

  ipcMain.handle(IPC.SETTINGS_UPDATE, async (_event, projectPath: string, overrides: Record<string, unknown>) => {
    if (!projectPath) return;

    const pilotDir = join(projectPath, '.pilot');
    const settingsPath = join(pilotDir, 'settings.json');

    // Load current settings, merge overrides, write back
    const current = loadProjectSettings(projectPath);
    const merged = { ...current, ...overrides };

    if (!existsSync(pilotDir)) {
      mkdirSync(pilotDir, { recursive: true });
    }
    writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf-8');
  });

  // ── Logging (renderer → main) ──────────────────────────────────────────

  ipcMain.handle(IPC.LOG_MESSAGE, async (_event, source: string, level: string, message: string, data?: unknown) => {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(level)) return;
    const logger = getLogger(`renderer:${source}`);
    const fn = logger[level as keyof typeof logger];
    if (typeof fn === 'function') fn(message, data);
  });
}
