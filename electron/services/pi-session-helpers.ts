import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * Make a lightweight API call to the cheapest available model for memory extraction.
 * Each provider uses a slightly different request format.
 */
export async function callCheapModel(
  provider: string,
  apiKey: string,
  modelId: string,
  prompt: string,
  signal: AbortSignal
): Promise<string | null> {
  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.content?.[0]?.text || null;
  }

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  }

  if (provider === 'google') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500 },
        }),
        signal,
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }

  return null;
}

/**
 * Encode a path separator as `+` so that hyphens in directory names round-trip safely.
 * Legacy directories used `-` (lossy for hyphenated names); new ones use `+`.
 * Format: --Users+espen+Dev+my-project--
 * @example getSessionDir('/home/pi', '/Users/espen/Dev/my-project') // → '<piDir>/sessions/--Users+espen+Dev+my-project--'
 */
export function getSessionDir(piAgentDir: string, cwd: string): string {
  const safePath = `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '+')}--`;
  const sessionDir = join(piAgentDir, 'sessions', safePath);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

/**
 * Decode a session directory name back to a cwd.
 * Handles both new `+` encoding and legacy `-` encoding.
 * On Windows, reconstructs drive letters properly (e.g., "C/Users/foo" → "C:\Users\foo").
 * @example decodeDirName('--Users+espen+Dev+my-project--') // → '/Users/espen/Dev/my-project'
 */
export function decodeDirName(dirName: string): string {
  const inner = dirName.replace(/^--/, '').replace(/--$/, '');
  // New format uses `+` as separator (round-trips safely with hyphens in names)
  // Legacy format uses `-` (lossy for hyphenated names, but best-effort)
  const decoded = inner.includes('+') ? inner.replace(/\+/g, '/') : inner.replace(/-/g, '/');
  
  // On Windows, detect drive letter pattern (e.g., "C/Users/foo") and reconstruct as "C:\Users\foo"
  if (process.platform === 'win32' && /^[a-zA-Z]\//.test(decoded)) {
    const driveLetter = decoded[0];
    const restOfPath = decoded.slice(2); // Everything after "C/"
    if (restOfPath) {
      return `${driveLetter}:\\${restOfPath.replace(/\//g, '\\')}`;
    }
    return `${driveLetter}:\\`;
  }
  
  return '/' + decoded;
}
