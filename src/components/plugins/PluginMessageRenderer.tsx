import { usePluginStore } from '../../stores/plugin-store';
import type { PluginMessageRenderer as PluginMessageRendererType } from '../../../shared/types';

/**
 * Check if any plugin has registered a custom renderer for a tool result.
 * Returns the matching renderer or null.
 * 
 * Phase 2 stub - Phase 4 will flesh out actual plugin-hosted rendering.
 */
export function findPluginRenderer(
  toolName?: string,
  customType?: string,
): PluginMessageRendererType | null {
  // Message renderers are tracked separately — 
  // for now, this is a stub that Phase 4 will flesh out
  return null;
}

/**
 * Render a tool result using a plugin-provided renderer.
 * Falls back to the default ToolResult rendering.
 */
export default function PluginMessageRenderer({
  toolName,
  result,
  customType,
  data,
}: {
  toolName?: string;
  result?: string;
  customType?: string;
  data?: unknown;
}) {
  // Phase 4 will implement actual plugin-hosted rendering
  // For now, return null so the default renderer handles it
  return null;
}
