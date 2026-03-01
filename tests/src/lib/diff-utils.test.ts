import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, computeSimpleDiff, formatDiffStats, type DiffLine } from '../../../src/lib/diff-utils';

describe('parseUnifiedDiff', () => {
  it('returns empty array for empty string', () => {
    const result = parseUnifiedDiff('');
    expect(result).toEqual([]);
  });

  it('parses hunk header and sets line numbers', () => {
    const diff = '@@ -10,7 +10,8 @@\n unchanged line\n+added line\n-removed line';
    const result = parseUnifiedDiff(diff);
    
    expect(result[0]).toEqual({
      type: 'unchanged',
      content: 'unchanged line',
      oldLineNumber: 10,
      newLineNumber: 10,
    });
    expect(result[1]).toEqual({
      type: 'added',
      content: 'added line',
      newLineNumber: 11,
    });
    expect(result[2]).toEqual({
      type: 'removed',
      content: 'removed line',
      oldLineNumber: 11,
    });
  });

  it('handles added lines (+)', () => {
    const diff = '@@ -1,0 +1,2 @@\n+first line\n+second line';
    const result = parseUnifiedDiff(diff);
    
    expect(result).toEqual([
      { type: 'added', content: 'first line', newLineNumber: 1 },
      { type: 'added', content: 'second line', newLineNumber: 2 },
    ]);
  });

  it('handles removed lines (-)', () => {
    const diff = '@@ -1,2 +1,0 @@\n-first line\n-second line';
    const result = parseUnifiedDiff(diff);
    
    expect(result).toEqual([
      { type: 'removed', content: 'first line', oldLineNumber: 1 },
      { type: 'removed', content: 'second line', oldLineNumber: 2 },
    ]);
  });

  it('handles unchanged lines (space prefix)', () => {
    const diff = '@@ -5,3 +5,3 @@\n context 1\n context 2\n context 3';
    const result = parseUnifiedDiff(diff);
    
    expect(result).toEqual([
      { type: 'unchanged', content: 'context 1', oldLineNumber: 5, newLineNumber: 5 },
      { type: 'unchanged', content: 'context 2', oldLineNumber: 6, newLineNumber: 6 },
      { type: 'unchanged', content: 'context 3', oldLineNumber: 7, newLineNumber: 7 },
    ]);
  });

  it('tracks line numbers correctly through mixed changes', () => {
    const diff = `@@ -10,5 +10,6 @@
 unchanged 1
-removed 1
+added 1
+added 2
 unchanged 2`;
    const result = parseUnifiedDiff(diff);
    
    expect(result).toEqual([
      { type: 'unchanged', content: 'unchanged 1', oldLineNumber: 10, newLineNumber: 10 },
      { type: 'removed', content: 'removed 1', oldLineNumber: 11 },
      { type: 'added', content: 'added 1', newLineNumber: 11 },
      { type: 'added', content: 'added 2', newLineNumber: 12 },
      { type: 'unchanged', content: 'unchanged 2', oldLineNumber: 12, newLineNumber: 13 },
    ]);
  });

  it('handles multiple hunks', () => {
    const diff = `@@ -1,2 +1,2 @@
 line 1
-old line 2
+new line 2
@@ -10,2 +10,2 @@
-old line 10
+new line 10
 line 11`;
    const result = parseUnifiedDiff(diff);
    
    expect(result.length).toBe(6);
    expect(result[0]).toEqual({ type: 'unchanged', content: 'line 1', oldLineNumber: 1, newLineNumber: 1 });
    expect(result[1]).toEqual({ type: 'removed', content: 'old line 2', oldLineNumber: 2 });
    expect(result[2]).toEqual({ type: 'added', content: 'new line 2', newLineNumber: 2 });
    expect(result[3]).toEqual({ type: 'removed', content: 'old line 10', oldLineNumber: 10 });
    expect(result[4]).toEqual({ type: 'added', content: 'new line 10', newLineNumber: 10 });
    expect(result[5]).toEqual({ type: 'unchanged', content: 'line 11', oldLineNumber: 11, newLineNumber: 11 });
  });

  it('ignores empty lines in diff', () => {
    const diff = '@@ -1,2 +1,2 @@\n\n line 1\n+added\n\n-removed';
    const result = parseUnifiedDiff(diff);
    
    expect(result.length).toBe(3);
    expect(result[0].type).toBe('unchanged');
    expect(result[1].type).toBe('added');
    expect(result[2].type).toBe('removed');
  });

  it('handles hunk header without line count', () => {
    const diff = '@@ -10 +10 @@\n changed line';
    const result = parseUnifiedDiff(diff);
    
    expect(result[0]).toEqual({
      type: 'unchanged',
      content: 'changed line',
      oldLineNumber: 10,
      newLineNumber: 10,
    });
  });

  it('strips prefix character from content', () => {
    const diff = '@@ -1,3 +1,3 @@\n unchanged\n+added\n-removed';
    const result = parseUnifiedDiff(diff);
    
    expect(result[0].content).toBe('unchanged');
    expect(result[1].content).toBe('added');
    expect(result[2].content).toBe('removed');
  });
});

