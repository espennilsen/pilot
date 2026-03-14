/**
 * Tests for session-export.ts — Markdown and JSON export formatters.
 */

import { describe, it, expect } from 'vitest';
import { formatAsMarkdown, formatAsJson } from '../../../electron/services/session-export';
import type { Message } from '@mariozechner/pi-ai';
import type { SessionExportOptions } from '../../../shared/types';

// ─── Test Fixtures ──────────────────────────────────────────────────────

const userMessage: Message = {
  role: 'user',
  content: [{ type: 'text', text: 'Hello, how are you?' }],
  timestamp: 1710000000000,
};

const userMessageString: Message = {
  role: 'user',
  content: 'Hello as a string',
  timestamp: 1710000001000,
};

const assistantMessage: Message = {
  role: 'assistant',
  content: [
    { type: 'thinking', thinking: 'Let me think about this...', redacted: false },
    { type: 'text', text: 'I am doing great, thank you!' },
  ],
  api: 'anthropic-messages',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } },
  stopReason: 'stop',
  timestamp: 1710000002000,
};

const assistantWithToolCall: Message = {
  role: 'assistant',
  content: [
    { type: 'text', text: 'Let me read that file for you.' },
    { type: 'toolCall', id: 'tc-1', name: 'read_file', arguments: { path: 'src/index.ts' } },
  ],
  api: 'anthropic-messages',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } },
  stopReason: 'toolUse',
  timestamp: 1710000003000,
};

const toolResultMessage: Message = {
  role: 'toolResult',
  toolCallId: 'tc-1',
  toolName: 'read_file',
  content: [{ type: 'text', text: 'console.log("hello")' }],
  isError: false,
  timestamp: 1710000004000,
};

const toolResultError: Message = {
  role: 'toolResult',
  toolCallId: 'tc-2',
  toolName: 'write_file',
  content: [{ type: 'text', text: 'Permission denied' }],
  isError: true,
  timestamp: 1710000005000,
};

const simpleConversation: Message[] = [userMessage, assistantMessage];
const conversationWithTools: Message[] = [userMessage, assistantWithToolCall, toolResultMessage, assistantMessage];

const defaultOptions: SessionExportOptions = {
  format: 'markdown',
  includeThinking: false,
  includeToolCalls: false,
  includeTimestamps: true,
};

const fullOptions: SessionExportOptions = {
  format: 'markdown',
  includeThinking: true,
  includeToolCalls: true,
  includeTimestamps: true,
};

const meta = {
  title: 'Test Conversation',
  projectPath: '/Users/test/project',
  sessionPath: '/Users/test/.config/pilot/sessions/test.jsonl',
};

// ─── Markdown Export ────────────────────────────────────────────────────

describe('formatAsMarkdown', () => {
  it('should export a simple conversation', () => {
    const md = formatAsMarkdown(simpleConversation, defaultOptions, meta);
    expect(md).toContain('# Test Conversation');
    expect(md).toContain('**Project:** `/Users/test/project`');
    expect(md).toContain('## 🧑 User');
    expect(md).toContain('Hello, how are you?');
    expect(md).toContain('## 🤖 Assistant');
    expect(md).toContain('I am doing great, thank you!');
    expect(md).toContain('claude-sonnet-4-5');
  });

  it('should include thinking when option is set', () => {
    const md = formatAsMarkdown(simpleConversation, { ...defaultOptions, includeThinking: true }, meta);
    expect(md).toContain('💭 Thinking');
    expect(md).toContain('Let me think about this...');
  });

  it('should exclude thinking by default', () => {
    const md = formatAsMarkdown(simpleConversation, defaultOptions, meta);
    expect(md).not.toContain('💭 Thinking');
    expect(md).not.toContain('Let me think about this...');
  });

  it('should include tool calls when option is set', () => {
    const md = formatAsMarkdown(conversationWithTools, fullOptions, meta);
    expect(md).toContain('🔧 **Tool call:** `read_file`');
    expect(md).toContain('"path": "src/index.ts"');
  });

  it('should include tool results when option is set', () => {
    const md = formatAsMarkdown(conversationWithTools, fullOptions, meta);
    expect(md).toContain('✅ **Tool result:** `read_file`');
    expect(md).toContain('console.log("hello")');
  });

  it('should show error tool results with ❌', () => {
    const messages: Message[] = [userMessage, assistantWithToolCall, toolResultError];
    const md = formatAsMarkdown(messages, fullOptions, meta);
    expect(md).toContain('❌ **Tool result:** `write_file`');
    expect(md).toContain('Permission denied');
  });

  it('should exclude tool details by default', () => {
    const md = formatAsMarkdown(conversationWithTools, defaultOptions, meta);
    expect(md).not.toContain('🔧 **Tool call:**');
    expect(md).not.toContain('✅ **Tool result:**');
  });

  it('should include timestamps', () => {
    const md = formatAsMarkdown(simpleConversation, { ...defaultOptions, includeTimestamps: true }, meta);
    // Should have a date-like pattern in the message headers
    expect(md).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
  });

  it('should exclude timestamps when option is false', () => {
    const md = formatAsMarkdown(simpleConversation, { ...defaultOptions, includeTimestamps: false }, meta);
    // Headers should not have the timestamp pattern after User/Assistant
    const lines = md.split('\n').filter(l => l.startsWith('## 🧑 User') || l.startsWith('## 🤖 Assistant'));
    for (const line of lines) {
      expect(line).not.toContain('*(');
    }
  });

  it('should handle string user content', () => {
    const md = formatAsMarkdown([userMessageString, assistantMessage], defaultOptions, meta);
    expect(md).toContain('Hello as a string');
  });

  it('should handle empty messages array', () => {
    const md = formatAsMarkdown([], defaultOptions, meta);
    expect(md).toContain('# Test Conversation');
    expect(md).toContain('**Messages:** 0');
  });

  it('should show correct message count excluding tool results', () => {
    const md = formatAsMarkdown(conversationWithTools, fullOptions, meta);
    // 2 user/assistant pairs = 3 messages (1 user + 1 assistant with tool + 1 assistant)
    expect(md).toContain('**Messages:** 3');
  });

  it('should use default title when no meta provided', () => {
    const md = formatAsMarkdown(simpleConversation, defaultOptions);
    expect(md).toContain('# Chat Export');
  });
});

