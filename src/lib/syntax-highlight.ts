import hljs from 'highlight.js/lib/core';

// Register languages on demand from a static import map.
// highlight.js/lib/core ships zero languages — we pull in only what's needed.

const LANG_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'), // also covers HTML
  css: () => import('highlight.js/lib/languages/css'),
  scss: () => import('highlight.js/lib/languages/scss'),
  less: () => import('highlight.js/lib/languages/less'),
  json: () => import('highlight.js/lib/languages/json'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  go: () => import('highlight.js/lib/languages/go'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  java: () => import('highlight.js/lib/languages/java'),
  kotlin: () => import('highlight.js/lib/languages/kotlin'),
  scala: () => import('highlight.js/lib/languages/scala'),
  bash: () => import('highlight.js/lib/languages/bash'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
  php: () => import('highlight.js/lib/languages/php'),
  swift: () => import('highlight.js/lib/languages/swift'),
  csharp: () => import('highlight.js/lib/languages/csharp'),
  fsharp: () => import('highlight.js/lib/languages/fsharp'),
  sql: () => import('highlight.js/lib/languages/sql'),
  diff: () => import('highlight.js/lib/languages/diff'),
  graphql: () => import('highlight.js/lib/languages/graphql'),
  lua: () => import('highlight.js/lib/languages/lua'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  ini: () => import('highlight.js/lib/languages/ini'),
  dockerfile: () => import('highlight.js/lib/languages/dockerfile'),
  makefile: () => import('highlight.js/lib/languages/makefile'),
  plaintext: () => import('highlight.js/lib/languages/plaintext'),
  shell: () => import('highlight.js/lib/languages/shell'),
  r: () => import('highlight.js/lib/languages/r'),
  dart: () => import('highlight.js/lib/languages/dart'),
  perl: () => import('highlight.js/lib/languages/perl'),
  elixir: () => import('highlight.js/lib/languages/elixir'),
  erlang: () => import('highlight.js/lib/languages/erlang'),
  haskell: () => import('highlight.js/lib/languages/haskell'),
  nginx: () => import('highlight.js/lib/languages/nginx'),
  toml: () => import('highlight.js/lib/languages/ini'), // TOML ≈ INI for hljs
};

// Track which languages are already registered
const loadedLangs = new Set<string>();

async function ensureLanguage(lang: string): Promise<boolean> {
  if (loadedLangs.has(lang)) return true;

  const loader = LANG_LOADERS[lang];
  if (!loader) return false;

  try {
    const mod = await loader();
    hljs.registerLanguage(lang, mod.default as Parameters<typeof hljs.registerLanguage>[1]);
    loadedLangs.add(lang);
    return true;
  } catch {
    return false;
  }
}

// File extension → hljs language name
const EXT_TO_LANG: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescript',
  '.html': 'xml',
  '.htm': 'xml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.jsonc': 'json',
  '.json5': 'json',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.py': 'python',
  '.pyi': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.groovy': 'java',
  '.gradle': 'java',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.cs': 'csharp',
  '.fs': 'fsharp',
  '.sql': 'sql',
  '.diff': 'diff',
  '.patch': 'diff',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.lua': 'lua',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'nginx',
  '.r': 'r',
  '.R': 'r',
  '.dart': 'dart',
  '.pl': 'perl',
  '.pm': 'perl',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.tf': 'ini',
  '.hcl': 'ini',
  '.prisma': 'javascript',
  '.vue': 'xml',
  '.svelte': 'xml',
};

const FILENAME_TO_LANG: Record<string, string> = {
  Dockerfile: 'dockerfile',
  'Dockerfile.dev': 'dockerfile',
  'Dockerfile.prod': 'dockerfile',
  Makefile: 'makefile',
  '.gitignore': 'plaintext',
  '.dockerignore': 'plaintext',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
  '.env': 'bash',
  '.env.local': 'bash',
  '.env.development': 'bash',
  '.env.production': 'bash',
};

/** Max file size (chars) to attempt highlighting */
const MAX_HIGHLIGHT_SIZE = 200_000;

export function getLanguageFromPath(filePath: string): string | null {
  const fileName = filePath.split('/').pop() || '';

  if (FILENAME_TO_LANG[fileName]) {
    return FILENAME_TO_LANG[fileName];
  }

  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const ext = fileName.slice(dotIdx).toLowerCase();
  return EXT_TO_LANG[ext] || null;
}

/**
 * Highlight source code and return per-line HTML strings.
 * Each string contains `<span class="hljs-*">` markup.
 * Returns null if the language is unsupported or the file is too large.
 */
export async function highlightCode(
  code: string,
  language: string,
): Promise<string[] | null> {
  if (code.length > MAX_HIGHLIGHT_SIZE) return null;

  try {
    const ok = await ensureLanguage(language);
    if (!ok) return null;

    const result = hljs.highlight(code, { language });
    return result.value.split('\n');
  } catch (e) {
    console.warn('[syntax-highlight] failed for', language, e);
    return null;
  }
}
