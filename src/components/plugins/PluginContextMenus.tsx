import type { MenuEntry } from '../shared/ContextMenu';

/**
 * Get additional context menu entries from plugins matching the given 'when' clause.
 * Call this from any component that builds context menus.
 * 
 * Phase 2 stub - full context menu integration comes in Phase 5.
 */
export function usePluginContextMenuEntries(when: string): MenuEntry[] {
  // In Phase 2, context menu contributions are tracked in PluginBridge
  // but not yet exposed through the store. This is a placeholder.
  // Phase 5 will add full context menu contribution support.
  return [];
}
