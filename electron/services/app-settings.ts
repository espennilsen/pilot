import { readFileSync, writeFileSync, existsSync } from 'fs';
import {
  PILOT_APP_SETTINGS_FILE,
  DEFAULT_PI_AGENT_DIR,
  ensurePilotAppDirs,
} from './pilot-paths';
import type { PilotAppSettings } from '../../shared/types';
import { expandHome } from '../utils/paths';

export const DEFAULT_HIDDEN_PATHS = [
  'node_modules',
  '.git',
  '.DS_Store',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '__pycache__',
  '.tox',
  '.mypy_cache',
  'target',
  '.gradle',
  '*.pyc',
];

const DEFAULT_SYSTEM_PROMPT = `You are running inside Pilot, an Electron desktop app wrapping the pi coding agent.

Additional tools:
- pilot_memory_read: Read stored memories (global or project scope)
- pilot_memory_add: Save a memory (user preferences, decisions, conventions)
- pilot_memory_remove: Remove outdated or incorrect memories
- pilot_task_create/update/query/comment: Manage the project task board
- pilot_subagent: Delegate work to parallel sub-agents
- web_fetch: Fetch URLs and call APIs

Guidelines:
- File edits are staged for user review before being applied to disk
- Use memory tools to persist useful context across sessions — check existing memories before adding duplicates
- Keep memories concise: one fact per entry, use categories and appropriate scope (global vs project)`;

const DEFAULT_APP_SETTINGS: PilotAppSettings = {
  piAgentDir: DEFAULT_PI_AGENT_DIR,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  terminalApp: null,
  editorCli: null,
  onboardingComplete: false,
  developerMode: false,
  keybindOverrides: {},
  hiddenPaths: DEFAULT_HIDDEN_PATHS,
  logging: {
    level: 'warn',
    file: { enabled: true, maxSizeMB: 10, retainDays: 14 },
    syslog: { enabled: false, host: 'localhost', port: 514, facility: 16, appName: 'pilot' },
  },
};

// ─── Singleton ───────────────────────────────────────────────────────────

let cachedSettings: PilotAppSettings | null = null;

export function loadAppSettings(): PilotAppSettings {
  if (cachedSettings) return cachedSettings;

  ensurePilotAppDirs();

  if (!existsSync(PILOT_APP_SETTINGS_FILE)) {
    cachedSettings = { ...DEFAULT_APP_SETTINGS };
    return cachedSettings;
  }

  try {
    const raw = readFileSync(PILOT_APP_SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedSettings = {
      piAgentDir: parsed.piAgentDir || DEFAULT_PI_AGENT_DIR,
      terminalApp: parsed.terminalApp ?? null,
      editorCli: parsed.editorCli ?? null,
      onboardingComplete: parsed.onboardingComplete ?? false,
      developerMode: parsed.developerMode ?? false,
      keybindOverrides: parsed.keybindOverrides ?? {},
      companionPort: parsed.companionPort ?? undefined,
      companionProtocol: parsed.companionProtocol ?? undefined,
      companionAutoStart: parsed.companionAutoStart ?? false,
      hiddenPaths: Array.isArray(parsed.hiddenPaths) ? parsed.hiddenPaths : DEFAULT_HIDDEN_PATHS,
      systemPrompt: parsed.systemPrompt ?? undefined,
      logging: parsed.logging ?? DEFAULT_APP_SETTINGS.logging,
    };
    return cachedSettings;
  } catch (err) {
    console.warn('[AppSettings] Corrupt settings file, using defaults:', err);
    cachedSettings = { ...DEFAULT_APP_SETTINGS };
    return cachedSettings;
  }
}

export function saveAppSettings(settings: Partial<PilotAppSettings>): PilotAppSettings {
  const current = loadAppSettings();
  const merged: PilotAppSettings = {
    ...current,
    ...settings,
  };

  ensurePilotAppDirs();
  writeFileSync(PILOT_APP_SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
  cachedSettings = merged;
  return merged;
}

export function getAppSettings(): PilotAppSettings {
  return loadAppSettings();
}

/** Resolve the effective pi agent directory (from app settings), with ~ expansion */
export function getPiAgentDir(): string {
  const settings = loadAppSettings();
  const dir = settings.piAgentDir || DEFAULT_PI_AGENT_DIR;
  return expandHome(dir);
}
