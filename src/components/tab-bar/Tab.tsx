import { useState, useCallback, useRef, useEffect } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { useChatStore } from '../../stores/chat-store';
import { useSandboxStore } from '../../stores/sandbox-store';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';
import { ContextMenu, type MenuEntry } from '../shared/ContextMenu';
import { relativeTime } from '../../lib/utils';

function getFileTabIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) return 'FileCode';
  if (['json', 'yaml', 'yml', 'md', 'txt', 'css', 'scss'].includes(ext)) return 'FileText';
  return 'File';
}

type ChatStatus = 'idle' | 'empty' | 'streaming' | 'pending' | 'error';

function useChatTabStatus(tabId: string): ChatStatus {
  const isStreaming = useChatStore(s => !!s.streamingByTab[tabId]);
  const messages = useChatStore(s => s.messagesByTab[tabId]);
  const pendingCount = useSandboxStore(s => s.getPendingDiffs(tabId).length);

  if (isStreaming) return 'streaming';

  if (messages && messages.length > 0) {
    // Check if the last assistant message had an error
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.isError) return 'error';
    // Check for failed tool calls on the last assistant message
    if (lastMsg.role === 'assistant' && lastMsg.toolCalls?.some(tc => tc.status === 'error')) {
      return 'error';
    }
  }

  if (pendingCount > 0) return 'pending';

  if (!messages || messages.length === 0) return 'empty';

  return 'idle';
}

const STATUS_COLORS: Record<ChatStatus, string> = {
  idle: 'bg-success',
  empty: 'bg-text-secondary/40',
  streaming: 'bg-warning',
  pending: 'bg-warning',
  error: 'bg-error',
};

const STATUS_LABELS: Record<ChatStatus, string> = {
  idle: 'Ready',
  empty: 'New',
  streaming: 'Working…',
  pending: 'Pending review',
  error: 'Error',
};

interface TabProps {
  tabId: string;
  isActive: boolean;
  onDragStart: (e: React.DragEvent, tabId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetTabId: string) => void;
}

export function Tab({ tabId, isActive, onDragStart, onDragOver, onDrop }: TabProps) {
  const { tabs, switchTab, closeTab, pinTab, unpinTab, updateTab } = useTabStore();
  const tab = tabs.find(t => t.id === tabId);
  const chatStatus = useChatTabStatus(tabId);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (!tab) return null;

  const handleClick = () => {
    switchTab(tabId);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(tab.title);
    setIsEditing(true);
  };

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tab.title) {
      updateTab(tabId, { title: trimmed });
    }
    setIsEditing(false);
  };

  const cancelRename = () => {
    setIsEditing(false);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const menuItems: MenuEntry[] = [
    {
      label: 'Rename',
      icon: <Icon name="Pencil" size={14} />,
      action: () => { setEditValue(tab.title); setIsEditing(true); },
    },
    tab.isPinned
      ? { label: 'Unpin Tab', icon: <Icon name="PinOff" size={14} />, action: () => unpinTab(tabId) }
      : { label: 'Pin Tab', icon: <Icon name="Pin" size={14} />, action: () => pinTab(tabId) },
    'separator',
    { label: 'Close Tab', icon: <Icon name="X" size={14} />, action: () => closeTab(tabId) },
    {
      label: 'Close Other Tabs',
      action: () => {
        tabs.filter(t => t.id !== tabId).forEach(t => closeTab(t.id));
      },
      disabled: tabs.length <= 1,
    },
    {
      label: 'Close Tabs to the Right',
      action: () => {
        const sorted = [...tabs].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex(t => t.id === tabId);
        sorted.slice(idx + 1).forEach(t => closeTab(t.id));
      },
    },
    {
      label: 'Close Unpinned Tabs',
      action: () => {
        tabs.filter(t => !t.isPinned).forEach(t => closeTab(t.id));
      },
    },
  ];

  const tooltipContent = (
    <div className="text-xs space-y-1">
      <div className="font-medium">{tab.title}</div>
      {tab.type === 'file' && tab.filePath && (
        <div className="text-text-secondary">{tab.filePath}</div>
      )}
      {tab.type !== 'file' && (
        <>
          {tab.projectPath && (
            <div className="text-text-secondary">
              {tab.projectPath.split('/').slice(-2).join('/')}
            </div>
          )}
          <div className="text-text-secondary">
            Status: {STATUS_LABELS[chatStatus]}
          </div>
        </>
      )}
      <div className="text-text-secondary">
        Active {relativeTime(tab.lastActiveAt)}
      </div>
    </div>
  );

  return (
    <>
      <Tooltip content={tooltipContent} position="bottom">
        <div
          draggable
          onDragStart={(e) => onDragStart(e, tabId)}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, tabId)}
          onClick={handleClick}
          onMouseDown={handleMiddleClick}
          onContextMenu={handleContextMenu}
          className={`
            min-w-[120px] max-w-[200px] h-9 px-3 flex items-center gap-2 cursor-pointer
            border-b-2 transition-colors select-none group
            ${
              isActive
                ? 'bg-bg-surface border-accent text-text-primary'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-surface/50'
            }
          `}
        >
          {tab.type === 'file' ? (
            <Icon name={getFileTabIcon(tab.title)} size={14} className="flex-shrink-0 text-text-secondary" />
          ) : tab.type === 'tasks' ? (
            <Icon name="ListTodo" size={14} className="flex-shrink-0 text-text-secondary" />
          ) : tab.type === 'docs' ? (
            <Icon name="BookOpen" size={14} className="flex-shrink-0 text-text-secondary" />
          ) : (
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[chatStatus]} ${
                chatStatus === 'streaming' ? 'animate-pulse' : ''
              }`}
              title={STATUS_LABELS[chatStatus]}
            />
          )}
          {tab.isPinned && (
            <Icon name="Pin" size={10} className="flex-shrink-0 text-text-secondary" />
          )}
          {isEditing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') cancelRename();
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm bg-bg-base border border-accent rounded px-1 py-0 text-text-primary outline-none"
            />
          ) : (
            <span
              className="flex-1 truncate text-sm"
              onDoubleClick={handleDoubleClick}
            >
              {tab.title}
            </span>
          )}
          {tab.hasUnread && !isActive && (
            <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
          )}
          <button
            onClick={handleClose}
            className={`
              flex-shrink-0 w-4 h-4 flex items-center justify-center rounded
              hover:bg-bg-elevated transition-opacity
              ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
            `}
            aria-label="Close tab"
          >
            <Icon name="X" size={12} />
          </button>
        </div>
      </Tooltip>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
