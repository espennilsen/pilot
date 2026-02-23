import { useState, useEffect, useCallback } from 'react';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { X } from 'lucide-react';
import type { TaskType, TaskPriority, TaskAssignee } from '../../../shared/types';

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'epic', label: 'Epic' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 0, label: 'P0 Critical' },
  { value: 1, label: 'P1 High' },
  { value: 2, label: 'P2 Medium' },
  { value: 3, label: 'P3 Low' },
  { value: 4, label: 'P4 Backlog' },
];

const ASSIGNEE_OPTIONS: { value: TaskAssignee; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'human', label: 'Human' },
  { value: 'agent', label: 'Agent' },
];

export function TaskCreateDialog() {
  const { showCreateDialog, setShowCreateDialog, editingTask, setEditingTask, createTask, updateTask, epics } = useTaskStore();
  const { projectPath } = useProjectStore();

  const isEditing = !!editingTask;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('task');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [assignee, setAssignee] = useState<TaskAssignee>(null);
  const [parentId, setParentId] = useState<string>('');
  const [blockedBy, setBlockedBy] = useState('');
  const [labelsText, setLabelsText] = useState('');

  // Pre-fill form when editing
  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description);
      setType(editingTask.type);
      setPriority(editingTask.priority);
      setAssignee(editingTask.assignee);
      setParentId(editingTask.parentId || '');
      const blockerIds = editingTask.dependencies
        .filter((d) => d.type === 'blocked_by')
        .map((d) => d.taskId);
      setBlockedBy(blockerIds.join(', '));
      setLabelsText(editingTask.labels.join(', '));
    } else {
      setTitle('');
      setDescription('');
      setType('task');
      setPriority(2);
      setAssignee(null);
      setParentId('');
      setBlockedBy('');
      setLabelsText('');
    }
  }, [editingTask, showCreateDialog]);

  const handleClose = useCallback(() => {
    setShowCreateDialog(false);
    setEditingTask(null);
  }, [setShowCreateDialog, setEditingTask]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !projectPath) return;

    const labels = labelsText
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const blockedByIds = blockedBy
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const dependencies = blockedByIds.map((id) => ({
      type: 'blocked_by' as const,
      taskId: id,
    }));

    if (isEditing && editingTask) {
      await updateTask(projectPath, editingTask.id, {
        title: title.trim(),
        description,
        type,
        priority,
        assignee,
        parentId: parentId || null,
        dependencies,
        labels,
      } as any);
    } else {
      await createTask(projectPath, {
        title: title.trim(),
        description,
        type,
        priority,
        assignee,
        parentId: parentId || null,
        dependencies,
        labels,
      } as any);
    }

    handleClose();
  }, [
    title,
    description,
    type,
    priority,
    assignee,
    parentId,
    blockedBy,
    labelsText,
    projectPath,
    isEditing,
    editingTask,
    createTask,
    updateTask,
    handleClose,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleClose, handleSubmit]
  );

  if (!showCreateDialog) return null;

  const selectClass =
    'bg-bg-base border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent';
  const inputClass =
    'w-full bg-bg-base border border-border rounded-md px-3 py-2 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-bg-surface border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">
            {isEditing ? 'Edit Task' : 'Create Task'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-bg-elevated rounded transition-colors"
          >
            <X className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className={inputClass}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task (Markdown)"
              className={`${inputClass} resize-y`}
              rows={4}
            />
          </div>

          {/* Type / Priority / Assignee row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TaskType)}
                className={selectClass + ' w-full'}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) as TaskPriority)}
                className={selectClass + ' w-full'}
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Assignee</label>
              <select
                value={assignee || ''}
                onChange={(e) =>
                  setAssignee((e.target.value || null) as TaskAssignee)
                }
                className={selectClass + ' w-full'}
              >
                {ASSIGNEE_OPTIONS.map((opt) => (
                  <option key={String(opt.value)} value={opt.value || ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Epic (parent) */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Epic (parent)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={selectClass + ' w-full'}
            >
              <option value="">None</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.id} — {epic.title}
                </option>
              ))}
            </select>
          </div>

          {/* Blocked by */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Blocked by (comma-separated task IDs)
            </label>
            <input
              type="text"
              value={blockedBy}
              onChange={(e) => setBlockedBy(e.target.value)}
              placeholder="pt-a1b2, pt-c3d4"
              className={inputClass}
            />
          </div>

          {/* Labels */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Labels (comma-separated)
            </label>
            <input
              type="text"
              value={labelsText}
              onChange={(e) => setLabelsText(e.target.value)}
              placeholder="auth, backend, urgent"
              className={inputClass}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-4 py-2 text-sm bg-accent text-bg-base rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isEditing ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
