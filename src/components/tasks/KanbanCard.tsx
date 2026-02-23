import { useMemo } from 'react';
import { useTaskStore } from '../../stores/task-store';
import { Lock, Bot, User } from 'lucide-react';
import type { TaskItem } from '../../../shared/types';

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-blue-500',
  4: 'bg-gray-500',
};

interface KanbanCardProps {
  task: TaskItem;
  onDragStart?: (e: React.DragEvent) => void;
}

export function KanbanCard({ task, onDragStart }: KanbanCardProps) {
  const { selectTask, tasks, blockedTasks } = useTaskStore();

  const isBlocked = useMemo(
    () => blockedTasks.some((t) => t.id === task.id),
    [blockedTasks, task.id]
  );

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(e);
  };

  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[4];

  // Blocked-by deps count
  const blockerCount = task.dependencies.filter((d) => d.type === 'blocked_by').length;
  // Tasks blocked by this one
  const dependentCount = tasks.filter((t) =>
    t.dependencies.some((d) => d.type === 'blocked_by' && d.taskId === task.id)
  ).length;

  // Format estimate
  const estimateText = task.estimateMinutes
    ? task.estimateMinutes >= 60
      ? `${Math.floor(task.estimateMinutes / 60)}h`
      : `${task.estimateMinutes}m`
    : null;

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={() => selectTask(task.id)}
      className={`
        bg-bg-base border border-border rounded-lg p-3
        hover:shadow-md transition-shadow cursor-grab
        active:cursor-grabbing select-none
        ${isBlocked ? 'opacity-60' : ''}
      `}
    >
      {/* Priority dot + title */}
      <div className="flex items-start gap-2 mb-1">
        <div className={`${priorityColor} w-2 h-2 rounded-full mt-1.5 flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-text-primary font-medium leading-tight">
            {task.title}
          </div>
          <div className="text-[10px] font-mono text-text-secondary mt-0.5">{task.id}</div>
        </div>
        {isBlocked && <Lock className="w-3 h-3 text-yellow-500 flex-shrink-0 mt-1" />}
      </div>

      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 ml-4">
          {task.labels.slice(0, 3).map((label) => (
            <span
              key={label}
              className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary"
            >
              {label}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span className="text-xs text-text-secondary">+{task.labels.length - 3}</span>
          )}
        </div>
      )}

      {/* Bottom row: assignee, deps, estimate */}
      <div className="flex items-center gap-2 text-xs text-text-secondary ml-4">
        {task.assignee === 'agent' && <Bot className="w-3 h-3 text-accent" />}
        {task.assignee === 'human' && <User className="w-3 h-3" />}

        {(blockerCount > 0 || dependentCount > 0) && (
          <span>🔗 {blockerCount}→{dependentCount}</span>
        )}

        {estimateText && <span>⏱ {estimateText}</span>}

        {task.type === 'epic' && (
          <span className="text-accent font-medium">epic</span>
        )}
      </div>

      {/* Blocked-by indicator */}
      {isBlocked && blockerCount > 0 && (
        <div className="mt-1.5 ml-4 text-xs text-yellow-500/80">
          🔒 Blocked by {blockerCount} task{blockerCount > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
