/**
 * prompt-helpers.ts — Pure helper functions for prompt template management.
 *
 * Stateless functions for conflict detection, command validation, and
 * template filling. Extracted from PromptLibrary class for testability.
 */

import { CommandRegistry } from './command-registry';
import { COMMAND_REGEX } from './prompt-parser';
import type { PromptTemplate } from '../../shared/types';

// ─── Conflict Detection ──────────────────────────────────────────────

/**
 * Compute command conflicts for all loaded prompts.
 * Priority: project > user > builtin.
 *
 * Mutates `commandConflict` field on each prompt.
 */
export function computeConflicts(prompts: Map<string, PromptTemplate>): void {
  const claimedCommands = new Map<string, string>(); // command → prompt id

  // Sort prompts by priority: project > user > builtin
  const sorted = Array.from(prompts.values()).sort((a, b) => {
    const priority: Record<string, number> = { project: 0, user: 1, builtin: 2 };
    return (priority[a.source] ?? 3) - (priority[b.source] ?? 3);
  });

  for (const prompt of sorted) {
    prompt.commandConflict = null;

    if (!prompt.command || prompt.hidden) continue;

    // Check system command conflict
    const systemCmd = CommandRegistry.getSystemCommand(prompt.command);
    if (systemCmd) {
      prompt.commandConflict = {
        type: 'system',
        reason: `Conflicts with ${systemCmd.owner} (/${prompt.command})`,
        owner: systemCmd.owner,
      };
      continue;
    }

    // Check duplicate prompt command
    const existingId = claimedCommands.get(prompt.command);
    if (existingId) {
      const existing = prompts.get(existingId);
      prompt.commandConflict = {
        type: 'duplicate',
        reason: `/${prompt.command} is already used by ${existing?.title ?? existingId}`,
        conflictingPromptId: existingId,
      };
      continue;
    }

    // Claim the command
    claimedCommands.set(prompt.command, prompt.id);
  }
}

// ─── Command Validation ──────────────────────────────────────────────

/**
 * Validate a command string against system commands and existing prompts.
 * Returns { valid, error? }.
 */
export function validateCommand(
  command: string,
  prompts: Map<string, PromptTemplate>,
  excludePromptId?: string
): { valid: boolean; error?: string } {
  if (!command) return { valid: true };

  if (!COMMAND_REGEX.test(command)) {
    return {
      valid: false,
      error: 'Command must be lowercase, 2-20 chars, letters/numbers/hyphens only',
    };
  }

  // Check system commands
  const systemCmd = CommandRegistry.getSystemCommand(command);
  if (systemCmd) {
    return {
      valid: false,
      error: `/${command} is a system command (${systemCmd.owner})`,
    };
  }

  // Check existing prompts
  for (const prompt of prompts.values()) {
    if (prompt.id === excludePromptId) continue;
    if (prompt.command === command && !prompt.hidden) {
      return {
        valid: false,
        error: `/${command} is already used by ${prompt.title}`,
      };
    }
  }

  return { valid: true };
}

// ─── Template Filling ────────────────────────────────────────────────

/**
 * Fill template variables. Replaces {{var}} with values.
 * Unfilled variables are stripped, and excess blank lines are collapsed.
 */
export function fillTemplate(content: string, values: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  // Remove unfilled optional variables
  result = result.replace(/\{\{\w+\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return result;
}
