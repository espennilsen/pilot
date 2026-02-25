/**
 * pi-session-listing.ts — Session listing, querying, and deletion.
 *
 * Extracted from PilotSessionManager to isolate session persistence
 * operations (list, list all, delete) from the core session lifecycle.
 */

import { SessionManager } from '@mariozechner/pi-coding-agent';
import { join } from 'path';
import { existsSync, readdirSync, unlinkSync } from 'fs';
import { getPiAgentDir } from './app-settings';
import type { SessionMetadata } from '../../shared/types';
import { getAllSessionMeta, removeSessionMeta } from './session-metadata';
import { getSessionDir, decodeDirName } from './pi-session-helpers';

/**
 * List sessions for a specific project (project-scoped).
 */
export async function listSessions(projectPath: string): Promise<SessionMetadata[]> {
  try {
    const piAgentDir = getPiAgentDir();
    const sessionDir = getSessionDir(piAgentDir, projectPath);
    const sessions = await SessionManager.list(projectPath, sessionDir);
    const metaMap = getAllSessionMeta();
    return sessions.map(s => {
      const meta = metaMap[s.path] || { isPinned: false, isArchived: false };
      return {
        sessionPath: s.path,
        projectPath: s.cwd || projectPath,
        isPinned: meta.isPinned,
        isArchived: meta.isArchived,
        customTitle: s.name || s.firstMessage || null,
        messageCount: s.messageCount || 0,
        created: s.created?.getTime() || 0,
        modified: s.modified?.getTime() || 0,
      };
    });
  } catch (err) {
    console.warn('[PilotSession] Failed to list sessions:', err);
    return [];
  }
}

/**
 * List all sessions across known project directories.
 * If no project paths are specified, scans all session directories.
 */
export async function listAllSessions(projectPaths: string[]): Promise<SessionMetadata[]> {
  const piAgentDir = getPiAgentDir();
  const allSessions: SessionMetadata[] = [];
  const metaMap = getAllSessionMeta();

  if (projectPaths.length > 0) {
    // Scan sessions for specific projects
    for (const projectPath of projectPaths) {
      const sessions = await listSessions(projectPath);
      allSessions.push(...sessions);
    }
  } else {
    // No project paths specified — scan all session directories
    const sessionsRoot = join(piAgentDir, 'sessions');
    if (existsSync(sessionsRoot)) {
      try {
        const dirs = readdirSync(sessionsRoot, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        for (const dirName of dirs) {
          const cwd = decodeDirName(dirName);
          const sessionDir = join(sessionsRoot, dirName);
          try {
            const sessions = await SessionManager.list(cwd, sessionDir);
            for (const s of sessions) {
              const meta = metaMap[s.path] || { isPinned: false, isArchived: false };
              allSessions.push({
                sessionPath: s.path,
                projectPath: s.cwd || cwd,
                isPinned: meta.isPinned,
                isArchived: meta.isArchived,
                customTitle: s.name || s.firstMessage || null,
                messageCount: s.messageCount || 0,
                created: s.created?.getTime() || 0,
                modified: s.modified?.getTime() || 0,
              });
            }
          } catch { /* Expected: session directory may be unreadable */ }
        }
      } catch { /* Expected: session directory may be unreadable */ }
    }
  }

  // Sort by most recent first
  allSessions.sort((a, b) => {
    // sessionPath includes timestamp, so alphabetical sort works for recency
    return (b.sessionPath || '').localeCompare(a.sessionPath || '');
  });
  return allSessions;
}

/**
 * Delete a session file from disk and clean up its metadata.
 */
export async function deleteSession(sessionPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (existsSync(sessionPath)) {
      unlinkSync(sessionPath);
    }
    // Clean up persisted metadata (pin/archive flags)
    removeSessionMeta(sessionPath);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to delete session:', message);
    return { success: false, error: message };
  }
}
