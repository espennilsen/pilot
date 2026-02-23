/**
 * TaskBoardView — Full-width task board rendered as a main content tab.
 * Opened via the popup icon in the sidebar tasks header.
 */
import { useEffect } from 'react';
import { useTaskStore } from '../../stores/task-store';
import { useProjectStore } from '../../stores/project-store';
import { TaskKanban } from './TaskKanban';
import { TaskTable } from './TaskTable';
import { TaskDetail } from './TaskDetail';
import { TaskCreateDialog } from './TaskCreateDialog';
import { TaskFilters } from './TaskFilters';
import { LayoutGrid, List, Plus, ListTodo, Search } from 'lucide-react';
import { IPC } from '../../../shared/ipc';
import { on } from '../../lib/ipc-client';

export function TaskBoardView() {
  const projectPath = useProjectStore((s) => s.projectPath);
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
      <div className="flex-1 flex items-center justify-center bg-bg-base text-text-secondary">
        <div className="text-center">
          <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>No project selected</p>
        </div>
      </div>
    );
  }

  const hasTasks = tasks.length > 0;

  return (
    <div className="flex-1 flex flex-col bg-bg-base overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-surface">
        <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
          📋 Task Board
        </h2>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm bg-bg-base border border-border rounded-md focus:outline-none focus:border-accent w-56"
            />
          </div>

          {/* Create button */}
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-bg-base bg-accent rounded-md hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New
          </button>

          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 bg-bg-base rounded border border-border">
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              title="Kanban view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'table'
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
              title="Table view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <TaskFilters />

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
              <ListTodo className="w-16 h-16 mx-auto mb-4 text-text-secondary opacity-40" />
              <p className="text-lg font-medium text-text-primary mb-2">No tasks yet</p>
              <p className="text-sm text-text-secondary mb-4">Create your first task to get started</p>
              <button
                onClick={() => setShowCreateDialog(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-bg-base bg-accent rounded-md hover:bg-accent/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
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
