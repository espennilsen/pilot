import { useState, useEffect } from 'react';
import { relativeTime } from '../../lib/utils';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { ArrowLeft, Trash2, Edit, Lock, Bot, User, MessageSquare, ChevronDown } from 'lucide-react';
import type { TaskItem, TaskStatus, TaskPriority, TaskDependencyChain } from '../../../shared/types';

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

export function TaskDetail() {
  const { selectedTaskId, selectTask, tasks, updateTask, deleteTask, addComment, getDependencies } = useTaskStore();
  const projectPath = useProjectStore((state) => state.projectPath);
  
  const [newComment, setNewComment] = useState('');
  const [dependencies, setDependencies] = useState<TaskDependencyChain | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const task = tasks.find((t) => t.id === selectedTaskId);

  useEffect(() => {
    if (selectedTaskId && projectPath) {
      getDependencies(projectPath, selectedTaskId).then(setDependencies).catch(console.error);
    }
  }, [selectedTaskId, projectPath, getDependencies]);

  if (!task || !projectPath) {
    return null;
  }

  const handleBack = () => {
    selectTask(null);
  };

  const handleDelete = async () => {
    if (window.confirm(`Delete task ${task.id}?`)) {
      await deleteTask(projectPath, task.id);
      selectTask(null);
    }
  };

  const handleStatusChange = async (status: TaskStatus) => {
    await updateTask(projectPath, task.id, { status });
  };

  const handlePriorityChange = async (priority: TaskPriority) => {
    await updateTask(projectPath, task.id, { priority });
  };

  const handleAssigneeChange = async (assignee: 'agent' | 'human' | null) => {
    await updateTask(projectPath, task.id, { assignee });
  };

  const handleRemoveLabel = async (label: string) => {
    const newLabels = task.labels.filter((l) => l !== label);
    await updateTask(projectPath, task.id, { labels: newLabels });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await addComment(projectPath, task.id, newComment.trim());
    setNewComment('');
  };

  const handleTaskClick = (taskId: string) => {
    selectTask(taskId);
  };

  const statusOption = STATUS_OPTIONS.find((s) => s.value === task.status);
  const priorityOption = PRIORITY_OPTIONS.find((p) => p.value === task.priority);
  const parentTask = task.parentId ? tasks.find((t) => t.id === task.parentId) : null;

  return (
    <div className="h-full flex flex-col bg-bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-1 hover:bg-bg-elevated rounded transition-colors"
            title="Back to list"
          >
            <ArrowLeft size={20} className="text-text-secondary" />
          </button>
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-bg-elevated text-text-secondary uppercase">
            {task.type}
          </span>
          <span className="text-sm font-mono text-text-secondary">{task.id}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-2 hover:bg-bg-elevated rounded transition-colors"
            title="Edit task"
          >
            <Edit size={16} className="text-text-secondary" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 hover:bg-bg-elevated rounded transition-colors"
            title="Delete task"
          >
            <Trash2 size={16} className="text-red-500" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Title */}
        <h2 className="text-2xl font-semibold text-text-primary mb-6">{task.title}</h2>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Status</label>
            <div className="relative">
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
                className={`w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm ${statusOption?.color || 'text-text-primary'} appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent`}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Priority</label>
            <div className="relative">
              <select
                value={task.priority}
                onChange={(e) => handlePriorityChange(Number(e.target.value) as TaskPriority)}
                className={`w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm ${priorityOption?.color || 'text-text-primary'} appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent`}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Assignee</label>
            <div className="relative">
              <select
                value={task.assignee || 'none'}
                onChange={(e) => handleAssigneeChange(e.target.value === 'none' ? null : e.target.value as 'agent' | 'human')}
                className="w-full bg-bg-elevated border border-border rounded px-3 py-2 text-sm text-text-primary appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="none">None</option>
                <option value="agent">Agent</option>
                <option value="human">Human</option>
              </select>
              <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
            </div>
          </div>

          {/* Epic */}
          {parentTask && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Epic</label>
              <button
                onClick={() => handleTaskClick(parentTask.id)}
                className="text-sm text-accent hover:underline text-left"
              >
                {parentTask.title}
              </button>
            </div>
          )}

          {/* Estimate */}
          {task.estimateMinutes != null && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Estimate</label>
              <div className="text-sm text-text-primary">
                {task.estimateMinutes >= 60
                  ? `${Math.floor(task.estimateMinutes / 60)}h ${task.estimateMinutes % 60 ? (task.estimateMinutes % 60) + 'm' : ''}`
                  : `${task.estimateMinutes}m`}
              </div>
            </div>
          )}

          {/* Created */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Created</label>
            <div className="text-sm text-text-primary">
              {new Date(task.createdAt).toLocaleDateString()} by {task.createdBy}
            </div>
          </div>

          {/* Updated */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Updated</label>
            <div className="text-sm text-text-primary">{relativeTime(task.updatedAt)}</div>
          </div>
        </div>

        {/* Labels */}
        {task.labels.length > 0 && (
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-secondary mb-2">Labels</label>
            <div className="flex flex-wrap gap-2">
              {task.labels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-bg-elevated text-text-primary border border-border"
                >
                  {label}
                  <button
                    onClick={() => handleRemoveLabel(label)}
                    className="hover:text-red-500 transition-colors"
                    title="Remove label"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-secondary mb-2">Description</label>
            <div className="bg-bg-elevated border border-border rounded px-4 py-3 text-sm text-text-primary whitespace-pre-wrap">
              {task.description}
            </div>
          </div>
        )}

        {/* Dependencies */}
        {dependencies && (dependencies.blockers.length > 0 || dependencies.dependents.length > 0) && (
          <div className="mb-6">
            <label className="block text-xs font-medium text-text-secondary mb-2">Dependencies</label>
            <div className="bg-bg-elevated border border-border rounded divide-y divide-border">
              {dependencies.blockers.length > 0 && (
                <div className="px-4 py-3">
                  <div className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
                    <Lock size={12} />
                    Blocked by
                  </div>
                  <div className="space-y-1">
                    {dependencies.blockers.map((blocker) => (
                      <button
                        key={blocker.id}
                        onClick={() => handleTaskClick(blocker.id)}
                        className="block text-sm text-accent hover:underline"
                      >
                        {blocker.id} – {blocker.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {dependencies.dependents.length > 0 && (
                <div className="px-4 py-3">
                  <div className="text-xs font-medium text-text-secondary mb-2">Blocking</div>
                  <div className="space-y-1">
                    {dependencies.dependents.map((dependent) => (
                      <button
                        key={dependent.id}
                        onClick={() => handleTaskClick(dependent.id)}
                        className="block text-sm text-accent hover:underline"
                      >
                        {dependent.id} – {dependent.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="mb-6">
          <label className="block text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
            <MessageSquare size={12} />
            Comments ({task.comments.length})
          </label>
          <div className="space-y-3 mb-3">
            {task.comments.map((comment) => (
              <div key={comment.id} className="bg-bg-elevated border border-border rounded px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  {comment.author === 'agent' ? (
                    <Bot size={14} className="text-accent" />
                  ) : (
                    <User size={14} className="text-text-secondary" />
                  )}
                  <span className="text-xs font-medium text-text-primary">
                    {comment.author === 'agent' ? 'Agent' : 'Human'}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {relativeTime(comment.createdAt)}
                  </span>
                </div>
                <div className="text-sm text-text-primary whitespace-pre-wrap">{comment.text}</div>
              </div>
            ))}
          </div>
          {/* Comment input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddComment();
                }
              }}
              placeholder="Add a comment..."
              className="flex-1 bg-bg-elevated border border-border rounded px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <button
              onClick={handleAddComment}
              disabled={!newComment.trim()}
              className="px-4 py-2 bg-accent text-white rounded text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
