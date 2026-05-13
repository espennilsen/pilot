/**
 * @file Split pane utilities — pure functions for manipulating SplitNode trees.
 * The actual split layout state lives per-tab in TabState.
 */

export type SplitDirection = 'horizontal' | 'vertical';

export interface SplitNode {
  id: string;
  type: 'leaf' | 'split';
  chatId?: string | null;  // unique ID for the chat session in this pane
  direction?: SplitDirection;
  first?: SplitNode;
  second?: SplitNode;
  ratio?: number;
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function makeLeaf(chatId: string | null): SplitNode {
  return { id: uid(), type: 'leaf', chatId };
}

export function makeSplit(direction: SplitDirection, first: SplitNode, second: SplitNode): SplitNode {
  return { id: uid(), type: 'split', direction, first, second, ratio: 0.5 };
}

// ─── Tree helpers ────────────────────────────────────────────────────────────

export function findNode(root: SplitNode | null, id: string): SplitNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  if (root.type === 'split') {
    return findNode(root.first!, id) ?? findNode(root.second!, id);
  }
  return null;
}

export function findParent(root: SplitNode, id: string): { parent: SplitNode; side: 'first' | 'second' } | null {
  if (root.type === 'leaf') return null;
  if (root.first?.id === id) return { parent: root, side: 'first' };
  if (root.second?.id === id) return { parent: root, side: 'second' };
  return findParent(root.first!, id) ?? findParent(root.second!, id);
}

export function getLeaves(root: SplitNode | null): SplitNode[] {
  if (!root) return [];
  if (root.type === 'leaf') return [root];
  return [...getLeaves(root.first!), ...getLeaves(root.second!)];
}

export function replaceNode(root: SplitNode, id: string, replacement: SplitNode): SplitNode {
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

/**
 * Split a leaf node into two children. First child keeps the original chatId,
 * second child gets a new chatId (new conversation).
 */
export function splitLeafNode(root: SplitNode, nodeId: string, direction: SplitDirection): SplitNode {
  const node = findNode(root, nodeId);
  if (!node || node.type !== 'leaf') return root;

  const firstChild = makeLeaf(node.chatId ?? null);
  const secondChild = makeLeaf(null); // new chat session
  const splitNode = makeSplit(direction, firstChild, secondChild);

  return replaceNode(root, nodeId, splitNode);
}

/**
 * Close/remove a leaf node (promotes sibling to replace parent split).
 */
export function closeLeafNode(root: SplitNode, nodeId: string): SplitNode {
  if (root.type === 'leaf') return root;

  const parentInfo = findParent(root, nodeId);
  if (!parentInfo) return root;

  const { parent, side } = parentInfo;
  const sibling = side === 'first' ? parent.second! : parent.first!;

  // If parent is root, return sibling directly
  if (parent === root) return sibling;

  // Replace parent with sibling in grandparent
  return replaceNode(root, parent.id, sibling);
}

/**
 * Check if a value is a valid SplitNode tree (not stale persistence data).
 */
export function isValidNode(node: unknown): node is SplitNode {
  if (!node || typeof node !== 'object') return false;
  const n = node as Record<string, unknown>;
  if (n.type !== 'leaf' && n.type !== 'split') return false;
  if (typeof n.id !== 'string') return false;
  if (n.type === 'split') {
    if (!n.first || !n.second) return false;
    if (typeof n.ratio !== 'number') return false;
  }
  return true;
}
