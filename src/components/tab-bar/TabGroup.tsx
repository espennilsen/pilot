import { useState } from 'react';
import { TabGroupHeader } from './TabGroupHeader';
import { Tab } from './Tab';
import type { TabGroup as TabGroupType } from '../../stores/tab-store';
import { useTabStore } from '../../stores/tab-store';

interface TabGroupProps {
  group: TabGroupType;
  showHeader: boolean;
  onDragStart: (e: React.DragEvent, tabId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetTabId: string) => void;
}

export function TabGroup({ group, showHeader, onDragStart, onDragOver, onDrop }: TabGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { activeTabId, closeTab } = useTabStore();

  const handleToggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleCloseAll = () => {
    group.tabs.forEach(tab => closeTab(tab.id));
  };

  return (
    <div className="flex items-stretch">
      {showHeader && (
        <TabGroupHeader
          projectName={group.projectName}
          projectPath={group.projectPath}
          color={group.color}
          isCollapsed={isCollapsed}
          tabCount={group.tabs.length}
          onToggleCollapse={handleToggleCollapse}
          onCloseAll={handleCloseAll}
        />
      )}

      {!isCollapsed &&
        group.tabs.map(tab => (
          <Tab
            key={tab.id}
            tabId={tab.id}
            isActive={tab.id === activeTabId}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        ))
      }
    </div>
  );
}
