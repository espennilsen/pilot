import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expandHome, normalizePath, isWithinDir } from '../../../electron/utils/paths';
import { homedir } from 'os';
import { resolve } from 'path';

describe('expandHome', () => {
  const home = homedir();

  it('expands ~ alone to home directory', () => {
    expect(expandHome('~')).toBe(home);
  });

  it('expands ~/path to home + path', () => {
    const result = expandHome('~/Documents/project');
    expect(result).toBe(`${home}/Documents/project`);
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/usr/local/bin')).toBe('/usr/local/bin');
  });

  it('leaves relative paths unchanged', () => {
    expect(expandHome('relative/path')).toBe('relative/path');
  });

  it('leaves empty string unchanged', () => {
    expect(expandHome('')).toBe('');
  });

  it('handles ~/ with nested paths', () => {
    const result = expandHome('~/a/b/c/d');
    expect(result).toBe(`${home}/a/b/c/d`);
  });
});

describe('normalizePath', () => {
  it('resolves relative paths to absolute', () => {
    const result = normalizePath('some/relative');
    expect(result).toBe(resolve('some/relative'));
  });

  it('keeps absolute paths resolved', () => {
    const result = normalizePath('/tmp/test');
    expect(result).toBe(resolve('/tmp/test'));
  });
});

describe('isWithinDir', () => {
  it('returns true when child is inside parent', () => {
    expect(isWithinDir('/Users/test/project', '/Users/test/project/src/file.ts')).toBe(true);
  });

  it('returns true when child equals parent', () => {
    expect(isWithinDir('/Users/test/project', '/Users/test/project')).toBe(true);
  });

  it('returns false when child is outside parent', () => {
    expect(isWithinDir('/Users/test/project', '/Users/test/other/file.ts')).toBe(false);
  });

  it('returns false for sibling directories with shared prefix', () => {
    // /Users/test/project-extra is NOT within /Users/test/project
    expect(isWithinDir('/Users/test/project', '/Users/test/project-extra/file.ts')).toBe(false);
  });

  it('returns false when child tries to escape with ..', () => {
    // resolve will normalize the .., so /Users/test/project/../other => /Users/test/other
    expect(isWithinDir('/Users/test/project', '/Users/test/project/../other/file.ts')).toBe(false);
  });

  it('handles deeply nested child paths', () => {
    expect(isWithinDir('/project', '/project/a/b/c/d/e/f.ts')).toBe(true);
  });
});
