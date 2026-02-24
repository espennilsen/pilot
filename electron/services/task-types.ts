// ============================================================================
// Task Types & Interfaces
// ============================================================================

export type TaskStatus = 'open' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 0 | 1 | 2 | 3 | 4;
export type TaskType = 'epic' | 'task' | 'bug' | 'feature';
export type TaskAssignee = 'human' | 'agent' | null;
export type TaskCreator = 'human' | 'agent';

export interface Dependency {
  type: 'blocks' | 'blocked_by' | 'related';
  taskId: string;
}

export interface Comment {
  id: string;
  text: string;
  author: 'human' | 'agent';
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  parentId: string | null;
  dependencies: Dependency[];
  labels: string[];
  assignee: TaskAssignee;
  estimateMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  createdBy: TaskCreator;
  comments: Comment[];
}

export interface TaskBoard {
  projectPath: string;
  tasks: Task[];
  readyTasks: Task[];
  blockedTasks: Task[];
  epics: Task[];
}

export interface TaskFilter {
  status?: TaskStatus[];
  priority?: TaskPriority[];
  type?: TaskType[];
  labels?: string[];
  assignee?: TaskAssignee[];
  parentId?: string | null;
  search?: string;
}

export interface EpicProgress {
  total: number;
  open: number;
  inProgress: number;
  review: number;
  done: number;
  percentComplete: number;
}

export interface DependencyChain {
  blockers: Task[];
  dependents: Task[];
}

export interface TaskCreateInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  parentId?: string | null;
  dependencies?: Dependency[];
  labels?: string[];
  assignee?: TaskAssignee;
  estimateMinutes?: number | null;
  createdBy?: TaskCreator;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  parentId?: string | null;
  dependencies?: Dependency[];
  labels?: string[];
  assignee?: TaskAssignee;
  estimateMinutes?: number | null;
}

/**
 * Internal type for board storage with file watcher
 */
export interface BoardEntry {
  board: TaskBoard;
  watcher: any; // FSWatcher | null
}
