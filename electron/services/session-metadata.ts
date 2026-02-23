import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { PILOT_APP_DIR } from './pilot-paths';

/**
 * Per-session metadata that Pilot tracks on top of the SDK session data.
 * Keyed by session path (the unique identifier from the SDK).
 */
export interface SessionMeta {
  isPinned: boolean;
  isArchived: boolean;
}

interface SessionMetadataFile {
  /** Map of session path → metadata */
  sessions: Record<string, SessionMeta>;
}

const METADATA_FILE = join(PILOT_APP_DIR, 'session-metadata.json');

const DEFAULT_META: SessionMeta = { isPinned: false, isArchived: false };

function load(): SessionMetadataFile {
  try {
    if (existsSync(METADATA_FILE)) {
      const raw = readFileSync(METADATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return { sessions: parsed.sessions || {} };
    }
  } catch {
    // Corrupt file — start fresh
  }
  return { sessions: {} };
}

function save(data: SessionMetadataFile): void {
  try {
    const dir = PILOT_APP_DIR;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(METADATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save session metadata:', err);
  }
}

/** Get metadata for a session. Returns defaults if not found. */
export function getSessionMeta(sessionPath: string): SessionMeta {
  const data = load();
  return data.sessions[sessionPath] || { ...DEFAULT_META };
}

/** Update metadata for a session (partial update, merges with existing). */
export function updateSessionMeta(sessionPath: string, update: Partial<SessionMeta>): SessionMeta {
  const data = load();
  const existing = data.sessions[sessionPath] || { ...DEFAULT_META };
  const merged = { ...existing, ...update };
  data.sessions[sessionPath] = merged;
  save(data);
  return merged;
}

/** Get metadata for all sessions at once (for bulk listing). */
export function getAllSessionMeta(): Record<string, SessionMeta> {
  const data = load();
  return data.sessions;
}

/** Remove metadata for a session (e.g., when session is deleted). */
export function removeSessionMeta(sessionPath: string): void {
  const data = load();
  delete data.sessions[sessionPath];
  save(data);
}
