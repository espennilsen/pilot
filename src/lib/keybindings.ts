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

/** All app-level keybindings with their defaults. */
export const DEFAULT_KEYBINDINGS: KeybindingDef[] = [
  { id: 'toggle-sidebar',       label: 'Toggle Sidebar',       defaultCombo: 'meta+b',             category: 'View',      displaySymbol: '⌘B' },
  { id: 'toggle-context-panel', label: 'Toggle Context Panel', defaultCombo: 'meta+shift+b',       category: 'View',      displaySymbol: '⌘⇧B' },
  { id: 'toggle-focus-mode',    label: 'Focus Mode',           defaultCombo: 'meta+shift+enter',   category: 'View',      displaySymbol: '⌘⇧↵' },
  { id: 'toggle-terminal',      label: 'Toggle Terminal',      defaultCombo: 'meta+`',             category: 'View',      displaySymbol: '⌘`' },
  { id: 'toggle-scratch-pad',   label: 'Toggle Scratch Pad',   defaultCombo: 'meta+j',             category: 'View',      displaySymbol: '⌘J' },
  { id: 'toggle-git-panel',     label: 'Toggle Git Panel',     defaultCombo: 'meta+g',             category: 'View',      displaySymbol: '⌘G' },
  { id: 'new-tab',              label: 'New Tab',              defaultCombo: 'meta+t',             category: 'Tabs',      displaySymbol: '⌘T' },
  { id: 'close-tab',            label: 'Close Tab',            defaultCombo: 'meta+w',             category: 'Tabs',      displaySymbol: '⌘W' },
  { id: 'new-conversation',     label: 'New Conversation',     defaultCombo: 'meta+n',             category: 'Tabs',      displaySymbol: '⌘N' },
  { id: 'toggle-yolo-mode',     label: 'Toggle Yolo Mode',     defaultCombo: 'meta+shift+y',       category: 'Sandbox',   displaySymbol: '⌘⇧Y' },
  { id: 'developer-settings',   label: 'Developer Settings',   defaultCombo: 'meta+shift+d',       category: 'Developer', displaySymbol: '⌘⇧D' },
  { id: 'open-project',         label: 'Open Project',         defaultCombo: 'meta+shift+n',       category: 'General',   displaySymbol: '⌘⇧N' },
  { id: 'open-settings',        label: 'Open Settings',        defaultCombo: 'meta+,',             category: 'General',   displaySymbol: '⌘,' },
  { id: 'command-palette',      label: 'Command Palette',      defaultCombo: 'meta+k',             category: 'General',   displaySymbol: '⌘K' },
  { id: 'open-memory',          label: 'Open Memory Panel',    defaultCombo: 'meta+shift+m',       category: 'General',   displaySymbol: '⌘⇧M' },
  { id: 'open-prompts',         label: 'Prompt Library',       defaultCombo: 'meta+/',             category: 'General',   displaySymbol: '⌘/' },
  { id: 'open-tasks',           label: 'Open Task Board',      defaultCombo: 'meta+shift+t',       category: 'General',   displaySymbol: '⌘⇧T' },
];

/** Parse "meta+shift+b" → { key: 'b', modifiers: ['meta', 'shift'] } */
export function parseCombo(combo: string): { key: string; modifiers: ('meta' | 'ctrl' | 'alt' | 'shift')[] } {
  const parts = combo.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1) as ('meta' | 'ctrl' | 'alt' | 'shift')[];
  return { key, modifiers };
}

/** Format { key: 'b', modifiers: ['meta', 'shift'] } → "meta+shift+b" */
export function formatCombo(key: string, modifiers: string[]): string {
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
