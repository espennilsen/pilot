/**
 * pi-session-commands.ts — Slash command routing and aggregation.
 *
 * Extracted from PilotSessionManager to isolate command handling logic:
 * - /memory commands
 * - /tasks commands
 * - Slash command listing (prompt templates, skills, extensions)
 */

import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { MemoryCommandResult } from '../../shared/types';
import type { MemoryManager } from './memory-manager';
import type { TaskManager } from './task-manager';

/**
 * Handle /tasks slash commands.
 * Returns a result if it was a task command, or null if not intercepted.
 */
export function handlePossibleTaskCommand(
  message: string,
  projectPath: string,
  taskManager: TaskManager
): { action: 'show_panel' | 'show_create' | 'show_ready'; readyText?: string } | null {
  const trimmed = message.trim().toLowerCase();

  if (trimmed === '/tasks' || trimmed === '/tasks board') {
    return { action: 'show_panel' };
  }

  if (trimmed === '/tasks create') {
    return { action: 'show_create' };
  }

  if (trimmed === '/tasks ready') {
    const ready = taskManager.getReadyTasks(projectPath);
    if (ready.length === 0) {
      return { action: 'show_ready', readyText: '📋 No ready tasks. All tasks are either blocked, in progress, or done.' };
    }
    const lines = ready.map(t => {
      const priorityEmoji = ['🔴', '🟠', '🟡', '🔵', '⚪'][t.priority] || '⚪';
      return `  ${priorityEmoji} [${t.id}] ${t.title}`;
    });
    return {
      action: 'show_ready',
      readyText: `📋 Ready tasks (${ready.length}):\n${lines.join('\n')}`,
    };
  }

  return null;
}

/**
 * Handle messages that start with # or /memory.
 * Returns the result if it was a memory command, or null if not intercepted.
 */
export async function handlePossibleMemoryCommand(
  message: string,
  projectPath: string,
  memoryManager: MemoryManager
): Promise<MemoryCommandResult | null> {
  const trimmed = message.trim();

  // Only intercept:
  // - Messages starting with # as the first character
  // - Exact /memory command
  // Don't intercept ## (markdown headings) or # in the middle of text
  const isHashCommand = trimmed.startsWith('#') && !trimmed.startsWith('##');
  const isMemorySlashCommand = trimmed.toLowerCase() === '/memory';

  if (!isHashCommand && !isMemorySlashCommand) return null;

  return memoryManager.handleManualMemory(message, projectPath);
}

/**
 * Get available slash commands for a session.
 * Combines built-in Pilot commands, prompt templates, skills, and extension commands.
 */
export function getSlashCommands(
  session: AgentSession | undefined
): Array<{ name: string; description: string; source: string }> {
  const commands: Array<{ name: string; description: string; source: string }> = [];

  // Pilot-specific commands (always available, regardless of session)
  commands.push({ name: 'memory', description: 'Open memory panel', source: 'pilot' });
  commands.push({ name: 'tasks', description: 'Open task board', source: 'pilot' });
  commands.push({ name: 'tasks ready', description: 'Show ready tasks', source: 'pilot' });
  commands.push({ name: 'tasks create', description: 'Create a new task', source: 'pilot' });
  commands.push({ name: 'orchestrate', description: 'Enter orchestrator mode — coordinate subagents', source: 'pilot' });
  commands.push({ name: 'spawn', description: 'Quick-spawn a subagent: /spawn [role] [prompt]', source: 'pilot' });

  if (!session) return commands;

  // Prompt templates from the session
  try {
    const templates = session.promptTemplates;
    for (const t of templates) {
      commands.push({
        name: t.name,
        description: t.description || `Prompt template (${t.source})`,
        source: 'prompt',
      });
    }
  } catch { /* session may not be fully initialized */ }

  // Skills from the resource loader
  try {
    const { skills } = session.resourceLoader.getSkills();
    for (const s of skills) {
      commands.push({
        name: `skill:${s.name}`,
        description: s.description || `Skill (${s.source})`,
        source: 'skill',
      });
    }
  } catch { /* Expected: resource loader may not be ready */ }

  // Extension-registered commands
  try {
    const runner = session.extensionRunner;
    if (runner) {
      const extCmds = runner.getRegisteredCommands();
      for (const c of extCmds) {
        // Don't duplicate built-ins already handled
        if (!commands.some(cmd => cmd.name === c.name)) {
          commands.push({
            name: c.name,
            description: c.description || 'Extension command',
            source: 'extension',
          });
        }
      }
    }
  } catch { /* Expected: extension runner may not be initialized */ }

  return commands;
}
