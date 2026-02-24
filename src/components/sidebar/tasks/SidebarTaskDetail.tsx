import { useEffect, useState } from 'react';
import { relativeTime } from '../../../lib/utils';
import { Trash2, Lock, Bot, User, MessageSquare } from 'lucide-react';
import { useTaskStore } from '../../../stores/task-store';
import type {
  TaskStatus,
  TaskPriority,
  TaskItem,
  TaskDependencyChain,
} from '../../../../shared/types';
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from './task-constants';

// ── Inline Task Detail (sidebar-fitted) ────────────────────────────────

export default function SidebarTaskDetail({
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