describe('computeSimpleDiff', () => {
  it('treats new file (oldText is null) as all added lines', () => {
    const result = computeSimpleDiff(null, 'line 1\nline 2\nline 3');
    
    expect(result).toEqual([
      { type: 'added', content: 'line 1', newLineNumber: 1 },
      { type: 'added', content: 'line 2', newLineNumber: 2 },
      { type: 'added', content: 'line 3', newLineNumber: 3 },
    ]);
  });

  it('treats deleted file (newText is empty) as all removed lines', () => {
    const result = computeSimpleDiff('line 1\nline 2\nline 3', '');
    
    expect(result).toEqual([
      { type: 'removed', content: 'line 1', oldLineNumber: 1 },
      { type: 'removed', content: 'line 2', oldLineNumber: 2 },
      { type: 'removed', content: 'line 3', oldLineNumber: 3 },
    ]);
  });

  it('treats identical content as all unchanged', () => {
    const text = 'line 1\nline 2\nline 3';
    const result = computeSimpleDiff(text, text);
    
    expect(result).toEqual([
      { type: 'unchanged', content: 'line 1', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'unchanged', content: 'line 2', oldLineNumber: 2, newLineNumber: 2 },
      { type: 'unchanged', content: 'line 3', oldLineNumber: 3, newLineNumber: 3 },
    ]);
  });

  it('handles single line change', () => {
    const oldText = 'line 1\nold line 2\nline 3';
    const newText = 'line 1\nnew line 2\nline 3';
    const result = computeSimpleDiff(oldText, newText);
    
    expect(result[0]).toEqual({ type: 'unchanged', content: 'line 1', oldLineNumber: 1, newLineNumber: 1 });
    expect(result[1]).toEqual({ type: 'removed', content: 'old line 2', oldLineNumber: 2 });
    expect(result[2]).toEqual({ type: 'added', content: 'new line 2', newLineNumber: 2 });
    expect(result[3]).toEqual({ type: 'unchanged', content: 'line 3', oldLineNumber: 3, newLineNumber: 3 });
  });

  it('handles multiple changes with context lines', () => {
    const oldText = 'a\nb\nc\nd\ne';
    const newText = 'a\nX\nc\nY\ne';
    const result = computeSimpleDiff(oldText, newText);
    
    expect(result[0]).toEqual({ type: 'unchanged', content: 'a', oldLineNumber: 1, newLineNumber: 1 });
    expect(result[1]).toEqual({ type: 'removed', content: 'b', oldLineNumber: 2 });
    expect(result[2]).toEqual({ type: 'added', content: 'X', newLineNumber: 2 });
    expect(result[3]).toEqual({ type: 'unchanged', content: 'c', oldLineNumber: 3, newLineNumber: 3 });
    expect(result[4]).toEqual({ type: 'removed', content: 'd', oldLineNumber: 4 });
    expect(result[5]).toEqual({ type: 'added', content: 'Y', newLineNumber: 4 });
    expect(result[6]).toEqual({ type: 'unchanged', content: 'e', oldLineNumber: 5, newLineNumber: 5 });
  });

  it('handles undefined oldText as null', () => {
    const result = computeSimpleDiff(undefined, 'new content');
    
    expect(result).toEqual([
      { type: 'added', content: 'new content', newLineNumber: 1 },
    ]);
  });

  it('handles undefined newText as empty string', () => {
    const result = computeSimpleDiff('old content', undefined);
    
    expect(result).toEqual([
      { type: 'removed', content: 'old content', oldLineNumber: 1 },
    ]);
  });

  it('handles addition of lines at end', () => {
    const oldText = 'line 1\nline 2';
    const newText = 'line 1\nline 2\nline 3\nline 4';
    const result = computeSimpleDiff(oldText, newText);
    
    expect(result[0]).toEqual({ type: 'unchanged', content: 'line 1', oldLineNumber: 1, newLineNumber: 1 });
    expect(result[1]).toEqual({ type: 'unchanged', content: 'line 2', oldLineNumber: 2, newLineNumber: 2 });
    expect(result[2]).toEqual({ type: 'added', content: 'line 3', newLineNumber: 3 });
    expect(result[3]).toEqual({ type: 'added', content: 'line 4', newLineNumber: 4 });
  });

  it('handles removal of lines at end', () => {
    const oldText = 'line 1\nline 2\nline 3\nline 4';
    const newText = 'line 1\nline 2';
    const result = computeSimpleDiff(oldText, newText);
    
    expect(result[0]).toEqual({ type: 'unchanged', content: 'line 1', oldLineNumber: 1, newLineNumber: 1 });
    expect(result[1]).toEqual({ type: 'unchanged', content: 'line 2', oldLineNumber: 2, newLineNumber: 2 });
    expect(result[2]).toEqual({ type: 'removed', content: 'line 3', oldLineNumber: 3 });
    expect(result[3]).toEqual({ type: 'removed', content: 'line 4', oldLineNumber: 4 });
  });

  it('handles addition of lines at beginning', () => {
    const oldText = 'line 3\nline 4';
    const newText = 'line 1\nline 2\nline 3\nline 4';
    const result = computeSimpleDiff(oldText, newText);
    
    // The simple diff algorithm treats this as changes, not pure additions
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(line => line.type === 'added')).toBe(true);
  });

  it('handles empty strings for both old and new', () => {
    const result = computeSimpleDiff('', '');
    
    // When newText is empty, treated as deleted file (all removed)
    expect(result).toEqual([
      { type: 'removed', content: '', oldLineNumber: 1 },
    ]);
  });

  it('handles single line files', () => {
    const result = computeSimpleDiff('old', 'new');
    
    expect(result).toEqual([
      { type: 'removed', content: 'old', oldLineNumber: 1 },
      { type: 'added', content: 'new', newLineNumber: 1 },
    ]);
  });

  it('uses lookahead to find matches', () => {
    const oldText = 'a\nb\nc\nd';
    const newText = 'a\nx\ny\nc\nd';
    const result = computeSimpleDiff(oldText, newText);
    
    // Should recognize 'a' as unchanged, 'b' as removed, 'x' and 'y' as added, then 'c' and 'd' as unchanged
    expect(result[0].type).toBe('unchanged');
    expect(result[0].content).toBe('a');
    expect(result.some(line => line.content === 'c' && line.type === 'unchanged')).toBe(true);
    expect(result.some(line => line.content === 'd' && line.type === 'unchanged')).toBe(true);
  });
});

