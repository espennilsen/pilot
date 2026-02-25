import React from 'react';
import CodeBlock from '../components/chat/CodeBlock';

interface CodeBlockMatch {
  type: 'code';
  language: string;
  code: string;
}

interface TextBlockMatch {
  type: 'text';
  content: string;
}

type Block = CodeBlockMatch | TextBlockMatch;

export function renderMarkdown(text: string): React.ReactNode {
  // Split by code blocks first
  const blocks = parseBlocks(text);
  
  return blocks.map((block, index) => {
    if (block.type === 'code') {
      return <CodeBlock key={index} language={block.language} code={block.code} />;
    }
    return <div key={index}>{renderTextBlock(block.content)}</div>;
  });
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index);
      if (textContent.trim()) {
        blocks.push({ type: 'text', content: textContent });
      }
    }
    
    // Add code block
    blocks.push({
      type: 'code',
      language: match[1] || 'text',
      code: match[2],
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex);
    if (textContent.trim()) {
      blocks.push({ type: 'text', content: textContent });
    }
  }
  
  return blocks;
}

function renderTextBlock(text: string): React.ReactNode[] {
  // Split by paragraphs (double newline)
  const paragraphs = text.split(/\n\n+/);
  
  return paragraphs.map((para, index) => {
    const trimmed = para.trim();
    if (!trimmed) return null;
    
    // Check if it's a header
    if (trimmed.startsWith('# ')) {
      return <h1 key={index} className="text-2xl font-bold mb-4 mt-6">{renderInline(trimmed.slice(2))}</h1>;
    }
    if (trimmed.startsWith('## ')) {
      return <h2 key={index} className="text-xl font-bold mb-3 mt-5">{renderInline(trimmed.slice(3))}</h2>;
    }
    if (trimmed.startsWith('### ')) {
      return <h3 key={index} className="text-lg font-bold mb-2 mt-4">{renderInline(trimmed.slice(4))}</h3>;
    }
    
    // Check if it's a table (lines starting with |, with a separator row like |---|---|)
    const lines = trimmed.split('\n');
    if (lines.length >= 2 && lines[0].includes('|') && /^\|?\s*[-:]+[-| :]*$/.test(lines[1].trim())) {
      return renderTable(lines, index);
    }

    // Check if it's a list
    if (lines.every(line => /^[-*]\s/.test(line.trim()))) {
      return (
        <ul key={index} className="list-disc list-inside mb-4 space-y-1">
          {lines.map((line, i) => (
            <li key={i}>{renderInline(line.replace(/^[-*]\s/, ''))}</li>
          ))}
        </ul>
      );
    }
    
    // Regular paragraph
    return (
      <p key={index} className="mb-4">
        {renderInline(trimmed)}
      </p>
    );
  }).filter(Boolean);
}

/** Parse a pipe-delimited table row into cell strings, trimming outer pipes and whitespace */
function parseTableRow(row: string): string[] {
  let trimmed = row.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(cell => cell.trim());
}

/** Parse alignment from the separator row (e.g. |:---|:---:|---:| ) */
function parseAlignments(separatorRow: string): ('left' | 'center' | 'right' | undefined)[] {
  return parseTableRow(separatorRow).map(cell => {
    const trimmed = cell.replace(/\s/g, '');
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return undefined;
  });
}

function renderTable(lines: string[], key: number): React.ReactNode {
  const headerCells = parseTableRow(lines[0]);
  const alignments = parseAlignments(lines[1]);
  const bodyRows = lines.slice(2).filter(line => line.trim() && line.includes('|'));

  return (
    <div key={key} className="mb-4 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {headerCells.map((cell, i) => (
              <th
                key={i}
                className="px-3 py-1.5 text-left text-text-primary font-semibold"
                style={{ textAlign: alignments[i] }}
              >
                {renderInline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => {
            const cells = parseTableRow(row);
            return (
              <tr key={ri} className="border-b border-border/50">
                {headerCells.map((_, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-1.5 text-text-secondary"
                    style={{ textAlign: alignments[ci] }}
                  >
                    {renderInline(cells[ci] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Mutable counter object threaded through render functions to generate
 * unique React keys without requiring a global counter or index-based keys.
 * Each call to `kc.n++` produces the next sequential key value.
 */
interface KeyCounter {
  value: number;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const counter: KeyCounter = { value: 0 };
  let currentText = '';
  let index = 0;
  
  while (index < text.length) {
    // Inline code
    if (text[index] === '`') {
      if (currentText) {
        parts.push(...processSimpleInline(currentText, counter));
        currentText = '';
      }
      
      const endIndex = text.indexOf('`', index + 1);
      if (endIndex !== -1) {
        const code = text.slice(index + 1, endIndex);
        parts.push(
          <code key={`code-${counter.value++}`} className="bg-bg-surface px-1 rounded text-accent font-mono text-sm">
            {code}
          </code>
        );
        index = endIndex + 1;
        continue;
      }
    }
    
    currentText += text[index];
    index++;
  }
  
  if (currentText) {
    parts.push(...processSimpleInline(currentText, counter));
  }
  
  return parts;
}

function processSimpleInline(text: string, counter: KeyCounter): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  
  // Process bold (**text**)
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      parts.push(...processItalic(before, counter));
    }
    parts.push(<strong key={`bold-${counter.value++}`}>{processItalic(match[1], counter)}</strong>);
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(...processItalic(text.slice(lastIndex), counter));
  }
  
  return parts;
}

function processItalic(text: string, counter: KeyCounter): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const italicRegex = /\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = italicRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      parts.push(...processLinks(before, counter));
    }
    parts.push(<em key={`italic-${counter.value++}`}>{processLinks(match[1], counter)}</em>);
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(...processLinks(text.slice(lastIndex), counter));
  }
  
  return parts;
}

/** Handle link clicks — external URLs open in system browser, others are suppressed */
function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string): void {
  e.preventDefault();
  if (/^https?:\/\//.test(href)) {
    window.api.openExternal(href);
  }
  // Relative paths and anchors (#) are intentionally no-ops in the markdown preview
}

function processLinks(text: string, counter: KeyCounter): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const linkRegex = /\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const href = match[2];
    parts.push(
      <a
        key={`link-${counter.value++}`}
        href={href}
        className="text-accent hover:underline cursor-pointer"
        onClick={(e) => handleLinkClick(e, href)}
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : [text];
}
