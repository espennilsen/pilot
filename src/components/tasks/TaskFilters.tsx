import { useTaskStore } from '../../stores/task-store';
import { Search, X } from 'lucide-react';
import type { TaskStatus, TaskPriority } from '../../../shared/types';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 0, label: 'P0' },
  { value: 1, label: 'P1' },
  { value: 2, label: 'P2' },
  { value: 3, label: 'P3' },
  { value: 4, label: 'P4' },
];

export function TaskFilters() {
  const { filters, setFilter, clearFilters } = useTaskStore();

  const hasActiveFilters =
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.search.length > 0;

  const toggleStatus = (status: TaskStatus) => {
    const current = filters.status;
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    setFilter('status', next);
  };

  const togglePriority = (priority: TaskPriority) => {
    const current = filters.priority;
    const next = current.includes(priority)
      ? current.filter((p) => p !== priority)
      : [...current, priority];
    setFilter('priority', next);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-surface overflow-x-auto">
      {/* Search Input */}
      <div className="relative flex-shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
        <input
          type="text"
          placeholder="Search tasks..."
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          className="pl-8 pr-3 py-1 text-sm bg-bg-base border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent w-48"
        />
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-text-secondary mr-1">Status:</span>
        {STATUS_OPTIONS.map(({ value, label }) => {
          const isActive = filters.status.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggleStatus(value)}
              className={`
                px-2.5 py-1 text-xs rounded transition-colors
                ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent'
                    : 'bg-bg-base text-text-secondary border border-transparent hover:border-border'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Priority Filters */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-text-secondary mr-1">Priority:</span>
        {PRIORITY_OPTIONS.map(({ value, label }) => {
          const isActive = filters.priority.includes(value);
          return (
            <button
              key={value}
              onClick={() => togglePriority(value)}
              className={`
                px-2.5 py-1 text-xs rounded transition-colors
                ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent'
                    : 'bg-bg-base text-text-secondary border border-transparent hover:border-border'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Clear Button */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded hover:bg-bg-base transition-colors flex-shrink-0"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}
