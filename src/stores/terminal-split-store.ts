import { create } from 'zustand';
import { useUIStore } from './ui-store';

export type SplitDirection = 'horizontal' | 'vertical';

export interface TerminalSplitLayout {
  mode: 'single' | 'split';
  direction: SplitDirection;
  secondaryTerminalId: string | null;
  splitRatio: number;
}

const DEFAULT_LAYOUT: TerminalSplitLayout = {
  mode: 'single',
  direction: 'vertical',
  secondaryTerminalId: null,
  splitRatio: 0.5,
};

interface TerminalSplitStore {
  layout: TerminalSplitLayout;
  split: (direction: SplitDirection) => void;
  unsplit: () => void;
  setSecondaryTerminalId: (id: string | null) => void;
  setSplitRatio: (ratio: number) => void;
  reset: () => void;
  getPaneTerminalIds: () => [string | null, string | null];
}

export const useTerminalSplitStore = create<TerminalSplitStore>((set, get) => ({
  layout: { ...DEFAULT_LAYOUT },

  split: (direction) => {
    const { terminalTabs, activeTerminalId, addTerminalTab } = useUIStore.getState();
    const secondaryTab = terminalTabs.filter((t) => t.id !== activeTerminalId)[0];
    let secondaryTerminalId = secondaryTab?.id ?? null;
    if (!secondaryTerminalId) secondaryTerminalId = addTerminalTab();
    set({ layout: { mode: 'split', direction, secondaryTerminalId, splitRatio: 0.5 } });
  },

  unsplit: () => set({ layout: { ...DEFAULT_LAYOUT } }),

  setSecondaryTerminalId: (id) =>
    set((s) => ({ layout: { ...s.layout, secondaryTerminalId: id } })),

  setSplitRatio: (ratio) =>
    set((s) => ({
      layout: {
        ...s.layout,
        splitRatio: Math.max(0.15, Math.min(0.85, ratio)),
      },
    })),

  reset: () => set({ layout: { ...DEFAULT_LAYOUT } }),

  getPaneTerminalIds: () => {
    const { activeTerminalId } = useUIStore.getState();
    const { layout } = get();
    return layout.mode === 'single'
      ? [activeTerminalId, null]
      : [activeTerminalId, layout.secondaryTerminalId];
  },
}));
