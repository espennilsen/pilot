import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ProjectSandboxSettings } from '../../shared/types';

const DEFAULT_SETTINGS: ProjectSandboxSettings = {
  jail: {
    enabled: true,
    allowedPaths: [],
  },
  yoloMode: false,
};

export function loadProjectSettings(projectPath: string): ProjectSandboxSettings {
  const settingsPath = join(projectPath, '.pilot', 'settings.json');
  if (!existsSync(settingsPath)) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const raw = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      jail: {
        enabled: parsed.jail?.enabled ?? DEFAULT_SETTINGS.jail.enabled,
        allowedPaths: parsed.jail?.allowedPaths ?? DEFAULT_SETTINGS.jail.allowedPaths,
      },
      yoloMode: parsed.yoloMode ?? DEFAULT_SETTINGS.yoloMode,
      dockerToolsEnabled: parsed.dockerToolsEnabled ?? undefined,
    };
  } catch {
    /* Expected: settings.json may not exist for project */
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveProjectSettings(projectPath: string, settings: ProjectSandboxSettings): void {
  const pilotDir = join(projectPath, '.pilot');
  if (!existsSync(pilotDir)) mkdirSync(pilotDir, { recursive: true });

  const settingsPath = join(pilotDir, 'settings.json');

  // Merge with existing file to preserve unknown keys
  let existing: Record<string, unknown> = {};
  try {
    if (existsSync(settingsPath)) {
      existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* start fresh */ }

  const merged = {
    ...existing,
    jail: settings.jail,
    yoloMode: settings.yoloMode,
    ...(settings.dockerToolsEnabled != null ? { dockerToolsEnabled: settings.dockerToolsEnabled } : {}),
  };

  writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
}
