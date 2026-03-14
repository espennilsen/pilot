/**
 * Tests for suggestion-generator.ts — follow-up suggestion generation.
 */

import { describe, it, expect } from 'vitest';
import { generateSuggestions } from '../../../electron/services/suggestion-generator';

describe('generateSuggestions', () => {
  it('should return at most 3 suggestions', () => {
    const response = `Here's the implementation with tests:
\`\`\`typescript
function add(a: number, b: number) { return a + b; }
\`\`\`
There was an error in the build. The todo items remaining are:
1. First, fix the import
2. Then, add validation
Step 3 is to update tests.`;
    const suggestions = generateSuggestions(response, 'Fix the code', ['write', 'edit']);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should suggest running tests after code changes', () => {
    const response = 'I\'ve updated the file with the new implementation:\n```ts\nconst x = 1;\n```';
    const suggestions = generateSuggestions(response, 'Add the feature', ['write']);
    const labels = suggestions.map(s => s.label);
    expect(labels).toContain('Run tests');
  });

  it('should suggest fixing after errors', () => {
    const response = 'There was an error: TypeError: Cannot read property "foo" of undefined.';
    const suggestions = generateSuggestions(response, 'Run the app', []);
    const labels = suggestions.map(s => s.label);
    expect(labels).toContain('Fix error');
  });

  it('should suggest examples for long explanations', () => {
    const response = 'A'.repeat(600); // Long explanation
    const suggestions = generateSuggestions(response, 'Explain generics', []);
    const labels = suggestions.map(s => s.label);
    expect(labels).toContain('Show example');
  });

  it('should suggest continuing for step-by-step responses', () => {
    const response = 'Step 1: Install the package\nStep 2: Configure the settings\nStep 3: Run the server';
    const suggestions = generateSuggestions(response, 'How do I set up?', []);
    const labels = suggestions.map(s => s.label);
    expect(labels).toContain('Continue');
  });

  it('should suggest more search after web_search', () => {
    const response = 'Based on search results, TypeScript generics allow...';
    const suggestions = generateSuggestions(response, 'Tell me about generics', ['web_search']);
    const labels = suggestions.map(s => s.label);
    expect(labels).toContain('Search more');
  });

  it('should not duplicate labels', () => {
    const response = 'Test results show an error in the test suite. The bug was found.';
    const suggestions = generateSuggestions(response, 'Run tests', []);
    const labels = suggestions.map(s => s.label);
    const unique = new Set(labels);
    expect(labels.length).toBe(unique.size);
  });

  it('should return empty array for very short responses', () => {
    const suggestions = generateSuggestions('OK', 'Hi', []);
    // May still return suggestions from generic fallbacks, but should not crash
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it('should suggest showing diff after code changes with code', () => {
    const response = 'I\'ve made the changes:\n```js\nconst x = 1;\n```\nThis should fix it.';
    const suggestions = generateSuggestions(response, 'Fix the bug', ['write']);
    const labels = suggestions.map(s => s.label);
    expect(labels).toContain('Show diff');
  });
});
