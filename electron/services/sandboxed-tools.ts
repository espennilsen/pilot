import {
  createEditTool,
  createWriteTool,
  createBashTool,
  createReadTool,
  createGrepTool,
  createFindTool,
  createLsTool,
} from '@mariozechner/pi-coding-agent';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { structuredPatch } from 'diff';
import { readFileSync, existsSync } from 'fs';
import { resolve, relative, isAbsolute, join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { StagedDiff } from '../../shared/types';

/** Generate a unified diff string using the diff package (same engine as pi's edit tool). */
function generateUnifiedDiff(oldContent: string, newContent: string, contextLines = 3): string {
  const patch = structuredPatch('', '', oldContent, newContent, '', '', { context: contextLines });
  const lines: string[] = [];
  for (const hunk of patch.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    for (const line of hunk.lines) {
      lines.push(line);
    }
  }
  return lines.join('\n');
}

export interface SandboxOptions {
  jailEnabled: boolean;
  yoloMode: boolean;
  allowedPaths: string[];
  onStagedDiff: (diff: StagedDiff) => void;
  tabId: string;
}

// Pending bash approvals — resolves when user accepts/rejects
const pendingBashApprovals = new Map<string, {
  resolve: (approved: boolean) => void;
}>();

export function resolveBashApproval(diffId: string, approved: boolean) {
  const pending = pendingBashApprovals.get(diffId);
  if (pending) {
    pending.resolve(approved);
    pendingBashApprovals.delete(diffId);
  }
}

function expandHome(p: string): string {
  const home = homedir();
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(home, p.slice(2));
  return p;
}

function isWithinProject(projectRoot: string, filePath: string, allowedPaths: string[]): boolean {
  const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(projectRoot, filePath);
  const rel = relative(projectRoot, resolved);
  // Path is within project if it doesn't start with '..'
  if (!rel.startsWith('..') && !isAbsolute(rel)) return true;
  // Check allowed paths
  for (const allowed of allowedPaths) {
    const resolvedAllowed = resolve(expandHome(allowed));
    const relToAllowed = relative(resolvedAllowed, resolved);
    if (!relToAllowed.startsWith('..') && !isAbsolute(relToAllowed)) return true;
  }
  return false;
}

// Helper to convert AgentTool to ToolDefinition by wrapping execute with ctx parameter
function agentToolToDefinition(agentTool: any): ToolDefinition {
  return {
    name: agentTool.name,
    label: agentTool.label,
    description: agentTool.description,
    parameters: agentTool.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      // Call the AgentTool's execute, which doesn't need ctx
      return agentTool.execute(toolCallId, params, signal, onUpdate);
    },
  } as ToolDefinition;
}

