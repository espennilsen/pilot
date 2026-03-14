import { useState, useEffect, useCallback } from 'react';
import { highlightCode } from '../../lib/syntax-highlight';
import { useTabStore } from '../../stores/tab-store';
import { useArtifactStore } from '../../stores/artifact-store';
import type { ArtifactType } from '../../../shared/types';

// Common aliases LLMs use → hljs language names
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  py: 'python',
  rb: 'ruby',
  cs: 'csharp',
  'c++': 'cpp',
  'c#': 'csharp',
  'f#': 'fsharp',
  objc: 'objectivec',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  toml: 'ini',
  tf: 'ini',
  hcl: 'ini',
  text: 'plaintext',
  txt: 'plaintext',
};

function resolveLanguage(lang: string): string {
  const lower = lang.toLowerCase().trim();
  return LANG_ALIASES[lower] ?? lower;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

/** Languages that can be opened as artifacts. */
const ARTIFACT_LANGUAGES: Record<string, ArtifactType> = {
  html: 'html',
  htm: 'html',
  svg: 'svg',
  mermaid: 'mermaid',
  jsx: 'react',
  tsx: 'react',
};

function getArtifactType(lang: string): ArtifactType | null {
  const lower = lang.toLowerCase().trim();
  return ARTIFACT_LANGUAGES[lower] ?? null;
}

export default function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<string[] | null>(null);
  const resolvedLang = resolveLanguage(language);
  const activeTabId = useTabStore(s => s.activeTabId);
  const createArtifact = useArtifactStore(s => s.createArtifact);
  const artifactType = getArtifactType(language);

  useEffect(() => {
    let cancelled = false;
    highlightCode(code, resolvedLang).then((result) => {
      if (!cancelled) setHighlightedLines(result);
    });
    return () => { cancelled = true; };
  }, [code, resolvedLang]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = highlightedLines ?? code.split('\n');

  return (
    <div className="bg-bg-elevated rounded-md border border-border overflow-hidden my-4">
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-1.5 bg-bg-surface border-b border-border text-text-secondary text-xs">
        <span className="font-mono">{language}</span>
        <div className="flex items-center gap-1">
          {artifactType && activeTabId && (
            <button
              onClick={() => createArtifact(activeTabId, artifactType, code)}
              className="hover:text-text-primary transition-colors px-2 py-0.5 rounded hover:bg-bg-elevated"
              title="Open as live preview"
            >
              ▶ Preview
            </button>
          )}
          <button
            onClick={handleCopy}
            className="hover:text-text-primary transition-colors px-2 py-0.5 rounded hover:bg-bg-elevated"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="p-3">
          <code className="font-mono text-sm">
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="text-text-secondary/40 select-none mr-4 text-right" style={{ minWidth: '2em' }}>
                  {i + 1}
                </span>
                {highlightedLines ? (
                  <span className="flex-1" dangerouslySetInnerHTML={{ __html: line || ' ' }} />
                ) : (
                  <span className="flex-1">{line || ' '}</span>
                )}
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
