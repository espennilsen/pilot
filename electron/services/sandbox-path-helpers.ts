/**
 * sandbox-path-helpers.ts — Pure path validation and command analysis helpers.
 *
 * Extracted from sandboxed-tools.ts. All functions are stateless and side-effect-free.
 * Used by the sandbox to determine whether a file path or bash command escapes
 * the project jail.
 */

import { structuredPatch } from 'diff';
import { resolve, relative, isAbsolute } from 'path';
import { expandHome } from '../utils/paths';

// ─── Diff Generation ──────────────────────────────────────────────────────

/** Generate a unified diff string using the diff package (same engine as pi's edit tool). */
export function generateUnifiedDiff(oldContent: string, newContent: string, contextLines = 3): string {
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

// ─── Project Jail ─────────────────────────────────────────────────────────

export function isWithinProject(projectRoot: string, filePath: string, allowedPaths: string[]): boolean {
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

// ─── Bash Command Path Analysis ───────────────────────────────────────────

/**
 * Non-binary system prefixes allowed when jail is enabled.
 * Binary directories are derived from $PATH at runtime (see buildSafePrefixes).
 */
const STATIC_SAFE_PREFIXES = [
  '/proc/',      // Linux procfs (needed by some CLI tools)
  '/sys/',       // Linux sysfs (kernel/hardware info, used by some CLI tools)
  '/tmp/',       // Temporary files
];

/**
 * Exact device/pseudo-file paths allowed — needed for basic bash operation.
 * No directory prefixes here; only specific files.
 */
const SYSTEM_SAFE_EXACT = new Set([
  '/dev/null', '/dev/zero', '/dev/urandom', '/dev/random',
  '/dev/stdin', '/dev/stdout', '/dev/stderr', '/dev/tty',
  '/tmp',  // bare /tmp reference (e.g., `ls /tmp`)
]);

/**
 * Build the full set of safe prefixes by combining static entries with
 * directories from $PATH. Each $PATH entry is a binary directory the
 * system trusts for executable lookup, so we allow references to them.
 *
 * Cached after first call — $PATH doesn't change during the process lifetime.
 */
let _cachedSafePrefixes: string[] | null = null;

function buildSafePrefixes(): string[] {
  if (_cachedSafePrefixes) return _cachedSafePrefixes;

  const separator = process.platform === 'win32' ? ';' : ':';
  const pathDirs = (process.env.PATH ?? '').split(separator).filter(Boolean);

  // Normalize each $PATH entry to an absolute path with trailing separator
  const trailingSep = process.platform === 'win32' ? '\\' : '/';
  const pathPrefixes = pathDirs.map(dir => {
    const resolved = resolve(dir);
    return resolved.endsWith(trailingSep) ? resolved : resolved + trailingSep;
  });

  // Deduplicate
  const all = new Set([...STATIC_SAFE_PREFIXES, ...pathPrefixes]);
  _cachedSafePrefixes = [...all];
  return _cachedSafePrefixes;
}

export function isSystemPath(absPath: string): boolean {
  const isWin = process.platform === 'win32';
  const normalized = isWin ? absPath.toLowerCase() : absPath;

  if (SYSTEM_SAFE_EXACT.has(normalized)) return true;

  const prefixes = buildSafePrefixes();
  const normalizedPrefixes = isWin ? prefixes.map(p => p.toLowerCase()) : prefixes;
  return normalizedPrefixes.some(prefix => normalized.startsWith(prefix));
}

/**
 * Expand environment variables that commonly resolve to paths.
 * Replaces $HOME, ${HOME}, $TMPDIR, ${TMPDIR}, and ~/ with their actual values.
 */
export function extractEnvExpansions(command: string): string {
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
export function extractAbsolutePaths(command: string): Set<string> {
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
export function extractRelativeEscapes(command: string): Set<string> {
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
export function extractPathsFromCommand(command: string): string[] {
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
