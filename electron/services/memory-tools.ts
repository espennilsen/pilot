import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { MemoryManager } from './memory-manager';

/**
 * Creates agent-facing memory tools for reading and writing MEMORY.md files.
 * Registered as customTools in createAgentSession().
 */
export function createMemoryTools(
  memoryManager: MemoryManager,
  projectPath: string
): ToolDefinition[] {

  // ─── pilot_memory_read ───────────────────────────────────────────────

  const memoryRead: ToolDefinition = {
    name: 'pilot_memory_read',
    label: 'Memory',
    description:
      'Read stored memories. Returns global and project memory contents. Use to check what has already been remembered before adding new entries.',
    parameters: Type.Object({
      scope: Type.Optional(
        Type.Union(
          [Type.Literal('all'), Type.Literal('global'), Type.Literal('project')],
          { description: 'Which memories to read. Default: all' }
        )
      ),
    }),
    execute: async (params) => {
      const scope = params.scope ?? 'all';
      const files = await memoryManager.getMemoryFiles(projectPath);
      const sections: string[] = [];

      if ((scope === 'all' || scope === 'global') && files.global) {
        sections.push(`## Global Memory\n${files.global}`);
      }
      if ((scope === 'all' || scope === 'project') && files.projectShared) {
        sections.push(`## Project Memory\n${files.projectShared}`);
      }

      return sections.length > 0 ? sections.join('\n\n') : 'No memories stored.';
    },
  };

  // ─── pilot_memory_add ────────────────────────────────────────────────

  const memoryAdd: ToolDefinition = {
    name: 'pilot_memory_add',
    label: 'Memory',
    description:
      'Save a memory entry. Use for user preferences, project decisions, conventions, and facts worth remembering across sessions. Avoid one-time task details.',
    parameters: Type.Object({
      text: Type.String({ description: 'The memory to save — one concise line' }),
      scope: Type.Optional(
        Type.Union(
          [Type.Literal('global'), Type.Literal('project')],
          { description: 'global = all projects, project = this project only. Default: project' }
        )
      ),
      category: Type.Optional(
        Type.String({ description: 'Category heading, e.g. "User Preferences", "Technical Context", "Decisions". Default: General' })
      ),
    }),
    execute: async (params) => {
      const scope = params.scope ?? 'project';
      const category = params.category ?? 'General';
      await memoryManager.appendMemory(params.text, scope, projectPath, category);
      return `Saved to ${scope} memory under "${category}": ${params.text}`;
    },
  };

  // ─── pilot_memory_remove ─────────────────────────────────────────────

  const memoryRemove: ToolDefinition = {
    name: 'pilot_memory_remove',
    label: 'Memory',
    description:
      'Remove a memory entry by matching its text. Use when a memory is outdated, wrong, or the user asks to forget something.',
    parameters: Type.Object({
      text: Type.String({ description: 'Text to match against existing memories (case-insensitive partial match)' }),
    }),
    execute: async (params) => {
      const removed = await memoryManager.removeMemory(params.text, projectPath);
      return removed
        ? `Removed memory matching: ${params.text}`
        : `No memory found matching: ${params.text}`;
    },
  };

  return [memoryRead, memoryAdd, memoryRemove];
}
