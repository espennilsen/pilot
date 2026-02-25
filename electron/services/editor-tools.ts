import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { IPC } from '../../shared/ipc';
import { broadcastToRenderer } from '../utils/broadcast';
import type { EditorOpenFilePayload, EditorOpenUrlPayload } from '../../shared/types';

/**
 * Creates agent tools for controlling the Pilot GUI.
 * These let the agent open files in the editor and URLs in the browser.
 */
export function createEditorTools(projectPath: string): ToolDefinition[] {

  // ─── pilot_show_file ─────────────────────────────────────────────────

  const showFile: ToolDefinition = {
    name: 'pilot_show_file',
    label: 'Editor',
    description:
      'Open a file in the editor for the user to see. Optionally highlight a range of lines. Use when the user asks to "show me", "where is", or when pointing out specific code.',
    parameters: Type.Object({
      path: Type.String({ description: 'File path relative to project root' }),
      start_line: Type.Optional(Type.Number({ description: 'First line to highlight (1-indexed)' })),
      end_line: Type.Optional(Type.Number({ description: 'Last line to highlight (1-indexed). Defaults to start_line if omitted.' })),
    }),
    execute: async (params) => {
      const { resolve, join } = await import('path');
      const filePath = resolve(join(projectPath, params.path));

      const payload: EditorOpenFilePayload = {
        filePath,
        projectPath,
        startLine: params.start_line,
        endLine: params.end_line ?? params.start_line,
      };

      broadcastToRenderer(IPC.EDITOR_OPEN_FILE, payload);
      const lineInfo = params.start_line
        ? ` (lines ${params.start_line}${params.end_line && params.end_line !== params.start_line ? `-${params.end_line}` : ''})`
        : '';
      return `Opened ${params.path}${lineInfo} in the editor.`;
    },
  };

  // ─── pilot_open_url ──────────────────────────────────────────────────

  const openUrl: ToolDefinition = {
    name: 'pilot_open_url',
    label: 'Browser',
    description:
      'Open a URL in the user\'s default browser. The user will be asked to confirm before the browser opens. Use for documentation links, API references, or web pages relevant to the conversation.',
    parameters: Type.Object({
      url: Type.String({ description: 'URL to open' }),
      title: Type.Optional(Type.String({ description: 'Short description of what the link is (shown to user in confirmation)' })),
    }),
    execute: async (params) => {
      const payload: EditorOpenUrlPayload = {
        url: params.url,
        title: params.title,
      };

      broadcastToRenderer(IPC.EDITOR_OPEN_URL, payload);
      return `Asked user to open: ${params.url}`;
    },
  };

  return [showFile, openUrl];
}
