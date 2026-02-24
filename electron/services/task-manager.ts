import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { watch, type FSWatcher } from 'chokidar';

// Import types
import type {
  Task,
  TaskBoard,
  TaskFilter,
  EpicProgress,
  DependencyChain,
  TaskCreateInput,
  TaskUpdateInput,
  Comment,
  BoardEntry
} from './task-types';

// Import helpers
import {
  computeDerivedState,
  filterTasks,
  buildDependencyChain,
  calculateEpicProgress,
  validateNoCycles,
  checkEpicAutoCompletion,
  formatAgentTaskSummary
} from './task-helpers';

// Re-export all types for backward compatibility
export type {
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskAssignee,
  TaskCreator,
  Dependency,
  Comment,
  Task,
  TaskBoard,
  TaskFilter,
  EpicProgress,
  DependencyChain,
  TaskCreateInput,
  TaskUpdateInput
} from './task-types';

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

    computeDerivedState(board);

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
    computeDerivedState(entry.board);

    // Notify listeners
    if (this.onBoardChanged) {
      this.onBoardChanged(projectPath);
    }
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
      validateNoCycles(board.tasks, task);
    }

    // Add to board and save
    board.tasks.push(task);
    this.appendToFile(projectPath, task);
    computeDerivedState(board);

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
      validateNoCycles(board.tasks, task);
    }

    // Append to file and recompute
    this.appendToFile(projectPath, task);
    computeDerivedState(board);

    // Check for epic auto-completion
    if (task.parentId) {
      await this.handleEpicAutoCompletion(projectPath, task.parentId);
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
    computeDerivedState(board);

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
    return filterTasks(board.tasks, filter);
  }

  async getReadyTasks(projectPath: string): Promise<Task[]> {
    const board = await this.loadBoard(projectPath);
    return board.readyTasks;
  }

  async getDependencyChain(projectPath: string, taskId: string): Promise<DependencyChain> {
    const board = await this.loadBoard(projectPath);
    return buildDependencyChain(board.tasks, taskId);
  }

  async getEpicProgress(projectPath: string, epicId: string): Promise<EpicProgress> {
    const board = await this.loadBoard(projectPath);
    return calculateEpicProgress(board.tasks, epicId);
  }

  // --------------------------------------------------------------------------
  // Agent Integration
  // --------------------------------------------------------------------------

  async getAgentTaskSummary(projectPath: string): Promise<string> {
    const board = await this.loadBoard(projectPath);
    return formatAgentTaskSummary(board);
  }

  // --------------------------------------------------------------------------
  // Epic Auto-Completion
  // --------------------------------------------------------------------------

  private async handleEpicAutoCompletion(projectPath: string, epicId: string): Promise<void> {
    const board = await this.loadBoard(projectPath);
    const updatedEpic = checkEpicAutoCompletion(board.tasks, epicId);
    
    if (updatedEpic) {
      // Find and update the epic in the board
      const epic = board.tasks.find(t => t.id === epicId);
      if (epic) {
        epic.status = updatedEpic.status;
        epic.closedAt = updatedEpic.closedAt;
        epic.updatedAt = updatedEpic.updatedAt;
        
        this.appendToFile(projectPath, epic);
        computeDerivedState(board);
      }
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
