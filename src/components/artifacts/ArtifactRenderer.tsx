/**
 * ArtifactRenderer — Renders artifact content in a sandboxed iframe.
 *
 * Supports HTML (direct rendering), SVG (inline or wrapped), and Mermaid
 * (rendered via mermaid.js CDN). Uses sandbox attribute for security.
 */

import { useMemo } from 'react';
import type { Artifact } from '../../../shared/types';

interface ArtifactRendererProps {
  artifact: Artifact;
}

/**
 * Build a complete HTML document for rendering in an iframe.
 */
function buildHtmlDocument(artifact: Artifact): string {
  switch (artifact.type) {
    case 'html':
      // If the source already has <html> or <body>, use as-is
      if (/<html[\s>]/i.test(artifact.source) || /<body[\s>]/i.test(artifact.source)) {
        return artifact.source;
      }
      // Otherwise wrap in a minimal document
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e0e0e0;
      background: #1a1a2e;
    }
  </style>
</head>
<body>
${artifact.source}
</body>
</html>`;

    case 'svg':
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #1a1a2e;
    }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${artifact.source}
</body>
</html>`;

    case 'mermaid':
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
  <style>
    body {
      margin: 0;
      padding: 16px;
      background: #1a1a2e;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .mermaid { color: #e0e0e0; }
  </style>
</head>
<body>
  <pre class="mermaid">
${artifact.source}
  </pre>
  <script>mermaid.initialize({ startOnLoad: true, theme: 'dark' });<\/script>
</body>
</html>`;

    case 'react':
      // Render React JSX via Babel standalone + React CDN
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/react@19/umd/react.production.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@19/umd/react-dom.production.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"><\/script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e0e0e0;
      background: #1a1a2e;
    }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
${artifact.source}

// Auto-render: find the last exported/defined component
const _components = {};
try {
  // Try common component names
  const _names = Object.keys(window).filter(k => /^[A-Z]/.test(k) && typeof window[k] === 'function');
  if (_names.length > 0) {
    const Component = window[_names[_names.length - 1]];
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));
  }
} catch (e) {
  document.getElementById('root').innerHTML = '<pre style="color:#ff6b6b">' + e.message + '</pre>';
}
  <\/script>
</body>
</html>`;

    default:
      return `<html><body><pre>${artifact.source}</pre></body></html>`;
  }
}

export default function ArtifactRenderer({ artifact }: ArtifactRendererProps) {
  const srcDoc = useMemo(() => buildHtmlDocument(artifact), [artifact.source, artifact.type]);

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      className="w-full h-full border-0"
      title={artifact.title}
      style={{ minHeight: '400px', background: '#1a1a2e' }}
    />
  );
}
