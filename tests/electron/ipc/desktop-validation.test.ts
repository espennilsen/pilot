/**
 * @file Tests for Desktop IPC input validation.
 *
 * Imports the real validation helpers from electron/utils/ipc-validation.ts
 * to test the actual security guards (including the homedir path check).
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { homedir } from 'os';
import { requireString, requireBoolean, validateProjectPath } from '../../../electron/utils/ipc-validation';

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
    it('accepts a path within the home directory', () => {
      const home = homedir();
      const testPath = `${home}/projects/my-app`;
      const result = validateProjectPath(testPath);
      expect(result).toBe(resolve(testPath));
    });

    it('resolves a relative path to absolute', () => {
      // Relative paths resolve against cwd, which is under home in test envs
      const result = validateProjectPath('some/relative/path');
      expect(result).toBe(resolve('some/relative/path'));
    });

    it('normalises paths with .. segments', () => {
      const home = homedir();
      const result = validateProjectPath(`${home}/projects/../other`);
      expect(result).toBe(resolve(`${home}/other`));
    });

    // Path traversal tests — these only apply on non-Windows platforms
    // because the Windows codepath allows any absolute drive path.
    if (process.platform !== 'win32') {
      it('rejects /etc (outside home directory)', () => {
        expect(() => validateProjectPath('/etc'))
          .toThrow('Project path must be within the home directory');
      });

      it('rejects /tmp/attack (outside home directory)', () => {
        expect(() => validateProjectPath('/tmp/attack'))
          .toThrow('Project path must be within the home directory');
      });

      it('rejects / (root path)', () => {
        expect(() => validateProjectPath('/'))
          .toThrow('Project path must be within the home directory');
      });

      it('rejects path traversal escaping home via ..', () => {
        const home = homedir();
        expect(() => validateProjectPath(`${home}/../../etc/passwd`))
          .toThrow('Project path must be within the home directory');
      });
    }

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
