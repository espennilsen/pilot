import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import {
  PILOT_APP_SETTINGS_FILE,
  DEFAULT_PI_AGENT_DIR,
  ensurePilotAppDirs,
} from './pilot-paths';
import type { PilotAppSettings } from '../../shared/types';
import { expandHome, isWithinDir } from '../utils/paths';

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

const DEFAULT_SYSTEM_PROMPT = `You are Pilot, an AI agent.

Additional tools:
- pilot_memory_read: Read stored memories (global or project scope)
- pilot_memory_add: Save a memory (user preferences, decisions, conventions)
- pilot_memory_remove: Remove outdated or incorrect memories
- pilot_task_create/update/query/comment: Manage the project task board
- pilot_show_file: Open a file in the editor with optional line highlighting
- pilot_open_url: Open a URL in the user's browser (requires confirmation)
- pilot_subagent: Delegate work to parallel sub-agents
- web_fetch: Fetch URLs and call APIs

Guidelines:
- File edits are staged for user review before being applied to disk
- Use pilot_show_file to visually point out code when explaining, reviewing, or debugging
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
      theme: parsed.theme ?? undefined,
      customThemeSlug: parsed.customThemeSlug ?? undefined,
      terminalApp: parsed.terminalApp ?? null,
      editorCli: parsed.editorCli ?? null,
      onboardingComplete: parsed.onboardingComplete ?? false,
      developerMode: parsed.developerMode ?? false,
      keybindOverrides: parsed.keybindOverrides ?? {},
      companionPort: parsed.companionPort ?? undefined,
      companionProtocol: parsed.companionProtocol ?? undefined,
      companionAutoStart: parsed.companionAutoStart ?? false,
      hiddenPaths: Array.isArray(parsed.hiddenPaths) ? parsed.hiddenPaths : DEFAULT_HIDDEN_PATHS,
      desktopEnabled: parsed.desktopEnabled ?? false,
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

  // Validate incoming fields — reject unexpected types to prevent a compromised renderer
  // from injecting dangerous values (e.g. piAgentDir: '/etc').
  const validated: Partial<PilotAppSettings> = {};
  if (settings.piAgentDir !== undefined) {
    if (typeof settings.piAgentDir === 'string') {
      const resolved = resolve(expandHome(settings.piAgentDir));
      if (isWithinDir(homedir(), resolved)) {
        validated.piAgentDir = settings.piAgentDir;
      }
    }
  }
  if (typeof settings.terminalApp === 'string' || settings.terminalApp === null) validated.terminalApp = settings.terminalApp;
  if (typeof settings.editorCli === 'string' || settings.editorCli === null) validated.editorCli = settings.editorCli;
  if (typeof settings.onboardingComplete === 'boolean') validated.onboardingComplete = settings.onboardingComplete;
  if (typeof settings.developerMode === 'boolean') validated.developerMode = settings.developerMode;
  if (typeof settings.companionPort === 'number') validated.companionPort = settings.companionPort;
  if (typeof settings.companionProtocol === 'string') validated.companionProtocol = settings.companionProtocol;
  if (typeof settings.companionAutoStart === 'boolean') validated.companionAutoStart = settings.companionAutoStart;
  if (typeof settings.desktopEnabled === 'boolean') validated.desktopEnabled = settings.desktopEnabled;
  if (typeof settings.theme === 'string' && ['dark', 'light', 'system', 'custom'].includes(settings.theme)) validated.theme = settings.theme;
  if (typeof settings.customThemeSlug === 'string' || settings.customThemeSlug === undefined) validated.customThemeSlug = settings.customThemeSlug;
  if (typeof settings.systemPrompt === 'string' || settings.systemPrompt === undefined) validated.systemPrompt = settings.systemPrompt;
  if (typeof settings.logging === 'object' && settings.logging !== null) validated.logging = settings.logging;
  if (typeof settings.keybindOverrides === 'object' && settings.keybindOverrides !== null) validated.keybindOverrides = settings.keybindOverrides;
  if (Array.isArray(settings.hiddenPaths)) validated.hiddenPaths = settings.hiddenPaths;

  const merged: PilotAppSettings = {
    ...current,
    ...validated,
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
