import { useAppSettingsStore } from '../../stores/app-settings-store';
import { useThemeStore } from '../../stores/theme-store';
import { resolveTheme } from '../../hooks/useTheme';

export const XTERM_THEME_DARK = {
  background: '#1a1b1e',
  foreground: '#e0e0e0',
  cursor: '#4fc3f7',
  selectionBackground: '#4fc3f740',
  black: '#1a1b1e',
  red: '#ef5350',
  green: '#66bb6a',
  yellow: '#ffa726',
  blue: '#4fc3f7',
  magenta: '#ce93d8',
  cyan: '#4dd0e1',
  white: '#e0e0e0',
  brightBlack: '#5a5a5a',
  brightRed: '#ff5252',
  brightGreen: '#69f0ae',
  brightYellow: '#ffd740',
  brightBlue: '#40c4ff',
  brightMagenta: '#ea80fc',
  brightCyan: '#64ffda',
  brightWhite: '#ffffff',
};

export const XTERM_THEME_LIGHT = {
  background: '#ffffff',
  foreground: '#1a1b1e',
  cursor: '#0b7dda',
  selectionBackground: '#0b7dda30',
  black: '#1a1b1e',
  red: '#d93025',
  green: '#1a8d3e',
  yellow: '#c47a0a',
  blue: '#0b7dda',
  magenta: '#a626a4',
  cyan: '#0e7490',
  white: '#e8eaed',
  brightBlack: '#5f6368',
  brightRed: '#ea4335',
  brightGreen: '#34a853',
  brightYellow: '#f9ab00',
  brightBlue: '#4285f4',
  brightMagenta: '#af5fcf',
  brightCyan: '#24a6c7',
  brightWhite: '#ffffff',
};

export function getXtermTheme(): typeof XTERM_THEME_DARK {
  const mode = useAppSettingsStore.getState().theme;
  const customTheme = useThemeStore.getState().activeCustomTheme;

  // If custom theme has terminal colors, use those
  if (mode === 'custom' && customTheme?.terminal) {
    const t = customTheme.terminal;
    const base = customTheme.base === 'light' ? XTERM_THEME_LIGHT : XTERM_THEME_DARK;
    return {
      background: t.background ?? base.background,
      foreground: t.foreground ?? base.foreground,
      cursor: t.cursor ?? base.cursor,
      selectionBackground: t.selectionBackground ?? base.selectionBackground,
      black: t.black ?? base.black,
      red: t.red ?? base.red,
      green: t.green ?? base.green,
      yellow: t.yellow ?? base.yellow,
      blue: t.blue ?? base.blue,
      magenta: t.magenta ?? base.magenta,
      cyan: t.cyan ?? base.cyan,
      white: t.white ?? base.white,
      brightBlack: t.brightBlack ?? base.brightBlack,
      brightRed: t.brightRed ?? base.brightRed,
      brightGreen: t.brightGreen ?? base.brightGreen,
      brightYellow: t.brightYellow ?? base.brightYellow,
      brightBlue: t.brightBlue ?? base.brightBlue,
      brightMagenta: t.brightMagenta ?? base.brightMagenta,
      brightCyan: t.brightCyan ?? base.brightCyan,
      brightWhite: t.brightWhite ?? base.brightWhite,
    };
  }

  return resolveTheme(mode) === 'light' ? XTERM_THEME_LIGHT : XTERM_THEME_DARK;
}
