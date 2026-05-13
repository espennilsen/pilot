import { useSplitPaneStore } from '../../stores/split-pane-store';
import { useTabStore } from '../../stores/tab-store';
import { SplitContainer } from '../shared/SplitContainer';
import ChatView from '../chat/ChatView';
import { Icon } from '../shared/Icon';

function ChatPane({ tabId, isFocused }: { tabId: string | null; isFocused: boolean }) {
  const tabs = useTabStore(s => s.tabs);
  const currentTab = tabs.find(t => t.id === tabId);
  if (!tabId || !currentTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary">
        <p className="text-sm">No tab in this pane</p>
      </div>
    );
  }
  return (
    <div className={`flex-1 flex flex-col overflow-hidden ${isFocused ? '' : 'opacity-75'}`}
      onClick={() => useTabStore.getState().switchTab(tabId)}>
      <ChatView tabId={tabId} />
    </div>
  );
}

export default function SplitPaneView() {
  const layout = useSplitPaneStore(s => s.layout);
  const { unsplit, setSplitRatio, getPaneTabIds } = useSplitPaneStore();
  const activeTabId = useTabStore(s => s.activeTabId);
  const [primaryTabId, secondaryTabId] = getPaneTabIds();

  if (layout.mode === 'single') return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <SplitContainer
        direction={layout.direction}
        ratio={layout.splitRatio}
        onRatioChange={setSplitRatio}
        firstChild={<ChatPane tabId={primaryTabId} isFocused={activeTabId === primaryTabId} />}
        secondChild={<ChatPane tabId={secondaryTabId} isFocused={activeTabId === secondaryTabId} />}
      />
      <button onClick={unsplit}
        className="absolute top-2 right-2 z-20 p-1 rounded bg-bg-surface/80 border border-border hover:bg-bg-elevated transition-colors"
        aria-label="Close split">
        <Icon name="X" size={14} className="text-text-secondary" />
      </button>
    </div>
  );
}
