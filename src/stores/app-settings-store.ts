/**
 * @file App settings store — manages app-level configuration (terminal, editor, developer mode, keybindings).
 */
import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import type { PilotAppSettings } from '../../shared/types';
import { invoke } from '../lib/ipc-client';

interface AppSettingsStore {
  piAgentDir: string;
  terminalApp: string | null;
  editorCli: string | null;
  onboardingComplete: boolean;
  developerMode: boolean;
  autoStartDevServer: boolean;
  keybindOverrides: Record<string, string | null>;
  hiddenPaths: string[];
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: { enabled: boolean; maxSizeMB?: number; retainDays?: number };
    syslog?: { enabled: boolean; host: string; port: number; facility?: number; appName?: string };
  };
  isLoading: boolean;
  error: string | null;

  load: () => Promise<void>;
  update: (updates: Partial<PilotAppSettings>) => Promise<void>;
  setPiAgentDir: (dir: string) => Promise<void>;
  setTerminalApp: (app: string | null) => Promise<void>;
  setEditorCli: (cli: string | null) => Promise<void>;
  setDeveloperMode: (enabled: boolean) => Promise<void>;
  setAutoStartDevServer: (enabled: boolean) => Promise<void>;
  setHiddenPaths: (paths: string[]) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  setKeybindOverride: (id: string, combo: string | null) => Promise<void>;
  clearKeybindOverride: (id: string) => Promise<void>;
  setLogLevel: (level: 'debug' | 'info' | 'warn' | 'error') => Promise<void>;
  setFileLogging: (enabled: boolean) => Promise<void>;
  setSyslogConfig: (config: Partial<{ enabled: boolean; host: string; port: number }>) => Promise<void>;
}

/**
 * Fallback Pi agent directory path (macOS/Linux).
 * The real platform-specific path is loaded from the main process via IPC
 * and replaces this default once the app initializes.
 */
const DEFAULT_PI_AGENT_DIR = '~/.config/.pilot';

/**
 * App settings store — manages app-level configuration (terminal, editor, developer mode, keybindings).
 */
export const useAppSettingsStore = create<AppSettingsStore>((set, get) => {
  /**
   * Helper to update settings with optional optimistic update.
   */
  const updateSetting = async (updates: Partial<PilotAppSettings>, optimistic = false) => {
    if (optimistic) {
      set(updates);
    }
    return get().update(updates);
  };

  return {
    piAgentDir: DEFAULT_PI_AGENT_DIR,
    terminalApp: null,
    editorCli: null,
    onboardingComplete: false,
    developerMode: false,
    autoStartDevServer: false,
    keybindOverrides: {},
    hiddenPaths: [],
    logging: {
      level: 'warn' as const,
      file: { enabled: true, maxSizeMB: 10, retainDays: 14 },
      syslog: { enabled: false, host: 'localhost', port: 514, facility: 16, appName: 'pilot' },
    },
    isLoading: false,
    error: null,

    load: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await invoke(IPC.APP_SETTINGS_GET) as PilotAppSettings;
      set({
        piAgentDir: settings.piAgentDir || DEFAULT_PI_AGENT_DIR,
        terminalApp: settings.terminalApp ?? null,
        editorCli: settings.editorCli ?? null,
        onboardingComplete: settings.onboardingComplete ?? false,
        developerMode: settings.developerMode ?? false,
        autoStartDevServer: settings.autoStartDevServer ?? false,
        keybindOverrides: settings.keybindOverrides ?? {},
        hiddenPaths: settings.hiddenPaths ?? [],
        logging: settings.logging ?? {
          level: 'warn' as const,
          file: { enabled: true, maxSizeMB: 10, retainDays: 14 },
          syslog: { enabled: false, host: 'localhost', port: 514, facility: 16, appName: 'pilot' },
        },
        isLoading: false,
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  update: async (updates: Partial<PilotAppSettings>) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await invoke(IPC.APP_SETTINGS_UPDATE, updates) as PilotAppSettings;
      set({
        piAgentDir: updated.piAgentDir || DEFAULT_PI_AGENT_DIR,
        terminalApp: updated.terminalApp ?? null,
        editorCli: updated.editorCli ?? null,
        onboardingComplete: updated.onboardingComplete ?? false,
        developerMode: updated.developerMode ?? false,
        autoStartDevServer: updated.autoStartDevServer ?? false,
        keybindOverrides: updated.keybindOverrides ?? {},
        hiddenPaths: updated.hiddenPaths ?? [],
        logging: updated.logging ?? {
          level: 'warn' as const,
          file: { enabled: true, maxSizeMB: 10, retainDays: 14 },
          syslog: { enabled: false, host: 'localhost', port: 514, facility: 16, appName: 'pilot' },
        },
        isLoading: false,
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

    setPiAgentDir: async (dir: string) => updateSetting({ piAgentDir: dir }),
    setTerminalApp: async (app: string | null) => updateSetting({ terminalApp: app }),
    setEditorCli: async (cli: string | null) => updateSetting({ editorCli: cli }),
    setDeveloperMode: async (enabled: boolean) => updateSetting({ developerMode: enabled }, true),
    setAutoStartDevServer: async (enabled: boolean) => updateSetting({ autoStartDevServer: enabled }, true),
    setHiddenPaths: async (paths: string[]) => updateSetting({ hiddenPaths: paths }, true),
    completeOnboarding: async () => updateSetting({ onboardingComplete: true }),
    setKeybindOverride: async (id: string, combo: string | null) => {
      const overrides = { ...get().keybindOverrides, [id]: combo };
      return updateSetting({ keybindOverrides: overrides });
    },
    clearKeybindOverride: async (id: string) => {
      const { [id]: _, ...rest } = get().keybindOverrides;
      return updateSetting({ keybindOverrides: rest });
    },
    setLogLevel: async (level) => {
      const current = get().logging;
      return updateSetting({ logging: { ...current, level } }, true);
    },
    setFileLogging: async (enabled) => {
      const current = get().logging;
      return updateSetting({ logging: { ...current, file: { ...current.file, enabled } } }, true);
    },
    setSyslogConfig: async (config) => {
      const current = get().logging;
      const merged = { ...current.syslog, ...config } as typeof current.syslog;
      return updateSetting({ logging: { ...current, syslog: merged } }, true);
    },
  };
});
