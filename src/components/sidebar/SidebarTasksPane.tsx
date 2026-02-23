import { useEffect, useState } from 'react';
import { relativeTime } from '../../lib/utils';
import {
  ListTodo,
  Plus,
  ArrowLeft,
  Lock,
  Bot,
  User,
  Trash2,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { IPC } from '../../../shared/ipc';
import { on } from '../../lib/ipc-client';
import type {
  TaskStatus,
  TaskPriority,
  TaskItem,
  TaskDependencyChain,
} from '../../../shared/types';

// ── Constants ──────────────────────────────────────────────────────────

const STATUS_CONFIG: {
  status: TaskStatus;
  label: string;
  color: string;
  dot: string;
}[] = [
  { status: 'open', label: 'Open', color: 'text-yellow-400', dot: 'bg-yellow-400' },
  { status: 'in_progress', label: 'In Progress', color: 'text-blue-400', dot: 'bg-blue-400' },
  { status: 'review', label: 'Review', color: 'text-purple-400', dot: 'bg-purple-400' },
  { status: 'done', label: 'Done', color: 'text-green-400', dot: 'bg-green-400' },
];

const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-blue-500',
  4: 'bg-gray-500',
};

const PRIORITY_PILLS: { value: TaskPriority; label: string }[] = [
  { value: 0, label: 'P0' },
  { value: 1, label: 'P1' },
  { value: 2, label: 'P2' },
  { value: 3, label: 'P3' },
  { value: 4, label: 'P4' },
];

type TaskTypeValue = 'epic' | 'task' | 'bug' | 'feature';
const TYPE_PILLS: { value: TaskTypeValue; label: string }[] = [
  { value: 'epic', label: 'Epic' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
];

const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: 'text-yellow-400' },
  { value: 'in_progress', label: 'In Progress', color: 'text-blue-400' },
  { value: 'review', label: 'Review', color: 'text-purple-400' },
  { value: 'done', label: 'Done', color: 'text-green-400' },
];

const PRIORITY_OPTIONS = [
  { value: 0, label: 'P0 Critical', color: 'text-red-500' },
  { value: 1, label: 'P1 High', color: 'text-orange-500' },
  { value: 2, label: 'P2 Medium', color: 'text-yellow-500' },
  { value: 3, label: 'P3 Low', color: 'text-blue-500' },
  { value: 4, label: 'P4 Backlog', color: 'text-gray-500' },
];

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

// ── Inline Task Detail (sidebar-fitted) ────────────────────────────────

