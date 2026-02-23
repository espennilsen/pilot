import { useState, useEffect } from 'react';
import { highlightCode, getLanguageFromPath } from '../lib/syntax-highlight';

/**
 * Returns an array of HTML strings (one per line) with hljs class markup,
 * or null while loading / if the language is unsupported.
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
