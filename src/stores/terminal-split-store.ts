/**
 * @file Terminal split store — manages recursive tree of terminal split panes.
 */
import { create } from 'zustand';
import { useUIStore } from './ui-store';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  id: string;
  type: 'leaf' | 'split';
  terminalId?: string | null;
  direction?: SplitDirection;
  first?: SplitNode;
  second?: SplitNode;
  ratio?: number;
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

function makeLeaf(terminalId: string | null): SplitNode {
  return { id: uid(), type: 'leaf', terminalId };
}

function makeSplit(direction: SplitDirection, first: SplitNode, second: SplitNode): SplitNode {
  return { id: uid(), type: 'split', direction, first, second, ratio: 0.5 };
}

function findNode(root: SplitNode | null, id: string): SplitNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  if (root.type === 'split') {
    return findNode(root.first!, id) ?? findNode(root.second!, id);
  }
  return null;
}

function findParent(root: SplitNode, id: string): { parent: SplitNode; side: 'first' | 'second' } | null {
  if (root.type === 'leaf') return null;
  if (root.first?.id === id) return { parent: root, side: 'first' };
  if (root.second?.id === id) return { parent: root, side: 'second' };
  return findParent(root.first!, id) ?? findParent(root.second!, id);
}

function getLeaves(root: SplitNode | null): SplitNode[] {
  if (!root) return [];
  if (root.type === 'leaf') return [root];
  return [...getLeaves(root.first!), ...getLeaves(root.second!)];
}

function replaceNode(root: SplitNode, id: string, replacement: SplitNode): SplitNode {
  if (root.id === id) return replacement;
  if (root.type === 'split') {
    return {
      ...root,
      first: root.first ? replaceNode(root.first, id, replacement) : undefined,
      second: root.second ? replaceNode(root.second, id, replacement) : undefined,
    };
  }
  return root;
}

interface TerminalSplitStore {
  root: SplitNode | null;
  init: () => void;
  splitPane: (nodeId: string, direction: SplitDirection) => void;
  closePane: (nodeId: string) => void;
  setPaneTerminalId: (nodeId: string, terminalId: string | null) => void;
  setRatio: (nodeId: string, ratio: number) => void;
  getLeaves: () => SplitNode[];
  findNode: (nodeId: string) => SplitNode | null;
  splitTab: (terminalId: string, direction: SplitDirection) => void;
  collapseToSingle: () => void;
  reset: () => void;
}

export const useTerminalSplitStore = create<TerminalSplitStore>((set, get) => ({
  root: null,

  init: () => {
    const { activeTerminalId, addTerminalTab } = useUIStore.getState();
    const termId = activeTerminalId ?? addTerminalTab();
    set({ root: makeLeaf(termId) });
  },

  splitPane: (nodeId, direction) => {
    const { root } = get();
    const node = findNode(root, nodeId);
    if (!node || node.type !== 'leaf') return;

    const { terminalTabs, activeTerminalId, addTerminalTab } = useUIStore.getState();
    const otherTab = terminalTabs.filter(t => t.id !== activeTerminalId && t.id !== node.terminalId)[0];
    const secondTerminalId = otherTab?.id ?? addTerminalTab();

    const firstChild = makeLeaf(node.terminalId ?? null);
    const secondChild = makeLeaf(secondTerminalId);
    const splitNode = makeSplit(direction, firstChild, secondChild);

    const newRoot = root ? replaceNode(root, nodeId, splitNode) : splitNode;
    set({ root: newRoot });
  },

  closePane: (nodeId) => {
    const { root } = get();
    if (!root || root.type === 'leaf') return;

    const parentInfo = findParent(root, nodeId);
    if (!parentInfo) return;

    const { parent, side } = parentInfo;
    const sibling = side === 'first' ? parent.second! : parent.first!;

    let newRoot: SplitNode;
    if (parent === root) {
      newRoot = sibling;
    } else {
      newRoot = replaceNode(root, parent.id, sibling);
    }

    set({ root: newRoot });
  },

  setPaneTerminalId: (nodeId, terminalId) => {
    const { root } = get();
    if (!root) return;
    const node = findNode(root, nodeId);
    if (!node || node.type !== 'leaf') return;
    const newRoot = replaceNode(root, nodeId, { ...node, terminalId });
    set({ root: newRoot });
  },

  setRatio: (nodeId, ratio) => {
    const { root } = get();
    if (!root) return;
    const node = findNode(root, nodeId);
    if (!node || node.type !== 'split') return;
    const clamped = Math.max(0.15, Math.min(0.85, ratio));
    const newRoot = replaceNode(root, nodeId, { ...node, ratio: clamped });
    set({ root: newRoot });
  },

  getLeaves: () => getLeaves(get().root),

  findNode: (nodeId) => findNode(get().root, nodeId),

  splitTab: (terminalId, direction) => {
    const { root } = get();
    const leaf = getLeaves(root).find(l => l.terminalId === terminalId);
    if (!leaf) return;
    get().splitPane(leaf.id, direction);
  },

  collapseToSingle: () => {
    const { activeTerminalId } = useUIStore.getState();
    set({ root: makeLeaf(activeTerminalId) });
  },

  reset: () => set({ root: null }),
}));
