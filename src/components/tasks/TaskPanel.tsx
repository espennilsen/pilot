/**
 * TaskPanel — Right-side context panel for tasks.
 * Shows kanban/table views with a search bar.
 * Filters have moved to the left sidebar.
 */
import { useEffect } from 'react';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { TaskKanban } from './TaskKanban';
import { TaskTable } from './TaskTable';
import { TaskDetail } from './TaskDetail';
import { TaskCreateDialog } from './TaskCreateDialog';
import { LayoutGrid, List, Plus, ListTodo, Search } from 'lucide-react';
import { IPC } from '../../../shared/ipc';
import { on } from '../../lib/ipc-client';

export function TaskPanel() {
  const projectPath = useProjectStore((state) => state.projectPath);
  const {
    viewMode,
    setViewMode,
    selectedTaskId,
    showCreateDialog,
    setShowCreateDialog,
    tasks,
    loadBoard,
    filters,
    setFilter,
  } = useTaskStore();

  // Load board on mount and when project changes
  useEffect(() => {
    if (!projectPath) return;
    loadBoard(projectPath).catch(console.error);
  }, [projectPath, loadBoard]);

  // Listen for IPC events
  useEffect(() => {
    const unsubChanged = on(IPC.TASKS_CHANGED, (data: any) => {
      if (projectPath && (!data?.projectPath || data.projectPath === projectPath)) {
        loadBoard(projectPath).catch(console.error);
      }
    });
    const unsubShowCreate = on(IPC.TASKS_SHOW_CREATE, () => {
      setShowCreateDialog(true);
    });
    return () => {
      unsubChanged();
      unsubShowCreate();
    };
  }, [projectPath, loadBoard, setShowCreateDialog]);

  if (!projectPath) {
    return (
      <div className="flex flex-col h-full bg-bg-surface">
        <div className="flex items-center justify-center h-full text-text-secondary">
          <div className="text-center">
            <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>No project selected</p>
          </div>
        </div>
      </div>
    );
  }

  const hasTasks = tasks.length > 0;

  return (
    <div className="flex flex-col h-full bg-bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-elevated">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          📋 Tasks
        </h2>

        <div className="flex items-center gap-1.5">
          {/* Create button */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="p-1.5 hover:bg-bg-base rounded transition-colors"
            title="New task"
          >
            <Plus className="w-3.5 h-3.5 text-text-secondary" />
          </button>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-bg-base rounded border border-border">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Kanban view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'table'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Table view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="w-full pl-7 pr-3 py-1 text-sm bg-bg-base border border-border rounded focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden relative">
        {selectedTaskId ? (
          <TaskDetail />
        ) : hasTasks ? (
          viewMode === 'kanban' ? (
            <TaskKanban />
          ) : (
            <TaskTable />
          )
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <ListTodo className="w-12 h-12 mx-auto mb-3 text-text-secondary opacity-40" />
              <p className="text-sm font-medium text-text-primary mb-1">No tasks yet</p>
              <p className="text-xs text-text-secondary mb-3">
                Create your first task to get started
              </p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-bg-base bg-accent rounded hover:bg-accent/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Task
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create dialog */}
      {showCreateDialog && <TaskCreateDialog />}
    </div>
  );
}
