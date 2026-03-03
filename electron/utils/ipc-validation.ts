/**
 * @file Shared IPC input validation helpers.
 *
 * Extracted from electron/ipc/desktop.ts so they can be tested directly
 * without re-implementing the logic in tests.
 */
import { resolve } from 'path';
import { homedir } from 'os';
import { isWithinDir } from './paths';

/** Validate that a value is a non-empty string. Throws with a descriptive message. */
export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

/** Validate that a value is a boolean. Throws with a descriptive message. */
export function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

/**
 * Validate a project path: must be a non-empty string that resolves to an absolute
 * path within the user's home directory. Rejects arbitrary paths to prevent writes
 * to sensitive locations (e.g. /etc, /tmp).
 *
 * On Windows the homedir() check is relaxed because projects commonly live on
 * secondary drives (e.g. D:\projects) outside C:\Users\<user>. Docker's own
 * mount restrictions prevent arbitrary filesystem access.
 *
 * Returns the resolved absolute path.
 */
export function validateProjectPath(value: unknown): string {
  const raw = requireString(value, 'projectPath');
  const resolved = resolve(raw);

  if (process.platform === 'win32') {
    if (!resolved.match(/^[A-Za-z]:\\/)) {
      throw new Error(`Project path must be an absolute path: ${resolved}`);
    }
    // Defence-in-depth: block well-known Windows system directories.
    // Docker mount restrictions provide the primary sandboxing, but rejecting
    // these at the IPC layer prevents a compromised renderer from attempting
    // to mount sensitive OS locations.
    const lower = resolved.toLowerCase().replace(/\\/g, '/');
    const blocklist = ['c:/windows', 'c:/program files', 'c:/program files (x86)', 'c:/programdata'];
    for (const blocked of blocklist) {
      if (lower === blocked || lower.startsWith(blocked + '/')) {
        throw new Error(`Project path must not be a system directory: ${resolved}`);
      }
    }
  } else {
    if (!isWithinDir(homedir(), resolved)) {
      throw new Error(`Project path must be within the home directory: ${resolved}`);
    }
  }

  return resolved;
}
