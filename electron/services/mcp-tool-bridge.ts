/**
 * MCP Tool Bridge
 *
 * Bridges Model Context Protocol (MCP) tools to the Pi SDK's ToolDefinition format.
 * Converts JSON Schema to TypeBox and wraps MCP callTool in Pi's execute signature.
 */

import { Type, type TSchema } from '@sinclair/typebox';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getLogger } from './logger';

const log = getLogger('MCP');

/** Timeout for individual MCP tool calls (ms). */
const CALL_TOOL_TIMEOUT = 60_000;

/**
 * Sanitize a string for use in tool names.
 * Tool names must match [a-zA-Z0-9_-]{1,64} for most AI providers.
 */
function sanitizeForToolName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'unknown';
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * Converts JSON Schema to TypeBox schema.
 * Handles common JSON Schema types and falls back to Type.Any() for unknown types.
 */
export function jsonSchemaToTypeBox(schema: any): TSchema {
  if (!schema || typeof schema !== 'object') {
    return Type.Any();
  }

  const { type, description, properties, required = [], items, enum: enumValues } = schema;

  // Handle enum
  if (enumValues && Array.isArray(enumValues) && enumValues.length > 0) {
    const literals = enumValues.map((value) => Type.Literal(value));
    const unionType = Type.Union(literals);
    return description ? Type.Unsafe({ ...unionType, description }) : unionType;
  }

  // Handle by type
  switch (type) {
    case 'object': {
      if (!properties || typeof properties !== 'object') {
        return Type.Object({}, description ? { description } : {});
      }

      const typeBoxProps: Record<string, TSchema> = {};
      const requiredSet = new Set(required);

      for (const [key, propSchema] of Object.entries(properties)) {
        const propTypeBox = jsonSchemaToTypeBox(propSchema);
        typeBoxProps[key] = requiredSet.has(key) ? propTypeBox : Type.Optional(propTypeBox);
      }

      return Type.Object(typeBoxProps, description ? { description } : {});
    }

    case 'array': {
      const itemSchema = items ? jsonSchemaToTypeBox(items) : Type.Any();
      return Type.Array(itemSchema, description ? { description } : {});
    }

    case 'string':
      return Type.String(description ? { description } : {});

    case 'number':
    case 'integer':
      return Type.Number(description ? { description } : {});

    case 'boolean':
      return Type.Boolean(description ? { description } : {});

    default:
      return Type.Any(description ? { description } : {});
  }
}

/**
 * Creates a Pi SDK ToolDefinition from an MCP tool.
 * The resulting tool name is prefixed with `mcp__<server>__` to avoid collisions.
 * Server names are sanitized to only contain [a-zA-Z0-9_-].
 */
export function createMcpToolDefinition(
  client: Client,
  mcpTool: McpTool,
  serverName: string
): ToolDefinition {
  const safeName = sanitizeForToolName(serverName);
  const safeToolName = sanitizeForToolName(mcpTool.name);
  // Truncate to fit within 64-char limit for tool names
  const fullName = `mcp__${safeName}__${safeToolName}`;
  const name = fullName.length > 64 ? fullName.slice(0, 64) : fullName;
  const label = `MCP: ${serverName}/${mcpTool.name}`;
  const description = mcpTool.description || `MCP tool from ${serverName}`;
  const parameters = jsonSchemaToTypeBox(mcpTool.inputSchema);

  return {
    name,
    label,
    description,
    parameters,
    async execute(toolCallId, params, signal) {
      try {
        log.debug(`Calling tool "${mcpTool.name}" on server "${serverName}"`);
        const callPromise = client.callTool({
          name: mcpTool.name,
          arguments: params as Record<string, unknown>,
        });

        // Race against timeout to prevent hanging the agent loop
        const result = await Promise.race([
          callPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(
              `MCP tool call timed out after ${CALL_TOOL_TIMEOUT / 1000}s`
            )), CALL_TOOL_TIMEOUT)
          ),
        ]);

        // Extract text from content items
        const textParts: string[] = [];
        if (result.content && Array.isArray(result.content)) {
          for (const item of result.content) {
            if (item.type === 'text' && 'text' in item) {
              textParts.push((item as { type: 'text'; text: string }).text);
            }
          }
        }

        const text = textParts.join('\n') || '(No output)';

        if (result.isError) {
          log.warn(`MCP tool "${mcpTool.name}" on "${serverName}" returned error: ${text}`);
          return {
            content: [{ type: 'text' as const, text: `Error: ${text}` }],
            details: { isError: true, serverName },
          };
        }

        log.debug(`MCP tool "${mcpTool.name}" on "${serverName}" completed`, { outputLength: text.length });
        return {
          content: [{ type: 'text' as const, text }],
          details: { serverName },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`MCP tool "${mcpTool.name}" on "${serverName}" threw: ${message}`);
        return {
          content: [{ type: 'text' as const, text: `Error calling MCP tool "${mcpTool.name}": ${message}` }],
          details: { error: message, serverName },
        };
      }
    },
  };
}
