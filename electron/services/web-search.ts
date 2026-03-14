/**
 * web-search.ts — Web search service using Brave Search API.
 *
 * Provides structured search results with titles, URLs, and descriptions
 * that the agent can use to answer questions with citations.
 */

const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search';
const SEARCH_TIMEOUT = 10_000;
const MAX_RESULTS = 5;

/** A single search result. */
export interface SearchResult {
  /** 1-based index for citation references. */
  index: number;
  title: string;
  url: string;
  description: string;
}

/** Complete search response. */
export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

/**
 * Search the web using Brave Search API.
 *
 * @param query — search query
 * @param apiKey — Brave Search API key
 * @param count — max number of results (default 5)
 * @param signal — optional abort signal
 */
export async function searchWeb(
  query: string,
  apiKey: string,
  count: number = MAX_RESULTS,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const controller = new AbortController();
  const timedOut = { value: false };
  const timeout = setTimeout(() => { timedOut.value = true; controller.abort(); }, SEARCH_TIMEOUT);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(count, 10)),
      text_decorations: 'false',
      safesearch: 'moderate',
    });

    const response = await fetch(`${BRAVE_SEARCH_URL}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'Invalid Brave Search API key. Get a free key at https://api.search.brave.com/'
        );
      }
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`);
    }

    const data = await response.json();

    const results: SearchResult[] = [];

    if (data.web?.results && Array.isArray(data.web.results)) {
      for (let i = 0; i < data.web.results.length && results.length < count; i++) {
        const r = data.web.results[i];
        if (r.url && r.title) {
          results.push({
            index: results.length + 1,
            title: r.title,
            url: r.url,
            description: r.description || r.meta_url?.hostname || '',
          });
        }
      }
    }

    return { query, results };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(
        timedOut.value
          ? `Search timed out after ${SEARCH_TIMEOUT / 1000}s`
          : 'Search was cancelled'
      );
    }
    throw err;
  }
}

/**
 * Format search results as a text block for the agent.
 * Includes numbered references so the agent can cite them as [1], [2], etc.
 */
export function formatSearchResults(response: SearchResponse): string {
  if (response.results.length === 0) {
    return `No results found for "${response.query}".`;
  }

  const lines: string[] = [
    `Web search results for "${response.query}":`,
    '',
  ];

  for (const r of response.results) {
    lines.push(`[${r.index}] ${r.title}`);
    lines.push(`    ${r.url}`);
    if (r.description) {
      lines.push(`    ${r.description}`);
    }
    lines.push('');
  }

  lines.push(
    'IMPORTANT: When using information from these results, cite your sources using ' +
    'numbered references like [1], [2], etc. matching the numbers above.'
  );

  return lines.join('\n');
}
