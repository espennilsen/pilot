/**
 * session-export.ts — Format session messages for export to Markdown and JSON.
 *
 * Converts the SDK's internal message format into clean, human-readable
 * export formats. Used by the SESSION_EXPORT IPC handler.
 */

import type {
  TextContent,
  ThinkingContent,
  ToolCall,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
  ImageContent,
} from '@mariozechner/pi-ai';
import type { SessionExportOptions } from '../../shared/types';

/** A processed message ready for export. */
interface ExportMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; args?: Record<string, unknown> }>;
  toolResults?: Array<{ toolName: string; content: string; isError: boolean }>;
  timestamp?: number;
  model?: string;
  provider?: string;
}

/** Extract plain text from user message content. */
function extractUserText(msg: UserMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((c): c is TextContent => c.type === 'text')
    .map(c => c.text)
    .join('');
}

/** Extract text, thinking, and tool calls from assistant message. */
function extractAssistantParts(msg: AssistantMessage): {
  text: string;
  thinking: string;
  toolCalls: Array<{ name: string; args?: Record<string, unknown> }>;
} {
  let text = '';
  let thinking = '';
  const toolCalls: Array<{ name: string; args?: Record<string, unknown> }> = [];

  for (const block of msg.content) {
    if (block.type === 'text') {
      text += (block as TextContent).text;
    } else if (block.type === 'thinking') {
      const tb = block as ThinkingContent;
      if (!tb.redacted) {
        thinking += tb.thinking;
      }
    } else if (block.type === 'toolCall') {
      const tc = block as ToolCall;
      toolCalls.push({ name: tc.name, args: tc.arguments });
    }
  }

  return { text, thinking, toolCalls };
}

/** Extract text from tool result message. */
function extractToolResultText(msg: ToolResultMessage): string {
  return msg.content
    .filter((c): c is TextContent => c.type === 'text')
    .map(c => c.text)
    .join('');
}

/** Convert SDK messages to a flat list of export messages. */
function processMessages(messages: Message[], options: SessionExportOptions): ExportMessage[] {
  const result: ExportMessage[] = [];

  for (const msg of messages) {
    if (!('role' in msg)) continue;

    if (msg.role === 'user') {
      const text = extractUserText(msg);
      if (!text) continue;
      result.push({
        role: 'user',
        content: text,
        timestamp: msg.timestamp || undefined,
      });
    } else if (msg.role === 'assistant') {
      const { text, thinking, toolCalls } = extractAssistantParts(msg);
      if (!text && !thinking && toolCalls.length === 0) continue;

      const exportMsg: ExportMessage = {
        role: 'assistant',
        content: text,
        timestamp: msg.timestamp || undefined,
        model: msg.model,
        provider: msg.provider,
      };

      if (options.includeThinking && thinking) {
        exportMsg.thinking = thinking;
      }
      if (options.includeToolCalls && toolCalls.length > 0) {
        exportMsg.toolCalls = toolCalls;
      }

      result.push(exportMsg);
    } else if (msg.role === 'toolResult' && options.includeToolCalls) {
      const text = extractToolResultText(msg);
      result.push({
        role: 'tool_result',
        content: text,
        toolResults: [{
          toolName: msg.toolName,
          content: text,
          isError: msg.isError,
        }],
        timestamp: msg.timestamp || undefined,
      });
    }
  }

  return result;
}

/** Format a timestamp as a readable date string. */
function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format session messages as Markdown.
 */
export function formatAsMarkdown(
  messages: Message[],
  options: SessionExportOptions,
  meta?: { title?: string; projectPath?: string; sessionPath?: string }
): string {
  const exportMessages = processMessages(messages, options);
  const lines: string[] = [];

  // Header
  const title = meta?.title || 'Chat Export';
  lines.push(`# ${title}`);
  lines.push('');

  if (meta?.projectPath) {
    lines.push(`**Project:** \`${meta.projectPath}\``);
  }

  const now = formatTimestamp(Date.now());
  lines.push(`**Exported:** ${now}`);
  lines.push(`**Messages:** ${exportMessages.filter(m => m.role !== 'tool_result').length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of exportMessages) {
    const timestamp = options.includeTimestamps !== false && msg.timestamp
      ? ` *(${formatTimestamp(msg.timestamp)})*`
      : '';

    if (msg.role === 'user') {
      lines.push(`## 🧑 User${timestamp}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    } else if (msg.role === 'assistant') {
      const modelTag = msg.model ? ` — ${msg.model}` : '';
      lines.push(`## 🤖 Assistant${modelTag}${timestamp}`);
      lines.push('');

      if (msg.thinking) {
        lines.push('<details>');
        lines.push('<summary>💭 Thinking</summary>');
        lines.push('');
        lines.push(msg.thinking);
        lines.push('');
        lines.push('</details>');
        lines.push('');
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          lines.push(`> 🔧 **Tool call:** \`${tc.name}\``);
          if (tc.args && Object.keys(tc.args).length > 0) {
            // Show args concisely — truncate long values
            const argsStr = JSON.stringify(tc.args, (_key, value) => {
              if (typeof value === 'string' && value.length > 200) {
                return value.slice(0, 200) + '…';
              }
              return value;
            }, 2);
            lines.push('>');
            lines.push('> ```json');
            for (const line of argsStr.split('\n')) {
              lines.push(`> ${line}`);
            }
            lines.push('> ```');
          }
          lines.push('');
        }
      }

      if (msg.content) {
        lines.push(msg.content);
        lines.push('');
      }
    } else if (msg.role === 'tool_result' && msg.toolResults) {
      for (const tr of msg.toolResults) {
        const status = tr.isError ? '❌' : '✅';
        lines.push(`> ${status} **Tool result:** \`${tr.toolName}\``);
        if (tr.content) {
          // Truncate very long tool results
          const truncated = tr.content.length > 500
            ? tr.content.slice(0, 500) + '\n…(truncated)'
            : tr.content;
          lines.push('>');
          lines.push('> ```');
          for (const line of truncated.split('\n')) {
            lines.push(`> ${line}`);
          }
          lines.push('> ```');
        }
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format session messages as JSON.
 */
export function formatAsJson(
  messages: Message[],
  options: SessionExportOptions,
  meta?: { title?: string; projectPath?: string; sessionPath?: string }
): string {
  const exportMessages = processMessages(messages, options);

  const output = {
    export: {
      version: 1,
      format: 'pilot-chat-export',
      exportedAt: new Date().toISOString(),
    },
    session: {
      title: meta?.title || null,
      projectPath: meta?.projectPath || null,
      sessionPath: meta?.sessionPath || null,
      messageCount: exportMessages.filter(m => m.role !== 'tool_result').length,
    },
    messages: exportMessages.map(msg => {
      const base: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };

      if (options.includeTimestamps !== false && msg.timestamp) {
        base.timestamp = new Date(msg.timestamp).toISOString();
      }
      if (msg.model) base.model = msg.model;
      if (msg.provider) base.provider = msg.provider;
      if (msg.thinking) base.thinking = msg.thinking;
      if (msg.toolCalls && msg.toolCalls.length > 0) base.toolCalls = msg.toolCalls;
      if (msg.toolResults && msg.toolResults.length > 0) base.toolResults = msg.toolResults;

      return base;
    }),
  };

  return JSON.stringify(output, null, 2);
}
