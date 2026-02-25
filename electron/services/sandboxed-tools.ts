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
import { readFileSync, existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { randomUUID } from 'crypto';
import type { StagedDiff } from '../../shared/types';
import {
  generateUnifiedDiff,
  isWithinProject,
  findEscapingPaths,
} from './sandbox-path-helpers';

export { findEscapingPaths } from './sandbox-path-helpers';

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
      } catch { /* Expected: file may not exist yet or be unreadable */ }

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
      } catch { /* Expected: file may not exist yet or be unreadable */ }

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

  // Bash tool: jail blocks escaping paths, otherwise normal yolo/staging flow
  const sandboxedBash: ToolDefinition = {
    name: realBash.name,
    label: realBash.label,
    description: realBash.description,
    parameters: realBash.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const command = (params as any).command ?? '';

      // Jail check: block commands that reference paths outside the project
      if (options.jailEnabled) {
        const escaping = findEscapingPaths(command, cwd, options.allowedPaths);
        if (escaping.length > 0) {
          const pathList = escaping.map(p => `  • ${p}`).join('\n');
          return {
            content: [{
              type: 'text',
              text: [
                `Error: Bash command references paths outside the project directory. Blocked by jail.`,
                ``,
                `Offending paths:`,
                pathList,
                ``,
                `Project root: ${cwd}`,
                `To allow specific external paths, add them to allowedPaths in .pilot/settings.json`,
              ].join('\n'),
            }],
            details: {},
          };
        }
      }

      // Yolo mode: execute immediately (jail already verified paths above)
      if (options.yoloMode) {
        return realBash.execute(toolCallId, params, signal, onUpdate);
      }

      // Normal mode: stage for approval
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

      const approved = await new Promise<boolean>((resolveApproval) => {
        pendingBashApprovals.set(diffId, { resolve: resolveApproval });
        if (signal) {
          signal.addEventListener('abort', () => {
            pendingBashApprovals.delete(diffId);
            resolveApproval(false);
          }, { once: true });
        }
      });

      if (!approved) {
        return {
          content: [{ type: 'text', text: `Bash command rejected by user: ${command}` }],
          details: {},
        };
      }

      return realBash.execute(toolCallId, params, signal, onUpdate);
    },
  } as ToolDefinition;

  // Read-only tools — apply jail checks when enabled
  const realRead = createReadTool(cwd);
  const realGrep = createGrepTool(cwd);
  const realFind = createFindTool(cwd);
  const realLs = createLsTool(cwd);

  function jailCheckPath(filePath: string): string | null {
    if (!options.jailEnabled) return null;
    if (isWithinProject(cwd, filePath, options.allowedPaths)) return null;
    return `Error: Path "${filePath}" is outside the project directory. Operation blocked by jail.`;
  }

  const sandboxedRead: ToolDefinition = {
    name: realRead.name,
    label: realRead.label,
    description: realRead.description,
    parameters: realRead.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const filePath = (params as any).path ?? '';
      const err = jailCheckPath(filePath);
      if (err) return { content: [{ type: 'text', text: err }], details: {} };
      return realRead.execute(toolCallId, params, signal, onUpdate);
    },
  } as ToolDefinition;

  const sandboxedGrep: ToolDefinition = {
    name: realGrep.name,
    label: realGrep.label,
    description: realGrep.description,
    parameters: realGrep.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const searchDir = (params as any).path ?? '';
      if (searchDir) {
        const err = jailCheckPath(searchDir);
        if (err) return { content: [{ type: 'text', text: err }], details: {} };
      }
      return realGrep.execute(toolCallId, params, signal, onUpdate);
    },
  } as ToolDefinition;

  const sandboxedFind: ToolDefinition = {
    name: realFind.name,
    label: realFind.label,
    description: realFind.description,
    parameters: realFind.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const searchDir = (params as any).path ?? '';
      if (searchDir) {
        const err = jailCheckPath(searchDir);
        if (err) return { content: [{ type: 'text', text: err }], details: {} };
      }
      return realFind.execute(toolCallId, params, signal, onUpdate);
    },
  } as ToolDefinition;

  const sandboxedLs: ToolDefinition = {
    name: realLs.name,
    label: realLs.label,
    description: realLs.description,
    parameters: realLs.parameters,
    execute: async (toolCallId, params, signal, onUpdate, _ctx) => {
      const dirPath = (params as any).path ?? '';
      if (dirPath) {
        const err = jailCheckPath(dirPath);
        if (err) return { content: [{ type: 'text', text: err }], details: {} };
      }
      return realLs.execute(toolCallId, params, signal, onUpdate);
    },
  } as ToolDefinition;

  const readOnlyToolDefs: ToolDefinition[] = [
    sandboxedRead,
    sandboxedGrep,
    sandboxedFind,
    sandboxedLs,
  ];

  return {
    tools: [sandboxedEdit, sandboxedWrite, sandboxedBash],
    readOnlyTools: readOnlyToolDefs,
  };
}
