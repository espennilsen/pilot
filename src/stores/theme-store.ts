/**
 * @file Theme store — manages custom theme state in the renderer.
 */
import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import type { CustomTheme } from '../../shared/types';
import { invoke } from '../lib/ipc-client';

interface ThemeStore {
  /** All available custom themes (built-in + user-created) */
  customThemes: CustomTheme[];
  /** Currently active custom theme (null when using built-in dark/light/system) */
  activeCustomTheme: CustomTheme | null;
  /** Whether themes are currently loading */
  isLoading: boolean;

  /** Load all custom themes from disk */
  loadThemes: () => Promise<void>;
  /** Load and cache a specific theme by slug */
  loadTheme: (slug: string) => Promise<CustomTheme | null>;
  /** Save (create or update) a custom theme */
  saveTheme: (theme: CustomTheme) => Promise<void>;
  /** Delete a custom theme */
  deleteTheme: (slug: string) => Promise<void>;
  /** Import a theme via file dialog */
  importTheme: () => Promise<CustomTheme | null>;
  /** Export a theme via file dialog */
  exportTheme: (slug: string) => Promise<void>;
  /** Set the active custom theme (also caches it for early apply) */
  setActiveCustomTheme: (theme: CustomTheme | null) => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  customThemes: [],
  activeCustomTheme: null,
  isLoading: false,

  loadThemes: async () => {
    set({ isLoading: true });
    try {
      const themes = await invoke(IPC.THEME_LIST) as CustomTheme[];
      set({ customThemes: themes, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadTheme: async (slug: string) => {
    try {
      const theme = await invoke(IPC.THEME_GET, slug) as CustomTheme | null;
      return theme;
    } catch {
      return null;
    }
  },

  saveTheme: async (theme: CustomTheme) => {
    await invoke(IPC.THEME_SAVE, theme);
    // Refresh list
    await get().loadThemes();
    // If this is the active theme, update the cached version
    const active = get().activeCustomTheme;
    if (active && active.slug === theme.slug) {
      set({ activeCustomTheme: theme });
      cacheCustomThemeForEarlyApply(theme);
    }
  },

  deleteTheme: async (slug: string) => {
    await invoke(IPC.THEME_DELETE, slug);
    // If deleted theme was active, clear it
    const active = get().activeCustomTheme;
    if (active && active.slug === slug) {
      set({ activeCustomTheme: null });
      clearCustomThemeCache();
    }
    await get().loadThemes();
  },

  importTheme: async () => {
    const theme = await invoke(IPC.THEME_IMPORT) as CustomTheme | null;
    if (theme) {
      await get().loadThemes();
    }
    return theme;
  },

  exportTheme: async (slug: string) => {
    await invoke(IPC.THEME_EXPORT, slug);
  },

  setActiveCustomTheme: (theme: CustomTheme | null) => {
    set({ activeCustomTheme: theme });
    if (theme) {
      cacheCustomThemeForEarlyApply(theme);
    } else {
      clearCustomThemeCache();
    }
  },
}));

// ─── localStorage cache for flash prevention ─────────────────────────────

/** Cache the active custom theme's CSS variables so applyThemeEarly() can use them. */
function cacheCustomThemeForEarlyApply(theme: CustomTheme): void {
  try {
    // Store just the colors map as a compact string
    localStorage.setItem('pilot-custom-theme-colors', JSON.stringify(theme.colors));
    localStorage.setItem('pilot-custom-theme-base', theme.base);
  } catch {
    // localStorage full or unavailable
  }
}

function clearCustomThemeCache(): void {
  try {
    localStorage.removeItem('pilot-custom-theme-colors');
    localStorage.removeItem('pilot-custom-theme-base');
  } catch {
    // ignore
  }
}
