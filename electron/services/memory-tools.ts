import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { MemoryManager } from './memory-manager';

/** Wrap a plain string in the AgentToolResult format the SDK expects. */
function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} };
}

/**
 * Normalize category names to prevent fragmentation.
 * Maps common variations to canonical categories.
 */
function normalizeCategory(category: string): string {
  const normalized = category.trim();
  const lower = normalized.toLowerCase();

  // User Preferences
  if (
    lower === 'preferences' ||
    lower === 'user prefs' ||
    lower === 'user preferences' ||
    lower === 'preference'
  ) {
    return 'User Preferences';
  }

  // Technical Context
  if (
    lower === 'tech context' ||
    lower === 'technical' ||
    lower === 'stack' ||
    lower === 'technical context' ||
    lower === 'technology'
  ) {
    return 'Technical Context';
  }

  // Decisions
  if (
    lower === 'decision' ||
    lower === 'decisions' ||
    lower === 'architecture decisions' ||
    lower === 'architectural decisions' ||
    lower === 'architecture'
  ) {
    return 'Decisions';
  }

  // Patterns & Conventions
  if (
    lower === 'patterns' ||
    lower === 'conventions' ||
    lower === 'style' ||
    lower === 'patterns & conventions' ||
    lower === 'patterns and conventions' ||
    lower === 'coding style'
  ) {
    return 'Patterns & Conventions';
  }

  // Project Notes
  if (
    lower === 'project notes' ||
    lower === 'project' ||
    lower === 'notes'
  ) {
    return 'Project Notes';
  }

  // Default to General (but preserve original capitalization for custom categories)
  if (lower === 'general') return 'General';

  return normalized;
}

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
    description: `Read stored memories from global and/or project-specific MEMORY.md files.

**When to use:**
- ALWAYS check existing memories BEFORE adding new ones to avoid duplicates
- When the user references something from a previous session
- When you need context about user preferences or project decisions

**Returns:** Markdown-formatted memory entries organized by category.`,
    parameters: Type.Object({
      scope: Type.Optional(
        Type.Union(
          [Type.Literal('all'), Type.Literal('global'), Type.Literal('project')],
          { description: 'Which memories to read. Default: all' }
        )
      ),
    }),
    execute: async (_toolCallId, params) => {
      const scope = params.scope ?? 'all';
      const files = await memoryManager.getMemoryFiles(projectPath);
      const sections: string[] = [];

      if ((scope === 'all' || scope === 'global') && files.global) {
        sections.push(`## Global Memory\n${files.global}`);
      }
      if ((scope === 'all' || scope === 'project') && files.projectShared) {
        sections.push(`## Project Memory\n${files.projectShared}`);
      }

      return textResult(sections.length > 0 ? sections.join('\n\n') : 'No memories stored.');
    },
  };

  // ─── pilot_memory_add ────────────────────────────────────────────────

  const memoryAdd: ToolDefinition = {
    name: 'pilot_memory_add',
    label: 'Memory',
    description: `Save a memory entry to persist knowledge across sessions.

**What makes a GOOD memory:**
✅ "User prefers Tailwind CSS over CSS modules"
✅ "Project uses pnpm workspaces, not npm"
✅ "Always ask before running git push"
✅ "API endpoints follow /api/v1/{resource} pattern"
✅ "User's name is Espen — use in commit messages"

**What makes a BAD memory (don't save these):**
❌ "Fixed bug in auth.ts line 42" (too specific, not reusable)
❌ "User asked to add a button" (one-time task, not a preference)
❌ "File src/app.tsx exists" (obvious, clogs memory)
❌ "I am writing TypeScript" (trivial, not worth remembering)

**Scope guidance:**
- \`global\`: User preferences, coding style, general practices (applies to ALL projects)
- \`project\`: Project-specific facts, tech stack, API patterns, team conventions

**Category guidance:** Use standard categories when possible: "User Preferences", "Technical Context", "Decisions", "Patterns & Conventions", "Project Notes". Custom categories are allowed but will be normalized to reduce fragmentation.

**IMPORTANT:** Always call \`pilot_memory_read\` FIRST to check for duplicates before adding.`,
    parameters: Type.Object({
      text: Type.String({ description: 'The memory to save — one concise line. Be specific and actionable.' }),
      scope: Type.Optional(
        Type.Union(
          [Type.Literal('global'), Type.Literal('project')],
          { description: 'global = all projects, project = this project only. Default: project' }
        )
      ),
      category: Type.Optional(
        Type.String({ description: 'Category heading (will be normalized). Recommended: "User Preferences", "Technical Context", "Decisions", "Patterns & Conventions", "Project Notes". Default: General' })
      ),
    }),
    execute: async (_toolCallId, params) => {
      const scope = params.scope ?? 'project';
      const category = normalizeCategory(params.category ?? 'General');
      await memoryManager.appendMemory(params.text, scope, projectPath, category);
      return textResult(`Saved to ${scope} memory under "${category}": ${params.text}`);
    },
  };

  // ─── pilot_memory_remove ─────────────────────────────────────────────

  const memoryRemove: ToolDefinition = {
    name: 'pilot_memory_remove',
    label: 'Memory',
    description: `Remove a memory entry by matching its text.

**When to use:**
- User explicitly asks to forget something
- A memory is outdated or incorrect
- User corrects a previous preference

**Matching behavior:** Case-insensitive partial match. For example, searching for "tailwind" will match "User prefers Tailwind CSS over CSS modules".

**Returns:** The exact text that was removed, or a message if nothing matched.`,
    parameters: Type.Object({
      text: Type.String({ description: 'Text to match against existing memories (case-insensitive partial match)' }),
    }),
    execute: async (_toolCallId, params) => {
      const removed = await memoryManager.removeMemory(params.text, projectPath);
      return textResult(removed
        ? `Removed: "${removed}"`
        : `No memory found matching: ${params.text}`);
    },
  };

  // ─── pilot_memory_search ─────────────────────────────────────────────

  const memorySearch: ToolDefinition = {
    name: 'pilot_memory_search',
    label: 'Memory',
    description: `Search memories by keyword or phrase, returning only matching entries rather than the full memory file contents.

**When to use:**
- Looking for a specific fact without wading through all memories
- Checking if something is already remembered before adding
- Finding memories related to a specific topic or keyword

**Returns:** Matching entries with scope and category context.`,
    parameters: Type.Object({
      query: Type.String({ description: 'Keyword or phrase to search for (case-insensitive)' }),
      scope: Type.Optional(
        Type.Union(
          [Type.Literal('all'), Type.Literal('global'), Type.Literal('project')],
          { description: 'Which memories to search. Default: all' }
        )
      ),
    }),
    execute: async (_toolCallId, params) => {
      if (!params.query.trim()) {
        return textResult('Please provide a non-empty search query. Use pilot_memory_read to see all memories.');
      }
      const scope = params.scope ?? 'all';
      const results = await memoryManager.searchMemories(params.query, projectPath, scope);

      if (results.length === 0) {
        return textResult(`No memories found matching: ${params.query}`);
      }

      const lines = results.map(r => `[${r.scope}/${r.category}] ${r.text}`);
      return textResult(`Found ${results.length} matching ${results.length === 1 ? 'memory' : 'memories'}:\n\n${lines.join('\n')}`);
    },
  };

  return [memoryRead, memoryAdd, memoryRemove, memorySearch];
}
