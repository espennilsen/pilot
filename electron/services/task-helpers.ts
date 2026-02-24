// ============================================================================
// Task Helper Functions (Pure Utilities)
// ============================================================================

import type {
  Task,
  TaskBoard,
  TaskFilter,
  EpicProgress,
  DependencyChain
} from './task-types';

/**
 * Compute derived state for a board (ready tasks, blocked tasks, epics).
 * Mutates the board object in place.
 */
export function computeDerivedState(board: TaskBoard): void {
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

/**
 * Filter tasks based on a TaskFilter criteria.
 */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  return tasks.filter(task => {
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

/**
 * Build dependency chain for a task (blockers and dependents).
 */
export function buildDependencyChain(tasks: Task[], taskId: string): DependencyChain {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
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
  for (const otherTask of tasks) {
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

/**
 * Calculate epic progress statistics.
 */
export function calculateEpicProgress(tasks: Task[], epicId: string): EpicProgress {
  const children = tasks.filter(t => t.parentId === epicId);

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

/**
 * Check if a dependency would create a cycle.
 * Used to validate dependencies before adding them.
 */
export function hasCycle(tasks: Task[], startId: string, targetId: string): boolean {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
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

/**
 * Validate that adding dependencies to a task won't create cycles.
 * Throws an error if a cycle is detected.
 */
export function validateNoCycles(tasks: Task[], task: Task): void {
  const blockedByIds = task.dependencies
    .filter(d => d.type === 'blocked_by')
    .map(d => d.taskId);

  for (const blockerId of blockedByIds) {
    if (hasCycle(tasks, task.id, blockerId)) {
      throw new Error(`Circular dependency detected: ${task.id} -> ${blockerId}`);
    }
  }
}

/**
 * Check if an epic should be auto-completed (all children done).
 * Returns the epic with updated status if it should be auto-completed, null otherwise.
 */
export function checkEpicAutoCompletion(tasks: Task[], epicId: string): Task | null {
  const epic = tasks.find(t => t.id === epicId);
  
  if (!epic || epic.type !== 'epic' || epic.status === 'done') {
    return null;
  }

  const children = tasks.filter(t => t.parentId === epicId);
  
  if (children.length === 0) {
    return null;
  }

  const allDone = children.every(child => child.status === 'done');
  
  if (allDone) {
    const now = new Date().toISOString();
    // Return updated epic (caller should save it)
    return {
      ...epic,
      status: 'done',
      closedAt: now,
      updatedAt: now
    };
  }

  return null;
}

/**
 * Format task board as agent summary string.
 */
export function formatAgentTaskSummary(board: TaskBoard): string {
  if (board.tasks.length === 0) {
    return '';
  }

  const taskMap = new Map(board.tasks.map(t => [t.id, t]));
  const lines: string[] = ['<tasks>'];

  // Group by status
  const inProgress = board.tasks.filter(t => t.status === 'in_progress');
  const inReview = board.tasks.filter(t => t.status === 'review');
  const ready = board.readyTasks;
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
