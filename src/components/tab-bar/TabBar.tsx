import { useRef, useState, useEffect } from 'react';
import { useTabStore } from '../../stores/tab-store';
import { TabGroup } from './TabGroup';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcut';

export function TabBar() {
  const { addTab, closeTab, nextTab, prevTab, reopenClosedTab, switchToTabByIndex, activeTabId, moveTab, getGroupedTabs } = useTabStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  const groups = getGroupedTabs();
  const showGroupHeaders = groups.length > 1;

  // Register keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 't',
      modifiers: ['meta'],
      action: () => addTab(),
    },
    {
      key: 'w',
      modifiers: ['meta'],
      action: () => {
        if (activeTabId) closeTab(activeTabId);
      },
    },
    {
      key: 't',
      modifiers: ['meta', 'shift'],
      action: () => reopenClosedTab(),
    },
    {
      key: ']',
      modifiers: ['meta', 'shift'],
      action: () => nextTab(),
    },
    {
      key: '[',
      modifiers: ['meta', 'shift'],
      action: () => prevTab(),
    },
    {
      key: 'Tab',
      modifiers: ['ctrl'],
      action: () => nextTab(),
    },
    {
      key: 'Tab',
      modifiers: ['ctrl', 'shift'],
      action: () => prevTab(),
    },
    // Cmd+1 through Cmd+9
    ...Array.from({ length: 9 }, (_, i) => ({
      key: String(i + 1),
      modifiers: ['meta'] as const,
      action: () => switchToTabByIndex(i),
    })),
  ]);

  // Check scroll overflow
  useEffect(() => {
    const checkOverflow = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const isOverflowing = container.scrollWidth > container.clientWidth;
      const isScrolledRight = container.scrollLeft > 0;
      const isScrolledLeft = container.scrollLeft < container.scrollWidth - container.clientWidth - 1;

      setShowLeftArrow(isOverflowing && isScrolledRight);
      setShowRightArrow(isOverflowing && isScrolledLeft);
    };

    checkOverflow();
    const container = scrollContainerRef.current;
    container?.addEventListener('scroll', checkOverflow);
    window.addEventListener('resize', checkOverflow);

    return () => {
      container?.removeEventListener('scroll', checkOverflow);
      window.removeEventListener('resize', checkOverflow);
    };
  }, [groups]);

  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    
    if (!draggedTabId || draggedTabId === targetTabId) {
      setDraggedTabId(null);
      return;
    }

    // Get all tabs in order
    const allTabs = groups.flatMap(g => g.tabs);
    const targetIndex = allTabs.findIndex(t => t.id === targetTabId);
    
    if (targetIndex !== -1) {
      moveTab(draggedTabId, targetIndex);
    }

    setDraggedTabId(null);
  };

  return (
    <div className="h-9 bg-bg-base border-b border-border flex items-center relative select-none">
      {/* Left scroll arrow */}
      {showLeftArrow && (
        <button
          onClick={scrollLeft}
          className="absolute left-0 z-10 w-8 h-full bg-gradient-to-r from-bg-base to-transparent flex items-center justify-start pl-1 hover:from-bg-surface transition-colors"
          aria-label="Scroll left"
        >
          <Icon name="ChevronLeft" size={16} className="text-text-secondary" />
        </button>
      )}

      {/* Tabs container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex overflow-x-auto overflow-y-hidden scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {groups.map((group, index) => (
          <div key={group.projectPath || 'general'} className="flex">
            <TabGroup
              group={group}
              showHeader={showGroupHeaders}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
            {/* Divider between groups */}
            {showGroupHeaders && index < groups.length - 1 && (
              <div className="w-px bg-border self-stretch" />
            )}
          </div>
        ))}
      </div>

      {/* Right scroll arrow */}
      {showRightArrow && (
        <button
          onClick={scrollRight}
          className="absolute right-12 z-10 w-8 h-full bg-gradient-to-l from-bg-base to-transparent flex items-center justify-end pr-1 hover:from-bg-surface transition-colors"
          aria-label="Scroll right"
        >
          <Icon name="ChevronRight" size={16} className="text-text-secondary" />
        </button>
      )}

      {/* Add tab button */}
      <Tooltip content="New tab (Cmd+T)" position="bottom">
        <button
          onClick={() => addTab()}
          className="w-10 h-full flex items-center justify-center border-l border-border hover:bg-bg-surface transition-colors"
          aria-label="New tab"
        >
          <Icon name="Plus" size={16} className="text-text-secondary" />
        </button>
      </Tooltip>
    </div>
  );
}
