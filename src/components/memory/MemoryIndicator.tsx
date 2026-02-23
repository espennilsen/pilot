import { useEffect } from 'react';
import { useMemoryStore } from '../../stores/memory-store';
import { useProjectStore } from '../../stores/project-store';
import { useUIStore } from '../../stores/ui-store';

export function MemoryIndicator() {
  const { memoryCount, lastUpdate, loadMemoryCount } = useMemoryStore();
  const projectPath = useProjectStore(s => s.projectPath);
  const { setSidebarPane, sidebarVisible, toggleSidebar } = useUIStore();

  // Load memory count on mount and when project changes
  useEffect(() => {
    if (projectPath) {
      loadMemoryCount(projectPath);
    }
  }, [projectPath, loadMemoryCount]);

  const handleClick = () => {
    setSidebarPane('memory');
    if (!sidebarVisible) toggleSidebar();
  };

  const total = memoryCount?.total ?? 0;
  const hasUpdate = !!lastUpdate;

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 hover:text-text-primary transition-colors"
      title={
        memoryCount
          ? `${memoryCount.total} memories (${memoryCount.global} global, ${memoryCount.project} project)\nClick to manage memories`
          : 'Memory — click to manage'
      }
    >
      <span className={hasUpdate ? 'animate-pulse' : ''}>
        🧠{hasUpdate ? '✨' : ''}
      </span>
      <span className="font-mono">{total}</span>
    </button>
  );
}
