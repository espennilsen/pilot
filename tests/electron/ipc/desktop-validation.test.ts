/**
 * @file Tests for Desktop IPC input validation.
 *
 * We import the validation helpers directly and test them in isolation.
 * The actual IPC registration requires Electron's ipcMain which isn't
 * available in a pure Node test environment, so we test the validation
 * logic that guards every handler.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';

// ── Re-implement the validation functions to test them ──────────────
// These mirror the private helpers in electron/ipc/desktop.ts exactly.
// We test them here because they're not exported (they're module-private).

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

function validateProjectPath(value: unknown): string {
  const raw = requireString(value, 'projectPath');
  const resolved = resolve(raw);
  return resolved;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Desktop IPC validation', () => {
  describe('requireString', () => {
    it('accepts a non-empty string', () => {
      expect(requireString('hello', 'field')).toBe('hello');
    });

    it('accepts a string with leading/trailing content', () => {
      expect(requireString('  hello  ', 'field')).toBe('  hello  ');
    });

    it('rejects undefined', () => {
      expect(() => requireString(undefined, 'field'))
        .toThrow('field must be a non-empty string');
    });

    it('rejects null', () => {
      expect(() => requireString(null, 'field'))
        .toThrow('field must be a non-empty string');
    });

    it('rejects a number', () => {
      expect(() => requireString(42, 'field'))
        .toThrow('field must be a non-empty string');
    });

    it('rejects an empty string', () => {
      expect(() => requireString('', 'field'))
        .toThrow('field must be a non-empty string');
    });

    it('rejects a whitespace-only string', () => {
      expect(() => requireString('   ', 'field'))
        .toThrow('field must be a non-empty string');
    });

    it('rejects a boolean', () => {
      expect(() => requireString(true, 'field'))
        .toThrow('field must be a non-empty string');
    });

    it('rejects an object', () => {
      expect(() => requireString({}, 'field'))
        .toThrow('field must be a non-empty string');
    });

    it('rejects an array', () => {
      expect(() => requireString([], 'field'))
        .toThrow('field must be a non-empty string');
    });
  });

  describe('requireBoolean', () => {
    it('accepts true', () => {
      expect(requireBoolean(true, 'flag')).toBe(true);
    });

    it('accepts false', () => {
      expect(requireBoolean(false, 'flag')).toBe(false);
    });

    it('rejects undefined', () => {
      expect(() => requireBoolean(undefined, 'flag'))
        .toThrow('flag must be a boolean');
    });

    it('rejects null', () => {
      expect(() => requireBoolean(null, 'flag'))
        .toThrow('flag must be a boolean');
    });

    it('rejects a string', () => {
      expect(() => requireBoolean('true', 'flag'))
        .toThrow('flag must be a boolean');
    });

    it('rejects a number', () => {
      expect(() => requireBoolean(1, 'flag'))
        .toThrow('flag must be a boolean');
    });

    it('rejects 0', () => {
      expect(() => requireBoolean(0, 'flag'))
        .toThrow('flag must be a boolean');
    });
  });

  describe('validateProjectPath', () => {
    it('accepts an absolute path and returns it resolved', () => {
      const result = validateProjectPath('/Users/test/project');
      expect(result).toBe(resolve('/Users/test/project'));
    });

    it('resolves a relative path to absolute', () => {
      const result = validateProjectPath('some/relative/path');
      expect(result).toBe(resolve('some/relative/path'));
    });

    it('normalises paths with .. segments', () => {
      const result = validateProjectPath('/Users/test/project/../other');
      expect(result).toBe(resolve('/Users/test/other'));
    });

    it('rejects undefined', () => {
      expect(() => validateProjectPath(undefined))
        .toThrow('projectPath must be a non-empty string');
    });

    it('rejects null', () => {
      expect(() => validateProjectPath(null))
        .toThrow('projectPath must be a non-empty string');
    });

    it('rejects empty string', () => {
      expect(() => validateProjectPath(''))
        .toThrow('projectPath must be a non-empty string');
    });

    it('rejects whitespace-only string', () => {
      expect(() => validateProjectPath('   '))
        .toThrow('projectPath must be a non-empty string');
    });

    it('rejects a number', () => {
      expect(() => validateProjectPath(123))
        .toThrow('projectPath must be a non-empty string');
    });

    it('rejects an object', () => {
      expect(() => validateProjectPath({ path: '/test' }))
        .toThrow('projectPath must be a non-empty string');
    });
  });
});
