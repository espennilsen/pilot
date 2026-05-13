import { create } from 'zustand';
import { useTabStore } from './tab-store';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitLayout {
  mode: 'single' | 'split';
  direction: SplitDirection;
  secondaryTabId: string | null;
  splitRatio: number;
}

const DEFAULT_LAYOUT: SplitLayout = {
  mode: 'single', direction: 'vertical', secondaryTabId: null, splitRatio: 0.5,
};

interface SplitPaneStore {
  layout: SplitLayout;
  split: (direction: SplitDirection) => void;
  unsplit: () => void;
  setSecondaryTabId: (tabId: string | null) => void;
  setSplitRatio: (ratio: number) => void;
  reset: () => void;
  getPaneTabIds: () => [string | null, string | null];
}

export const useSplitPaneStore = create<SplitPaneStore>((set, get) => ({
  layout: { ...DEFAULT_LAYOUT },

  split: (direction) => {
    const { tabs, activeTabId } = useTabStore.getState();
    const secondaryTab = tabs
      .filter(t => t.id !== activeTabId && t.type === 'chat')
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];
    let secondaryTabId = secondaryTab?.id ?? null;
    if (!secondaryTabId) secondaryTabId = useTabStore.getState().addTab();
    set({ layout: { mode: 'split', direction, secondaryTabId, splitRatio: 0.5 } });
  },

  unsplit: () => set({ layout: { ...DEFAULT_LAYOUT } }),

  setSecondaryTabId: (tabId) => set(s => ({ layout: { ...s.layout, secondaryTabId: tabId } })),

  setSplitRatio: (ratio) => set(s => ({ layout: { ...s.layout, splitRatio: Math.max(0.15, Math.min(0.85, ratio)) } })),

  reset: () => set({ layout: { ...DEFAULT_LAYOUT } }),

  getPaneTabIds: () => {
    const { activeTabId } = useTabStore.getState();
    const { layout } = get();
    return layout.mode === 'single' ? [activeTabId, null] : [activeTabId, layout.secondaryTabId];
  },
}));
