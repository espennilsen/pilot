import { ipcMain, dialog, clipboard, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { IPC } from '../../shared/ipc';
import type { PilotSessionManager } from '../services/pi-session-manager';
import { updateSessionMeta, removeSessionMeta } from '../services/session-metadata';
import type { SessionMeta } from '../services/session-metadata';
import type { SessionExportOptions, SessionExportResult } from '../../shared/types';
import type { Message } from '@mariozechner/pi-ai';
import { parseSessionEntries, buildSessionContext } from '@mariozechner/pi-coding-agent';
import { formatAsMarkdown, formatAsJson } from '../services/session-export';
import { getPiAgentDir } from '../services/app-settings';
import { isWithinDir } from '../utils/paths';

export function registerSessionIpc(sessionManager: PilotSessionManager) {
  ipcMain.handle(IPC.SESSION_LIST, async (_event, projectPath: string) => {
    return sessionManager.listSessions(projectPath);
  });

  ipcMain.handle(IPC.SESSION_LIST_ALL, async (_event, projectPaths: string[]) => {
    return sessionManager.listAllSessions(projectPaths || []);
  });

  ipcMain.handle(IPC.SESSION_UPDATE_META, async (_event, sessionPath: string, update: Partial<SessionMeta>) => {
    return updateSessionMeta(sessionPath, update);
  });

  ipcMain.handle(IPC.SESSION_DELETE, async (_event, sessionPath: string) => {
    return sessionManager.deleteSession(sessionPath);
  });

  // ── Session export ──────────────────────────────────────────────────

  /** Export session to a file (shows save dialog). */
  ipcMain.handle(
    IPC.SESSION_EXPORT,
    async (
      _event,
      tabId: string,
      options: SessionExportOptions,
      meta?: { title?: string; projectPath?: string }
    ): Promise<SessionExportResult> => {
      const rawMessages = sessionManager.getRawMessages(tabId) as Message[];
      if (rawMessages.length === 0) {
        throw new Error('No messages to export — the session is empty.');
      }

      const sessionPath = sessionManager.getSessionPath(tabId) || undefined;
      const exportMeta = { ...meta, sessionPath };

      const content = options.format === 'json'
        ? formatAsJson(rawMessages, options, exportMeta)
        : formatAsMarkdown(rawMessages, options, exportMeta);

      const ext = options.format === 'json' ? 'json' : 'md';
      const filterName = options.format === 'json' ? 'JSON' : 'Markdown';

      // Generate a default filename from the session title
      const slug = (meta?.title || 'chat-export')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      const dateStamp = new Date().toISOString().split('T')[0];
      const defaultName = `${slug || 'chat-export'}-${dateStamp}.${ext}`;

      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
        title: `Export Chat as ${filterName}`,
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: [ext] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false };
      }

      await writeFile(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    }
  );

  /** Export session to clipboard (returns the formatted content). */
  ipcMain.handle(
    IPC.SESSION_EXPORT_CLIPBOARD,
    async (
      _event,
      tabId: string,
      options: SessionExportOptions,
      meta?: { title?: string; projectPath?: string }
    ): Promise<SessionExportResult> => {
      const rawMessages = sessionManager.getRawMessages(tabId) as Message[];
      if (rawMessages.length === 0) {
        throw new Error('No messages to export — the session is empty.');
      }

      const sessionPath = sessionManager.getSessionPath(tabId) || undefined;
      const exportMeta = { ...meta, sessionPath };

      // Always use Markdown for clipboard — it's the most readable plain-text format
      const content = formatAsMarkdown(rawMessages, { ...options, format: 'markdown' }, exportMeta);

      clipboard.writeText(content);
      return { success: true };
    }
  );

  // ── Session export by path (for sidebar / historical sessions) ──────

  /** Load messages from a session file on disk. */
  async function loadMessagesFromPath(sessionPath: string): Promise<Message[]> {
    // Validate the path is within the sessions directory to prevent path traversal
    const sessionsDir = join(getPiAgentDir(), 'sessions');
    const resolved = resolve(sessionPath);
    if (!isWithinDir(sessionsDir, resolved)) {
      throw new Error('Invalid session path — must be within the sessions directory.');
    }
    if (!existsSync(resolved)) {
      throw new Error('Session file not found.');
    }
    const content = await readFile(resolved, 'utf-8');
    const entries = parseSessionEntries(content);
    if (entries.length === 0) {
      throw new Error('No messages to export — the session is empty.');
    }
    const context = buildSessionContext(entries);
    const messages = (context.messages ?? []) as Message[];
    if (messages.length === 0) {
      throw new Error('No messages to export — the session is empty.');
    }
    return messages;
  }

  /** Export a historical session (by file path) to a file. */
  ipcMain.handle(
    IPC.SESSION_EXPORT_BY_PATH,
    async (
      _event,
      sessionPath: string,
      options: SessionExportOptions,
      meta?: { title?: string; projectPath?: string }
    ): Promise<SessionExportResult> => {
      const rawMessages = await loadMessagesFromPath(sessionPath);
      const exportMeta = { ...meta, sessionPath };

      const content = options.format === 'json'
        ? formatAsJson(rawMessages, options, exportMeta)
        : formatAsMarkdown(rawMessages, options, exportMeta);

      const ext = options.format === 'json' ? 'json' : 'md';
      const filterName = options.format === 'json' ? 'JSON' : 'Markdown';

      const slug = (meta?.title || 'chat-export')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60);
      const dateStamp = new Date().toISOString().split('T')[0];
      const defaultName = `${slug || 'chat-export'}-${dateStamp}.${ext}`;

      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
        title: `Export Chat as ${filterName}`,
        defaultPath: defaultName,
        filters: [{ name: filterName, extensions: [ext] }],
      });

      if (result.canceled || !result.filePath) {
        return { success: false };
      }

      await writeFile(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    }
  );

  /** Copy a historical session (by file path) to clipboard. */
  ipcMain.handle(
    IPC.SESSION_EXPORT_CLIPBOARD_BY_PATH,
    async (
      _event,
      sessionPath: string,
      options: SessionExportOptions,
      meta?: { title?: string; projectPath?: string }
    ): Promise<SessionExportResult> => {
      const rawMessages = await loadMessagesFromPath(sessionPath);
      const exportMeta = { ...meta, sessionPath };

      const content = formatAsMarkdown(rawMessages, { ...options, format: 'markdown' }, exportMeta);

      clipboard.writeText(content);
      return { success: true };
    }
  );
}
