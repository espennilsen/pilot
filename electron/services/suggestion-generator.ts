/**
 * suggestion-generator.ts — Generate contextual follow-up suggestions.
 *
 * Analyzes the last assistant response and conversation context to produce
 * 2-3 relevant follow-up suggestions the user can click to continue.
 */

/** A single follow-up suggestion. */
export interface FollowUpSuggestion {
  /** The text to send as a user message when clicked. */
  text: string;
  /** Short label for the chip UI. */
  label: string;
}

/**
 * Generate follow-up suggestions based on the assistant's last response
 * and the conversation context.
 *
 * Uses heuristic analysis of the response content to produce relevant
 * suggestions without requiring an additional LLM call.
 */
export function generateSuggestions(
  assistantResponse: string,
  lastUserMessage: string,
  toolNames: string[],
): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = [];
  const response = assistantResponse.toLowerCase();
  const hasCode = /```[\s\S]*?```/.test(assistantResponse);
  const hasError = /error|exception|failed|bug|issue/i.test(assistantResponse);
  const hasFile = /\b[\w/.-]+\.(ts|tsx|js|jsx|py|rs|go|rb|java|css|html|md|json|yaml|toml)\b/.test(assistantResponse);
  const hasTests = /test|spec|describe|it\(|expect/i.test(assistantResponse);
  const hasChanges = toolNames.some(t => t === 'write' || t === 'edit');
  const hasSearch = toolNames.includes('web_search');
  const hasDiff = /diff|change|modif|updat/i.test(assistantResponse);
  const hasExplanation = assistantResponse.length > 500;
  const hasSteps = /step \d|1\.|first,|next,|then,/i.test(assistantResponse);
  const hasTodo = /todo|remaining|next step|follow.?up/i.test(assistantResponse);

  // After code changes — suggest running tests or reviewing
  if (hasChanges && !hasTests) {
    suggestions.push({
      text: 'Run the tests to verify the changes work correctly',
      label: 'Run tests',
    });
  }

  if (hasChanges && hasCode) {
    suggestions.push({
      text: 'Show me the full diff of what changed',
      label: 'Show diff',
    });
  }

  // After errors — suggest fixing or explaining
  if (hasError && suggestions.length < 3) {
    suggestions.push({
      text: 'Can you fix this error?',
      label: 'Fix error',
    });
  }

  // After explanations — suggest deeper dive
  if (hasExplanation && !hasChanges && suggestions.length < 3) {
    suggestions.push({
      text: 'Can you show me an example?',
      label: 'Show example',
    });
  }

  // After search results — suggest deeper research
  if (hasSearch && suggestions.length < 3) {
    suggestions.push({
      text: 'Can you search for more details on this topic?',
      label: 'Search more',
    });
  }

  // After multi-step explanations — suggest continuing
  if (hasSteps && suggestions.length < 3) {
    suggestions.push({
      text: 'Continue with the next step',
      label: 'Continue',
    });
  }

  // After todos/remaining work — suggest tackling them
  if (hasTodo && suggestions.length < 3) {
    suggestions.push({
      text: 'What are the remaining tasks? Let\'s tackle the next one.',
      label: 'Next task',
    });
  }

  // After file mentions — suggest reading/showing the file
  if (hasFile && !hasChanges && suggestions.length < 3) {
    suggestions.push({
      text: 'Show me the relevant code',
      label: 'Show code',
    });
  }

  // After test-related responses — suggest running or expanding
  if (hasTests && !hasChanges && suggestions.length < 3) {
    suggestions.push({
      text: 'Run the tests and show the results',
      label: 'Run tests',
    });
  }

  // Generic fallbacks if we don't have enough suggestions
  if (suggestions.length < 2 && hasCode) {
    suggestions.push({
      text: 'Explain this code in more detail',
      label: 'Explain more',
    });
  }

  if (suggestions.length < 2 && hasDiff) {
    suggestions.push({
      text: 'Are there any edge cases we should handle?',
      label: 'Edge cases',
    });
  }

  // Always offer to summarize long responses
  if (suggestions.length < 3 && assistantResponse.length > 1000) {
    suggestions.push({
      text: 'Summarize the key points',
      label: 'Summarize',
    });
  }

  // Deduplicate by label
  const seen = new Set<string>();
  const unique = suggestions.filter(s => {
    if (seen.has(s.label)) return false;
    seen.add(s.label);
    return true;
  });

  return unique.slice(0, 3);
}
