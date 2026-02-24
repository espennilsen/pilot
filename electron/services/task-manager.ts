import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { watch, type FSWatcher } from 'chokidar';

// ============================================================================
// Types & Interfaces
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

interface BoardEntry {
  board: TaskBoard;
  watcher: FSWatcher | null;
}

// ============================================================================
// TaskManager Service
// ============================================================================

export class TaskManager {
  private boards: Map<string, BoardEntry> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  public onBoardChanged: ((projectPath: string) => void) | null = null;
  private _enabled = true;

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  // --------------------------------------------------------------------------
  // ID Generation
  // --------------------------------------------------------------------------

  generateId(): string {
    return 'pt-' + randomBytes(4).toString('hex');
  }

  generateCommentId(): string {
    return 'cm-' + randomBytes(4).toString('hex');
  }

  // --------------------------------------------------------------------------
  // File System Helpers
  // --------------------------------------------------------------------------

  private ensureTaskDir(projectPath: string): void {
    const taskDir = join(projectPath, '.pilot', 'tasks');
    if (!existsSync(taskDir)) {
      mkdirSync(taskDir, { recursive: true });
    }
  }

  private getTaskFilePath(projectPath: string): string {
    return join(projectPath, '.pilot', 'tasks', 'tasks.jsonl');
  }

  private appendToFile(projectPath: string, task: Task): void {
    this.ensureTaskDir(projectPath);
    const filePath = this.getTaskFilePath(projectPath);
    const line = JSON.stringify(task) + '\n';
    appendFileSync(filePath, line, 'utf-8');
  }

  /**
   * Parse a tasks.jsonl file, deduplicating by ID (last occurrence wins).
   */
  private async parseTasksFile(filePath: string): Promise<Task[]> {
    if (!existsSync(filePath)) return [];
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    const taskMap = new Map<string, Task>();
    for (const line of lines) {
      try {
        const task = JSON.parse(line) as Task;
        taskMap.set(task.id, task);
      } catch (err) {
        console.error('Failed to parse task line:', line, err);
      }
    }
    return [...taskMap.values()];
  }

  private compactFile(projectPath: string, tasks: Task[]): void {
    this.ensureTaskDir(projectPath);
    const filePath = this.getTaskFilePath(projectPath);
    const lines = tasks.map(task => JSON.stringify(task)).join('\n') + (tasks.length > 0 ? '\n' : '');
    writeFileSync(filePath, lines, 'utf-8');
  }

  // --------------------------------------------------------------------------
  // Board Loading & Derived State
  // --------------------------------------------------------------------------

  async loadBoard(projectPath: string): Promise<TaskBoard> {
    // Check if already loaded
    const existing = this.boards.get(projectPath);
    if (existing) {
      return existing.board;
    }

    const filePath = this.getTaskFilePath(projectPath);
    const tasks = await this.parseTasksFile(filePath);

    // Create board with derived state
    const board: TaskBoard = {
      projectPath,
      tasks,
      readyTasks: [],
      blockedTasks: [],
      epics: []
    };

    this.computeDerivedState(board);

    // Start file watcher
    const watcher = this.startWatcher(projectPath);

    // Store in memory
    this.boards.set(projectPath, { board, watcher });

    return board;
  }

  private startWatcher(projectPath: string): FSWatcher | null {
    const filePath = this.getTaskFilePath(projectPath);
    
    try {
      const watcher = watch(filePath, {
        ignoreInitial: true,
        persistent: false
      });

      watcher.on('change', () => {
        this.handleFileChange(projectPath);
      });

      return watcher;
    } catch (err) {
      console.error('Failed to start file watcher for', projectPath, err);
      return null;
    }
  }

  private handleFileChange(projectPath: string): void {
    // Debounce reloads (100ms)
    const existingTimer = this.debounceTimers.get(projectPath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      await this.reloadBoard(projectPath);
      this.debounceTimers.delete(projectPath);
    }, 100);

