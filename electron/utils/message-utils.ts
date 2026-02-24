import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { TextContent, ThinkingContent } from '@mariozechner/pi-ai';

/**
 * Extract the text content from the last assistant message in a conversation.
 * Returns empty string if no assistant message is found.
 */
export function extractLastAssistantText(messages: AgentMessage[]): string {
  const lastAssistant = [...messages].reverse().find(
    (m: AgentMessage) => m.role === 'assistant'
  );
  if (!lastAssistant || lastAssistant.role !== 'assistant') return '';
  if (!Array.isArray(lastAssistant.content)) return '';
  return lastAssistant.content
    .filter((b): b is TextContent => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
