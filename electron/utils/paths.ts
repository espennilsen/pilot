import { homedir } from 'os';
import { join, resolve } from 'path';

/**
 * Expand ~ to home directory. Handles both ~/... and ~\\... (Windows).
 */
export function expandHome(p: string): string {
  const home = homedir();
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(home, p.slice(2));
  return p;
}

/**
 * Normalize a path for case-insensitive comparison on Windows.
 * On Unix, paths are case-sensitive so this is a no-op.
 */
export function normalizePath(p: string): string {
  const resolved = resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Check if `child` is within `parent` directory.
 * Handles Windows drive letter case and UNC paths.
 */
export function isWithinDir(parent: string, child: string): boolean {
  const normalParent = normalizePath(parent);
  const normalChild = normalizePath(child);
  return normalChild.startsWith(normalParent + (process.platform === 'win32' ? '\\' : '/')) ||
    normalChild === normalParent;
}
