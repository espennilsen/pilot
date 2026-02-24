/**
 * Central keybinding definitions.
 * Used by useKeyboardShortcuts (runtime) and KeybindingsSettings (UI).
 */

export interface KeybindingDef {
  id: string;
  label: string;
  /** Default key combo: "mod+key" where mod is meta/ctrl/alt/shift, joined with "+" */
  defaultCombo: string;
  category: 'View' | 'Tabs' | 'Sandbox' | 'Developer' | 'General';
  /** Display symbol for command palette (e.g. ⌘B) */
  displaySymbol: string;
}

/** Whether the current platform is macOS */
const _isMac = typeof window !== 'undefined'
  ? window.api?.platform === 'darwin'
  : typeof process !== 'undefined' && process.platform === 'darwin';

/** Return the platform-appropriate modifier key symbol: ⌘ on macOS, Ctrl on Windows/Linux */
export function modKey(): string {
  return _isMac ? '⌘' : 'Ctrl+';
}

/** Return a platform-appropriate shortcut label (e.g. "⌘S" on macOS, "Ctrl+S" on Windows/Linux) */
export function shortcutLabel(key: string, shift = false): string {
  const shiftPart = shift ? (_isMac ? '⇧' : 'Shift+') : '';
  return `${modKey()}${shiftPart}${key}`;
}

/** All app-level keybindings with their defaults. */
export const DEFAULT_KEYBINDINGS: KeybindingDef[] = [
  { id: 'toggle-sidebar',       label: 'Toggle Sidebar',       defaultCombo: 'meta+b',             category: 'View',      displaySymbol: shortcutLabel('B') },
  { id: 'toggle-context-panel', label: 'Toggle Context Panel', defaultCombo: 'meta+shift+b',       category: 'View',      displaySymbol: shortcutLabel('B', true) },
  { id: 'toggle-focus-mode',    label: 'Focus Mode',           defaultCombo: 'meta+shift+enter',   category: 'View',      displaySymbol: shortcutLabel('↵', true) },
  { id: 'toggle-terminal',      label: 'Toggle Terminal',      defaultCombo: 'meta+`',             category: 'View',      displaySymbol: shortcutLabel('`') },
  { id: 'toggle-scratch-pad',   label: 'Toggle Scratch Pad',   defaultCombo: 'meta+j',             category: 'View',      displaySymbol: shortcutLabel('J') },
  { id: 'toggle-git-panel',     label: 'Toggle Git Panel',     defaultCombo: 'meta+g',             category: 'View',      displaySymbol: shortcutLabel('G') },
  { id: 'new-tab',              label: 'New Tab',              defaultCombo: 'meta+t',             category: 'Tabs',      displaySymbol: shortcutLabel('T') },
  { id: 'close-tab',            label: 'Close Tab',            defaultCombo: 'meta+w',             category: 'Tabs',      displaySymbol: shortcutLabel('W') },
  { id: 'new-conversation',     label: 'New Conversation',     defaultCombo: 'meta+n',             category: 'Tabs',      displaySymbol: shortcutLabel('N') },
  { id: 'toggle-yolo-mode',     label: 'Toggle Yolo Mode',     defaultCombo: 'meta+shift+y',       category: 'Sandbox',   displaySymbol: shortcutLabel('Y', true) },
  { id: 'developer-settings',   label: 'Developer Settings',   defaultCombo: 'meta+shift+d',       category: 'Developer', displaySymbol: shortcutLabel('D', true) },
  { id: 'open-project',         label: 'Open Project',         defaultCombo: 'meta+shift+n',       category: 'General',   displaySymbol: shortcutLabel('N', true) },
  { id: 'open-settings',        label: 'Open Settings',        defaultCombo: 'meta+,',             category: 'General',   displaySymbol: shortcutLabel(',') },
  { id: 'command-palette',      label: 'Command Palette',      defaultCombo: 'meta+k',             category: 'General',   displaySymbol: shortcutLabel('K') },
  { id: 'open-memory',          label: 'Open Memory Panel',    defaultCombo: 'meta+shift+m',       category: 'General',   displaySymbol: shortcutLabel('M', true) },
  { id: 'open-prompts',         label: 'Prompt Library',       defaultCombo: 'meta+/',             category: 'General',   displaySymbol: shortcutLabel('/') },
  { id: 'open-tasks',           label: 'Open Task Board',      defaultCombo: 'meta+shift+t',       category: 'General',   displaySymbol: shortcutLabel('T', true) },
  { id: 'stop-agent',           label: 'Stop Agent',           defaultCombo: 'escape',             category: 'General',   displaySymbol: 'Esc' },
];

