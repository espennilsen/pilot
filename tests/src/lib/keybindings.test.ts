import { describe, it, expect } from 'vitest';
import { parseCombo, formatCombo, getEffectiveCombo, DEFAULT_KEYBINDINGS } from '../../../src/lib/keybindings';

describe('parseCombo', () => {
  it('parses single key with no modifiers', () => {
    const result = parseCombo('escape');
    expect(result).toEqual({ key: 'escape', modifiers: [] });
  });

  it('parses key with single modifier', () => {
    const result = parseCombo('meta+b');
    expect(result).toEqual({ key: 'b', modifiers: ['meta'] });
  });

  it('parses key with multiple modifiers', () => {
    const result = parseCombo('meta+shift+b');
    expect(result).toEqual({ key: 'b', modifiers: ['meta', 'shift'] });
  });

  it('parses key with ctrl modifier', () => {
    const result = parseCombo('ctrl+c');
    expect(result).toEqual({ key: 'c', modifiers: ['ctrl'] });
  });

  it('parses key with alt modifier', () => {
    const result = parseCombo('alt+f4');
    expect(result).toEqual({ key: 'f4', modifiers: ['alt'] });
  });

  it('parses key with all modifiers', () => {
    const result = parseCombo('meta+ctrl+alt+shift+x');
    expect(result).toEqual({ 
      key: 'x', 
      modifiers: ['meta', 'ctrl', 'alt', 'shift'] 
    });
  });

  it('normalizes combo to lowercase', () => {
    const result = parseCombo('META+SHIFT+B');
    expect(result).toEqual({ key: 'b', modifiers: ['meta', 'shift'] });
  });

  it('handles special keys like enter', () => {
    const result = parseCombo('meta+shift+enter');
    expect(result).toEqual({ key: 'enter', modifiers: ['meta', 'shift'] });
  });

  it('handles backtick key', () => {
    const result = parseCombo('meta+`');
    expect(result).toEqual({ key: '`', modifiers: ['meta'] });
  });

  it('handles comma key', () => {
    const result = parseCombo('meta+,');
    expect(result).toEqual({ key: ',', modifiers: ['meta'] });
  });

  it('handles slash key', () => {
    const result = parseCombo('meta+/');
    expect(result).toEqual({ key: '/', modifiers: ['meta'] });
  });

  it('throws on empty string', () => {
    expect(() => parseCombo('')).toThrow('combo string cannot be empty');
  });

  it('throws on whitespace-only string', () => {
    expect(() => parseCombo('   ')).toThrow('combo string cannot be empty');
  });

  it('throws on empty key part', () => {
    expect(() => parseCombo('meta+')).toThrow('key part is empty');
  });

  it('throws on invalid modifier', () => {
    expect(() => parseCombo('invalid+b')).toThrow('invalid modifier "invalid"');
  });

  it('throws on multiple invalid modifiers', () => {
    expect(() => parseCombo('foo+bar+c')).toThrow('invalid modifier');
  });
});

describe('formatCombo', () => {
  it('formats key with no modifiers', () => {
    const result = formatCombo('escape', []);
    expect(result).toBe('escape');
  });

  it('formats key with single modifier', () => {
    const result = formatCombo('b', ['meta']);
    expect(result).toBe('meta+b');
  });

  it('formats key with multiple modifiers', () => {
    const result = formatCombo('b', ['meta', 'shift']);
    expect(result).toBe('meta+shift+b');
  });

  it('formats key with all modifiers', () => {
    const result = formatCombo('x', ['meta', 'ctrl', 'alt', 'shift']);
    expect(result).toBe('meta+ctrl+alt+shift+x');
  });

  it('joins modifiers and key with +', () => {
    const result = formatCombo('t', ['meta']);
    expect(result).toBe('meta+t');
  });

  it('handles special keys', () => {
    const result = formatCombo('enter', ['meta', 'shift']);
    expect(result).toBe('meta+shift+enter');
  });

  it('throws on empty key', () => {
    expect(() => formatCombo('', ['meta'])).toThrow('key cannot be empty');
  });

  it('throws on whitespace-only key', () => {
    expect(() => formatCombo('   ', ['meta'])).toThrow('key cannot be empty');
  });

  it('throws on invalid modifier', () => {
    expect(() => formatCombo('b', ['invalid'])).toThrow('invalid modifier "invalid"');
  });

  it('throws on invalid modifier in array', () => {
    expect(() => formatCombo('b', ['meta', 'foo'])).toThrow('invalid modifier "foo"');
  });

  it('handles empty modifiers array', () => {
    const result = formatCombo('k', []);
    expect(result).toBe('k');
  });

  it('is inverse of parseCombo for valid combos', () => {
    const original = 'meta+shift+b';
    const parsed = parseCombo(original);
    const formatted = formatCombo(parsed.key, parsed.modifiers);
    expect(formatted).toBe(original);
  });
});

