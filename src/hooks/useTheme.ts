/**
 * useTheme — Applies the active theme to the document and keeps it in sync.
 *
 * Sets `data-theme` on <html> to 'dark', 'light', or 'system'.
 * For custom themes, applies CSS variables directly to the root element.
 * When the resolved theme changes, notifies the main process so it can
 * update the window chrome (titlebar overlay, background color).
 */

import { useEffect } from 'react';
import { useAppSettingsStore } from '../stores/app-settings-store';
import { useThemeStore } from '../stores/theme-store';
import type { ThemeMode, CustomTheme } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { send } from '../lib/ipc-client';

/** CSS variable keys that map to theme color properties. */
const CSS_VAR_MAP: Record<string, string> = {
  'bg-base': '--color-bg-base',
  'bg-surface': '--color-bg-surface',
  'bg-elevated': '--color-bg-elevated',
  'text-primary': '--color-text-primary',
  'text-secondary': '--color-text-secondary',
  'accent': '--color-accent',
  'success': '--color-success',
  'error': '--color-error',
  'warning': '--color-warning',
  'border': '--color-border',
};

/** Resolve 'system' to 'dark' or 'light' based on OS preference. */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  if (mode === 'custom') {
    // Custom themes declare a base — use it for resolved checks
    const active = useThemeStore.getState().activeCustomTheme;
    return active?.base ?? 'dark';
  }
  return mode;
}

/** Apply custom theme CSS variables to the document root. */
function applyCustomThemeColors(colors: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    if (colors[key]) {
      root.style.setProperty(cssVar, colors[key]);
    }
  }
}

/** Remove custom theme CSS variable overrides from the document root. */
function clearCustomThemeColors(): void {
  const root = document.documentElement;
  for (const cssVar of Object.values(CSS_VAR_MAP)) {
    root.style.removeProperty(cssVar);
  }
}

/** Inject dynamic syntax highlighting overrides for a custom theme. */
function applySyntaxTheme(syntax: Record<string, string> | undefined, base: 'dark' | 'light'): void {
  // Remove any existing dynamic syntax style
  const existingStyle = document.getElementById('pilot-custom-syntax-theme');
  if (existingStyle) existingStyle.remove();

  if (!syntax || Object.keys(syntax).length === 0) return;

  // Map syntax token names to hljs class selectors
  const tokenMap: Record<string, string[]> = {
    comment: ['.hljs-comment', '.hljs-quote'],
    keyword: ['.hljs-keyword', '.hljs-selector-tag', '.hljs-type'],
    string: ['.hljs-string', '.hljs-template-variable', '.hljs-addition'],
    number: ['.hljs-number', '.hljs-literal'],
    function: ['.hljs-title.function_', '.hljs-title'],
    variable: ['.hljs-variable', '.hljs-attr', '.hljs-symbol'],
    type: ['.hljs-built_in', '.hljs-class .hljs-title'],
    operator: ['.hljs-operator', '.hljs-punctuation'],
  };

  let css = '';
  for (const [token, color] of Object.entries(syntax)) {
    const selectors = tokenMap[token];
    if (!selectors) continue;
    const selectorStr = selectors.map(s => `[data-theme="${base}"] ${s}`).join(', ');
    css += `${selectorStr} { color: ${color} !important; }\n`;
  }

  if (css) {
    const style = document.createElement('style');
    style.id = 'pilot-custom-syntax-theme';
    style.textContent = css;
    document.head.appendChild(style);
  }
}

/** Remove dynamic syntax highlighting overrides. */
function clearSyntaxTheme(): void {
  const el = document.getElementById('pilot-custom-syntax-theme');
  if (el) el.remove();
}

/** Apply theme to DOM and notify main process. */
function applyTheme(mode: ThemeMode, customTheme: CustomTheme | null): void {
  if (mode === 'custom' && customTheme) {
    // Set data-theme to the base for CSS fallbacks (hljs, etc.)
    document.documentElement.setAttribute('data-theme', customTheme.base);
    applyCustomThemeColors(customTheme.colors);
    applySyntaxTheme(customTheme.syntax, customTheme.base);

    // Notify main process with custom chrome colors
    send(IPC.APP_THEME_CHANGED, {
      resolved: customTheme.base,
      bgColor: customTheme.colors['bg-base'],
      fgColor: customTheme.colors['text-primary'],
    });
  } else if (mode === 'custom') {
    // Custom theme selected but not yet loaded — leave applyThemeEarly() output intact
    return;
  } else {
    // Standard theme — clear any custom overrides
    clearCustomThemeColors();
    clearSyntaxTheme();
    document.documentElement.setAttribute('data-theme', mode);

    const resolved = resolveTheme(mode);
    send(IPC.APP_THEME_CHANGED, resolved);
  }
}

export function useTheme(): void {
  const theme = useAppSettingsStore((s) => s.theme);
  const customThemeSlug = useAppSettingsStore((s) => s.customThemeSlug);
  const activeCustomTheme = useThemeStore((s) => s.activeCustomTheme);

  // Load the custom theme when slug changes
  useEffect(() => {
    if (theme !== 'custom' || !customThemeSlug) return;

    const store = useThemeStore.getState();
    // Only load if we don't already have this theme cached
    if (store.activeCustomTheme?.slug !== customThemeSlug) {
      store.loadTheme(customThemeSlug).then((loaded) => {
        if (loaded) {
          store.setActiveCustomTheme(loaded);
        }
      });
    }
  }, [theme, customThemeSlug]);

  // Apply on mount and when setting changes
  useEffect(() => {
    applyTheme(theme, activeCustomTheme);
  }, [theme, activeCustomTheme]);

  // Listen for OS theme changes when mode is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyTheme('system', null);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // On unmount, remove any lingering custom CSS variable overrides
  useEffect(() => {
    return () => {
      clearCustomThemeColors();
      clearSyntaxTheme();
    };
  }, []);
}

/**
 * Apply theme immediately from localStorage before React mounts.
 * Call this in the entry point (main.tsx) to prevent a flash.
 */
export function applyThemeEarly(): void {
  try {
    const raw = localStorage.getItem('pilot-theme');
    const mode: ThemeMode = (raw === 'light' || raw === 'system' || raw === 'custom') ? raw : 'dark';

    if (mode === 'custom') {
      // Try to restore custom theme colors from cache
      const colorsJson = localStorage.getItem('pilot-custom-theme-colors');
      const base = localStorage.getItem('pilot-custom-theme-base');
      if (colorsJson && (base === 'dark' || base === 'light')) {
        const colors = JSON.parse(colorsJson) as Record<string, string>;
        document.documentElement.setAttribute('data-theme', base);
        applyCustomThemeColors(colors);
        return;
      }
      // Fallback to dark if cache is missing
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}