/** Parse "meta+shift+b" → { key: 'b', modifiers: ['meta', 'shift'] } */
export function parseCombo(combo: string): { key: string; modifiers: ('meta' | 'ctrl' | 'alt' | 'shift')[] } {
  if (!combo || combo.trim() === '') {
    throw new Error('parseCombo: combo string cannot be empty');
  }

  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  // Validate key is non-empty
  if (!key || key.trim() === '') {
    throw new Error(`parseCombo: key part is empty in combo "${combo}"`);
  }

  // Validate modifiers are valid
  const validModifiers = ['meta', 'ctrl', 'alt', 'shift'];
  for (const mod of modifiers) {
    if (!validModifiers.includes(mod)) {
      throw new Error(`parseCombo: invalid modifier "${mod}" in combo "${combo}". Valid modifiers: ${validModifiers.join(', ')}`);
    }
  }

  return { key, modifiers: modifiers as ('meta' | 'ctrl' | 'alt' | 'shift')[] };
}

/** Format { key: 'b', modifiers: ['meta', 'shift'] } → "meta+shift+b" */
export function formatCombo(key: string, modifiers: string[]): string {
  if (!key || key.trim() === '') {
    throw new Error('formatCombo: key cannot be empty');
  }

  // Validate modifiers are valid
  const validModifiers = ['meta', 'ctrl', 'alt', 'shift'];
  for (const mod of modifiers) {
    if (!validModifiers.includes(mod.toLowerCase())) {
      throw new Error(`formatCombo: invalid modifier "${mod}". Valid modifiers: ${validModifiers.join(', ')}`);
    }
  }

  return [...modifiers, key].join('+');
}

/** Convert combo string to display symbol (⌘⇧B style) */
export function comboToSymbol(combo: string): string {
  const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin';
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);

  const symbols: string[] = [];
  if (mods.includes('meta'))  symbols.push(isMac ? '⌘' : 'Ctrl');
  if (mods.includes('ctrl'))  symbols.push('Ctrl');
  if (mods.includes('alt'))   symbols.push(isMac ? '⌥' : 'Alt');
  if (mods.includes('shift')) symbols.push('⇧');

  // Prettify key names
  const keyMap: Record<string, string> = {
    enter: '↵', escape: 'Esc', backspace: '⌫', delete: '⌦',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    ' ': 'Space', '`': '`', ',': ',',
  };
  const displayKey = keyMap[key] || key.toUpperCase();
  symbols.push(displayKey);

  return symbols.join('');
}

/** Convert combo string to an array of individual key labels for rich rendering */
export function comboToParts(combo: string): string[] {
  const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin';
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);

  const result: string[] = [];
  if (mods.includes('meta'))  result.push(isMac ? 'Cmd' : 'Ctrl');
  if (mods.includes('ctrl'))  result.push('Ctrl');
  if (mods.includes('alt'))   result.push(isMac ? 'Opt' : 'Alt');
  if (mods.includes('shift')) result.push('Shift');

  const keyMap: Record<string, string> = {
    enter: 'Enter', escape: 'Esc', backspace: '⌫', delete: 'Del',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    ' ': 'Space', '`': '`', ',': ',',
  };
  result.push(keyMap[key] || key.toUpperCase());

  return result;
}

/** Get the effective combo for a keybinding, applying overrides. Returns null if disabled. */
export function getEffectiveCombo(id: string, overrides: Record<string, string | null>): string | null {
  if (id in overrides) return overrides[id];
  const def = DEFAULT_KEYBINDINGS.find(k => k.id === id);
  return def?.defaultCombo ?? null;
}
