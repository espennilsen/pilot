import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { SubagentManager } from './subagent-manager';

/**
 * Creates the three subagent agent-facing tools for the Pi SDK.
 * These are registered as customTools in createAgentSession() for the parent session.
 *
 * - pilot_subagent: Spawn a single subagent and await its result
 * - pilot_subagent_parallel: Spawn multiple subagents in parallel
 * - pilot_subagent_status: Check subagent status (non-blocking)
 */
export function createSubagentTools(
  subagentManager: SubagentManager,
  parentTabId: string,
  projectPath: string
): ToolDefinition[] {
  // ─── pilot_subagent ──────────────────────────────────────────────

  const subagentTool: ToolDefinition = {
    name: 'pilot_subagent',
    label: 'Subagent',
    description:
      'Spawn a subagent to perform a task independently. The subagent gets its own conversation and runs to completion. Use this to delegate implementation work, code review, test writing, etc. You receive the result when the subagent finishes.',
    parameters: Type.Object({
      role: Type.String({
        description:
          'Short label for the subagent: "Dev", "QA", "Tests", "Reviewer", "Writer", etc.',
      }),
      prompt: Type.String({
        description:
          'Full task instructions for the subagent. Be specific — include file paths, requirements, constraints. The subagent has access to the project files.',
      }),
      systemPrompt: Type.Optional(
        Type.String({
          description:
            'Custom system prompt for the subagent. If omitted, uses a default with project context.',
        })
      ),
      readOnly: Type.Optional(
        Type.Boolean({
          description:
            'If true, the subagent cannot write files (read, grep, find, ls only). Default: false.',
        })
      ),
      allowedPaths: Type.Optional(
        Type.Array(Type.String(), {
          description:
            'Restrict file access to these paths (relative to project root). Narrows the project jail.',
        })
      ),
      model: Type.Optional(
        Type.String({
          description:
            'Override the model for this subagent. Default: same as parent.',
        })
      ),
      maxTurns: Type.Optional(
        Type.Number({
          description:
            'Override maximum conversation turns. Default: 20.',
        })
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const p = params as {
          role: string;
          prompt: string;
          systemPrompt?: string;
          readOnly?: boolean;
          allowedPaths?: string[];
          model?: string;
          maxTurns?: number;
        };

        const subId = await subagentManager.spawn(parentTabId, projectPath, {
          role: p.role,
          prompt: p.prompt,
          systemPrompt: p.systemPrompt,
          readOnly: p.readOnly,
          allowedPaths: p.allowedPaths,
          model: p.model,
          maxTurns: p.maxTurns,
        });

        // Await the result
        const result = await subagentManager.awaitResult(subId);

        if (result.error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    subId: result.subId,
                    role: result.role,
                    status: 'failed',
                    error: result.error,
                    tokenUsage: result.tokenUsage,
                  },
                  null,
                  2
                ),
              },
            ],
            details: {},
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  subId: result.subId,
                  role: result.role,
                  status: 'completed',
                  result: result.result,
                  tokenUsage: result.tokenUsage,
                  modifiedFiles: result.modifiedFiles,
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
              text: `Error spawning subagent: ${err.message}`,
            },
          ],
          details: {},
        };
      }
    },
  } as ToolDefinition;

  // ─── pilot_subagent_parallel ─────────────────────────────────────

  const subagentParallel: ToolDefinition = {
    name: 'pilot_subagent_parallel',
    label: 'Subagent (Parallel)',
    description:
      'Spawn multiple subagents in parallel. Each task gets its own subagent running concurrently. Use for independent work like writing tests for multiple modules, implementing unrelated stories, or running multiple analyses. Returns results when all complete. Note: parallel subagents that modify the same file will conflict — assign non-overlapping file scopes.',
    parameters: Type.Object({
      tasks: Type.Array(
        Type.Object({
          role: Type.String({ description: 'Short label for this subagent' }),
          prompt: Type.String({ description: 'Full task instructions' }),
          systemPrompt: Type.Optional(
            Type.String({ description: 'Custom system prompt' })
          ),
          readOnly: Type.Optional(
            Type.Boolean({ description: 'If true, read-only mode' })
          ),
          allowedPaths: Type.Optional(
            Type.Array(Type.String(), {
              description: 'Restrict file access to these paths',
            })
          ),
        }),
        { description: 'Array of task objects, each spawned as a separate subagent' }
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const p = params as {
          tasks: Array<{
            role: string;
            prompt: string;
            systemPrompt?: string;
            readOnly?: boolean;
            allowedPaths?: string[];
          }>;
        };

        if (!p.tasks || p.tasks.length === 0) {
          return {
            content: [
              { type: 'text', text: 'Error: No tasks provided.' },
            ],
            details: {},
          };
        }

        const poolId = await subagentManager.spawnPool(
          parentTabId,
          projectPath,
          p.tasks.map((t) => ({
            role: t.role,
            prompt: t.prompt,
            systemPrompt: t.systemPrompt,
            readOnly: t.readOnly,
            allowedPaths: t.allowedPaths,
          }))
        );

        // Await all results
        const poolResult = await subagentManager.awaitPool(poolId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  poolId: poolResult.poolId,
                  totalTasks: p.tasks.length,
                  completed: poolResult.results.length,
                  failed: poolResult.failures.length,
                  results: poolResult.results.map((r) => ({
                    subId: r.subId,
                    role: r.role,
                    result: r.result,
                    tokenUsage: r.tokenUsage,
                    modifiedFiles: r.modifiedFiles,
                  })),
                  failures: poolResult.failures.map((r) => ({
                    subId: r.subId,
                    role: r.role,
                    error: r.error,
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
              text: `Error spawning parallel subagents: ${err.message}`,
            },
          ],
          details: {},
        };
      }
    },
  } as ToolDefinition;

  // ─── pilot_subagent_status ──────────────────────────────────────

  const subagentStatus: ToolDefinition = {
    name: 'pilot_subagent_status',
    label: 'Subagent Status',
    description:
      'Check the status of subagents. Returns status, elapsed time, token usage, and result (if completed). Use this for non-blocking status checks in orchestrator mode.',
    parameters: Type.Object({
      subId: Type.Optional(
        Type.String({ description: 'Check a specific subagent by ID' })
      ),
      poolId: Type.Optional(
        Type.String({ description: 'Check all subagents in a pool' })
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      try {
        const p = params as { subId?: string; poolId?: string };

        if (p.subId) {
          const result = subagentManager.getResult(p.subId);
          const status = subagentManager.getStatus(parentTabId);
          const sub = status.find((s) => s.id === p.subId);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...sub,
                    ...(result ? { result: result.result } : {}),
                    elapsed: sub
                      ? (sub.completedAt || Date.now()) - sub.createdAt
                      : null,
                  },
                  null,
                  2
                ),
              },
            ],
            details: {},
          };
        }

        // Return all subagents for this tab (or filter by poolId)
        let status = subagentManager.getStatus(parentTabId);
        if (p.poolId) {
          status = status.filter((s) => s.poolId === p.poolId);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  count: status.length,
                  subagents: status.map((s) => ({
                    id: s.id,
                    role: s.role,
                    status: s.status,
                    poolId: s.poolId,
                    elapsed: (s.completedAt || Date.now()) - s.createdAt,
                    tokenUsage: s.tokenUsage,
                    ...(s.error ? { error: s.error } : {}),
                    ...(s.result ? { resultPreview: s.result.slice(0, 200) } : {}),
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
              text: `Error checking subagent status: ${err.message}`,
            },
          ],
          details: {},
        };
      }
    },
  } as ToolDefinition;

  return [subagentTool, subagentParallel, subagentStatus];
}
