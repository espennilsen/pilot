import type { TaskStatus, TaskPriority } from '../../../../shared/types';

// ── Constants ──────────────────────────────────────────────────────────

export const STATUS_CONFIG: {
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

export const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-blue-500',
  4: 'bg-gray-500',
};

export const PRIORITY_PILLS: { value: TaskPriority; label: string }[] = [
  { value: 0, label: 'P0' },
  { value: 1, label: 'P1' },
  { value: 2, label: 'P2' },
  { value: 3, label: 'P3' },
  { value: 4, label: 'P4' },
];

export type TaskTypeValue = 'epic' | 'task' | 'bug' | 'feature';
export const TYPE_PILLS: { value: TaskTypeValue; label: string }[] = [
  { value: 'epic', label: 'Epic' },
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
];

export const STATUS_OPTIONS: { value: TaskStatus; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: 'text-yellow-400' },
  { value: 'in_progress', label: 'In Progress', color: 'text-blue-400' },
  { value: 'review', label: 'Review', color: 'text-purple-400' },
  { value: 'done', label: 'Done', color: 'text-green-400' },
];

export const PRIORITY_OPTIONS = [
  { value: 0, label: 'P0 Critical', color: 'text-red-500' },
  { value: 1, label: 'P1 High', color: 'text-orange-500' },
  { value: 2, label: 'P2 Medium', color: 'text-yellow-500' },
  { value: 3, label: 'P3 Low', color: 'text-blue-500' },
  { value: 4, label: 'P4 Backlog', color: 'text-gray-500' },
];
