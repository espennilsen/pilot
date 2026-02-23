import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, BookOpen, ExternalLink } from 'lucide-react';
import { useTabStore } from '../../stores/tab-store';
import { IPC } from '../../../shared/ipc';

// Page title map for breadcrumbs
const PAGE_TITLES: Record<string, string> = {
  index: 'Documentation',
  'getting-started': 'Getting Started',
  sessions: 'Sessions',
  memory: 'Memory',
  tasks: 'Tasks',
  agent: 'Agent',
  steering: 'Steering & Follow-up',
  'keyboard-shortcuts': 'Keyboard Shortcuts',
  settings: 'Settings',
  sidebar: 'Sidebar',
  'context-panel': 'Context Panel',
};

export function DocsViewer() {
  const activeTab = useTabStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const { addDocsTab } = useTabStore();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<string[]>([]);

  const currentPage = activeTab?.filePath || 'index';

  // Load page content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.api
      .invoke(IPC.DOCS_READ, currentPage)
      .then((result) => {
        if (!cancelled) {
          setContent(result as string | null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  const navigateTo = useCallback(
    (page: string) => {
      setHistory((prev) => [...prev, currentPage]);
      addDocsTab(page);
    },
    [currentPage, addDocsTab]
  );

  const goBack = useCallback(() => {
    const prev = history[history.length - 1];
    if (prev) {
      setHistory((h) => h.slice(0, -1));
      addDocsTab(prev);
    }
  }, [history, addDocsTab]);

  // Handle clicks on internal links
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('data-doc-link');
      if (href) {
        e.preventDefault();
        navigateTo(href);
        return;
      }

      // External links
      const externalHref = anchor.getAttribute('href');
      if (externalHref && (externalHref.startsWith('http') || externalHref.startsWith('mailto:'))) {
        e.preventDefault();
        window.api.openExternal(externalHref);
      }
    },
    [navigateTo]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-text-secondary">Loading…</div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <BookOpen className="w-10 h-10 text-text-secondary opacity-40" />
        <p className="text-sm text-text-secondary">Page not found</p>
        <button
          onClick={() => navigateTo('index')}
          className="px-3 py-1.5 text-sm bg-accent text-bg-base rounded hover:bg-accent/90 transition-colors"
        >
          Go to Documentation Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-base" onClick={handleClick}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border bg-bg-surface">
        {history.length > 0 && (
          <button
            onClick={goBack}
            className="p-1 hover:bg-bg-elevated rounded transition-colors"
            title="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-text-secondary" />
          </button>
        )}
        <BookOpen className="w-4 h-4 text-accent" />
        <nav className="flex items-center gap-1 text-sm">
          {currentPage !== 'index' && (
            <>
              <button
                onClick={() => navigateTo('index')}
                className="text-accent hover:underline"
              >
                Docs
              </button>
              <span className="text-text-secondary">/</span>
            </>
          )}
          <span className="text-text-primary font-medium">
            {PAGE_TITLES[currentPage] || currentPage}
          </span>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8">
          <MarkdownContent content={content} currentPage={currentPage} />
        </div>
      </div>
    </div>
  );
}

// ── Markdown renderer (docs-specific, with internal link support) ──────

function MarkdownContent({
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