function SidebarTaskDetail({
  task,
  projectPath,
  onNavigate,
}: {
  task: TaskItem;
  projectPath: string;
  onNavigate: (taskId: string) => void;
}) {
  const { updateTask, deleteTask, addComment, getDependencies, tasks } = useTaskStore();
  const [deps, setDeps] = useState<TaskDependencyChain | null>(null);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    getDependencies(projectPath, task.id).then(setDeps).catch(console.error);
  }, [task.id, projectPath, getDependencies]);

  const handleStatusChange = (status: TaskStatus) =>
    updateTask(projectPath, task.id, { status } as any);
  const handlePriorityChange = (priority: TaskPriority) =>
    updateTask(projectPath, task.id, { priority } as any);
  const handleAssigneeChange = (assignee: 'agent' | 'human' | null) =>
    updateTask(projectPath, task.id, { assignee } as any);
  const handleDelete = () => {
    if (window.confirm(`Delete ${task.id}?`)) deleteTask(projectPath, task.id);
  };
  const handleComment = () => {
    if (!commentText.trim()) return;
    addComment(projectPath, task.id, commentText.trim());
    setCommentText('');
  };

  const parentTask = task.parentId ? tasks.find((t) => t.id === task.parentId) : null;
  const selectClass =
    'bg-bg-base border border-border rounded px-2 py-1 text-xs text-text-primary appearance-none cursor-pointer focus:outline-none focus:border-accent';

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-xs">
      {/* Type badge + ID + delete */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-bg-elevated text-text-secondary uppercase">
            {task.type}
          </span>
          <span className="font-mono text-text-secondary">{task.id}</span>
        </div>
        <button onClick={handleDelete} className="p-1 hover:bg-bg-elevated rounded transition-colors">
          <Trash2 className="w-3 h-3 text-red-500" />
        </button>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-text-primary leading-tight">{task.title}</h3>

      {/* Status / Priority / Assignee */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">Status</label>
          <select
            value={task.status}
            onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            className={selectClass + ' w-full'}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">Priority</label>
          <select
            value={task.priority}
            onChange={(e) => handlePriorityChange(Number(e.target.value) as TaskPriority)}
            className={selectClass + ' w-full'}
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">Assignee</label>
          <select
            value={task.assignee || 'none'}
            onChange={(e) =>
              handleAssigneeChange(
                e.target.value === 'none' ? null : (e.target.value as 'agent' | 'human')
              )
            }
            className={selectClass + ' w-full'}
          >
            <option value="none">None</option>
            <option value="agent">Agent</option>
            <option value="human">Human</option>
          </select>
        </div>
      </div>

      {/* Epic parent */}
      {parentTask && (
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">Epic</label>
          <button
            onClick={() => onNavigate(parentTask.id)}
            className="text-accent hover:underline text-xs"
          >
            {parentTask.title}
          </button>
        </div>
      )}

      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <span
              key={l}
              className="px-1.5 py-0.5 text-[10px] rounded bg-bg-elevated text-text-secondary"
            >
              {l}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {task.description && (
        <div>
          <label className="block text-[10px] text-text-secondary mb-0.5">Description</label>
          <div className="bg-bg-elevated rounded p-2 text-text-primary whitespace-pre-wrap text-xs">
            {task.description}
          </div>
        </div>
      )}

      {/* Dependencies */}
      {deps && (deps.blockers.length > 0 || deps.dependents.length > 0) && (
        <div className="space-y-1.5">
          {deps.blockers.length > 0 && (
            <div>
              <label className="flex items-center gap-1 text-[10px] text-text-secondary mb-0.5">
                <Lock className="w-3 h-3" /> Blocked by
              </label>
              {deps.blockers.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onNavigate(b.id)}
                  className="block text-accent hover:underline text-xs truncate"
                >
                  {b.id} — {b.title}
                </button>
              ))}
            </div>
          )}
          {deps.dependents.length > 0 && (
            <div>
              <label className="block text-[10px] text-text-secondary mb-0.5">Blocking</label>
              {deps.dependents.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onNavigate(d.id)}
                  className="block text-accent hover:underline text-xs truncate"
                >
                  {d.id} — {d.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="text-[10px] text-text-secondary space-y-0.5 pt-1 border-t border-border/50">
        <div>
          Created {new Date(task.createdAt).toLocaleDateString()} by {task.createdBy}
        </div>
        <div>Updated {relativeTime(task.updatedAt)}</div>
        {task.estimateMinutes != null && (
          <div>
            Estimate:{' '}
            {task.estimateMinutes >= 60
              ? `${Math.floor(task.estimateMinutes / 60)}h`
              : `${task.estimateMinutes}m`}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="pt-1 border-t border-border/50">
        <label className="flex items-center gap-1 text-[10px] text-text-secondary mb-1.5">
          <MessageSquare className="w-3 h-3" /> Comments ({task.comments.length})
        </label>
        <div className="space-y-2 mb-2">
          {task.comments.map((c) => (
            <div key={c.id} className="bg-bg-elevated rounded p-2">
              <div className="flex items-center gap-1.5 mb-0.5 text-[10px]">
                {c.author === 'agent' ? (
                  <Bot className="w-3 h-3 text-accent" />
                ) : (
                  <User className="w-3 h-3 text-text-secondary" />
                )}
                <span className="font-medium text-text-primary">
                  {c.author === 'agent' ? 'Agent' : 'Human'}
                </span>
                <span className="text-text-secondary">{relativeTime(c.createdAt)}</span>
              </div>
              <div className="text-text-primary whitespace-pre-wrap">{c.text}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleComment();
              }
            }}
            placeholder="Add comment…"
            className="flex-1 bg-bg-base border border-border rounded px-2 py-1 text-xs text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleComment}
            disabled={!commentText.trim()}
            className="px-2 py-1 bg-accent text-bg-base rounded text-xs font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
