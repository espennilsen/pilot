/**
 * pi-session-config.ts — Session configuration building for PilotSessionManager.
 *
 * Assembles all the pieces needed to create an agent session: sandbox options,
 * extension/skill loading, memory context, task summary, resource loader,
 * and custom tools. Extracted to reduce initSession() complexity.
 */

import {
  SettingsManager,
  DefaultResourceLoader,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import { createSandboxedTools, type SandboxOptions } from './sandboxed-tools';
import { loadProjectSettings } from './project-settings';
import { getPiAgentDir, loadAppSettings } from './app-settings';
import { PILOT_SKILLS_DIR } from './pilot-paths';
import { ExtensionManager } from './extension-manager';
import { MemoryManager } from './memory-manager';
import { TaskManager } from './task-manager';
import { createTaskTools } from './task-tools';
import { SubagentManager } from './subagent-manager';
import { createSubagentTools } from './subagent-tools';
import { createWebFetchTool } from './web-fetch-tool';
import { createMemoryTools } from './memory-tools';
import { createEditorTools } from './editor-tools';
import type { StagedDiff } from '../../shared/types';
import type { McpManager } from './mcp-manager';

// ─── Types ────────────────────────────────────────────────────────

export interface SessionConfigResult {
  settingsManager: SettingsManager;
  resourceLoader: DefaultResourceLoader;
  customTools: ToolDefinition[];
  piAgentDir: string;
  /** Live reference — mutate properties to change sandbox behaviour at runtime. */
  sandboxOptions: SandboxOptions;
}

export interface SessionConfigOptions {
  tabId: string;
  projectPath: string;
  memoryManager: MemoryManager;
  taskManager: TaskManager;
  subagentManager: SubagentManager;
  mcpManager?: McpManager | null;
  onStagedDiff: (diff: StagedDiff) => void;
}

// ─── Config Builder ──────────────────────────────────────────────

/**
 * Build all configuration needed to create an agent session.
 *
 * Loads project settings, creates sandbox tools, resolves extensions/skills,
 * loads memory context, builds resource loader with system prompt injection,
 * and assembles the custom tools array.
 */
export async function buildSessionConfig(
  options: SessionConfigOptions
): Promise<SessionConfigResult> {
  const { tabId, projectPath, memoryManager, taskManager, subagentManager, mcpManager, onStagedDiff } = options;

  const projectSettings = loadProjectSettings(projectPath);
  const piAgentDir = getPiAgentDir();
  const settingsManager = SettingsManager.create(projectPath, piAgentDir);

  // Create sandboxed file tools
  // Always safelist the Pilot skills directory so the agent can read skill files
  const allowedPaths = [...projectSettings.jail.allowedPaths];
  if (!allowedPaths.includes(PILOT_SKILLS_DIR)) {
    allowedPaths.push(PILOT_SKILLS_DIR);
  }

  const sandboxOptions: SandboxOptions = {
    jailEnabled: projectSettings.jail.enabled,
    yoloMode: projectSettings.yoloMode,
    allowedPaths,
    tabId,
    onStagedDiff,
  };

  const { tools, readOnlyTools } = createSandboxedTools(projectPath, sandboxOptions);

  // Resolve enabled extensions and skills
  const extensionManager = new ExtensionManager();
  extensionManager.setProject(projectPath);
  const enabledExtensions = extensionManager.listExtensions().filter(e => e.enabled);
  const enabledSkills = extensionManager.listSkills();

  // Load memory context for system prompt injection
  const memoryContext = memoryManager.enabled
    ? await memoryManager.getMemoryContext(projectPath)
    : null;

  // Load task summary for system prompt injection
  const taskSummary = taskManager.enabled
    ? taskManager.getAgentTaskSummary(projectPath)
    : null;

  // Load user-defined system prompt from app settings
  const appSettings = loadAppSettings();
  const userSystemPrompt = appSettings.systemPrompt?.trim() || null;

  // Combine user system prompt, memory, and task context
  const additionalContext = [userSystemPrompt, memoryContext, taskSummary].filter(Boolean).join('\n\n');

  // Build resource loader with extensions, skills, and system prompt
  const resourceLoader = new DefaultResourceLoader({
    cwd: projectPath,
    agentDir: piAgentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    additionalExtensionPaths: enabledExtensions.map(e => e.path),
    additionalSkillPaths: enabledSkills.map(s => s.skillMdPath),
    ...(additionalContext ? { appendSystemPrompt: additionalContext } : {}),
  });
  await resourceLoader.reload();

  // Build custom tools array
  const taskTools = taskManager.enabled
    ? createTaskTools(taskManager, projectPath)
    : [];

  const subagentTools = createSubagentTools(subagentManager, tabId, projectPath);

  const memoryTools = memoryManager.enabled
    ? createMemoryTools(memoryManager, projectPath)
    : [];

  const editorTools = createEditorTools(projectPath);

  // Get MCP tools from connected servers
  const mcpTools = mcpManager
    ? mcpManager.getToolDefinitions(projectPath)
    : [];

  const customTools: ToolDefinition[] = [
    ...tools,
    ...readOnlyTools,
    ...taskTools,
    ...memoryTools,
    ...editorTools,
    ...subagentTools,
    createWebFetchTool(),
    ...mcpTools,
  ];

  return { settingsManager, resourceLoader, customTools, piAgentDir, sandboxOptions };
}
