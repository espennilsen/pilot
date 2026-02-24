/**
 * Clean up IPC error messages by stripping Electron's verbose wrapper prefixes.
 * Electron wraps errors as: "Error: Error invoking remote method 'channel': Error: actual message"
 * This extracts just the actual human-readable message.
 * 
 * Returns the cleaned message, or an empty string if the message becomes empty after cleaning.
 * Callers should provide their own fallback default if needed.
 */
export function cleanErrorMessage(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw);
  return msg
    .replace(/^Error:\s*/i, '')
    .replace(/Error invoking remote method '[^']+':?\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}
