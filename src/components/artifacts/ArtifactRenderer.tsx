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
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"
          integrity="sha384-zkWMJO4sgpPUzyuOgDx8HB/K55glbAwajEpk1Go2NWRuPkPA/wIhoEJTuSkmOYrV"
          crossorigin="anonymous"><\/script>
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
  <script src="https://cdn.jsdelivr.net/npm/react@19.1.0/umd/react.production.min.js"
          integrity="sha384-WcU25JcSvbqF7FhAved4KMxL1rMz6Ba2tG4D1gWn7X2CljYCCjlarh0BbnRRwNN1"
          crossorigin="anonymous"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@19.1.0/umd/react-dom.production.min.js"
          integrity="sha384-hBq0oXHNHhoXThqlW6pzrWD7luBPeba+U6wYAvIuMJKFb/s1BmjcTT4w8LJP7P7C"
          crossorigin="anonymous"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.27.1/babel.min.js"
          integrity="sha384-gfdDnMJZ5KDBvTE8ubvJFTQpYg0sEBsV/T5HU1fjbkytB0atp//jUAocPT6F3NKX"
          crossorigin="anonymous"><\/script>
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
  <script>
// Provide a render helper the user's code can call.
// Also used by the auto-render harness below.
window.__render__ = function(Component) {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));
};
  <\/script>
  <script type="text/babel" data-type="module">
${artifact.source}

// Auto-render harness: detect the default export and render it.
// If the code called __render__() itself, this is a no-op.
try {
  if (typeof exports !== 'undefined' && exports.default) {
    window.__render__(exports.default);
  }
} catch (e) {
  document.getElementById('root').innerHTML = '<pre style="color:#ff6b6b">' + e.message + '</pre>';
}
  <\/script>
</body>
</html>`;

    default:
      return `<html><body><pre>${artifact.source.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></body></html>`;
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
