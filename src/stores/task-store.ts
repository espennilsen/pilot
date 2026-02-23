import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import type {
  TaskItem,
  TaskBoardData,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskAssignee,
  TaskEpicProgress,
  TaskDependencyChain,
} from '../../shared/types';
import { invoke } from '../lib/ipc-client';

export type TaskViewMode = 'kanban' | 'table';

export interface TaskFilters {
  status: TaskStatus[];
  priority: TaskPriority[];
  type: TaskType[];
  labels: string[];
  assignee: TaskAssignee[];
  search: string;
  epicId: string | null;
}

interface TaskStore {
  // State
  tasksEnabled: boolean;
  tasks: TaskItem[];
  isLoading: boolean;
  viewMode: TaskViewMode;
  selectedTaskId: string | null;
  showCreateDialog: boolean;
  editingTask: TaskItem | null;  // if set, dialog is in edit mode
  filters: TaskFilters;

  // Derived (cached from last board load)
  readyTasks: TaskItem[];
  blockedTasks: TaskItem[];
  epics: TaskItem[];

  // Actions
  loadBoard: (projectPath: string) => Promise<void>;
  createTask: (projectPath: string, input: Partial<TaskItem>) => Promise<TaskItem | null>;
  updateTask: (projectPath: string, taskId: string, updates: Partial<TaskItem>) => Promise<TaskItem | null>;
  deleteTask: (projectPath: string, taskId: string) => Promise<boolean>;
  addComment: (projectPath: string, taskId: string, text: string) => Promise<void>;
  moveTask: (projectPath: string, taskId: string, newStatus: TaskStatus) => Promise<void>;
  selectTask: (taskId: string | null) => void;
  setViewMode: (mode: TaskViewMode) => void;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
  clearFilters: () => void;
  setTasksEnabled: (enabled: boolean) => void;
  setShowCreateDialog: (show: boolean) => void;
  setEditingTask: (task: TaskItem | null) => void;

  // Queries
  getFilteredTasks: () => TaskItem[];
  getTasksByStatus: (status: TaskStatus) => TaskItem[];
  getEpicProgress: (projectPath: string, epicId: string) => Promise<TaskEpicProgress | null>;
  getDependencies: (projectPath: string, taskId: string) => Promise<TaskDependencyChain | null>;
}

const defaultFilters: TaskFilters = {
  status: [],
  priority: [],
  type: [],
  labels: [],
  assignee: [],
  search: '',
  epicId: null,
};

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasksEnabled: true,
  tasks: [],
  isLoading: false,
  viewMode: 'kanban',
  selectedTaskId: null,
  showCreateDialog: false,
  editingTask: null,
  filters: { ...defaultFilters },
  readyTasks: [],
  blockedTasks: [],
  epics: [],

  loadBoard: async (projectPath: string) => {
    set({ isLoading: true });
    try {
      const board = (await invoke(IPC.TASKS_LOAD_BOARD, projectPath)) as TaskBoardData;
      set({
        tasks: board.tasks,
        readyTasks: board.readyTasks,
        blockedTasks: board.blockedTasks,
        epics: board.epics,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  createTask: async (projectPath: string, input: Partial<TaskItem>) => {
    try {
      const task = (await invoke(IPC.TASKS_CREATE, projectPath, input)) as TaskItem;
      // Reload board to get updated derived state
      await get().loadBoard(projectPath);
      return task;
    } catch {
      return null;
    }
  },

  updateTask: async (projectPath: string, taskId: string, updates: Partial<TaskItem>) => {
    try {
      const task = (await invoke(IPC.TASKS_UPDATE, projectPath, taskId, updates)) as TaskItem;
      await get().loadBoard(projectPath);
      return task;
    } catch {
      return null;
    }
  },

  deleteTask: async (projectPath: string, taskId: string) => {
    try {
      const result = (await invoke(IPC.TASKS_DELETE, projectPath, taskId)) as boolean;
      if (result) {
        // Close detail if this task was selected
        if (get().selectedTaskId === taskId) {
          set({ selectedTaskId: null });
        }
        await get().loadBoard(projectPath);
      }
      return result;
    } catch {
      return false;
    }
  },

  addComment: async (projectPath: string, taskId: string, text: string) => {
    try {
      await invoke(IPC.TASKS_COMMENT, projectPath, taskId, text);
      await get().loadBoard(projectPath);
    } catch {
      // silent
    }
  },

  moveTask: async (projectPath: string, taskId: string, newStatus: TaskStatus) => {
    await get().updateTask(projectPath, taskId, { status: newStatus } as any);
  },

  selectTask: (taskId) => set({ selectedTaskId: taskId }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  clearFilters: () => set({ filters: { ...defaultFilters } }),

  setTasksEnabled: (enabled) => {
    set({ tasksEnabled: enabled });
    invoke(IPC.TASKS_SET_ENABLED, enabled).catch(() => {});
  },

  setShowCreateDialog: (show) => set({ showCreateDialog: show, editingTask: show ? get().editingTask : null }),

  setEditingTask: (task) => set({ editingTask: task, showCreateDialog: !!task }),

  getFilteredTasks: () => {
    const { tasks, filters } = get();
    return tasks.filter((task) => {
      if (filters.status.length > 0 && !filters.status.includes(task.status)) return false;
      if (filters.priority.length > 0 && !filters.priority.includes(task.priority)) return false;
      if (filters.type.length > 0 && !filters.type.includes(task.type)) return false;
      if (filters.assignee.length > 0 && !filters.assignee.includes(task.assignee)) return false;
      if (filters.labels.length > 0 && !filters.labels.some((l) => task.labels.includes(l))) return false;
      if (filters.epicId !== null && task.parentId !== filters.epicId) return false;
      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (
          !task.id.toLowerCase().includes(s) &&
          !task.title.toLowerCase().includes(s) &&
          !task.description.toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      return true;
    });
  },

  getTasksByStatus: (status: TaskStatus) => {
    return get().getFilteredTasks().filter((t) => t.status === status);
  },

  getEpicProgress: async (projectPath, epicId) => {
    try {
      return (await invoke(IPC.TASKS_EPIC_PROGRESS, projectPath, epicId)) as TaskEpicProgress;
    } catch {
      return null;
    }
  },

  getDependencies: async (projectPath, taskId) => {
    try {
      return (await invoke(IPC.TASKS_DEPENDENCIES, projectPath, taskId)) as TaskDependencyChain;
    } catch {
      return null;
    }
  },
}));
