import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { relativeTime, truncate, generateId } from '../../../src/lib/utils';

describe('relativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp30sAgo = now.getTime() - 30 * 1000;
    expect(relativeTime(timestamp30sAgo)).toBe('just now');
  });

  it('returns "just now" for 0 seconds ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    expect(relativeTime(now.getTime())).toBe('just now');
  });

  it('returns minutes for timestamps less than 1 hour ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp5mAgo = now.getTime() - 5 * 60 * 1000;
    expect(relativeTime(timestamp5mAgo)).toBe('5m ago');
  });

  it('returns minutes for 59 minutes ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp59mAgo = now.getTime() - 59 * 60 * 1000;
    expect(relativeTime(timestamp59mAgo)).toBe('59m ago');
  });

  it('returns hours for timestamps less than 24 hours ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp3hAgo = now.getTime() - 3 * 3600 * 1000;
    expect(relativeTime(timestamp3hAgo)).toBe('3h ago');
  });

  it('returns hours for 23 hours ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp23hAgo = now.getTime() - 23 * 3600 * 1000;
    expect(relativeTime(timestamp23hAgo)).toBe('23h ago');
  });

  it('returns days for timestamps less than 1 week ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp3dAgo = now.getTime() - 3 * 86400 * 1000;
    expect(relativeTime(timestamp3dAgo)).toBe('3d ago');
  });

  it('returns days for 6 days ago', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp6dAgo = now.getTime() - 6 * 86400 * 1000;
    expect(relativeTime(timestamp6dAgo)).toBe('6d ago');
  });

  it('returns localized date string for timestamps 1 week or older', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp8dAgo = new Date('2024-01-07T12:00:00Z');
    const result = relativeTime(timestamp8dAgo.getTime());
    expect(result).toBe(timestamp8dAgo.toLocaleDateString());
  });

  it('accepts ISO string timestamp', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp5mAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(relativeTime(timestamp5mAgo.toISOString())).toBe('5m ago');
  });

  it('accepts number timestamp (ms epoch)', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp10mAgo = now.getTime() - 10 * 60 * 1000;
    expect(relativeTime(timestamp10mAgo)).toBe('10m ago');
  });

  it('handles edge case at exactly 60 seconds', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp60sAgo = now.getTime() - 60 * 1000;
    expect(relativeTime(timestamp60sAgo)).toBe('1m ago');
  });

  it('handles edge case at exactly 1 hour', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp1hAgo = now.getTime() - 3600 * 1000;
    expect(relativeTime(timestamp1hAgo)).toBe('1h ago');
  });

  it('handles edge case at exactly 1 day', () => {
    const now = new Date('2024-01-01T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp1dAgo = now.getTime() - 86400 * 1000;
    expect(relativeTime(timestamp1dAgo)).toBe('1d ago');
  });

  it('handles edge case at exactly 1 week', () => {
    const now = new Date('2024-01-08T12:00:00Z');
    vi.setSystemTime(now);
    
    const timestamp1wAgo = new Date('2024-01-01T12:00:00Z');
    const result = relativeTime(timestamp1wAgo.getTime());
    expect(result).toBe(timestamp1wAgo.toLocaleDateString());
  });
});

describe('truncate', () => {
  it('returns text unchanged when length equals maxLength', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('returns text unchanged when length is less than maxLength', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('truncates text longer than maxLength and adds ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('truncates to maxLength - 3 characters plus ellipsis', () => {
    const text = 'this is a very long string';
    const result = truncate(text, 10);
    expect(result).toBe('this is...');
    expect(result.length).toBe(10);
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles maxLength of 3 (minimum for ellipsis)', () => {
    expect(truncate('hello', 3)).toBe('...');
  });

  it('handles maxLength of 4', () => {
    expect(truncate('hello', 4)).toBe('h...');
  });

  it('handles very long text', () => {
    const longText = 'a'.repeat(1000);
    const result = truncate(longText, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith('...')).toBe(true);
  });

  it('preserves content when maxLength is larger than text', () => {
    expect(truncate('short', 100)).toBe('short');
  });

  it('handles single character text', () => {
    expect(truncate('a', 10)).toBe('a');
    expect(truncate('a', 1)).toBe('a');
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('returns a UUID-like string (36 characters with hyphens)', () => {
    const id = generateId();
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns unique IDs on multiple calls', () => {
    const id1 = generateId();
    const id2 = generateId();
    const id3 = generateId();
    
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });

  it('generates IDs with correct length', () => {
    const id = generateId();
    expect(id.length).toBe(36);
  });
});
