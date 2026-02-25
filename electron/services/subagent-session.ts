/**
 * subagent-session.ts — Session startup logic for subagents.
 *
 * Handles creating an SDK session for a subagent: project settings,
 * sandboxed tools, system prompt assembly, event subscription, and
 * timeout management. Extracted from SubagentManager for clarity.
 */

import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import { extractLastAssistantText } from '../utils/message-utils';
import { createSandboxedTools, type SandboxOptions } from './sandboxed-tools';
import { loadProjectSettings } from './project-settings';
import { getPiAgentDir } from './app-settings';
import { ExtensionManager } from './extension-manager';
import type { StagedDiff, SubagentSpawnOptions } from '../../shared/types';
import type { PilotSessionManager } from './pi-session-manager';
import type { SubagentInternal } from './subagent-helpers';

// ─── Types ────────────────────────────────────────────────────────

export interface SubagentSessionCallbacks {
  /** Called when a tool stages a diff (file write/edit). */
  onStagedDiff: (diff: StagedDiff) => void;
  /** Called on every SDK event (for forwarding/token tracking). */
  onEvent: (event: AgentSessionEvent) => void;
  /** Called when the agent finishes (agent_end event). */
  onCompleted: (resultText: string) => void;
  /** Called when the session fails with an error. */
  onFailed: (error: string) => void;
}

// ─── Session Startup ──────────────────────────────────────────────

/**
 * Start a subagent session: load settings, create sandboxed tools,
 * assemble system prompt, create SDK session, subscribe to events,
 * send the prompt, and handle timeout.
 *
 * Returns when the subagent prompt completes (or fails/times out).
 */
export async function startSubagentSession(
  sub: SubagentInternal,
  projectPath: string,
  options: SubagentSpawnOptions,
  parentSessionManager: PilotSessionManager,
  callbacks: SubagentSessionCallbacks,
  timeoutMs: number
): Promise<void> {
  const piAgentDir = getPiAgentDir();
  const projectSettings = loadProjectSettings(projectPath);
  const settingsManager = SettingsManager.create(projectPath, piAgentDir);

  const sandboxOptions: SandboxOptions = {
    jailEnabled: projectSettings.jail.enabled,
    yoloMode: projectSettings.yoloMode,
    allowedPaths: options.allowedPaths ?? projectSettings.jail.allowedPaths,
    tabId: sub.parentTabId,
    onStagedDiff: callbacks.onStagedDiff,
  };

  // Create tools — full or read-only based on options
  let customTools: ToolDefinition[];
  if (options.readOnly) {
    const { readOnlyTools } = createSandboxedTools(projectPath, sandboxOptions);
    customTools = readOnlyTools;
  } else {
    const { tools, readOnlyTools } = createSandboxedTools(projectPath, sandboxOptions);
    customTools = [...tools, ...readOnlyTools];
  }

  // Build system prompt
  const extensionManager = new ExtensionManager();
  extensionManager.setProject(projectPath);
  const enabledExtensions = extensionManager.listExtensions().filter((e) => e.enabled);
  const enabledSkills = extensionManager.listSkills();

  const systemPromptParts: string[] = [];
  if (options.systemPrompt) {
    systemPromptParts.push(options.systemPrompt);
  }
  systemPromptParts.push(
    `You are a subagent with role "${options.role}". Complete the given task thoroughly and report your results clearly.`,
    `Do not spawn subagents. You are a leaf worker — focus on implementation.`
  );

  const resourceLoader = new DefaultResourceLoader({
    cwd: projectPath,
    agentDir: piAgentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    additionalExtensionPaths: enabledExtensions.map((e) => e.path),
    additionalSkillPaths: enabledSkills.map((s) => s.skillMdPath),
    appendSystemPrompt: systemPromptParts.join('\n\n'),
  });
  await resourceLoader.reload();

  // Use in-memory session for subagents (no persistence needed)
  const sessionMgr = SessionManager.inMemory(projectPath);

  const { session } = await createAgentSession({
    cwd: projectPath,
    agentDir: piAgentDir,
    sessionManager: sessionMgr,
    authStorage: parentSessionManager.getAuthStorage(),
    modelRegistry: parentSessionManager.getModelRegistry(),
    settingsManager,
    resourceLoader,
    tools: [],
    customTools,
  });

  sub.session = session;

  // Subscribe to events and track tokens
  const unsub = session.subscribe((event: AgentSessionEvent) => {
    callbacks.onEvent(event);

    // Detect completion
    if (event.type === 'agent_end') {
      const resultText = extractLastAssistantText(session.state.messages);
      callbacks.onCompleted(resultText || '(no output)');
    }
  });

  sub.unsub = unsub;

  // Set timeout
  const timeoutTimer = setTimeout(() => {
    if (sub.status === 'running') {
      try { session.abort(); } catch { /* ignore */ }
      callbacks.onFailed(`Subagent timed out after ${timeoutMs}ms`);
    }
  }, timeoutMs);

  // Send the prompt
  try {
    await session.prompt(options.prompt);
  } catch (err: any) {
    clearTimeout(timeoutTimer);
    if (sub.status === 'running') {
      callbacks.onFailed(err.message || String(err));
    }
    return;
  }

  clearTimeout(timeoutTimer);

  // Safety net: if still running after prompt returns, extract result
  if (sub.status === 'running') {
    const resultText = extractLastAssistantText(session.state.messages);
    if (resultText) {
      callbacks.onCompleted(resultText);
    }
  }
}
