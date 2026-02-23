import type { StagedDiff } from '../../shared/types';

export class StagedDiffManager {
  private diffs = new Map<string, StagedDiff[]>(); // tabId -> diffs

  addDiff(diff: StagedDiff): void {
    const tabDiffs = this.diffs.get(diff.tabId) ?? [];
    tabDiffs.push(diff);
    this.diffs.set(diff.tabId, tabDiffs);
  }

  getDiffs(tabId: string): StagedDiff[] {
    return this.diffs.get(tabId) ?? [];
  }

  getDiff(tabId: string, diffId: string): StagedDiff | undefined {
    return this.getDiffs(tabId).find(d => d.id === diffId);
  }

  updateStatus(tabId: string, diffId: string, status: StagedDiff['status']): void {
    const diffs = this.getDiffs(tabId);
    const diff = diffs.find(d => d.id === diffId);
    if (diff) {
      diff.status = status;
    }
  }

  getPending(tabId: string): StagedDiff[] {
    return this.getDiffs(tabId).filter(d => d.status === 'pending');
  }

  clearTab(tabId: string): void {
    this.diffs.delete(tabId);
  }

  clearAll(): void {
    this.diffs.clear();
  }
}
