/**
 * @file SessionToolInjector — Encapsulates private SDK access for runtime tool injection.
 *
 * The pi-coding-agent SDK (AgentSession) does not expose a public API to add or
 * remove tools from a live session after creation. It does support passing
 * `customTools` at session creation time, and the internal `_refreshToolRegistry()`
 * rebuilds the tool registry from base tools + extension tools + custom tools.
 *
 * This module isolates the private-field access to a single abstraction with
 * runtime guards, so the rest of the codebase doesn't touch SDK internals.
 *
 * How it works:
 *   1. Mutate the `_customTools` array on AgentSession (stored by reference)
 *   2. Call `_refreshToolRegistry()` to rebuild the full tool registry
 *
 * This is preferable to directly mutating `_toolRegistry` because:
 *   - The SDK's rebuild pipeline handles prompt snippets, guidelines, and
 *     extension tool_call/tool_result hooks automatically
 *   - Tools survive a `session.reload()` since they're in `_customTools`
 *   - Only one private method call instead of manual Map manipulation
 *
 * Runtime guards detect SDK changes and produce actionable error messages
 * instead of silent corruption.
 *
 * TODO(sdk): Replace with a public session.addTools() / session.removeTools()
 * API when the SDK exposes one. Track: https://github.com/nicepkg/pi-coding-agent/issues/TBD
 *
 * Verified working with @mariozechner/pi-coding-agent 0.55.x – 0.57.x.
 */

import type { AgentSession, ToolDefinition } from '@mariozechner/pi-coding-agent';

// ─── Types ────────────────────────────────────────────────────────

/** Internals we access on AgentSession via `any` cast. */
interface AgentSessionInternals {
  _customTools: ToolDefinition[];
  _refreshToolRegistry: (options?: { activeToolNames?: string[] }) => void;
}

export interface ToolInjectionResult {
  ok: true;
  added: number;
  removed: number;
}

export interface ToolInjectionError {
  ok: false;
  message: string;
}

// ─── SDK Version Helper ───────────────────────────────────────────

function getSdkVersion(): string {
  try {
    return require('@mariozechner/pi-coding-agent/package.json').version;
  } catch {
    return 'unknown';
  }
}

// ─── Runtime Validation ───────────────────────────────────────────

/**
 * Validate that the session exposes the private internals we need.
 * Returns the typed internals or an error message.
 */
export function validateSessionInternals(
  session: AgentSession
): { ok: true; internals: AgentSessionInternals } | { ok: false; message: string } {
  const raw = session as any;

  // Check _customTools exists and is an array
  if (!Array.isArray(raw._customTools)) {
    return {
      ok: false,
      message:
        `SDK internal API changed — _customTools is not an array ` +
        `(got ${typeof raw._customTools}). ` +
        `SDK version: ${getSdkVersion()} (verified with 0.55.x–0.57.x).`,
    };
  }

  // Check _refreshToolRegistry exists and is a function
  if (typeof raw._refreshToolRegistry !== 'function') {
    return {
      ok: false,
      message:
        `SDK internal API changed — _refreshToolRegistry is not a function ` +
        `(got ${typeof raw._refreshToolRegistry}). ` +
        `SDK version: ${getSdkVersion()} (verified with 0.55.x–0.57.x).`,
    };
  }

  return { ok: true, internals: raw as AgentSessionInternals };
}

// ─── Tool Injection ───────────────────────────────────────────────

/**
 * Add tools to a live session's custom tools array and rebuild the registry.
 *
 * Tools are identified by `name` — duplicates (tools already present with the
 * same name) are silently skipped.
 *
 * @param session  The live AgentSession to inject tools into
 * @param tools    Tool definitions to add
 * @returns        Result with count of tools added, or an error
 */
export function injectTools(
  session: AgentSession,
  tools: ToolDefinition[],
): ToolInjectionResult | ToolInjectionError {
  if (tools.length === 0) return { ok: true, added: 0, removed: 0 };

  const validation = validateSessionInternals(session);
  if (!validation.ok) return validation;

  const { internals } = validation;
  const existingNames = new Set(internals._customTools.map(t => t.name));

  let added = 0;
  for (const tool of tools) {
    if (!existingNames.has(tool.name)) {
      internals._customTools.push(tool);
      added++;
    }
  }

  if (added > 0) {
    internals._refreshToolRegistry();
  }

  return { ok: true, added, removed: 0 };
}

/**
 * Remove tools from a live session's custom tools array and rebuild the registry.
 *
 * Tools are matched by name prefix or exact name.
 *
 * @param session  The live AgentSession to remove tools from
 * @param filter   A predicate that returns true for tool names to remove
 * @returns        Result with count of tools removed, or an error
 */
export function ejectTools(
  session: AgentSession,
  filter: (toolName: string) => boolean,
): ToolInjectionResult | ToolInjectionError {
  const validation = validateSessionInternals(session);
  if (!validation.ok) return validation;

  const { internals } = validation;
  const before = internals._customTools.length;

  // Remove matching tools in-place (splice from end to preserve indices)
  for (let i = internals._customTools.length - 1; i >= 0; i--) {
    if (filter(internals._customTools[i].name)) {
      internals._customTools.splice(i, 1);
    }
  }

  const removed = before - internals._customTools.length;
  if (removed > 0) {
    internals._refreshToolRegistry();
  }

  return { ok: true, added: 0, removed };
}

/**
 * Check whether any tools matching the filter exist in the session's custom tools.
 *
 * Uses `getActiveToolNames()` (public API) so this does NOT require private access.
 */
export function hasTools(
  session: AgentSession,
  filter: (toolName: string) => boolean,
): boolean {
  return session.getActiveToolNames().some(filter);
}
