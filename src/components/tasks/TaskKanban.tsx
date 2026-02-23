import { useState, useCallback } from 'react';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { KanbanCard } from './KanbanCard';
import { Plus } from 'lucide-react';
import type { TaskStatus, TaskItem } from '../../../shared/types';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'open', label: 'Open', color: 'text-yellow-400' },
  { status: 'in_progress', label: 'In Progress', color: 'text-blue-400' },
  { status: 'review', label: 'Review', color: 'text-purple-400' },
  { status: 'done', label: 'Done', color: 'text-green-400' },
];

export function TaskKanban() {
  const { getTasksByStatus, moveTask, setShowCreateDialog } = useTaskStore();
  const projectPath = useProjectStore((s) => s.projectPath);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're leaving the column entirely, not just moving between children
    const relatedTarget = e.relatedTarget as HTMLElement;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      setDragOverColumn(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, newStatus: TaskStatus) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('text/plain');
      
      if (taskId && projectPath) {
        moveTask(projectPath, taskId, newStatus);
      }
      
      setDragOverColumn(null);
    },
    [projectPath, moveTask]
  );

  const sortTasks = useCallback((tasks: TaskItem[]) => {
    return [...tasks].sort((a, b) => {
      // Priority 0 first (highest priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by updatedAt (most recent first)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, []);

  return (
    <div className="flex h-full overflow-x-auto gap-4 p-4">
      {COLUMNS.map(({ status, label, color }) => {
        const tasks = getTasksByStatus(status);
        const sortedTasks = sortTasks(tasks);
        const isDropTarget = dragOverColumn === status;

        return (
          <div
            key={status}
            className="flex flex-col min-w-[300px] w-[300px] bg-bg-elevated rounded-lg border border-border"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between p-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${color}`}>{label}</span>
                <span className="px-2 py-0.5 text-xs bg-bg-base text-text-secondary rounded-full">
                  {sortedTasks.length}
                </span>
              </div>
            </div>

            {/* Scrollable Card Area */}
            <div
              className={`flex-1 overflow-y-auto p-3 space-y-2 transition-colors ${
                isDropTarget ? 'bg-accent/10 ring-2 ring-accent ring-inset' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {sortedTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onDragStart={(e) => handleDragStart(e, task.id)}
                />
              ))}

              {sortedTasks.length === 0 && (
                <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
                  No tasks
                </div>
              )}
            </div>

            {/* Add Task Button (Open column only) */}
            {status === 'open' && (
              <div className="p-3 border-t border-border">
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-accent hover:bg-bg-base rounded-md transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add task
                </button>
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}
