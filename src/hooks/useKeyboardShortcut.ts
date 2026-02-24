import { useEffect } from 'react';

type ShortcutModifier = 'meta' | 'ctrl' | 'alt' | 'shift';

interface ShortcutConfig {
  key: string;
  modifiers: ShortcutModifier[];
  action: () => void;
  enabled?: boolean;
}

function matchesShortcut(event: KeyboardEvent, config: ShortcutConfig): boolean {
  const { key, modifiers } = config;
  
  // Check if key matches (case-insensitive)
  if (event.key.toLowerCase() !== key.toLowerCase()) {
    return false;
  }

  const isMac = window.api.platform === 'darwin';
  
  // Check modifiers
  const hasShift = modifiers.includes('shift');
  const hasAlt = modifiers.includes('alt');
  const hasMeta = modifiers.includes('meta');
  const hasCtrl = modifiers.includes('ctrl');

  // On macOS, 'meta' modifier means Cmd key
  // On Windows/Linux, 'meta' modifier means Ctrl key
  const metaKeyPressed = isMac ? event.metaKey : event.ctrlKey;
  const ctrlKeyPressed = event.ctrlKey;

  // Match Shift
  if (hasShift !== event.shiftKey) return false;
  
  // Match Alt
  if (hasAlt !== event.altKey) return false;
  
  // Match Meta (Cmd on macOS, Ctrl on Windows/Linux)
  if (hasMeta && !metaKeyPressed) return false;
  if (!hasMeta && metaKeyPressed && !hasCtrl) return false;
  
  // Match explicit Ctrl
  if (hasCtrl && !ctrlKeyPressed) return false;
  if (!hasCtrl && ctrlKeyPressed && !hasMeta) return false;

  return true;
}

/**
 * Registers a single keyboard shortcut handler.
 * 
 * Convenience wrapper around useKeyboardShortcuts for a single shortcut.
 * Handles platform-specific modifier keys (Cmd on macOS, Ctrl on Windows/Linux)
 * and skips shortcuts when focus is in an input field (unless the shortcut uses
 * modifier keys).
 * 
 * @param config - Shortcut configuration with key, modifiers, and action callback
 */
export function useKeyboardShortcut(config: ShortcutConfig): void {
  useKeyboardShortcuts([config]);
}

/**
 * Registers multiple keyboard shortcut handlers.
 * 
 * Attaches a global keydown listener that matches keyboard events against the
 * provided shortcut configurations. Handles platform-specific modifier keys:
 * - 'meta' modifier maps to Cmd on macOS, Ctrl on Windows/Linux
 * - 'ctrl' modifier is explicit Ctrl key on all platforms
 * 
 * Shortcuts are suppressed when focus is in input fields (input, textarea,
 * contentEditable) unless the shortcut includes modifier keys (Cmd/Ctrl).
 * 
 * Re-registers listeners whenever the configs array changes. Each shortcut can
 * be individually disabled via the `enabled` flag.
 * 
 * @param configs - Array of shortcut configurations
 */
export function useKeyboardShortcuts(configs: ShortcutConfig[]): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow modifier-heavy shortcuts (Cmd+K, Ctrl+W, etc.) to fire in inputs
        if (!event.metaKey && !event.ctrlKey) return;
      }

      for (const config of configs) {
        if (config.enabled === false) continue;
        
        if (matchesShortcut(event, config)) {
          event.preventDefault();
          event.stopPropagation();
          config.action();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [configs]);
}
