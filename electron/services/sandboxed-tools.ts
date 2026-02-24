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
import { resolve, relative, isAbsolute } from 'path';
import { randomUUID } from 'crypto';
import type { StagedDiff } from '../../shared/types';
import { expandHome } from '../utils/paths';

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

function isWithinProject(projectRoot: string, filePath: string, allowedPaths: string[]): boolean {
  const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(projectRoot, filePath);
  // On Windows, normalize case for comparison (C:\Foo vs c:\foo are the same path)
  const norm = (p: string) => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);
  const normalRoot = norm(projectRoot);
  const normalResolved = norm(resolved);
  const rel = relative(normalRoot, normalResolved);
  // Path is within project if it doesn't start with '..'
  if (!rel.startsWith('..') && !isAbsolute(rel)) return true;
  // Check allowed paths
  for (const allowed of allowedPaths) {
    const normalAllowed = norm(expandHome(allowed));
    const relToAllowed = relative(normalAllowed, normalResolved);
    if (!relToAllowed.startsWith('..') && !isAbsolute(relToAllowed)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Bash command path analysis — extract and validate paths in shell commands
// ---------------------------------------------------------------------------

/**
 * System path prefixes that are implicitly allowed when jail is enabled.
 * These are standard OS directories containing executables and read-only
 * system resources that agents routinely reference in commands.
 */
const SYSTEM_SAFE_PREFIXES = [
  // Unix/macOS
  '/dev/',       // Device files (/dev/null, /dev/urandom, etc.)
  '/proc/',      // Linux procfs
  '/sys/',       // Linux sysfs
  '/usr/',       // System executables and libraries
  '/bin/',       // Essential executables
  '/sbin/',      // System admin executables
  '/opt/',       // Third-party packages
  '/nix/',       // Nix store
  '/etc/',       // System config (read-only in practice)
  '/Library/',   // macOS system library
  // Windows
  'C:\\Windows\\',
  'C:\\Program Files\\',
  'C:\\Program Files (x86)\\',
];

/** Exact system paths allowed (when not covered by prefix). */
const SYSTEM_SAFE_EXACT = new Set([
  '/dev/null', '/dev/zero', '/dev/urandom', '/dev/random',
  '/dev/stdin', '/dev/stdout', '/dev/stderr', '/dev/tty',
  '/tmp',  // bare /tmp reference (e.g., `ls /tmp`)
]);

function isSystemPath(absPath: string): boolean {
  // Normalize to lowercase on Windows for case-insensitive comparison
  const normalized = process.platform === 'win32' ? absPath.toLowerCase() : absPath;
  const normalizedPrefixes = process.platform === 'win32'
    ? SYSTEM_SAFE_PREFIXES.map(p => p.toLowerCase())
    : SYSTEM_SAFE_PREFIXES;
  
  if (SYSTEM_SAFE_EXACT.has(normalized)) return true;
  return normalizedPrefixes.some(prefix => normalized.startsWith(prefix));
}

/**
 * Expand environment variables that commonly resolve to paths.
 * Replaces $HOME, ${HOME}, $TMPDIR, ${TMPDIR}, and ~/ with their actual values.
 */
function extractEnvExpansions(command: string): string {
  const home = process.env.HOME ?? '';
  let expanded = command;
  
  // Expand $HOME and ${HOME}
  expanded = expanded.replace(/\$HOME(?=\/|[\s;|&'"`)}]|$)|\$\{HOME\}/g, home);
  
  // Expand $TMPDIR and ${TMPDIR}
  expanded = expanded.replace(
    /\$TMPDIR(?=\/|[\s;|&'"`)}]|$)|\$\{TMPDIR\}/g,
    process.env.TMPDIR ?? '/tmp',
  );

  // Expand ~ to home dir at word boundaries (not ~user)
  expanded = expanded.replace(/(^|[\s;|&()>=`])~\//g, `$1${home}/`);

  // Strip comments (# to end of line, but not inside quotes — best-effort)
  expanded = expanded.replace(/(^|[\s;|&])#[^\n]*/g, '$1');

  return expanded;
}

/**
 * Extract absolute paths from command string using regex pattern matching.
 * Captures paths like /foo/bar, /etc/hosts, excluding URL paths (https://).
 */
function extractAbsolutePaths(command: string): Set<string> {
  const candidates = new Set<string>();
  
  // Pattern: Absolute paths — /foo/bar preceded by shell delimiter or start
  // The regex prevents matching URL paths by checking context
  const absRegex = /(?:^|[\s;|&()>`"'=])(\/{1,2}[\w.\-/+@:,]+)/g;
  let m: RegExpExecArray | null;
  
  while ((m = absRegex.exec(command)) !== null) {
    const p = m[1].replace(/[,;:'"]+$/, ''); // trim trailing punctuation
    if (p.length > 1 && p !== '//') {
      // Skip if this looks like part of a URL (preceded by :)
      const charBefore = command[m.index] === '/' ? command[m.index - 1] : undefined;
      if (charBefore !== ':') candidates.add(p);
    }
  }

  return candidates;
}

/**
 * Extract relative escape paths from command string (e.g., ../, ../../foo).
 * These paths attempt to navigate outside the current directory.
 */
function extractRelativeEscapes(command: string): Set<string> {
  const candidates = new Set<string>();
  
  // Pattern: Relative escape paths — ../ or ../../ preceded by delimiter
  const relRegex = /(?:^|[\s;|&()>`"'=])((?:\.\.\/)+[\w.\-/]*)/g;
  let m: RegExpExecArray | null;
  
  while ((m = relRegex.exec(command)) !== null) {
    candidates.add(m[1]);
  }

  return candidates;
}

/**
 * Extract potential filesystem paths from a bash command string.
 *
 * This is a best-effort heuristic — shell is Turing-complete so we can't
 * catch every programmatic path construction. We catch the common patterns:
 *
 * - Absolute paths:        /foo/bar, /etc/hosts
 * - Home references:       ~/foo, $HOME/foo, ${HOME}/foo
 * - Relative escapes:      ../foo, ../../bar
 * - Redirect targets:      > /path, >> /path, 2> /path
 * - Env var expansion:     $HOME, $TMPDIR (resolved before extraction)
 * - Inside quotes:         "~/secrets" or '/etc/passwd' (quotes stripped)
 * - Command substitution:  $(cat /etc/passwd) or `cat /etc/passwd`
 *
 * Does NOT false-positive on:
 * - URLs:                  https://example.com/path (no whitespace before /)
 * - CLI flags:             --option=/value (excluded by = prefix handling)
 * - Regex patterns:        s/foo/bar/g (not word-boundary-preceded)
 */
function extractPathsFromCommand(command: string): string[] {
  // Step 1: Expand environment variables
  const expanded = extractEnvExpansions(command);

  // Step 2: Extract absolute paths
  const absolutePaths = extractAbsolutePaths(expanded);

  // Step 3: Extract relative escape paths
  const relativePaths = extractRelativeEscapes(expanded);

  // Merge results and return as array
  const allPaths = new Set([...absolutePaths, ...relativePaths]);
  return [...allPaths];
}

/**
 * Analyze a bash command for paths that escape the project jail.
 *
 * @returns Array of offending paths (empty if command is safe).
 *          Each entry is the raw path string found in the command.
 */
export function findEscapingPaths(
  command: string,
  projectRoot: string,
  allowedPaths: string[],
): string[] {
  const candidates = extractPathsFromCommand(command);
  const offending: string[] = [];

  for (const candidate of candidates) {
    // Resolve to absolute for system-path check
    const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(projectRoot, candidate);

    // Allow standard system paths (executables, /dev, /proc, etc.)
    if (isSystemPath(abs)) continue;

    // Check against project root + user-configured allowed paths
    if (!isWithinProject(projectRoot, candidate, allowedPaths)) {
      offending.push(candidate);
    }
  }

  return offending;
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
