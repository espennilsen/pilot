/**
 * Tests for web-search.ts — search result formatting.
 */

import { describe, it, expect } from 'vitest';
import { formatSearchResults, type SearchResponse } from '../../../electron/services/web-search';

const sampleResponse: SearchResponse = {
  query: 'TypeScript generics',
  results: [
    { index: 1, title: 'TypeScript Generics Guide', url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html', description: 'Learn about TypeScript generics.' },
    { index: 2, title: 'Understanding Generics', url: 'https://example.com/generics', description: 'A practical guide to generics in TypeScript.' },
    { index: 3, title: 'Advanced TypeScript', url: 'https://example.com/advanced', description: '' },
  ],
};

describe('formatSearchResults', () => {
  it('should format results with numbered references', () => {
    const formatted = formatSearchResults(sampleResponse);
    expect(formatted).toContain('[1] TypeScript Generics Guide');
    expect(formatted).toContain('https://www.typescriptlang.org/docs/handbook/2/generics.html');
    expect(formatted).toContain('[2] Understanding Generics');
    expect(formatted).toContain('[3] Advanced TypeScript');
  });

  it('should include the query', () => {
    const formatted = formatSearchResults(sampleResponse);
    expect(formatted).toContain('TypeScript generics');
  });

  it('should include citation instruction', () => {
    const formatted = formatSearchResults(sampleResponse);
    expect(formatted).toContain('cite your sources');
    expect(formatted).toContain('[1], [2]');
  });

  it('should include descriptions when available', () => {
    const formatted = formatSearchResults(sampleResponse);
    expect(formatted).toContain('Learn about TypeScript generics.');
    expect(formatted).toContain('A practical guide to generics in TypeScript.');
  });

  it('should handle empty results', () => {
    const empty: SearchResponse = { query: 'nonexistent', results: [] };
    const formatted = formatSearchResults(empty);
    expect(formatted).toContain('No results found');
    expect(formatted).toContain('nonexistent');
  });
});
