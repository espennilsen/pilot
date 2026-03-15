/**
 * Tests for Citations — citation extraction from tool calls.
 */

import { describe, it, expect } from 'vitest';
import { extractCitations } from '../../../src/components/chat/Citations';
import type { ToolCallInfo } from '../../../src/stores/chat-store';

describe('extractCitations', () => {
  it('should return empty array when no tool calls', () => {
    expect(extractCitations(undefined)).toEqual([]);
    expect(extractCitations([])).toEqual([]);
  });

  it('should return empty for non-search tool calls', () => {
    const toolCalls: ToolCallInfo[] = [{
      id: 'tc-1',
      toolName: 'read',
      status: 'completed',
      result: 'file content',
      startedAt: Date.now(),
      completedAt: Date.now(),
    }];
    expect(extractCitations(toolCalls)).toEqual([]);
  });

  it('should extract citations from web_search tool results', () => {
    const result = `Web search results for "TypeScript generics":

[1] TypeScript Generics Guide
    https://www.typescriptlang.org/docs/handbook/2/generics.html
    Learn about TypeScript generics.

[2] Understanding Generics
    https://example.com/generics
    A practical guide.

IMPORTANT: When using information from these results, cite your sources.`;

    const toolCalls: ToolCallInfo[] = [{
      id: 'tc-1',
      toolName: 'web_search',
      status: 'completed',
      result,
      startedAt: Date.now(),
      completedAt: Date.now(),
    }];

    const citations = extractCitations(toolCalls);
    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      index: 1,
      title: 'TypeScript Generics Guide',
      url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html',
      description: 'Learn about TypeScript generics.',
    });
    expect(citations[1]).toEqual({
      index: 2,
      title: 'Understanding Generics',
      url: 'https://example.com/generics',
      description: 'A practical guide.',
    });
  });

  it('should ignore running web_search tool calls', () => {
    const toolCalls: ToolCallInfo[] = [{
      id: 'tc-1',
      toolName: 'web_search',
      status: 'running',
      startedAt: Date.now(),
    }];
    expect(extractCitations(toolCalls)).toEqual([]);
  });

  it('should handle results with empty descriptions without dropping entries', () => {
    const result = `Web search results for "test":

[1] First Result
    https://example.com/1
    Has a description.

[2] Second No Desc
    https://example.com/2

[3] Third Result
    https://example.com/3
    Also has description.

IMPORTANT: cite your sources.`;

    const toolCalls: ToolCallInfo[] = [{
      id: 'tc-1',
      toolName: 'web_search',
      status: 'completed',
      result,
      startedAt: Date.now(),
      completedAt: Date.now(),
    }];

    const citations = extractCitations(toolCalls);
    // All 3 should be extracted — the empty description on [2] must not drop [3]
    expect(citations).toHaveLength(3);
    expect(citations[0].index).toBe(1);
    expect(citations[0].description).toBe('Has a description.');
    expect(citations[1].index).toBe(2);
    expect(citations[1].description).toBe('');
    expect(citations[2].index).toBe(3);
    expect(citations[2].description).toBe('Also has description.');
  });

  it('should handle multiple web_search results', () => {
    const result1 = `Web search results for "query 1":

[1] Result One
    https://example.com/1
    Description one.
`;
    const result2 = `Web search results for "query 2":

[1] Result Two
    https://example.com/2
    Description two.
`;

    const toolCalls: ToolCallInfo[] = [
      { id: 'tc-1', toolName: 'web_search', status: 'completed', result: result1, startedAt: Date.now(), completedAt: Date.now() },
      { id: 'tc-2', toolName: 'web_search', status: 'completed', result: result2, startedAt: Date.now(), completedAt: Date.now() },
    ];

    const citations = extractCitations(toolCalls);
    expect(citations.length).toBeGreaterThanOrEqual(2);
  });
});
