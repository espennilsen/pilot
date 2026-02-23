import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type {
  TaskManager,
  TaskStatus,
  TaskPriority,
  TaskType,
  Dependency,
} from './task-manager';

/**
 * Creates the four agent-facing task tools for the Pi SDK.
 * Registered as customTools in createAgentSession().
 */
export function createTaskTools(
  taskManager: TaskManager,
  projectPath: string
): ToolDefinition[] {
  // ─── pilot_task_create ───────────────────────────────────────────────

  const taskCreate: ToolDefinition = {
    name: 'pilot_task_create',
    label: 'Task Manager',
    description:
      'Create a new task on the project task board. Use when you identify work that needs to be done, want to break an epic into subtasks, or discover a dependency.',
    parameters: Type.Object({
      title: Type.String({ description: 'Short descriptive title' }),
      description: Type.Optional(
        Type.String({ description: 'Detailed description (Markdown)' })
      ),
      type: Type.Optional(
        Type.Union(
          [
            Type.Literal('epic'),
            Type.Literal('task'),
            Type.Literal('bug'),
            Type.Literal('feature'),
          ],
          { description: 'Task type. Default: task' }
        )
      ),
      priority: Type.Optional(
        Type.Number({
          description: 'Priority 0-4 (0=Critical, 4=Backlog). Default: 2',
        })
      ),
      parent_id: Type.Optional(
        Type.String({ description: 'Parent epic ID' })
      ),
      blocked_by: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Task IDs that must be completed first',
        })
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Tags for categorization',
        })
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const p = params as {
          title: string;
          description?: string;
          type?: TaskType;
          priority?: number;
          parent_id?: string;
          blocked_by?: string[];
          labels?: string[];
        };

        // Convert blocked_by to Dependency objects
        const dependencies: Dependency[] = (p.blocked_by || []).map(
          (id) => ({ type: 'blocked_by' as const, taskId: id })
        );

        const task = taskManager.createTask(projectPath, {
          title: p.title,
          description: p.description,
          type: p.type,
          priority: p.priority as TaskPriority | undefined,
          parentId: p.parent_id || null,
          dependencies,
          labels: p.labels,
          assignee: 'agent',
          createdBy: 'agent',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { id: task.id, title: task.title, status: task.status },
                null,
                2
              ),
            },
          ],
          details: {},
        };
      } catch (err: any) {
        return {
          content: [
            { type: 'text', text: `Error creating task: ${err.message}` },
          ],
          details: {},
        };
      }
    },
  } as ToolDefinition;

  // ─── pilot_task_update ───────────────────────────────────────────────

  const taskUpdate: ToolDefinition = {
    name: 'pilot_task_update',
    label: 'Task Manager',
    description:
      "Update a task's status, priority, or other fields. Always update status when starting work (→ in_progress), finishing (→ done), or sending for review (→ review).",
    parameters: Type.Object({
      task_id: Type.String({ description: 'Task ID (e.g. pt-a1b2c3d4)' }),
      status: Type.Optional(
        Type.Union(
          [
            Type.Literal('open'),
            Type.Literal('in_progress'),
            Type.Literal('review'),
            Type.Literal('done'),
          ],
          { description: 'New status' }
        )
      ),
      priority: Type.Optional(
        Type.Number({ description: 'New priority (0-4)' })
      ),
      title: Type.Optional(Type.String({ description: 'New title' })),
      description: Type.Optional(
        Type.String({ description: 'New description' })
      ),
      add_blocked_by: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Task IDs to add as blockers',
        })
      ),
      remove_blocked_by: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Task IDs to remove from blockers',
        })
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), { description: 'Replace all labels' })
      ),
      assignee: Type.Optional(
        Type.Union([Type.Literal('human'), Type.Literal('agent')], {
          description: 'New assignee',
        })
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const p = params as {
          task_id: string;
          status?: TaskStatus;
          priority?: number;
          title?: string;
          description?: string;
          add_blocked_by?: string[];
          remove_blocked_by?: string[];
          labels?: string[];
          assignee?: 'human' | 'agent';
        };

        // Load board and find existing task for dependency merging
        const board = taskManager.loadBoard(projectPath);
        const existing = board.tasks.find((t) => t.id === p.task_id);

        if (!existing) {
          return {
            content: [
              { type: 'text', text: `Error: Task not found: ${p.task_id}` },
            ],
            details: {},
          };
        }

        // Merge dependencies
        let updatedDeps: Dependency[] | undefined;
        if (p.add_blocked_by || p.remove_blocked_by) {
          const currentDeps = [...existing.dependencies];
          const removeSet = new Set(p.remove_blocked_by || []);

          // Filter out removed
          const filtered = currentDeps.filter(
            (d) =>
              !(d.type === 'blocked_by' && removeSet.has(d.taskId))
          );

          // Add new blockers (deduplicate)
          const existingBlockerIds = new Set(
            filtered
              .filter((d) => d.type === 'blocked_by')
              .map((d) => d.taskId)
          );
          for (const id of p.add_blocked_by || []) {
            if (!existingBlockerIds.has(id)) {
              filtered.push({ type: 'blocked_by', taskId: id });
            }
          }

          updatedDeps = filtered;
        }

        // Build update object
        const updates: Record<string, any> = {};
        if (p.status !== undefined) updates.status = p.status;
        if (p.priority !== undefined) updates.priority = p.priority;
        if (p.title !== undefined) updates.title = p.title;
        if (p.description !== undefined) updates.description = p.description;
        if (p.labels !== undefined) updates.labels = p.labels;
        if (p.assignee !== undefined) updates.assignee = p.assignee;
        if (updatedDeps !== undefined) updates.dependencies = updatedDeps;

        const task = taskManager.updateTask(
          projectPath,
          p.task_id,
          updates
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { id: task.id, title: task.title, status: task.status },
                null,
                2
              ),
            },
          ],
          details: {},
        };
      } catch (err: any) {
        return {
          content: [
            { type: 'text', text: `Error updating task: ${err.message}` },
          ],
          details: {},
        };
      }
    },
  } as ToolDefinition;

  // ─── pilot_task_query ────────────────────────────────────────────────

  const taskQuery: ToolDefinition = {
    name: 'pilot_task_query',
    label: 'Task Manager',
    description:
      'Query the task board. Use to find ready tasks, check specific task details, list epic subtasks, or search.',
    parameters: Type.Object({
      ready: Type.Optional(
        Type.Boolean({
          description:
            'If true, return only unblocked tasks sorted by priority',
        })
      ),
      status: Type.Optional(
        Type.Array(Type.String(), { description: 'Filter by statuses' })
      ),
      priority: Type.Optional(
        Type.Array(Type.Number(), {
          description: 'Filter by priority levels',
        })
      ),
      type: Type.Optional(
        Type.Array(Type.String(), { description: 'Filter by types' })
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), { description: 'Filter by labels' })
      ),
      parent_id: Type.Optional(
        Type.String({ description: 'Filter to subtasks of an epic' })
      ),
      search: Type.Optional(
        Type.String({ description: 'Search by keyword' })
      ),
      task_id: Type.Optional(
        Type.String({
          description: 'Get specific task by ID with full details',
        })
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const p = params as {
          ready?: boolean;
          status?: string[];
          priority?: number[];
          type?: string[];
          labels?: string[];
          parent_id?: string;
          search?: string;
          task_id?: string;
        };

        // Mode 1: Get specific task by ID
        if (p.task_id) {
          const board = taskManager.loadBoard(projectPath);
          const task = board.tasks.find((t) => t.id === p.task_id);

          if (!task) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Task not found: ${p.task_id}`,
                },
              ],
              details: {},
            };
          }

          const chain = taskManager.getDependencyChain(
            projectPath,
            p.task_id
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    task,
                    blockers: chain.blockers.map((t) => ({
                      id: t.id,
                      title: t.title,
                      status: t.status,
                    })),
                    dependents: chain.dependents.map((t) => ({
                      id: t.id,
                      title: t.title,
                      status: t.status,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
            details: {},
          };
        }

        // Mode 2: Ready tasks
        if (p.ready) {
          const ready = taskManager.getReadyTasks(projectPath);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    count: ready.length,
                    tasks: ready.map((t) => ({
                      id: t.id,
                      title: t.title,
                      priority: t.priority,
                      type: t.type,
                      labels: t.labels,
                    })),
                  },
                  null,
                  2
                ),
              },
            ],
            details: {},
          };
        }

        // Mode 3: Filtered query
        const tasks = taskManager.queryTasks(projectPath, {
          status: p.status as TaskStatus[] | undefined,
          priority: p.priority as TaskPriority[] | undefined,
          type: p.type as TaskType[] | undefined,
          labels: p.labels,
          parentId: p.parent_id,
          search: p.search,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: tasks.length,
                  tasks: tasks.map((t) => ({
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                    type: t.type,
                    labels: t.labels,
                    assignee: t.assignee,
                  })),
                },
                null,
                2
              ),
            },
          ],
          details: {},
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error querying tasks: ${err.message}`,
            },
          ],
          details: {},
        };
      }
    },
  } as ToolDefinition;

  // ─── pilot_task_comment ──────────────────────────────────────────────

  const taskComment: ToolDefinition = {
    name: 'pilot_task_comment',
    label: 'Task Manager',
    description:
      'Add a comment to a task. Use to log progress, note decisions, or flag issues.',
    parameters: Type.Object({
      task_id: Type.String({ description: 'Task ID' }),
      text: Type.String({ description: 'Comment text (Markdown)' }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const p = params as { task_id: string; text: string };

        const comment = taskManager.addComment(
          projectPath,
          p.task_id,
          p.text,
          'agent'
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { commented: true, commentId: comment.id },
                null,
                2
              ),
            },
          ],
          details: {},
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error adding comment: ${err.message}`,
            },
          ],
          details: {},
        };
      }
    },
  } as ToolDefinition;

  return [taskCreate, taskUpdate, taskQuery, taskComment];
}