// ─── JSON Export ────────────────────────────────────────────────────────

describe('formatAsJson', () => {
  it('should export valid JSON', () => {
    const json = formatAsJson(simpleConversation, defaultOptions, meta);
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
    expect(parsed.export.format).toBe('pilot-chat-export');
    expect(parsed.export.version).toBe(1);
  });

  it('should include session metadata', () => {
    const json = formatAsJson(simpleConversation, defaultOptions, meta);
    const parsed = JSON.parse(json);
    expect(parsed.session.title).toBe('Test Conversation');
    expect(parsed.session.projectPath).toBe('/Users/test/project');
    expect(parsed.session.sessionPath).toBe('/Users/test/.config/pilot/sessions/test.jsonl');
  });

  it('should include messages', () => {
    const json = formatAsJson(simpleConversation, defaultOptions, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe('user');
    expect(parsed.messages[0].content).toBe('Hello, how are you?');
    expect(parsed.messages[1].role).toBe('assistant');
    expect(parsed.messages[1].content).toBe('I am doing great, thank you!');
  });

  it('should include timestamps as ISO strings', () => {
    const json = formatAsJson(simpleConversation, { ...defaultOptions, includeTimestamps: true }, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should exclude timestamps when option is false', () => {
    const json = formatAsJson(simpleConversation, { ...defaultOptions, includeTimestamps: false }, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages[0].timestamp).toBeUndefined();
  });

  it('should include thinking when option is set', () => {
    const json = formatAsJson(simpleConversation, { ...defaultOptions, includeThinking: true }, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages[1].thinking).toBe('Let me think about this...');
  });

  it('should exclude thinking by default', () => {
    const json = formatAsJson(simpleConversation, defaultOptions, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages[1].thinking).toBeUndefined();
  });

  it('should include tool calls when option is set', () => {
    const json = formatAsJson(conversationWithTools, fullOptions, meta);
    const parsed = JSON.parse(json);
    const toolMsg = parsed.messages.find((m: any) => m.toolCalls);
    expect(toolMsg).toBeDefined();
    expect(toolMsg.toolCalls[0].name).toBe('read_file');
    expect(toolMsg.toolCalls[0].args.path).toBe('src/index.ts');
  });

  it('should include tool results when option is set', () => {
    const json = formatAsJson(conversationWithTools, fullOptions, meta);
    const parsed = JSON.parse(json);
    const resultMsg = parsed.messages.find((m: any) => m.role === 'tool_result');
    expect(resultMsg).toBeDefined();
    expect(resultMsg.toolResults[0].toolName).toBe('read_file');
    expect(resultMsg.toolResults[0].isError).toBe(false);
  });

  it('should include model info on assistant messages', () => {
    const json = formatAsJson(simpleConversation, defaultOptions, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages[1].model).toBe('claude-sonnet-4-5');
    expect(parsed.messages[1].provider).toBe('anthropic');
  });

  it('should handle empty messages array', () => {
    const json = formatAsJson([], defaultOptions, meta);
    const parsed = JSON.parse(json);
    expect(parsed.messages).toHaveLength(0);
    expect(parsed.session.messageCount).toBe(0);
  });
});
