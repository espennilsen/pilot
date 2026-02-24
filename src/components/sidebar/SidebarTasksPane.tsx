import { useEffect, useState } from 'react';
import {
  ListTodo,
  Plus,
  ArrowLeft,
  Lock,
  Bot,
  User,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { IPC } from '../../../shared/ipc';
import { on } from '../../lib/ipc-client';
import type { TaskStatus } from '../../../shared/types';
import SidebarTaskDetail from './tasks/SidebarTaskDetail';
import {
  STATUS_CONFIG,
  PRIORITY_COLORS,
  PRIORITY_PILLS,
  TYPE_PILLS,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './tasks/task-constants';

// ── Component ──────────────────────────────────────────────────────────

export function SidebarTasksPane() {
  const {
    tasks,
    loadBoard,
    setShowCreateDialog,
    updateTask,
    deleteTask,
    addComment,
    getDependencies,
    blockedTasks,
    filters,
    setFilter,
  } = useTaskStore();
  const projectPath = useProjectStore((s) => s.projectPath);
  // Which statuses are expanded (toggle inline)
  const [expandedStatuses, setExpandedStatuses] = useState<Set<TaskStatus>>(new Set());
  // Which task detail is open (replaces the whole pane)
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // Load board when project changes
  useEffect(() => {
    if (projectPath) loadBoard(projectPath);
  }, [projectPath, loadBoard]);

  // Listen for task changes
  useEffect(() => {
    const unsub = on(IPC.TASKS_CHANGED, () => {
      if (projectPath) loadBoard(projectPath);
    });
    return unsub;
  }, [projectPath, loadBoard]);

  // Listen for show panel IPC event
  useEffect(() => {
    const unsub = on(IPC.TASKS_SHOW_PANEL, () => {
      // already on this pane
    });
    return unsub;
  }, []);

  // Reset state when project changes
  useEffect(() => {
    setExpandedStatuses(new Set());
    setDetailTaskId(null);
  }, [projectPath]);

  const toggleStatus = (status: TaskStatus) => {
    setExpandedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const getTasksForStatus = (status: TaskStatus) =>
    tasks
      .filter((t) => t.status === status)
      .filter((t) => {
        if (filters.priority.length > 0 && !filters.priority.includes(t.priority)) return false;
        if (filters.type.length > 0 && !filters.type.includes(t.type)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });

  // ── No project ───────────────────────────────────────────────────────

  if (!projectPath) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-base flex items-center justify-center">
          <ListTodo className="w-5 h-5 text-text-secondary" />
        </div>
        <p className="text-sm font-medium text-text-primary">Tasks</p>
        <p className="text-xs text-text-secondary">Open a project to manage tasks.</p>
      </div>
    );
  }

  // Back bar — only shown in detail view
  const backBar = detailTaskId ? (
    <div className="flex items-center px-3 py-1.5 border-b border-border/50">
      <button
        onClick={() => setDetailTaskId(null)}
        className="flex items-center gap-1 p-1 hover:bg-bg-elevated rounded transition-colors text-xs text-text-secondary"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back</span>
      </button>
    </div>
  ) : null;

  // ── Detail view ──────────────────────────────────────────────────────

  if (detailTaskId) {
    const task = tasks.find((t) => t.id === detailTaskId);
    if (!task) {
      return (
        <div className="flex-1 flex flex-col">
          {backBar}
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
            Task not found
          </div>
        </div>
      );
    }
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {backBar}
        <SidebarTaskDetail
          task={task}
          projectPath={projectPath}
          onNavigate={(id) => setDetailTaskId(id)}
        />
      </div>
    );
  }

  // ── Summary view with inline expansion ───────────────────────────────

  const totalTasks = tasks.length;

  if (totalTasks === 0) {
    return (
      <div className="flex-1 flex flex-col">
        {backBar}
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <ListTodo className="w-8 h-8 text-text-secondary opacity-40" />
          <p className="text-xs text-text-secondary">No tasks yet</p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Create Task
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {backBar}

      {/* Filter pills — above the task list, not scrollable */}
      <div className="px-3 pt-2 pb-1.5 border-b border-border/50 space-y-1.5">
        {/* Priority */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-text-secondary mr-0.5">Priority:</span>
          {PRIORITY_PILLS.map(({ value, label }) => {
            const isActive = filters.priority.includes(value);
            return (
              <button
                key={value}
                onClick={() => {
                  const cur = filters.priority;
                  setFilter(
                    'priority',
                    isActive ? cur.filter((p) => p !== value) : [...cur, value]
                  );
                }}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent'
                    : 'bg-bg-base text-text-secondary border border-transparent hover:border-border'
                }`}
              >
                {label}
              </button>
            );
          })}
          {filters.priority.length > 0 && (
            <button
              onClick={() => setFilter('priority', [])}
              className="p-0.5 text-text-secondary hover:text-text-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* Type */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-text-secondary mr-0.5">Type:</span>
          {TYPE_PILLS.map(({ value, label }) => {
            const isActive = filters.type.includes(value);
            return (
              <button
                key={value}
                onClick={() => {
                  const cur = filters.type;
                  setFilter(
                    'type',
                    isActive ? cur.filter((t) => t !== value) : [...cur, value]
                  );
                }}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent'
                    : 'bg-bg-base text-text-secondary border border-transparent hover:border-border'
                }`}
              >
                {label}
              </button>
            );
          })}
          {filters.type.length > 0 && (
            <button
              onClick={() => setFilter('type', [])}
              className="p-0.5 text-text-secondary hover:text-text-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Status sections with inline task lists */}
        <div className="py-1">
          {STATUS_CONFIG.map(({ status, label, color, dot }) => {
            const statusTasks = getTasksForStatus(status);
            const count = statusTasks.length;
            const isExpanded = expandedStatuses.has(status);

            return (
              <div key={status}>
                {/* Status row — click to expand/collapse */}
                <button
                  onClick={() => toggleStatus(status)}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-bg-elevated/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-text-secondary" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-text-secondary" />
                    )}
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-xs text-text-secondary">{label}</span>
                  </div>
                  <span
                    className={`text-xs font-medium tabular-nums ${count > 0 ? color : 'text-text-secondary'}`}
                  >
                    {count}
                  </span>
                </button>

                {/* Expanded task list */}
                {isExpanded && (
                  <div className="pb-1">
                    {statusTasks.length === 0 ? (
                      <div className="pl-8 pr-3 py-2 text-[10px] text-text-secondary">
                        No tasks
                      </div>
                    ) : (
                      statusTasks.map((task) => {
                        const isBlocked = blockedTasks.some((bt) => bt.id === task.id);
                        return (
                          <button
                            key={task.id}
                            onClick={() => setDetailTaskId(task.id)}
                            className={`w-full text-left pl-7 pr-3 py-1.5 hover:bg-bg-elevated/60 transition-colors ${
                              isBlocked ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="flex items-start gap-1.5">
                              <span
                                className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                                  PRIORITY_COLORS[task.priority] || 'bg-gray-500'
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-text-primary truncate">
                                  {task.title}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-secondary">
                                  <span className="font-mono">{task.id}</span>
                                  {task.assignee === 'agent' && (
                                    <Bot className="w-2.5 h-2.5 text-accent" />
                                  )}
                                  {task.assignee === 'human' && (
                                    <User className="w-2.5 h-2.5" />
                                  )}
                                  {isBlocked && (
                                    <Lock className="w-2.5 h-2.5 text-yellow-500" />
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
