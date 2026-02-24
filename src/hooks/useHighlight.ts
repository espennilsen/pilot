import { useState, useEffect } from 'react';
import { highlightCode, getLanguageFromPath } from '../lib/syntax-highlight';

/**
 * Syntax highlights code using highlight.js with lazy language loading.
 * 
 * Takes source code and a file path, infers the language from the path extension,
 * lazy-loads the highlight.js language module if needed, and returns HTML strings
 * with syntax highlighting markup (one string per line).
 * 
 * Uses an async effect to avoid blocking the UI during highlighting. Returns null
 * while loading, if the language is unsupported, or if inputs are invalid.
 * 
 * @param code - Source code to highlight (null if not loaded yet)
 * @param filePath - File path used to infer language (null if not available)
 * @returns Array of HTML strings with hljs class markup (one per line), or null while loading
 */
export function useHighlight(
  code: string | null,
  filePath: string | null,
): string[] | null {
  const [lines, setLines] = useState<string[] | null>(null);

  useEffect(() => {
    if (!code || !filePath) {
      setLines(null);
      return;
    }

    const lang = getLanguageFromPath(filePath);
    if (!lang) {
      setLines(null);
      return;
    }

    let cancelled = false;

    highlightCode(code, lang).then((result) => {
      if (!cancelled) {
        setLines(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, filePath]);

  return lines;
}
