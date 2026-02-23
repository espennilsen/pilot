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
    
    // Check if it's a list
    const lines = trimmed.split('\n');
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

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let currentText = '';
  let index = 0;
  
  while (index < text.length) {
    // Inline code
    if (text[index] === '`') {
      if (currentText) {
        parts.push(...processSimpleInline(currentText));
        currentText = '';
      }
      
      const endIndex = text.indexOf('`', index + 1);
      if (endIndex !== -1) {
        const code = text.slice(index + 1, endIndex);
        parts.push(
          <code key={parts.length} className="bg-bg-surface px-1 rounded text-accent font-mono text-sm">
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
    parts.push(...processSimpleInline(currentText));
  }
  
  return parts;
}

function processSimpleInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  
  // Process bold (**text**)
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = boldRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      const before = remaining.slice(lastIndex, match.index);
      parts.push(...processItalic(before, key++));
    }
    parts.push(<strong key={`bold-${key++}`}>{processItalic(match[1], key++)}</strong>);
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < remaining.length) {
    parts.push(...processItalic(remaining.slice(lastIndex), key++));
  }
  
  return parts;
}

function processItalic(text: string, startKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const italicRegex = /\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = startKey;
  
  while ((match = italicRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      parts.push(...processLinks(before, key++));
    }
    parts.push(<em key={`italic-${key++}`}>{processLinks(match[1], key++)}</em>);
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(...processLinks(text.slice(lastIndex), key++));
  }
  
  return parts;
}

function processLinks(text: string, startKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const linkRegex = /\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = startKey;
  
  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <a
        key={`link-${key++}`}
        href={match[2]}
        className="text-accent hover:underline"
        target="_blank"
        rel="noopener noreferrer"
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
