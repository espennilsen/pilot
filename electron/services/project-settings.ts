import { readFileSync, existsSync } from 'fs';
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
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
