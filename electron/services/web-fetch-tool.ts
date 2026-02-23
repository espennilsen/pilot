import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

const MAX_OUTPUT_BYTES = 50_000;
const MAX_OUTPUT_LINES = 2000;
const DEFAULT_TIMEOUT = 30_000;

/**
 * Strip HTML tags and decode common entities to produce readable text.
 * Removes script/style blocks entirely.
 */
function htmlToText(html: string): string {
  let text = html;
  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Convert block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br\s*\/?)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Truncate output to max lines/bytes, returning a note if truncated.
 */
function truncate(text: string): { output: string; truncated: boolean } {
  const lines = text.split('\n');
  let truncated = false;

  if (lines.length > MAX_OUTPUT_LINES) {
    truncated = true;
  }

  let result = lines.slice(0, MAX_OUTPUT_LINES).join('\n');

  if (Buffer.byteLength(result, 'utf8') > MAX_OUTPUT_BYTES) {
    // Binary-search for the right cut point
    while (Buffer.byteLength(result, 'utf8') > MAX_OUTPUT_BYTES) {
      result = result.slice(0, Math.floor(result.length * 0.9));
    }
    truncated = true;
  }

  return { output: result, truncated };
}

/**
 * Create a web_fetch tool for fetching URLs.
 * Uses Node.js built-in fetch (available in Node 18+ / Electron).
 * Returns plain text for HTML pages, raw text for other content types.
 */
export function createWebFetchTool(): ToolDefinition {
  return {
    name: 'web_fetch',
    label: 'Web Fetch',
    description:
      'Fetch content from a URL. Supports HTTP methods, custom headers, and request bodies. ' +
      'HTML pages are automatically converted to readable text. ' +
      `Output is truncated to ${MAX_OUTPUT_LINES} lines or ${MAX_OUTPUT_BYTES / 1000}KB (whichever is hit first). ` +
      'Use this for fetching web pages, APIs, documentation, etc.',
    parameters: Type.Object({
      url: Type.String({ description: 'URL to fetch' }),
      method: Type.Optional(
        Type.Union(
          [
            Type.Literal('GET'),
            Type.Literal('POST'),
            Type.Literal('PUT'),
            Type.Literal('PATCH'),
            Type.Literal('DELETE'),
            Type.Literal('HEAD'),
          ],
          { description: 'HTTP method (default: GET)' }
        )
      ),
      headers: Type.Optional(
        Type.Record(Type.String(), Type.String(), {
          description: 'HTTP headers as key-value pairs',
        })
      ),
      body: Type.Optional(
        Type.String({ description: 'Request body (for POST, PUT, PATCH)' })
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const { url, method = 'GET', headers = {}, body } = params;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

        // Chain external signal if provided
        if (signal) {
          signal.addEventListener('abort', () => controller.abort());
        }

        const response = await fetch(url, {
          method,
          headers: {
            'User-Agent': 'PiLot/1.0',
            Accept: 'text/html, application/json, text/plain, */*',
            ...headers,
          },
          body: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        const status = response.status;
        let text = await response.text();

        // Convert HTML to readable text
        if (contentType.includes('text/html')) {
          text = htmlToText(text);
        }

        const { output, truncated } = truncate(text);

        let result = `Status: ${status}\nContent-Type: ${contentType}\n\n${output}`;
        if (truncated) {
          result += `\n\n[Output truncated to ${MAX_OUTPUT_LINES} lines / ${MAX_OUTPUT_BYTES / 1000}KB]`;
        }

        return {
          content: [{ type: 'text', text: result }],
          details: { status, contentType, truncated },
        };
      } catch (err: any) {
        const message = err.name === 'AbortError'
          ? `Request timed out after ${DEFAULT_TIMEOUT / 1000}s`
          : err.message || String(err);

        return {
          content: [{ type: 'text', text: `Error fetching ${url}: ${message}` }],
          details: { error: message },
        };
      }
    },
  };
}
