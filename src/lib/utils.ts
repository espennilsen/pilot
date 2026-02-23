/**
 * Format a timestamp or ISO date string as relative time (e.g., "2h ago", "yesterday")
 */
export function relativeTime(timestamp: number | string): string {
  const ms = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  const seconds = Math.floor((Date.now() - ms) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(ms).toLocaleDateString();
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Generate a unique ID (same pattern as tab-store)
 */
export function generateId(): string {
  return crypto.randomUUID();
}