describe('formatDiffStats', () => {
  it('returns 0 for empty array', () => {
    const result = formatDiffStats([]);
    expect(result).toEqual({ added: 0, removed: 0 });
  });

  it('counts added lines', () => {
    const diff: DiffLine[] = [
      { type: 'added', content: 'line 1', newLineNumber: 1 },
      { type: 'added', content: 'line 2', newLineNumber: 2 },
      { type: 'added', content: 'line 3', newLineNumber: 3 },
    ];
    const result = formatDiffStats(diff);
    expect(result).toEqual({ added: 3, removed: 0 });
  });

  it('counts removed lines', () => {
    const diff: DiffLine[] = [
      { type: 'removed', content: 'line 1', oldLineNumber: 1 },
      { type: 'removed', content: 'line 2', oldLineNumber: 2 },
    ];
    const result = formatDiffStats(diff);
    expect(result).toEqual({ added: 0, removed: 2 });
  });

  it('ignores unchanged lines', () => {
    const diff: DiffLine[] = [
      { type: 'unchanged', content: 'line 1', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'unchanged', content: 'line 2', oldLineNumber: 2, newLineNumber: 2 },
      { type: 'unchanged', content: 'line 3', oldLineNumber: 3, newLineNumber: 3 },
    ];
    const result = formatDiffStats(diff);
    expect(result).toEqual({ added: 0, removed: 0 });
  });

  it('counts mixed diff types correctly', () => {
    const diff: DiffLine[] = [
      { type: 'unchanged', content: 'line 1', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'removed', content: 'old line 2', oldLineNumber: 2 },
      { type: 'added', content: 'new line 2', newLineNumber: 2 },
      { type: 'added', content: 'new line 3', newLineNumber: 3 },
      { type: 'unchanged', content: 'line 4', oldLineNumber: 3, newLineNumber: 4 },
      { type: 'removed', content: 'old line 5', oldLineNumber: 4 },
    ];
    const result = formatDiffStats(diff);
    expect(result).toEqual({ added: 2, removed: 2 });
  });

  it('handles large diffs', () => {
    const diff: DiffLine[] = [];
    for (let i = 0; i < 100; i++) {
      diff.push({ type: 'added', content: `line ${i}`, newLineNumber: i });
    }
    for (let i = 0; i < 50; i++) {
      diff.push({ type: 'removed', content: `old ${i}`, oldLineNumber: i });
    }
    const result = formatDiffStats(diff);
    expect(result).toEqual({ added: 100, removed: 50 });
  });

  it('handles diff with only unchanged lines', () => {
    const diff: DiffLine[] = [
      { type: 'unchanged', content: 'a', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'unchanged', content: 'b', oldLineNumber: 2, newLineNumber: 2 },
    ];
    const result = formatDiffStats(diff);
    expect(result).toEqual({ added: 0, removed: 0 });
  });
});
