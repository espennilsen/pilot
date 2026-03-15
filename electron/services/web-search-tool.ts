/**
 * web-search-tool.ts — Agent tool for searching the web.
 *
 * Wraps the Brave Search API in a tool the agent can invoke.
 * Results include numbered references for citation support.
 */

import { Type } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { searchWeb, formatSearchResults } from './web-search';

/**
 * Create the web_search tool.
 *
 * @param getApiKey — function to dynamically resolve the API key (reads from settings)
 */
export function createWebSearchTool(getApiKey: () => string | undefined): ToolDefinition {
  return {
    name: 'web_search',
    label: 'Web Search',
    description:
      'Search the web using Brave Search and return relevant results with URLs. ' +
      'Use this when you need current information, facts, documentation, or anything ' +
      'that might be available on the web. Results include numbered references — ' +
      'always cite sources in your response using [1], [2], etc.',
    parameters: Type.Object({
      query: Type.String({
        description: 'Search query — be specific for better results',
      }),
      count: Type.Optional(
        Type.Number({
          description: 'Number of results to return (1-10). Default: 5',
          minimum: 1,
          maximum: 10,
          default: 5,
        })
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const apiKey = getApiKey();
      if (!apiKey) {
        return {
          content: [{
            type: 'text',
            text: 'Web search is not configured. Set a Brave Search API key in Settings → General → Web Search. ' +
                  'Get a free key at https://api.search.brave.com/',
          }],
          details: { error: 'No API key configured' },
        };
      }

      try {
        const response = await searchWeb(params.query, apiKey, params.count ?? 5, signal);
        const formatted = formatSearchResults(response);

        return {
          content: [{ type: 'text', text: formatted }],
          details: {
            query: response.query,
            resultCount: response.results.length,
            results: response.results,
          },
        };
      } catch (err: any) {
        return {
          content: [{
            type: 'text',
            text: `Web search failed: ${err.message || String(err)}`,
          }],
          details: { error: err.message || String(err) },
        };
      }
    },
  };
}
