import { useState, useMemo } from 'react';
import type { ToolCallInfo } from '../../stores/chat-store';
import { parseUnifiedDiff as parseUnifiedDiffLines } from '../../lib/diff-utils';

const PREVIEW_LINES = 6;

interface ToolResultProps {
  toolCall: ToolCallInfo;
}

/** Try to parse result as JSON, return parsed or null */
function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/** Extract meaningful text from a tool result (strips SDK wrapper) */
function extractContent(result: string): string {
  const parsed = tryParseJSON(result);
  if (!parsed) return result;

  // SDK returns { content: [{ type: 'text', text: '...' }] }
  if (parsed.content && Array.isArray(parsed.content)) {
    const texts = parsed.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text);
    if (texts.length > 0) return texts.join('\n');
  }

  if (typeof parsed.content === 'string') return parsed.content;
  if (typeof parsed.text === 'string') return parsed.text;
  if (typeof parsed.error === 'string') return `Error: ${parsed.error}`;

  return result;
}

// ─── Diff rendering for edit tool ────────────────────────

interface DiffLine {
  type: 'removed' | 'added' | 'context';
  text: string;
}

/**
 * Extract the unified diff from the edit tool result (EditToolDetails.diff).
 * Falls back to naive diff from args if the result doesn't contain a proper diff.
 */
function buildEditDiff(result: string | undefined, oldText: string, newText: string): DiffLine[] {
  // Try to extract the proper diff from the tool result
  if (result) {
    const parsed = tryParseJSON(result);
    const diff = parsed?.details?.diff ?? parsed?.diff;
    if (typeof diff === 'string' && diff.length > 0) {
      return parseUnifiedDiffLines(diff).map(l => ({
        type: l.type === 'unchanged' ? 'context' as const : l.type,
        text: l.content,
      }));
    }
  }

  // Fallback: naive diff from args
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: DiffLine[] = [];
  for (const line of oldLines) {
    lines.push({ type: 'removed', text: line });
  }
  for (const line of newLines) {
    lines.push({ type: 'added', text: line });
  }
  return lines;
}

function buildWriteDiff(content: string): DiffLine[] {
  return content.split('\n').map(line => ({ type: 'added' as const, text: line }));
}

// ─── Generic text preview (first N lines + expand) ──────

function TextPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  const { preview, rest, totalLines } = useMemo(() => {
    const lines = text.split('\n');
    if (lines.length <= PREVIEW_LINES) {
      return { preview: text, rest: '', totalLines: lines.length };
    }
    return {
      preview: lines.slice(0, PREVIEW_LINES).join('\n'),
      rest: lines.slice(PREVIEW_LINES).join('\n'),
      totalLines: lines.length,
    };
  }, [text]);

  const hasMore = rest.length > 0;
  const remainingLines = totalLines - PREVIEW_LINES;

  return (
    <div className="mt-1.5 text-xs font-mono bg-bg-base rounded border border-border overflow-hidden">
      <pre className="px-2.5 pt-2 pb-1 overflow-x-auto whitespace-pre-wrap text-text-secondary leading-relaxed">
        {preview}
        {expanded && rest && <>{'\n'}{rest}</>}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-2.5 py-1.5 text-[11px] text-accent hover:text-accent/80 bg-bg-surface border-t border-border transition-colors text-center"
        >
          {expanded ? 'Show less' : `Show ${remainingLines} more line${remainingLines !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

// ─── Diff preview (first N lines + expand) ──────────────

function DiffPreview({ lines }: { lines: DiffLine[] }) {
  const [expanded, setExpanded] = useState(false);

  const previewLines = lines.slice(0, PREVIEW_LINES);
  const restLines = lines.slice(PREVIEW_LINES);
  const hasMore = restLines.length > 0;
  const displayLines = expanded ? lines : previewLines;

  return (
    <div className="mt-1.5 text-xs font-mono bg-bg-base rounded border border-border overflow-hidden">
      <div className="overflow-x-auto">
        {displayLines.map((line, i) => {
          const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
          const bg = line.type === 'added'
            ? 'bg-success/10'
            : line.type === 'removed'
            ? 'bg-error/10'
            : '';
          const color = line.type === 'added'
            ? 'text-success'
            : line.type === 'removed'
            ? 'text-error'
            : 'text-text-secondary';

          return (
            <div key={i} className={`px-2.5 py-0 leading-relaxed whitespace-pre-wrap ${bg} ${color}`}>
              {prefix} {line.text}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-2.5 py-1.5 text-[11px] text-accent hover:text-accent/80 bg-bg-surface border-t border-border transition-colors text-center"
        >
          {expanded ? 'Show less' : `Show ${restLines.length} more line${restLines.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────

export function ToolResult({ toolCall }: ToolResultProps) {
  const args = toolCall.args as Record<string, any> | undefined;

  // Edit tool: show diff from result (EditToolDetails.diff) or fall back to args
  if (toolCall.toolName === 'edit' && args?.oldText && args?.newText) {
    const diffLines = buildEditDiff(toolCall.result, args.oldText as string, args.newText as string);
    return <DiffPreview lines={diffLines} />;
  }

  // Write tool: show content as all-added diff
  if (toolCall.toolName === 'write' && args?.content) {
    const diffLines = buildWriteDiff(args.content);
    return <DiffPreview lines={diffLines} />;
  }

  // All other tools: extract text from result
  const text = extractContent(toolCall.result || '');
  if (!text.trim()) return null;

  return <TextPreview text={text} />;
}
