/**
 * useTheme — Applies the active theme to the document and keeps it in sync.
 *
 * Sets `data-theme` on <html> to 'dark', 'light', or 'system'.
 * When the resolved theme changes, notifies the main process so it can
 * update the window chrome (titlebar overlay, background color).
 */

import { useEffect } from 'react';
import { useAppSettingsStore } from '../stores/app-settings-store';
import type { ThemeMode } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { send } from '../lib/ipc-client';

/** Resolve 'system' to 'dark' or 'light' based on OS preference. */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

/** Apply theme to DOM and notify main process. */
function applyTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', mode);

  // Notify main process of resolved theme for window chrome
  const resolved = resolveTheme(mode);
  send(IPC.APP_THEME_CHANGED, resolved);
}

export function useTheme(): void {
  const theme = useAppSettingsStore((s) => s.theme);

  // Apply on mount and when setting changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for OS theme changes when mode is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);
}

/**
 * Apply theme immediately from localStorage before React mounts.
 * Call this in the entry point (main.tsx) to prevent a flash.
 */
export function applyThemeEarly(): void {
  try {
    const raw = localStorage.getItem('pilot-theme');
    const mode: ThemeMode = (raw === 'light' || raw === 'system') ? raw : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}
