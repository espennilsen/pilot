import { useState, useMemo } from 'react';
import { relativeTime } from '../../lib/utils';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { ArrowUp, ArrowDown, Lock, Bot, User } from 'lucide-react';
import type { TaskItem, TaskStatus } from '../../../shared/types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  open: 'bg-yellow-400',
  in_progress: 'bg-blue-400',
  review: 'bg-purple-400',
  done: 'bg-green-400',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open',
  in_progress: 'In Prog',
  review: 'Review',
  done: 'Done',
};

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-blue-500',
  4: 'bg-gray-500',
};

type SortKey = 'id' | 'title' | 'status' | 'priority' | 'type' | 'assignee' | 'updatedAt';

function isBlocked(task: TaskItem, taskMap: Map<string, TaskItem>): boolean {
  return task.dependencies.some((d) => {
    if (d.type !== 'blocked_by') return false;
    const blocker = taskMap.get(d.taskId);
    return !blocker || blocker.status !== 'done';
  });
}

export function TaskTable() {
  const { selectTask, selectedTaskId } = useTaskStore();
  const getFilteredTasks = useTaskStore((s) => s.getFilteredTasks);
  const tasks = getFilteredTasks();

  const [sortBy, setSortBy] = useState<SortKey>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const sorted = useMemo(() => {
    const arr = [...tasks];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'id':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'status': {
          const order: Record<TaskStatus, number> = { open: 0, in_progress: 1, review: 2, done: 3 };
          cmp = order[a.status] - order[b.status];
          break;
        }
        case 'priority':
          cmp = a.priority - b.priority;
          break;
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
        case 'assignee':
          cmp = (a.assignee || '').localeCompare(b.assignee || '');
          break;
        case 'updatedAt':
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [tasks, sortBy, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortBy !== column) return null;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  const headerClass =
    'px-3 py-2 text-left text-xs font-medium text-text-secondary uppercase tracking-wider cursor-pointer hover:text-text-primary select-none';

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-elevated border-b border-border z-10">
          <tr>
            <th className={headerClass} onClick={() => handleSort('id')} style={{ width: 80 }}>
              ID <SortIcon column="id" />
            </th>
            <th className={headerClass} onClick={() => handleSort('title')}>
              Title <SortIcon column="title" />
            </th>
            <th className={headerClass} onClick={() => handleSort('status')} style={{ width: 100 }}>
              Status <SortIcon column="status" />
            </th>
            <th className={headerClass} onClick={() => handleSort('priority')} style={{ width: 80 }}>
              Priority <SortIcon column="priority" />
            </th>
            <th className={headerClass} onClick={() => handleSort('type')} style={{ width: 80 }}>
              Type <SortIcon column="type" />
            </th>
            <th className={headerClass} style={{ width: 120 }}>Labels</th>
            <th className={headerClass} onClick={() => handleSort('assignee')} style={{ width: 60 }}>
              <SortIcon column="assignee" />
            </th>
            <th className={headerClass} onClick={() => handleSort('updatedAt')} style={{ width: 80 }}>
              Updated <SortIcon column="updatedAt" />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((task) => {
            const blocked = isBlocked(task, taskMap);
            return (
              <tr
                key={task.id}
                onClick={() => selectTask(task.id)}
                className={`border-b border-border/50 cursor-pointer transition-colors ${
                  selectedTaskId === task.id
                    ? 'bg-accent/10'
                    : 'hover:bg-bg-elevated/50'
                } ${blocked ? 'opacity-60' : ''}`}
              >
                {/* ID */}
                <td className="px-3 py-2 text-xs text-text-secondary font-mono">
                  {blocked && <Lock className="w-3 h-3 inline mr-1 text-yellow-500" />}
                  {task.id}
                </td>

                {/* Title */}
                <td className="px-3 py-2 text-text-primary truncate max-w-[250px]">
                  {task.title}
                </td>

                {/* Status */}
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[task.status]}`} />
                    <span className="text-xs">{STATUS_LABELS[task.status]}</span>
                  </span>
                </td>

                {/* Priority */}
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority] || 'bg-gray-500'}`} />
                    <span className="text-xs">P{task.priority}</span>
                  </span>
                </td>

                {/* Type */}
                <td className="px-3 py-2 text-xs text-text-secondary capitalize">{task.type}</td>

                {/* Labels */}
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {task.labels.slice(0, 3).map((label) => (
                      <span
                        key={label}
                        className="px-1.5 py-0.5 text-xs bg-bg-base rounded text-text-secondary"
                      >
                        {label}
                      </span>
                    ))}
                    {task.labels.length > 3 && (
                      <span className="text-xs text-text-secondary">+{task.labels.length - 3}</span>
                    )}
                  </div>
                </td>

                {/* Assignee */}
                <td className="px-3 py-2 text-center">
                  {task.assignee === 'agent' ? (
                    <Bot className="w-3.5 h-3.5 text-accent inline" />
                  ) : task.assignee === 'human' ? (
                    <User className="w-3.5 h-3.5 text-text-secondary inline" />
                  ) : (
                    <span className="text-xs text-text-secondary">—</span>
                  )}
                </td>

                {/* Updated */}
                <td className="px-3 py-2 text-xs text-text-secondary">
                  {relativeTime(task.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className="flex items-center justify-center py-12 text-text-secondary text-sm">
          No tasks match current filters
        </div>
      )}
    </div>
  );
}
