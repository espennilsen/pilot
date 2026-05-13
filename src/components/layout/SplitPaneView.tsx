import { useEffect, useRef } from 'react';
import { useSplitPaneStore, type SplitNode } from '../../stores/split-pane-store';
import { useTabStore } from '../../stores/tab-store';
import { SplitContainer } from '../shared/SplitContainer';
import ChatView from '../chat/ChatView';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';

/**
 * Single pane cell — shows a chat for a given tab, with split/close buttons.
 */
function ChatPane({ node }: { node: SplitNode }) {
  const tabs = useTabStore(s => s.tabs);
  const activeTabId = useTabStore(s => s.activeTabId);
  const { splitPane, closePane, setPaneTab } = useSplitPaneStore();
  const currentTab = tabs.find(t => t.id === node.tabId);
  const leafCount = useSplitPaneStore(s => s.getLeaves().length);
  const isOnlyLeaf = leafCount <= 1;

  if (node.type !== 'leaf') return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative group/pane">
      {/* Pane toolbar — shown on hover or when focused */}
      <div className={`
        absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded bg-bg-surface/90 border border-border
        transition-opacity
        ${activeTabId === node.tabId ? 'opacity-100' : 'opacity-0 group-hover/pane:opacity-100'}
      `}>
        <Tooltip content="Split Vertically" position="bottom">
          <button onClick={() => splitPane(node.id, 'vertical')}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split vertically">
            <Icon name="Columns" size={13} className="text-text-secondary" />
          </button>
        </Tooltip>
        <Tooltip content="Split Horizontally" position="bottom">
          <button onClick={() => splitPane(node.id, 'horizontal')}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split horizontally">
            <Icon name="Rows" size={13} className="text-text-secondary" />
          </button>
        </Tooltip>
        {!isOnlyLeaf && (
          <Tooltip content="Close Pane" position="bottom">
            <button onClick={() => closePane(node.id)}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-error/20 text-text-secondary hover:text-error transition-colors"
              aria-label="Close pane">
              <Icon name="X" size={13} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* Tab selector (if multiple tabs available) */}
      {tabs.filter(t => t.type === 'chat').length > 1 && (
        <div className="absolute top-1 left-1 z-10">
          <select
            value={node.tabId ?? ''}
            onChange={(e) => setPaneTab(node.id, e.target.value || null)}
            className="text-xs bg-bg-surface/90 border border-border rounded px-1.5 py-0.5 text-text-secondary"
          >
            {tabs.filter(t => t.type === 'chat').map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className={`flex-1 flex flex-col overflow-hidden ${activeTabId === node.tabId ? '' : 'opacity-75'}`}
        onClick={() => node.tabId && useTabStore.getState().switchTab(node.tabId)}>
        {node.tabId && currentTab ? (
          <ChatView tabId={node.tabId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-secondary">
            <p className="text-sm">No tab selected</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Check if a value is a valid SplitNode tree (not stale persistence data).
 * Old persistence had `mode` instead of `type`.
 */
function isValidNode(node: unknown): node is SplitNode {
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

/**
 * Recursive renderer for the split tree.
 */
function SplitNodeView({ node }: { node: SplitNode }) {
  const { setRatio } = useSplitPaneStore();

  if (node.type === 'leaf') {
    return <ChatPane node={node} />;
  }

  return (
    <SplitContainer
      direction={node.direction!}
      ratio={node.ratio ?? 0.5}
      onRatioChange={(ratio) => setRatio(node.id, ratio)}
      firstChild={<SplitNodeView node={node.first!} />}
      secondChild={<SplitNodeView node={node.second!} />}
    />
  );
}

export default function SplitPaneView() {
  const root = useSplitPaneStore(s => s.root);
  const { init, reset } = useSplitPaneStore();
  const didInitRef = useRef(false);

  // Validate and initialise on mount — never call setState during render
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    if (!isValidNode(root)) {
      if (root) reset();
      init();
    }
  }, [root, init, reset]);

  if (!isValidNode(root)) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SplitNodeView node={root} />
    </div>
  );
}
