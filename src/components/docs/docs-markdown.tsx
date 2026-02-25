import { ExternalLink } from 'lucide-react';

// ── Markdown renderer (docs-specific, with internal link support) ──────

export function MarkdownContent({
  content,
  currentPage,
}: {
  content: string;
  currentPage: string;
}) {
  const blocks = parseDocBlocks(content);

  return (
    <div className="docs-content space-y-0">
      {blocks.map((block, i) => (
        <DocBlock key={i} block={block} currentPage={currentPage} />
      ))}
    </div>
  );
}

type DocBlockType =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'hr' }
  | { kind: 'blank' };

function parseDocBlocks(text: string): DocBlockType[] {
  const lines = text.split('\n');
  const blocks: DocBlockType[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ kind: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'text';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'code', language: lang, code: codeLines.join('\n') });
      i++; // skip closing ```
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1].trim())) {
      const headers = line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(
          lines[i]
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean)
        );
        i++;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    // List (unordered or ordered)
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\.\s/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\d+\.\s/.test(lines[i]) : /^[-*]\s/.test(lines[i]))
      ) {
        items.push(lines[i].replace(/^[-*]\s+|^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('---') &&
      !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1]?.trim()))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: 'paragraph', text: paraLines.join('\n') });
    }
  }

  return blocks;
}

function DocBlock({ block, currentPage }: { block: DocBlockType; currentPage: string }) {
  switch (block.kind) {
    case 'heading': {
      const id = block.text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
      const sizes: Record<number, string> = {
        1: 'text-2xl font-bold mt-0 mb-4',
        2: 'text-xl font-bold mt-8 mb-3',
        3: 'text-lg font-semibold mt-6 mb-2',
        4: 'text-base font-semibold mt-5 mb-1.5',
        5: 'text-sm font-semibold mt-4 mb-1',
        6: 'text-sm font-medium mt-3 mb-1',
      };
      return (
        <Tag id={id} className={`${sizes[block.level] || sizes[3]} text-text-primary`}>
          <InlineContent text={block.text} />
        </Tag>
      );
    }

    case 'paragraph':
      return (
        <p className="text-sm text-text-primary leading-relaxed mb-4">
          <InlineContent text={block.text} />
        </p>
      );

    case 'list':
      if (block.ordered) {
        return (
          <ol className="list-decimal list-inside mb-4 space-y-1 text-sm text-text-primary pl-1">
            {block.items.map((item, i) => (
              <li key={i} className="leading-relaxed">
                <InlineContent text={item} />
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="list-disc list-inside mb-4 space-y-1 text-sm text-text-primary pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="leading-relaxed">
              <InlineContent text={item} />
            </li>
          ))}
        </ul>
      );

    case 'code':
      return (
        <pre className="bg-bg-elevated border border-border rounded-lg p-4 mb-4 overflow-x-auto">
          <code className="text-xs font-mono text-text-primary">{block.code}</code>
        </pre>
      );

    case 'table':
      return (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                {block.headers.map((h, i) => (
                  <th
                    key={i}
                    className="text-left px-3 py-2 text-text-secondary font-medium text-xs"
                  >
                    <InlineContent text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border/50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-text-primary text-sm">
                      <InlineContent text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'hr':
      return <hr className="border-border my-6" />;

    default:
      return null;
  }
}

// ── Inline rendering (bold, italic, code, links) ──────────────────────

function InlineContent({ text }: { text: string }) {
  return <>{renderInlineNodes(text)}</>;
}

let _inlineKey = 0;

function renderInlineNodes(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  // Process in priority order: links first (to avoid bold/italic eating them),
  // then bold, italic, code. Use a single pass with a combined regex.
  // Key insight: match links BEFORE bold so **[text](url)** works.
  const regex =
    /(\[([^\]]+?)\]\(([^)]+?)\))|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Link [text](href)
      const linkText = match[2];
      const href = match[3];
      const k = _inlineKey++;

      const docMatch = href.match(/^\.?\/?([a-zA-Z0-9_-]+)\.md(?:#.*)?$/);
      if (docMatch) {
        nodes.push(
          <a
            key={k}
            href="#"
            data-doc-link={docMatch[1]}
            className="text-accent hover:underline cursor-pointer"
          >
            {linkText}
          </a>
        );
      } else if (href.startsWith('http') || href.startsWith('mailto:')) {
        nodes.push(
          <a
            key={k}
            href={href}
            className="text-accent hover:underline inline-flex items-center gap-0.5"
          >
            {linkText}
            <ExternalLink className="w-3 h-3 inline" />
          </a>
        );
      } else {
        nodes.push(
          <span key={k} className="text-text-primary">
            {linkText}
          </span>
        );
      }
    } else if (match[4]) {
      // Bold **text** — recurse into inner content for nested links/code
      nodes.push(
        <strong key={_inlineKey++} className="font-semibold">
          {renderInlineNodes(match[5])}
        </strong>
      );
    } else if (match[6]) {
      // Italic *text* — recurse
      nodes.push(
        <em key={_inlineKey++} className="italic">
          {renderInlineNodes(match[7])}
        </em>
      );
    } else if (match[8]) {
      // Inline code `text`
      nodes.push(
        <code
          key={_inlineKey++}
          className="bg-bg-elevated px-1.5 py-0.5 rounded text-accent font-mono text-xs"
        >
          {match[9]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}