describe('getEffectiveCombo', () => {
  it('returns override value when id exists in overrides', () => {
    const overrides = { 'toggle-sidebar': 'ctrl+b' };
    const result = getEffectiveCombo('toggle-sidebar', overrides);
    expect(result).toBe('ctrl+b');
  });

  it('returns null when override is null (disabled)', () => {
    const overrides = { 'toggle-sidebar': null };
    const result = getEffectiveCombo('toggle-sidebar', overrides);
    expect(result).toBeNull();
  });

  it('returns default combo when no override exists', () => {
    const overrides = {};
    const result = getEffectiveCombo('toggle-sidebar', overrides);
    expect(result).toBe('meta+b');
  });

  it('returns null for unknown id with no override', () => {
    const overrides = {};
    const result = getEffectiveCombo('unknown-keybinding', overrides);
    expect(result).toBeNull();
  });

  it('prefers override over default', () => {
    const overrides = { 'new-tab': 'ctrl+shift+t' };
    const result = getEffectiveCombo('new-tab', overrides);
    expect(result).toBe('ctrl+shift+t');
    // Verify the default is different
    const defaultResult = getEffectiveCombo('new-tab', {});
    expect(defaultResult).toBe('meta+t');
  });

  it('handles multiple overrides independently', () => {
    const overrides = {
      'toggle-sidebar': 'ctrl+1',
      'new-tab': null,
      'close-tab': 'alt+w',
    };
    expect(getEffectiveCombo('toggle-sidebar', overrides)).toBe('ctrl+1');
    expect(getEffectiveCombo('new-tab', overrides)).toBeNull();
    expect(getEffectiveCombo('close-tab', overrides)).toBe('alt+w');
  });

  it('returns default for ids not in override map', () => {
    const overrides = { 'toggle-sidebar': 'ctrl+b' };
    const result = getEffectiveCombo('new-tab', overrides);
    expect(result).toBe('meta+t');
  });
});

describe('DEFAULT_KEYBINDINGS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_KEYBINDINGS)).toBe(true);
    expect(DEFAULT_KEYBINDINGS.length).toBeGreaterThan(0);
  });

  it('has expected structure for each entry', () => {
    DEFAULT_KEYBINDINGS.forEach(binding => {
      expect(binding).toHaveProperty('id');
      expect(binding).toHaveProperty('label');
      expect(binding).toHaveProperty('defaultCombo');
      expect(binding).toHaveProperty('category');
      expect(binding).toHaveProperty('displaySymbol');
      
      expect(typeof binding.id).toBe('string');
      expect(typeof binding.label).toBe('string');
      expect(typeof binding.defaultCombo).toBe('string');
      expect(typeof binding.displaySymbol).toBe('string');
      
      expect(['View', 'Tabs', 'Sandbox', 'Developer', 'General']).toContain(binding.category);
    });
  });

  it('has no duplicate ids', () => {
    const ids = DEFAULT_KEYBINDINGS.map(b => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all defaultCombos are parseable by parseCombo', () => {
    DEFAULT_KEYBINDINGS.forEach(binding => {
      expect(() => parseCombo(binding.defaultCombo)).not.toThrow();
    });
  });

  it('contains expected common keybindings', () => {
    const ids = DEFAULT_KEYBINDINGS.map(b => b.id);
    
    // Check for some essential keybindings
    expect(ids).toContain('toggle-sidebar');
    expect(ids).toContain('new-tab');
    expect(ids).toContain('close-tab');
    expect(ids).toContain('command-palette');
    expect(ids).toContain('stop-agent');
  });

  it('has unique defaultCombo values', () => {
    const combos = DEFAULT_KEYBINDINGS.map(b => b.defaultCombo);
    const uniqueCombos = new Set(combos);
    expect(uniqueCombos.size).toBe(combos.length);
  });

  it('has non-empty labels', () => {
    DEFAULT_KEYBINDINGS.forEach(binding => {
      expect(binding.label.length).toBeGreaterThan(0);
    });
  });

  it('has non-empty display symbols', () => {
    DEFAULT_KEYBINDINGS.forEach(binding => {
      expect(binding.displaySymbol.length).toBeGreaterThan(0);
    });
  });
});
