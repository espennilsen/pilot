/**
 * MCP Server Configuration
 * Loads and saves MCP server configuration from JSON files.
 * Supports both global (~/.config/pilot/mcp.json) and project-level (.pilot/mcp.json) configs.
 */

import { join, dirname } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { PILOT_APP_DIR } from './pilot-paths';
import type { McpServerConfig } from '../../shared/types';

/** On-disk JSON format (Claude Desktop convention) */
interface McpConfigFile {
  mcpServers: Record<string, Omit<McpServerConfig, 'name' | 'scope'>>;
}

/** Get path to global MCP config */
function getGlobalConfigPath(): string {
  return join(PILOT_APP_DIR, 'mcp.json');
}

/** Get path to project MCP config */
function getProjectConfigPath(projectPath: string): string {
  return join(projectPath, '.pilot', 'mcp.json');
}

/** Load config from a JSON file */
function loadConfigFile(filePath: string, scope: 'global' | 'project'): McpServerConfig[] {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const config: McpConfigFile = JSON.parse(content);

    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      return [];
    }

    return Object.entries(config.mcpServers).map(([name, server]) => ({
      name,
      scope,
      ...server,
    }));
  } catch (error) {
    console.error(`Failed to load MCP config from ${filePath}:`, error);
    return [];
  }
}

/** Save config to a JSON file */
function saveConfigFile(filePath: string, servers: McpServerConfig[]): void {
  const mcpServers: Record<string, Omit<McpServerConfig, 'name' | 'scope'>> = {};

  for (const server of servers) {
    const { name, scope, ...rest } = server;
    mcpServers[name] = rest;
  }

  const config: McpConfigFile = { mcpServers };

  // Ensure directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

/** Load global MCP config */
export function loadGlobalMcpConfig(): McpServerConfig[] {
  return loadConfigFile(getGlobalConfigPath(), 'global');
}

/** Load project MCP config */
export function loadProjectMcpConfig(projectPath: string): McpServerConfig[] {
  return loadConfigFile(getProjectConfigPath(projectPath), 'project');
}

/** Load merged MCP config (global + project, project wins on name collision) */
export function loadMergedMcpConfig(projectPath?: string): McpServerConfig[] {
  const global = loadGlobalMcpConfig();

  if (!projectPath) {
    return global;
  }

  const project = loadProjectMcpConfig(projectPath);
  const projectNames = new Set(project.map(s => s.name));

  // Project configs override global configs with the same name
  return [...global.filter(s => !projectNames.has(s.name)), ...project];
}

/** Save global MCP config */
export function saveGlobalMcpConfig(servers: McpServerConfig[]): void {
  saveConfigFile(getGlobalConfigPath(), servers);
}

/** Save project MCP config */
export function saveProjectMcpConfig(projectPath: string, servers: McpServerConfig[]): void {
  saveConfigFile(getProjectConfigPath(projectPath), servers);
}

/** Add server to config */
export function addServerToConfig(
  server: McpServerConfig,
  scope: 'global' | 'project',
  projectPath?: string
): void {
  const servers = scope === 'global'
    ? loadGlobalMcpConfig()
    : loadProjectMcpConfig(projectPath!);

  // Remove existing server with same name
  const filtered = servers.filter(s => s.name !== server.name);
  filtered.push({ ...server, scope });

  if (scope === 'global') {
    saveGlobalMcpConfig(filtered);
  } else {
    saveProjectMcpConfig(projectPath!, filtered);
  }
}

/** Remove server from config */
export function removeServerFromConfig(
  name: string,
  scope: 'global' | 'project',
  projectPath?: string
): void {
  const servers = scope === 'global'
    ? loadGlobalMcpConfig()
    : loadProjectMcpConfig(projectPath!);

  const filtered = servers.filter(s => s.name !== name);

  if (scope === 'global') {
    saveGlobalMcpConfig(filtered);
  } else {
    saveProjectMcpConfig(projectPath!, filtered);
  }
}

/** Update server in config */
export function updateServerInConfig(
  name: string,
  updates: Partial<McpServerConfig>,
  scope: 'global' | 'project',
  projectPath?: string
): void {
  const servers = scope === 'global'
    ? loadGlobalMcpConfig()
    : loadProjectMcpConfig(projectPath!);

  const updated = servers.map(s =>
    s.name === name ? { ...s, ...updates, name, scope } : s
  );

  if (scope === 'global') {
    saveGlobalMcpConfig(updated);
  } else {
    saveProjectMcpConfig(projectPath!, updated);
  }
}
