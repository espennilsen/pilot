import { describe, it, expect, beforeEach } from 'vitest';
import { StagedDiffManager } from '../../../electron/services/staged-diffs';
import type { StagedDiff } from '../../../shared/types';

function makeDiff(overrides: Partial<StagedDiff> = {}): StagedDiff {
  return {
    id: 'diff-1',
    tabId: 'tab-1',
    toolCallId: 'tc-1',
    filePath: '/project/src/file.ts',
    operation: 'write' as const,
    content: 'new content',
    status: 'pending' as const,
    timestamp: Date.now(),
    ...overrides,
  } as StagedDiff;
}

describe('StagedDiffManager', () => {
  let manager: StagedDiffManager;

  beforeEach(() => {
    manager = new StagedDiffManager();
  });

  describe('addDiff', () => {
    it('adds a diff to the correct tab', () => {
      const diff = makeDiff();
      manager.addDiff(diff);
      expect(manager.getDiffs('tab-1')).toHaveLength(1);
      expect(manager.getDiffs('tab-1')[0]).toBe(diff);
    });

    it('appends multiple diffs to same tab', () => {
      manager.addDiff(makeDiff({ id: 'diff-1' }));
      manager.addDiff(makeDiff({ id: 'diff-2' }));
      expect(manager.getDiffs('tab-1')).toHaveLength(2);
    });

    it('keeps diffs separated by tab', () => {
      manager.addDiff(makeDiff({ tabId: 'tab-1' }));
      manager.addDiff(makeDiff({ tabId: 'tab-2' }));
      expect(manager.getDiffs('tab-1')).toHaveLength(1);
      expect(manager.getDiffs('tab-2')).toHaveLength(1);
    });
  });

  describe('getDiff', () => {
    it('finds a specific diff by id', () => {
      const diff = makeDiff({ id: 'target' });
      manager.addDiff(diff);
      expect(manager.getDiff('tab-1', 'target')).toBe(diff);
    });

    it('returns undefined for unknown diff id', () => {
      manager.addDiff(makeDiff());
      expect(manager.getDiff('tab-1', 'nonexistent')).toBeUndefined();
    });

    it('returns undefined for unknown tab id', () => {
      expect(manager.getDiff('unknown-tab', 'diff-1')).toBeUndefined();
    });
  });

  describe('getDiffs', () => {
    it('returns empty array for unknown tab', () => {
      expect(manager.getDiffs('unknown')).toEqual([]);
    });
  });

  describe('updateStatus', () => {
    it('updates diff status', () => {
      manager.addDiff(makeDiff({ id: 'diff-1', status: 'pending' as const }));
      manager.updateStatus('tab-1', 'diff-1', 'accepted');
      expect(manager.getDiff('tab-1', 'diff-1')?.status).toBe('accepted');
    });

    it('does nothing for unknown diff', () => {
      manager.addDiff(makeDiff());
      // should not throw
      manager.updateStatus('tab-1', 'nonexistent', 'rejected');
    });
  });

  describe('getPending', () => {
    it('returns only pending diffs', () => {
      manager.addDiff(makeDiff({ id: 'pending-1', status: 'pending' as const }));
      manager.addDiff(makeDiff({ id: 'accepted-1', status: 'accepted' as const }));
      manager.addDiff(makeDiff({ id: 'pending-2', status: 'pending' as const }));

      const pending = manager.getPending('tab-1');
      expect(pending).toHaveLength(2);
      expect(pending.map(d => d.id)).toEqual(['pending-1', 'pending-2']);
    });

    it('returns empty array when no pending diffs', () => {
      manager.addDiff(makeDiff({ status: 'accepted' as const }));
      expect(manager.getPending('tab-1')).toEqual([]);
    });
  });

  describe('clearTab', () => {
    it('removes all diffs for a tab', () => {
      manager.addDiff(makeDiff({ tabId: 'tab-1' }));
      manager.addDiff(makeDiff({ tabId: 'tab-2' }));
      manager.clearTab('tab-1');
      expect(manager.getDiffs('tab-1')).toEqual([]);
      expect(manager.getDiffs('tab-2')).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('removes all diffs from all tabs', () => {
      manager.addDiff(makeDiff({ tabId: 'tab-1' }));
      manager.addDiff(makeDiff({ tabId: 'tab-2' }));
      manager.clearAll();
      expect(manager.getDiffs('tab-1')).toEqual([]);
      expect(manager.getDiffs('tab-2')).toEqual([]);
    });
  });
});
