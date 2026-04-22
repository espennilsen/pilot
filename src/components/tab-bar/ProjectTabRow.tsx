import { useMemo } from 'react';
import * as icons from 'lucide-react';
import { useTabStore, type TabState } from '../../stores/tab-store';
import { Icon } from '../shared/Icon';
import { Tooltip } from '../shared/Tooltip';

const TAB_ICON: Record<TabState['type'], keyof typeof icons> = {
  chat: 'MessageSquare',
  file: 'FileText',
  tasks: 'CheckSquare',
  docs: 'BookOpen',
  web: 'Globe',
  desktop: 'Monitor',
};

interface ProjectTabRowProps {
  projectPath: string | null;
}

export function ProjectTabRow({ projectPath }: ProjectTabRowProps) {
  const { tabs, activeTabId, switchTab, closeTab } = useTabStore();

  const projectTabs = useMemo(() => {
    return tabs
      .filter(t => t.projectPath === projectPath)
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return a.order - b.order;
      });
  }, [tabs, projectPath]);

  if (projectTabs.length === 0) return null;

  return (
    <div className="h-8 bg-bg-surface border-b border-border flex items-center px-2 gap-1 overflow-x-auto scrollbar-hide select-none">
      {projectTabs.map(tab => {
        const isActive = tab.id === activeTabId;
        const iconName = TAB_ICON[tab.type] || 'File';

        return (
          <Tooltip key={tab.id} content={tab.title} position="bottom">
            <button
              onClick={() => switchTab(tab.id)}
              className={`
                group flex items-center gap-1.5 h-6 px-2 rounded text-xs
                transition-colors whitespace-nowrap max-w-[160px]
                ${isActive
                  ? 'bg-bg-base text-text-primary'
                  : 'text-text-secondary hover:bg-bg-base hover:text-text-primary'
                }
              `}
            >
              <Icon name={iconName} size={13} className="flex-shrink-0" />
              <span className="truncate">{tab.title}</span>
              {tab.hasUnread && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className={`
                  flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded
                  hover:bg-bg-elevated transition-opacity ml-0.5
                  ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}
                aria-label={`Close ${tab.title}`}
              >
                <Icon name="X" size={10} />
              </span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