export function createSandboxedTools(
  cwd: string,
  options: SandboxOptions
): { tools: ToolDefinition[]; readOnlyTools: ToolDefinition[] } {
  // Get the real SDK tools as AgentTool
  const realEdit = createEditTool(cwd);
  const realWrite = createWriteTool(cwd);
  const realBash = createBashTool(cwd);

  // Create sandboxed edit tool
  const sandboxedEdit: ToolDefinition = {
    name: realEdit.name,
    label: realEdit.label,
    description: realEdit.description,
    parameters: realEdit.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const filePath = (params as any).path ?? (params as any).file_path ?? '';
      
      // Jail check
      if (options.jailEnabled && !isWithinProject(cwd, filePath, options.allowedPaths)) {
        return {
          content: [{ type: 'text', text: `Error: Path "${filePath}" is outside the project directory. Operation blocked by jail.` }],
          details: {},
        };
      }

      // Yolo mode: execute immediately
      if (options.yoloMode) {
        return realEdit.execute(toolCallId, params, signal, onUpdate);
      }

      // Normal mode: stage the diff
      const resolvedPath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
      const oldText = (params as any).oldText ?? (params as any).old_text ?? '';
      const newText = (params as any).newText ?? (params as any).new_text ?? '';

      let originalContent: string | null = null;
      try {
        if (existsSync(resolvedPath)) {
          originalContent = readFileSync(resolvedPath, 'utf-8');
        }
      } catch { /* ignore */ }

      // Compute the proposed file content by applying the edit
      let proposedContent = originalContent ?? '';
      if (originalContent && originalContent.includes(oldText)) {
        proposedContent = originalContent.replace(oldText, newText);
      }

      // Compute unified diff using pi's diff engine
      const unifiedDiff = generateUnifiedDiff(originalContent ?? '', proposedContent);

      const diff: StagedDiff = {
        id: randomUUID(),
        tabId: options.tabId,
        toolCallId,
        filePath,
        operation: 'edit',
        originalContent,
        proposedContent,
        unifiedDiff,
        editParams: { oldText, newText },
        status: 'pending',
        createdAt: Date.now(),
      };

      options.onStagedDiff(diff);

      return {
        content: [{ type: 'text', text: `Edit staged for review: ${filePath}` }],
        details: { diff: unifiedDiff },
      };
    },
  } as ToolDefinition;

  // Create sandboxed write tool
  const sandboxedWrite: ToolDefinition = {
    name: realWrite.name,
    label: realWrite.label,
    description: realWrite.description,
    parameters: realWrite.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const filePath = (params as any).path ?? (params as any).file_path ?? '';
      const content = (params as any).content ?? '';

      // Jail check
      if (options.jailEnabled && !isWithinProject(cwd, filePath, options.allowedPaths)) {
        return {
          content: [{ type: 'text', text: `Error: Path "${filePath}" is outside the project directory. Operation blocked by jail.` }],
          details: {},
        };
      }

      // Yolo mode: execute immediately
      if (options.yoloMode) {
        return realWrite.execute(toolCallId, params, signal, onUpdate);
      }

      // Normal mode: stage the diff
      const resolvedPath = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
      let originalContent: string | null = null;
      try {
        if (existsSync(resolvedPath)) {
          originalContent = readFileSync(resolvedPath, 'utf-8');
        }
      } catch { /* ignore */ }

      // Compute unified diff using pi's diff engine
      const unifiedDiff = generateUnifiedDiff(originalContent ?? '', content);

      const diff: StagedDiff = {
        id: randomUUID(),
        tabId: options.tabId,
        toolCallId,
        filePath,
        operation: originalContent === null ? 'create' : 'edit',
        originalContent,
        proposedContent: content,
        unifiedDiff,
        status: 'pending',
        createdAt: Date.now(),
      };

      options.onStagedDiff(diff);

      return {
        content: [{ type: 'text', text: `Write staged for review: ${filePath}` }],
        details: { diff: unifiedDiff },
      };
    },
  } as ToolDefinition;

  // Bash tool: stages command for approval, waits for accept/reject, then executes
  const sandboxedBash: ToolDefinition = {
    name: realBash.name,
    label: realBash.label,
    description: realBash.description,
    parameters: realBash.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const command = (params as any).command ?? '';

      // Yolo mode: execute immediately
      if (options.yoloMode) {
        return realBash.execute(toolCallId, params, signal, onUpdate);
      }

      const diffId = randomUUID();

      const diff: StagedDiff = {
        id: diffId,
        tabId: options.tabId,
        toolCallId,
        filePath: command,
        operation: 'bash',
        originalContent: null,
        proposedContent: command,
        status: 'pending',
        createdAt: Date.now(),
      };

      options.onStagedDiff(diff);

      // Wait for user approval
      const approved = await new Promise<boolean>((resolve) => {
        pendingBashApprovals.set(diffId, { resolve });

        // If aborted while waiting, reject
        if (signal) {
          signal.addEventListener('abort', () => {
            pendingBashApprovals.delete(diffId);
            resolve(false);
          }, { once: true });
        }
      });

      if (!approved) {
        return {
          content: [{ type: 'text', text: `Bash command rejected by user: ${command}` }],
          details: {},
        };
      }

      // Execute the real command
      return realBash.execute(toolCallId, params, signal, onUpdate);
    },
  } as ToolDefinition;

  // Read-only tools pass through unchanged, converted to ToolDefinition
  const readOnlyToolDefs: ToolDefinition[] = [
    agentToolToDefinition(createReadTool(cwd)),
    agentToolToDefinition(createGrepTool(cwd)),
    agentToolToDefinition(createFindTool(cwd)),
    agentToolToDefinition(createLsTool(cwd)),
  ];

  return {
    tools: [sandboxedEdit, sandboxedWrite, sandboxedBash],
    readOnlyTools: readOnlyToolDefs,
  };
}
