/**
 * Citations — Renders numbered citation references from web search results.
 *
 * Detects search result data in tool calls and displays clickable
 * citation links at the bottom of assistant messages.
 */

import { ExternalLink } from 'lucide-react';
import type { ToolCallInfo } from '../../stores/chat-store';

/** A citation extracted from a web_search tool result. */
export interface Citation {
  index: number;
  title: string;
  url: string;
  description: string;
}

/**
 * Extract citations from a list of tool calls.
 * Looks for web_search tool results with structured data.
 */
export function extractCitations(toolCalls?: ToolCallInfo[]): Citation[] {
  if (!toolCalls || toolCalls.length === 0) return [];

  const citations: Citation[] = [];

  for (const tc of toolCalls) {
    if (tc.toolName !== 'web_search' || tc.status !== 'completed' || !tc.result) continue;

    try {
      // The result may be a JSON string with details.results
      // Or the tool output may have the results embedded
      // Try parsing from the result text
      const resultText = tc.result;

      // Parse numbered references from the text output: [N] Title\n    URL\n    Description
      // Use [^\S\n]+ (horizontal whitespace only) to avoid matching across blank lines
      const refPattern = /\[(\d+)\]\s+(.+)\n[^\S\n]+(\S+)\n(?:[^\S\n]+(.+))?/g;
      let match;
      while ((match = refPattern.exec(resultText)) !== null) {
        citations.push({
          index: parseInt(match[1], 10),
          title: match[2].trim(),
          url: match[3].trim(),
          description: match[4]?.trim() || '',
        });
      }
    } catch {
      // Ignore parse errors — no citations for this tool call
    }
  }

  return citations;
}

interface CitationsBarProps {
  citations: Citation[];
}

/** Only allow safe URL protocols. */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Render a horizontal bar of citation chips below a message.
 */
export default function CitationsBar({ citations }: CitationsBarProps) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-border/50">
      <div className="flex items-center gap-1.5 mb-1.5">
        <ExternalLink className="w-3 h-3 text-text-secondary" />
        <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wider">Sources</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c) => (
          <a
            key={c.index}
            href={isSafeUrl(c.url) ? c.url : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-bg-surface hover:bg-bg-elevated border border-border rounded-md text-xs transition-colors group"
            title={`${c.title}\n${c.url}${c.description ? '\n' + c.description : ''}`}
          >
            <span className="flex-shrink-0 w-4 h-4 rounded bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center">
              {c.index}
            </span>
            <span className="text-text-primary truncate max-w-[200px] group-hover:text-accent transition-colors">
              {c.title}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
