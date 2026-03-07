import { ipcMain } from 'electron';
import { IPC } from '../../shared/ipc';
import type { TaskManager, TaskCreateInput, TaskUpdateInput, TaskFilter, TaskCreator } from '../services/task-manager';
import { TaskReviewService } from '../services/task-review-service';
import { broadcastToRenderer } from '../utils/broadcast';

const taskReviewService = new TaskReviewService();

export function registerTasksIpc(taskManager: TaskManager) {
  // tasks:load-board
  ipcMain.handle(IPC.TASKS_LOAD_BOARD, async (_event, projectPath: string) => {
    return taskManager.loadBoard(projectPath);
  });

  // tasks:create - human-created tasks
  ipcMain.handle(IPC.TASKS_CREATE, async (_event, projectPath: string, input: TaskCreateInput) => {
    return taskManager.createTask(projectPath, { ...input, createdBy: 'human' as TaskCreator });
  });

  // tasks:update
  ipcMain.handle(IPC.TASKS_UPDATE, async (_event, projectPath: string, taskId: string, updates: TaskUpdateInput) => {
    return taskManager.updateTask(projectPath, taskId, updates);
  });

  // tasks:delete
  ipcMain.handle(IPC.TASKS_DELETE, async (_event, projectPath: string, taskId: string) => {
    return taskManager.deleteTask(projectPath, taskId);
  });

  // tasks:comment - human comments
  ipcMain.handle(IPC.TASKS_COMMENT, async (_event, projectPath: string, taskId: string, text: string) => {
    return taskManager.addComment(projectPath, taskId, text, 'human');
  });

  // tasks:query
  ipcMain.handle(IPC.TASKS_QUERY, async (_event, projectPath: string, filter: TaskFilter) => {
    return taskManager.queryTasks(projectPath, filter);
  });

  // tasks:ready
  ipcMain.handle(IPC.TASKS_READY, async (_event, projectPath: string) => {
    return taskManager.getReadyTasks(projectPath);
  });

  // tasks:epic-progress
  ipcMain.handle(IPC.TASKS_EPIC_PROGRESS, async (_event, projectPath: string, epicId: string) => {
    return taskManager.getEpicProgress(projectPath, epicId);
  });

  // tasks:dependencies
  ipcMain.handle(IPC.TASKS_DEPENDENCIES, async (_event, projectPath: string, taskId: string) => {
    return taskManager.getDependencyChain(projectPath, taskId);
  });

  // tasks:set-enabled
  ipcMain.handle(IPC.TASKS_SET_ENABLED, async (_event, enabled: boolean) => {
    taskManager.setEnabled(enabled);
  });

  // tasks:approve — spawns td approve in a background subprocess
  ipcMain.handle(IPC.TASKS_APPROVE, async (_event, projectPath: string, taskId: string) => {
    const result = await taskReviewService.approve(projectPath, taskId);
    if (result.success) {
      // Move internal task to done
      try {
        await taskManager.updateTask(projectPath, taskId, { status: 'done' });
      } catch { /* task may not exist in internal board */ }
      broadcastToRenderer(IPC.TASKS_CHANGED, { projectPath });
    }
    return result;
  });

  // tasks:reject — spawns td reject in a background subprocess
  ipcMain.handle(IPC.TASKS_REJECT, async (_event, projectPath: string, taskId: string, reason?: string) => {
    const result = await taskReviewService.reject(projectPath, taskId, reason);
    if (result.success) {
      // Move internal task back to in_progress
      try {
        await taskManager.updateTask(projectPath, taskId, { status: 'in_progress' });
      } catch { /* task may not exist in internal board */ }
      broadcastToRenderer(IPC.TASKS_CHANGED, { projectPath });
    }
    return result;
  });
}