    this.debounceTimers.set(projectPath, timer);
  }

  private async reloadBoard(projectPath: string): Promise<void> {
    const entry = this.boards.get(projectPath);
    if (!entry) return;

    const filePath = this.getTaskFilePath(projectPath);
    entry.board.tasks = await this.parseTasksFile(filePath);
    this.computeDerivedState(entry.board);

    // Notify listeners
    if (this.onBoardChanged) {
      this.onBoardChanged(projectPath);
    }
  }

  private computeDerivedState(board: TaskBoard): void {
    const taskMap = new Map(board.tasks.map(t => [t.id, t]));

    // Compute epics
    board.epics = board.tasks.filter(t => t.type === 'epic');

    // Compute ready tasks: open + all blocked_by deps are done
    board.readyTasks = board.tasks
      .filter(task => {
        if (task.status !== 'open') return false;
        
        const blockers = task.dependencies.filter(d => d.type === 'blocked_by');
        if (blockers.length === 0) return true;

        return blockers.every(dep => {
          const blocker = taskMap.get(dep.taskId);
          return blocker && blocker.status === 'done';
        });
      })
      .sort((a, b) => {
        // Sort by priority (0 first), then createdAt
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    // Compute blocked tasks: open or in_progress + at least one blocked_by dep NOT done
    board.blockedTasks = board.tasks.filter(task => {
      if (task.status !== 'open' && task.status !== 'in_progress') return false;
      
      const blockers = task.dependencies.filter(d => d.type === 'blocked_by');
      if (blockers.length === 0) return false;

      return blockers.some(dep => {
        const blocker = taskMap.get(dep.taskId);
        return !blocker || blocker.status !== 'done';
      });
    });
  }

  // --------------------------------------------------------------------------
  // Task CRUD
  // --------------------------------------------------------------------------

  async createTask(projectPath: string, input: TaskCreateInput): Promise<Task> {
    const board = await this.loadBoard(projectPath);
    const now = new Date().toISOString();

    const task: Task = {
      id: this.generateId(),
      title: input.title,
      description: input.description || '',
      status: input.status || 'open',
      priority: input.priority ?? 2,
      type: input.type || 'task',
      parentId: input.parentId || null,
      dependencies: input.dependencies || [],
      labels: input.labels || [],
      assignee: input.assignee || null,
      estimateMinutes: input.estimateMinutes ?? null,
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      createdBy: input.createdBy || 'human',
      comments: []
    };

    // Check for circular dependencies
    if (task.dependencies.some(d => d.type === 'blocked_by')) {
      this.validateNoCycles(board, task);
    }

    // Add to board and save
    board.tasks.push(task);
    this.appendToFile(projectPath, task);
    this.computeDerivedState(board);

    // Notify listeners
    if (this.onBoardChanged) {
      this.onBoardChanged(projectPath);
    }

    return task;
  }

  async updateTask(projectPath: string, taskId: string, updates: TaskUpdateInput): Promise<Task> {
    const board = await this.loadBoard(projectPath);
    const task = board.tasks.find(t => t.id === taskId);
    
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const now = new Date().toISOString();
    const oldStatus = task.status;

    // Apply updates
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.status !== undefined) task.status = updates.status;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.type !== undefined) task.type = updates.type;
    if (updates.parentId !== undefined) task.parentId = updates.parentId;
    if (updates.dependencies !== undefined) task.dependencies = updates.dependencies;
    if (updates.labels !== undefined) task.labels = updates.labels;
    if (updates.assignee !== undefined) task.assignee = updates.assignee;
    if (updates.estimateMinutes !== undefined) task.estimateMinutes = updates.estimateMinutes;

    task.updatedAt = now;

    // Handle closedAt
    if (task.status === 'done' && oldStatus !== 'done') {
      task.closedAt = now;
    } else if (task.status !== 'done' && oldStatus === 'done') {
      task.closedAt = null;
    }

    // Check for circular dependencies if dependencies changed
    if (updates.dependencies && updates.dependencies.some(d => d.type === 'blocked_by')) {
      this.validateNoCycles(board, task);
    }

    // Append to file and recompute
    this.appendToFile(projectPath, task);
    this.computeDerivedState(board);

    // Check for epic auto-completion
    if (task.parentId) {
      await this.checkEpicAutoCompletion(projectPath, task.parentId);
    }

    // Notify listeners
    if (this.onBoardChanged) {
      this.onBoardChanged(projectPath);
    }

    return task;
  }

  async addComment(projectPath: string, taskId: string, text: string, author: 'human' | 'agent'): Promise<Comment> {
    const board = await this.loadBoard(projectPath);
    const task = board.tasks.find(t => t.id === taskId);
    
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const comment: Comment = {
      id: this.generateCommentId(),
      text,
      author,
      createdAt: new Date().toISOString()
    };

    task.comments.push(comment);
    task.updatedAt = new Date().toISOString();

    this.appendToFile(projectPath, task);

    // Notify listeners
    if (this.onBoardChanged) {
      this.onBoardChanged(projectPath);
    }

    return comment;
  }

  async deleteTask(projectPath: string, taskId: string): Promise<boolean> {
    const board = await this.loadBoard(projectPath);
    const taskIndex = board.tasks.findIndex(t => t.id === taskId);
    
    if (taskIndex === -1) {
      return false;
    }

    // Remove task
    board.tasks.splice(taskIndex, 1);

    // Remove dependencies referencing this task from all other tasks
    for (const task of board.tasks) {
      task.dependencies = task.dependencies.filter(d => d.taskId !== taskId);
    }

    // Compact file (full rewrite)
    this.compactFile(projectPath, board.tasks);
    this.computeDerivedState(board);

    // Notify listeners
    if (this.onBoardChanged) {
      this.onBoardChanged(projectPath);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  async queryTasks(projectPath: string, filter: TaskFilter): Promise<Task[]> {
    const board = await this.loadBoard(projectPath);
    
    return board.tasks.filter(task => {
      // Status filter
      if (filter.status && !filter.status.includes(task.status)) {
        return false;
      }

      // Priority filter
      if (filter.priority && !filter.priority.includes(task.priority)) {
        return false;
      }

      // Type filter
      if (filter.type && !filter.type.includes(task.type)) {
        return false;
      }

      // Labels filter (any match)
      if (filter.labels && filter.labels.length > 0) {
        if (!filter.labels.some(label => task.labels.includes(label))) {
          return false;
        }
      }

      // Assignee filter
      if (filter.assignee && !filter.assignee.includes(task.assignee)) {
        return false;
      }

      // ParentId filter
      if (filter.parentId !== undefined) {
        if (task.parentId !== filter.parentId) {
          return false;
        }
      }

      // Search filter (case-insensitive on title, description, id)
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const matches = 
          task.id.toLowerCase().includes(searchLower) ||
          task.title.toLowerCase().includes(searchLower) ||
          task.description.toLowerCase().includes(searchLower);
        
        if (!matches) {
          return false;
        }
      }

      return true;
    });
  }

  async getReadyTasks(projectPath: string): Promise<Task[]> {
    const board = await this.loadBoard(projectPath);
    return board.readyTasks;
  }

  async getDependencyChain(projectPath: string, taskId: string): Promise<DependencyChain> {
    const board = await this.loadBoard(projectPath);
    const taskMap = new Map(board.tasks.map(t => [t.id, t]));
    const task = taskMap.get(taskId);

    if (!task) {
      return { blockers: [], dependents: [] };
    }

    // Blockers: tasks this is blocked_by
    const blockers: Task[] = [];
    for (const dep of task.dependencies) {
      if (dep.type === 'blocked_by') {
        const blocker = taskMap.get(dep.taskId);
        if (blocker) {
          blockers.push(blocker);
        }
      }
    }

    // Dependents: tasks that are blocked_by this task
    const dependents: Task[] = [];
    for (const otherTask of board.tasks) {
      if (otherTask.id === taskId) continue;
      
      const hasDep = otherTask.dependencies.some(
        d => d.type === 'blocked_by' && d.taskId === taskId
      );
      
      if (hasDep) {
        dependents.push(otherTask);
      }
    }

    return { blockers, dependents };
  }

  async getEpicProgress(projectPath: string, epicId: string): Promise<EpicProgress> {
    const board = await this.loadBoard(projectPath);
    const children = board.tasks.filter(t => t.parentId === epicId);

    const progress: EpicProgress = {
      total: children.length,
      open: 0,
      inProgress: 0,
      review: 0,
      done: 0,
      percentComplete: 0
    };

    for (const child of children) {
      switch (child.status) {
        case 'open':
          progress.open++;
          break;
        case 'in_progress':
          progress.inProgress++;
          break;
        case 'review':
          progress.review++;
          break;
        case 'done':
          progress.done++;
          break;
      }
    }

    if (progress.total > 0) {
      progress.percentComplete = Math.round((progress.done / progress.total) * 100);
    }

    return progress;
  }

  // --------------------------------------------------------------------------
  // Agent Integration
  // --------------------------------------------------------------------------

  async getAgentTaskSummary(projectPath: string): Promise<string> {
    const board = await this.loadBoard(projectPath);
    
    if (board.tasks.length === 0) {
      return '';
    }

    const taskMap = new Map(board.tasks.map(t => [t.id, t]));
    const lines: string[] = ['<tasks>'];

    // Group by status
    const inProgress = board.tasks.filter(t => t.status === 'in_progress');
    const inReview = board.tasks.filter(t => t.status === 'review');
    const ready = await this.getReadyTasks(projectPath);
    const blocked = board.blockedTasks;
    const doneCount = board.tasks.filter(t => t.status === 'done').length;

    // IN PROGRESS
    if (inProgress.length > 0) {
      lines.push('\nIN PROGRESS:');
      for (const task of inProgress) {
        lines.push(`- [${task.id}] P${task.priority} ${task.title}`);
      }
    }

    // IN REVIEW
    if (inReview.length > 0) {
      lines.push('\nIN REVIEW:');
      for (const task of inReview) {
        lines.push(`- [${task.id}] P${task.priority} ${task.title}`);
      }
    }

    // READY
    if (ready.length > 0) {
      lines.push('\nREADY:');
      for (const task of ready) {
        lines.push(`- [${task.id}] P${task.priority} ${task.title}`);
      }
    }

    // BLOCKED
    if (blocked.length > 0) {
      lines.push('\nBLOCKED:');
      for (const task of blocked) {
        const blockerIds = task.dependencies
          .filter(d => d.type === 'blocked_by')
          .map(d => d.taskId)
          .filter(id => {
            const blocker = taskMap.get(id);
            return blocker && blocker.status !== 'done';
          });
        
        const blockerStr = blockerIds.length > 0 ? ` (blocked by: ${blockerIds.join(', ')})` : '';
        lines.push(`- [${task.id}] P${task.priority} ${task.title}${blockerStr}`);
      }
    }

    // DONE (count only)
    if (doneCount > 0) {
      lines.push(`\nDONE: ${doneCount} task${doneCount === 1 ? '' : 's'}`);
    }

    lines.push('</tasks>');
    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // Dependency Validation
  // --------------------------------------------------------------------------

  private validateNoCycles(board: TaskBoard, task: Task): void {
    const blockedByIds = task.dependencies
      .filter(d => d.type === 'blocked_by')
      .map(d => d.taskId);

    for (const blockerId of blockedByIds) {
      if (this.hasCycle(board, task.id, blockerId)) {
        throw new Error(`Circular dependency detected: ${task.id} -> ${blockerId}`);
      }
    }
  }

  private hasCycle(board: TaskBoard, startId: string, targetId: string): boolean {
    const taskMap = new Map(board.tasks.map(t => [t.id, t]));
    const visited = new Set<string>();
    const stack = [targetId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      
      if (currentId === startId) {
        return true;
      }

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const currentTask = taskMap.get(currentId);
      if (!currentTask) continue;

      const blockedByIds = currentTask.dependencies
        .filter(d => d.type === 'blocked_by')
        .map(d => d.taskId);

      stack.push(...blockedByIds);
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // Epic Auto-Completion
  // --------------------------------------------------------------------------

  private async checkEpicAutoCompletion(projectPath: string, epicId: string): Promise<void> {
    const board = await this.loadBoard(projectPath);
    const epic = board.tasks.find(t => t.id === epicId);
    
    if (!epic || epic.type !== 'epic' || epic.status === 'done') {
      return;
    }

    const children = board.tasks.filter(t => t.parentId === epicId);
    
    if (children.length === 0) {
      return;
    }

    const allDone = children.every(child => child.status === 'done');
    
    if (allDone) {
      // Auto-close the epic
      epic.status = 'done';
      epic.closedAt = new Date().toISOString();
      epic.updatedAt = epic.closedAt;
      
      this.appendToFile(projectPath, epic);
      this.computeDerivedState(board);
    }
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  dispose(projectPath?: string): void {
    if (projectPath) {
      // Dispose specific project
      const entry = this.boards.get(projectPath);
      if (entry) {
        if (entry.watcher) {
          entry.watcher.close();
        }
        this.boards.delete(projectPath);
      }

      const timer = this.debounceTimers.get(projectPath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(projectPath);
      }
    } else {
      // Dispose all
      for (const [path, entry] of this.boards.entries()) {
        if (entry.watcher) {
          entry.watcher.close();
        }
      }
      this.boards.clear();

      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();
    }
  }
}
