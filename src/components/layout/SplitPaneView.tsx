import { useTabStore } from '../../stores/tab-store';
import { isValidNode, type SplitNode, type SplitDirection } from '../../stores/split-pane-store';
import { useChatStore } from '../../stores/chat-store';
import { SplitContainer } from '../shared/SplitContainer';
import ChatView from '../chat/ChatView';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';
import { useProjectStore } from '../../stores/project-store';

/**
 * Single pane cell — shows a chat for a given chatId, with split/close buttons.
 */
function ChatPane({ tabId, node }: { tabId: string; node: SplitNode }) {
  const activeTabId = useTabStore(s => s.activeTabId);
  const chatMessages = useChatStore(s => node.chatId ? s.messagesByTab[node.chatId!] : undefined);
  const isNotEmpty = !!chatMessages && chatMessages.length > 0;
  const leafCount = useTabStore(s => {
    const tab = s.tabs.find(t => t.id === tabId);
    return tab?.splitLayout ? countLeaves(tab.splitLayout) : 1;
  });
  const isOnlyLeaf = leafCount <= 1;

  if (node.type !== 'leaf') return null;

  const handleSplit = (direction: SplitDirection) => {
    useTabStore.getState().splitPane(tabId, node.id, direction);
  };

  const handleClose = () => {
    useTabStore.getState().closePane(tabId, node.id);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative group/pane">
      {/* Pane toolbar — shown on hover */}
      <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded bg-bg-surface/90 border border-border opacity-0 group-hover/pane:opacity-100 transition-opacity">
        <Tooltip content="Split Vertically" position="bottom">
          <button onClick={() => handleSplit('vertical')}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split vertically">
            <Icon name="Columns" size={13} className="text-text-secondary" />
          </button>
        </Tooltip>
        <Tooltip content="Split Horizontally" position="bottom">
          <button onClick={() => handleSplit('horizontal')}
            className="flex items-center justify-center w-6 h-6 rounded hover:bg-bg-elevated transition-colors"
            aria-label="Split horizontally">
            <Icon name="Rows" size={13} className="text-text-secondary" />
          </button>
        </Tooltip>
        {!isOnlyLeaf && (
          <Tooltip content="Close Pane" position="bottom">
            <button onClick={handleClose}
              className="flex items-center justify-center w-6 h-6 rounded hover:bg-error/20 text-text-secondary hover:text-error transition-colors"
              aria-label="Close pane">
              <Icon name="X" size={13} />
            </button>
          </Tooltip>
        )}
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {node.chatId ? (
          <ChatView tabId={node.chatId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-secondary">
            <p className="text-sm">New chat — start typing to begin</p>
          </div>
        )}
      </div>
    </div>
  );
}

function countLeaves(node: SplitNode): number {
  if (node.type === 'leaf') return 1;
  return countLeaves(node.first!) + countLeaves(node.second!);
}

/**
 * Recursive renderer for the split tree.
 */
function SplitNodeView({ tabId, node }: { tabId: string; node: SplitNode }) {
  const { setPaneRatio } = useTabStore.getState();

  if (node.type === 'leaf') {
    return <ChatPane tabId={tabId} node={node} />;
  }

  return (
    <SplitContainer
      direction={node.direction!}
      ratio={node.ratio ?? 0.5}
      onRatioChange={(ratio) => setPaneRatio(tabId, node.id, ratio)}
      firstChild={<SplitNodeView tabId={tabId} node={node.first!} />}
      secondChild={<SplitNodeView tabId={tabId} node={node.second!} />}
    />
  );
}

export default function SplitPaneView() {
  const activeTab = useTabStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const projectPath = useProjectStore(s => s.projectPath);
  const { openProjectDialog } = useProjectStore();
  const { addTab } = useTabStore();

  // No active tab or active tab is not a chat — show empty state
  if (!activeTab || activeTab.type !== 'chat') {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-base">
        <div className="text-center space-y-4">
          {projectPath ? (
            <>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-bg-surface border-2 border-dashed border-border flex items-center justify-center">
                <Icon name="MessageSquare" size={28} className="text-text-secondary" />
              </div>
              <p className="text-text-secondary text-lg font-medium">No chat open</p>
              <button
                onClick={() => addTab()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-lg transition-colors"
              >
                <Icon name="Plus" size={16} />
                New Chat
              </button>
            </>
          ) : (
            <>
              <div className="w-14 h-14 mx-auto rounded-2xl bg-bg-surface border-2 border-dashed border-border flex items-center justify-center">
                <Icon name="FolderOpen" size={28} className="text-text-secondary" />
              </div>
              <p className="text-text-secondary text-lg font-medium">No project open</p>
              <p className="text-text-secondary/50 text-sm">Open a project to start chatting with the agent</p>
              <button
                onClick={openProjectDialog}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-lg transition-colors"
              >
                <Icon name="FolderOpen" size={16} />
                Open Project
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const splitLayout = activeTab.splitLayout;

  // No split layout — render single leaf through the same ChatPane wrapper (with split buttons)
  // Use tab.id as leaf id so splitPane can find it when creating the first split.
  if (!splitLayout) {
    return <ChatPane tabId={activeTab.id} node={{ type: 'leaf', id: activeTab.id, chatId: activeTab.id }} />;
  }

  // Validate split layout (guard against stale persistence data)
  if (!isValidNode(splitLayout)) {
    // Clear invalid layout
    useTabStore.getState().updateTab(activeTab.id, { splitLayout: null });
    return <ChatPane tabId={activeTab.id} node={{ type: 'leaf', id: activeTab.id, chatId: activeTab.id }} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SplitNodeView tabId={activeTab.id} node={splitLayout} />
    </div>
  );
}
