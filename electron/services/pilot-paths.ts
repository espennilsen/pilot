import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, renameSync } from 'fs';

// ─── Pilot App Directory ─────────────────────────────────────────────────
// App-level config that is NOT per-project and NOT related to pi agent settings.
// Platform-aware:
//   macOS:   ~/.config/pilot/
//   Windows: %APPDATA%\pilot\              (e.g. C:\Users\<user>\AppData\Roaming\pilot)
//   Linux:   $XDG_CONFIG_HOME/pilot/       (default: ~/.config/pilot/)
function resolvePilotAppDir(): string {
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'pilot');
    case 'linux':
      return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'pilot');
    default: // darwin and others
      return join(homedir(), '.config', 'pilot');
  }
}

/** Resolve the legacy .pilot directory path (pre-rename). */
function resolveLegacyAppDir(): string {
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), '.pilot');
    case 'linux':
      return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), '.pilot');
    default:
      return join(homedir(), '.config', '.pilot');
  }
}

/**
 * Migrate from legacy ~/.config/.pilot to ~/.config/pilot.
 * Only runs if the old directory exists and the new one does not.
 */
function migrateLegacyDir(): void {
  const legacyDir = resolveLegacyAppDir();
  const newDir = resolvePilotAppDir();
  if (existsSync(legacyDir) && !existsSync(newDir)) {
    try {
      renameSync(legacyDir, newDir);
    } catch {
      // If rename fails (e.g. cross-device), leave the old dir in place.
      // ensurePilotAppDirs() will create the new dir and the user keeps
      // both until they manually clean up.
    }
  }
}

export const PILOT_APP_DIR = resolvePilotAppDir();

// App settings file (includes piAgentDir override)
export const PILOT_APP_SETTINGS_FILE = join(PILOT_APP_DIR, 'app-settings.json');

// Workspace state (tabs, window bounds, UI layout)
export const PILOT_WORKSPACE_FILE = join(PILOT_APP_DIR, 'workspace.json');

// Auth credentials managed by Pilot (separate from pi CLI's auth)
export const PILOT_AUTH_FILE = join(PILOT_APP_DIR, 'auth.json');

// Model registry managed by Pilot
export const PILOT_MODELS_FILE = join(PILOT_APP_DIR, 'models.json');

// Extensions and skills installed through Pilot (NOT auto-discovered by pi agent)
export const PILOT_EXTENSIONS_DIR = join(PILOT_APP_DIR, 'extensions');
export const PILOT_SKILLS_DIR = join(PILOT_APP_DIR, 'skills');

// Extension registry (enabled/disabled state)
export const PILOT_EXTENSION_REGISTRY_FILE = join(PILOT_APP_DIR, 'extension-registry.json');

// Prompt library
export const PILOT_PROMPTS_DIR = join(PILOT_APP_DIR, 'prompts');

// Log files directory
export const PILOT_LOGS_DIR = join(PILOT_APP_DIR, 'logs');

// ─── Default Pi Agent Directory ──────────────────────────────────────────
// Pilot uses its own app directory as the default agent dir.
// Users can override this in Settings → General → Pi Config Directory.
export const DEFAULT_PI_AGENT_DIR = PILOT_APP_DIR;

// ─── Ensure directories exist ────────────────────────────────────────────
export function ensurePilotAppDirs(): void {
  // Migrate from legacy ~/.config/.pilot → ~/.config/pilot on first run
  migrateLegacyDir();

  const dirs = [
    PILOT_APP_DIR,
    PILOT_EXTENSIONS_DIR,
    PILOT_SKILLS_DIR,
    PILOT_PROMPTS_DIR,
    PILOT_LOGS_DIR,
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
