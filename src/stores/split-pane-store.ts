/**
 * @file Split pane store — manages recursive tree of chat split panes.
 * Each node is either a leaf (showing a tab) or a split (two children with direction/ratio).
 */
import { create } from 'zustand';
import { useTabStore } from './tab-store';

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  id: string;
  type: 'leaf' | 'split';
  // Leaf fields
  tabId?: string | null;
  // Split fields
  direction?: SplitDirection;
  first?: SplitNode;
  second?: SplitNode;
  ratio?: number; // 0-1, proportion for first child
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

function makeLeaf(tabId: string | null): SplitNode {
  return { id: uid(), type: 'leaf', tabId };
}

function makeSplit(direction: SplitDirection, first: SplitNode, second: SplitNode): SplitNode {
  return { id: uid(), type: 'split', direction, first, second, ratio: 0.5 };
}

interface SplitPaneStore {
  root: SplitNode | null;

  // Initialise the tree with a single leaf showing the active tab
  init: () => void;

  // Split a leaf node into two children (first keeps existing tab, second is empty)
  splitPane: (nodeId: string, direction: SplitDirection) => void;

  // Close/remove a leaf node (promotes sibling to replace parent split)
  closePane: (nodeId: string) => void;

  // Set the tab for a leaf node
  setPaneTab: (nodeId: string, tabId: string | null) => void;

  // Set the ratio for a split node
  setRatio: (nodeId: string, ratio: number) => void;

  // Get all leaf nodes (flattened)
  getLeaves: () => SplitNode[];

  // Find a node by ID (returns null if not found)
  findNode: (nodeId: string) => SplitNode | null;

  // Split the leaf node showing the given tabId
  splitTab: (tabId: string, direction: SplitDirection) => void;

  // Reset to empty
  splitTab: (tabId: string, direction: SplitDirection) => void;
  collapseToSingle: () => void;
  reset: () => void;
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

function findNode(root: SplitNode | null, id: string): SplitNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  if (root.type === 'split') {
    return findNode(root.first!, id) ?? findNode(root.second!, id);
  }
  return null;
}

function findParent(root: SplitNode | null, id: string): { parent: SplitNode | null; side: 'first' | 'second' } | null {
  if (!root || root.type === 'leaf') return null;
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

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSplitPaneStore = create<SplitPaneStore>((set, get) => ({
  root: null,

  init: () => {
    const { activeTabId } = useTabStore.getState();
    set({ root: makeLeaf(activeTabId) });
  },

  splitPane: (nodeId, direction) => {
    const { root } = get();
    const node = findNode(root, nodeId);
    if (!node || node.type !== 'leaf') return;

    // First child keeps existing tab; second gets a new chat tab or another existing tab
    const { tabs, activeTabId } = useTabStore.getState();
    const otherTab = tabs
      .filter(t => t.id !== activeTabId && t.id !== node.tabId && t.type === 'chat')
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];
    const secondTabId = otherTab?.id ?? null;

    const firstChild = makeLeaf(node.tabId ?? null);
    const secondChild = makeLeaf(secondTabId);
    const splitNode = makeSplit(direction, firstChild, secondChild);

    const newRoot = root ? replaceNode(root, nodeId, splitNode) : splitNode;
    set({ root: newRoot });
  },

  closePane: (nodeId) => {
    const { root } = get();
    if (!root) return;
    // If root is a leaf, nothing to close
    if (root.type === 'leaf') return;

    const parentInfo = findParent(root, nodeId);
    if (!parentInfo) return;

    const { parent, side } = parentInfo;
    const sibling = side === 'first' ? parent.second! : parent.first!;

    // If parent is root, sibling becomes new root
    let newRoot: SplitNode;
    if (parent === root) {
      newRoot = sibling;
    } else {
      // Replace parent with sibling in grandparent
      newRoot = replaceNode(root, parent.id, sibling);
    }

    // If the result is still a single leaf, collapse to just that leaf
    set({ root: newRoot });
  },

  setPaneTab: (nodeId, tabId) => {
    const { root } = get();
    if (!root) return;
    const node = findNode(root, nodeId);
    if (!node || node.type !== 'leaf') return;
    const newRoot = replaceNode(root, nodeId, { ...node, tabId });
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

  getLeaves: () => {
    return getLeaves(get().root);
  },

  findNode: (nodeId) => {
    return findNode(get().root, nodeId);
  },

  splitTab: (tabId, direction) => {
    const { root } = get();
    const leaf = getLeaves(root).find(l => l.tabId === tabId);
    if (!leaf) return;
    get().splitPane(leaf.id, direction);
  },

  collapseToSingle: () => {
    const { activeTabId } = useTabStore.getState();
    set({ root: makeLeaf(activeTabId) });
  },

  reset: () => {
    set({ root: null });
  },
}));
