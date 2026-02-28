import { describe, it, expect } from 'vitest';
import { IPC } from '../../shared/ipc';

describe('IPC constants', () => {
  it('has no duplicate channel values', () => {
    const values = Object.values(IPC);
    const unique = new Set(values);
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
    expect(duplicates).toEqual([]);
    expect(unique.size).toBe(values.length);
  });

  it('all values are non-empty strings', () => {
    for (const [key, value] of Object.entries(IPC)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('all values follow domain:action naming convention', () => {
    for (const [key, value] of Object.entries(IPC)) {
      expect(value).toMatch(/^[a-z-]+:[a-z-]+$/);
    }
  });

  it('has expected core domains', () => {
    const domains = new Set(Object.values(IPC).map(v => v.split(':')[0]));
    expect(domains).toContain('agent');
    expect(domains).toContain('model');
    expect(domains).toContain('session');
    expect(domains).toContain('sandbox');
    expect(domains).toContain('git');
    expect(domains).toContain('project');
    expect(domains).toContain('terminal');
  });
});
