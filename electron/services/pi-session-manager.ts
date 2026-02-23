import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
  createEventBus,
  buildSessionContext,
  type AgentSession,
  type AgentSessionEvent,
  type SessionEntry,
  type ContextUsage,
  type SessionStats,
} from '@mariozechner/pi-coding-agent';
import type { TextContent, ThinkingContent } from '@mariozechner/pi-ai';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { BrowserWindow } from 'electron';
import { join } from 'path';
import { existsSync, readdirSync, mkdirSync } from 'fs';
import { createSandboxedTools, type SandboxOptions } from './sandboxed-tools';
import { loadProjectSettings } from './project-settings';
import { StagedDiffManager } from './staged-diffs';
import { getPiAgentDir } from './app-settings';
import { ExtensionManager } from './extension-manager';
import { MemoryManager } from './memory-manager';
import {
  PILOT_AUTH_FILE,
  PILOT_MODELS_FILE,
  ensurePilotAppDirs,
} from './pilot-paths';
import { IPC } from '../../shared/ipc';
import type { StagedDiff, SessionMetadata, MemoryCommandResult } from '../../shared/types';
import { getAllSessionMeta, removeSessionMeta } from './session-metadata';
import { TaskManager } from './task-manager';
import { createTaskTools } from './task-tools';
import { companionBridge } from './companion-ipc-bridge';
import { SubagentManager } from './subagent-manager';
import { createSubagentTools } from './subagent-tools';
import { createWebFetchTool } from './web-fetch-tool';

/**
 * Encode a path separator as `+` so that hyphens in directory names round-trip safely.
 * Legacy directories used `-` (lossy for hyphenated names); new ones use `+`.
 * Format: --Users+espen+Dev+my-project--
 */
function getSessionDir(piAgentDir: string, cwd: string): string {
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
 */
function decodeDirName(dirName: string): string {
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

export class PilotSessionManager {
  private sessions = new Map<string, AgentSession>();
  private unsubscribers = new Map<string, () => void>();
  private tabProjectPaths = new Map<string, string>();
  private lastUserMessages = new Map<string, string>();
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private eventBus = createEventBus();
  public stagedDiffs = new StagedDiffManager();
  public memoryManager = new MemoryManager();
  public taskManager = new TaskManager();
  public subagentManager: SubagentManager;

  constructor() {
    ensurePilotAppDirs();
    // Auth & models stored in Pilot app dir (~/.config/.pilot/)
    this.authStorage = AuthStorage.create(PILOT_AUTH_FILE);
    this.modelRegistry = new ModelRegistry(this.authStorage, PILOT_MODELS_FILE);
    this.subagentManager = new SubagentManager(this);

    // Wire up task board change notifications to renderer
    this.taskManager.onBoardChanged = (projectPath: string) => {
      this.sendToRenderer(IPC.TASKS_CHANGED, { projectPath });
    };
  }

  async createSession(tabId: string, projectPath: string): Promise<void> {
    const piAgentDir = getPiAgentDir();
    const sessionDir = getSessionDir(piAgentDir, projectPath);
    await this.initSession(tabId, projectPath, SessionManager.create(projectPath, sessionDir));
  }

  /** Create a session for a tab from a specific session file */
  async openSession(tabId: string, sessionPath: string, projectPath: string): Promise<void> {
    // Skip if this tab already has the same session open (idempotent)
    const existing = this.sessions.get(tabId);
    if (existing && existing.sessionFile === sessionPath) {
      return;
    }
    // Dispose existing session on this tab if any
    if (existing) {
      this.dispose(tabId);
    }
    const piAgentDir = getPiAgentDir();
    const sessionDir = getSessionDir(piAgentDir, projectPath);
    await this.initSession(tabId, projectPath, SessionManager.open(sessionPath, sessionDir));
  }

  /**
   * Shared session initialization — sets up sandbox, extensions, memory, resource loader,
   * creates the agent session, subscribes to events, and registers the tab.
   */
  private async initSession(
    tabId: string,
    projectPath: string,
    sessionMgr: SessionManager
  ): Promise<void> {
    const projectSettings = loadProjectSettings(projectPath);
    const piAgentDir = getPiAgentDir();
    const settingsManager = SettingsManager.create(projectPath, piAgentDir);

    const sandboxOptions: SandboxOptions = {
      jailEnabled: projectSettings.jail.enabled,
      yoloMode: projectSettings.yoloMode,
      allowedPaths: projectSettings.jail.allowedPaths,
      tabId,
      onStagedDiff: (diff: StagedDiff) => {
        this.stagedDiffs.addDiff(diff);
        this.sendToRenderer(IPC.SANDBOX_STAGED_DIFF, { tabId, diff });
      },
    };

    const { tools, readOnlyTools } = createSandboxedTools(projectPath, sandboxOptions);

    // Resolve enabled extensions and skills from Pilot's own directories
    const extensionManager = new ExtensionManager();
    extensionManager.setProject(projectPath);
    const enabledExtensions = extensionManager.listExtensions().filter(e => e.enabled);
    const enabledSkills = extensionManager.listSkills();

    // Load memory context to inject into the system prompt (skip if memory disabled)
    const memoryContext = this.memoryManager.enabled
      ? await this.memoryManager.getMemoryContext(projectPath)
      : null;

    // Load task summary for system prompt injection (skip if tasks disabled)
    const taskSummary = this.taskManager.enabled
      ? this.taskManager.getAgentTaskSummary(projectPath)
      : null;

    // Combine memory and task context
    const additionalContext = [memoryContext, taskSummary].filter(Boolean).join('\n\n');

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

    // Create task tools for agent integration (skip if tasks disabled)
    const taskTools = this.taskManager.enabled
      ? createTaskTools(this.taskManager, projectPath)
      : [];

    // Create subagent tools so the agent can delegate work
    const subagentTools = createSubagentTools(
      this.subagentManager,
      tabId,
      projectPath
    );

    const { session } = await createAgentSession({
      cwd: projectPath,
      agentDir: piAgentDir,
      sessionManager: sessionMgr,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      settingsManager,
      resourceLoader,
      tools: [],  // No built-in tools (we provide sandboxed versions)
      customTools: [...tools, ...readOnlyTools, ...taskTools, ...subagentTools, createWebFetchTool()],
    });

    // Subscribe to events and forward to renderer
    // Also trigger memory extraction when agent finishes responding
    const unsub = session.subscribe((event: AgentSessionEvent) => {
      this.forwardEventToRenderer(tabId, event);

      if (event.type === 'agent_end' || event.type === 'turn_end') {
        const messages = session.state.messages;
        const lastAssistant = [...messages].reverse().find(
          (m: AgentMessage) => m.role === 'assistant'
        );
        if (lastAssistant && lastAssistant.role === 'assistant') {
          let responseText = '';
          if (Array.isArray(lastAssistant.content)) {
            responseText = lastAssistant.content
              .filter((b): b is TextContent => b.type === 'text')
              .map((b) => b.text)
              .join('');
          }
          if (responseText) {
            this.extractMemoriesInBackground(tabId, responseText).catch(() => {});
          }
        }
      }
    });

    this.sessions.set(tabId, session);
    this.unsubscribers.set(tabId, unsub);
    this.tabProjectPaths.set(tabId, projectPath);
  }

  async prompt(tabId: string, text: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) throw new Error(`No session for tab ${tabId}`);

    // Track the user message for auto-extraction
    this.lastUserMessages.set(tabId, text);

    if (session.state.isStreaming) {
      await session.followUp(text);
    } else {
      await session.prompt(text);
    }
  }

  /**
   * Handle messages that start with # or /memory.
   * Returns the result if it was a memory command, or null if not intercepted.
   */
  /**
   * Handle /tasks slash commands.
   * Returns a result if it was a task command, or null if not intercepted.
   */
  handlePossibleTaskCommand(
    tabId: string,
    message: string,
    projectPath: string
  ): { action: 'show_panel' | 'show_create' | 'show_ready'; readyText?: string } | null {
    const trimmed = message.trim().toLowerCase();

    if (trimmed === '/tasks' || trimmed === '/tasks board') {
      return { action: 'show_panel' };
    }

    if (trimmed === '/tasks create') {
      return { action: 'show_create' };
    }

    if (trimmed === '/tasks ready') {
      const ready = this.taskManager.getReadyTasks(projectPath);
      if (ready.length === 0) {
        return { action: 'show_ready', readyText: '📋 No ready tasks. All tasks are either blocked, in progress, or done.' };
      }
      const lines = ready.map(t => {
        const priorityEmoji = ['🔴', '🟠', '🟡', '🔵', '⚪'][t.priority] || '⚪';
        return `  ${priorityEmoji} [${t.id}] ${t.title}`;
      });
      return {
        action: 'show_ready',
        readyText: `📋 Ready tasks (${ready.length}):\n${lines.join('\n')}`,
      };
    }

    return null;
  }

  async handlePossibleMemoryCommand(
    tabId: string,
    message: string,
    projectPath: string
  ): Promise<MemoryCommandResult | null> {
    const trimmed = message.trim();

    // Only intercept:
    // - Messages starting with # as the first character
    // - Exact /memory command
    // Don't intercept ## (markdown headings) or # in the middle of text
    const isHashCommand = trimmed.startsWith('#') && !trimmed.startsWith('##');
    const isMemorySlashCommand = trimmed.toLowerCase() === '/memory';

    if (!isHashCommand && !isMemorySlashCommand) return null;

    return this.memoryManager.handleManualMemory(message, projectPath);
  }

  /**
   * Run memory extraction in background after an agent response.
   * Must never block the main conversation.
   */
  async extractMemoriesInBackground(
    tabId: string,
    agentResponseText: string
  ): Promise<void> {
    try {
      const projectPath = this.tabProjectPaths.get(tabId);
      const userMessage = this.lastUserMessages.get(tabId);
      if (!projectPath || !userMessage) return;

      // Skip if memory is disabled
      if (!this.memoryManager.enabled) return;

      // Check debounce
      if (this.memoryManager.shouldSkipExtraction()) return;
      this.memoryManager.markExtractionRun();

      const existingMemories = await this.memoryManager.getMemoryContext(projectPath);

      // Build extraction prompt
      const extractionPrompt = this.memoryManager.buildExtractionPrompt(
        userMessage,
        agentResponseText,
        existingMemories
      );

      // Use the cheapest available model for extraction
      // Try to make a lightweight API call using the auth infrastructure
      let extractionResult: string | null = null;
      try {
        const availableModels = this.modelRegistry.getAvailable();
        // Prefer haiku-class models for cost efficiency
        const cheapModel = availableModels.find(m =>
          m.id.includes('haiku') || m.id.includes('gpt-4o-mini') || m.id.includes('flash')
        ) || availableModels[0];

        if (!cheapModel) return;

        const auth = this.authStorage.get(cheapModel.provider);
        if (!auth || auth.type !== 'api_key' || !auth.key) return;
        const apiKey = auth.key;

        // Direct API call with 10s timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        try {
          if (cheapModel.provider === 'anthropic') {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'x-api-key': apiKey,
                'content-type': 'application/json',
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: cheapModel.id,
                max_tokens: 500,
                messages: [{ role: 'user', content: extractionPrompt }],
              }),
              signal: controller.signal,
            });
            if (response.ok) {
              const data = await response.json();
              extractionResult = data.content?.[0]?.text || null;
            }
          } else if (cheapModel.provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: cheapModel.id,
                max_tokens: 500,
                messages: [{ role: 'user', content: extractionPrompt }],
              }),
              signal: controller.signal,
            });
            if (response.ok) {
              const data = await response.json();
              extractionResult = data.choices?.[0]?.message?.content || null;
            }
          } else if (cheapModel.provider === 'google') {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${cheapModel.id}:generateContent?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: extractionPrompt }] }],
                  generationConfig: { maxOutputTokens: 500 },
                }),
                signal: controller.signal,
              }
            );
            if (response.ok) {
              const data = await response.json();
              extractionResult = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
            }
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // Model call failed — skip extraction silently
        return;
      }

      if (!extractionResult) return;

      const result = await this.memoryManager.processExtractionResult(
        extractionResult,
        projectPath
      );

      if (result.shouldSave) {
        // Notify renderer that memories were updated
        this.sendToRenderer(IPC.MEMORY_UPDATED, {
          count: result.memories.length,
          preview: result.memories[0]?.text ?? '',
        });
      }
    } catch {
      // Silent failure. Memory extraction must never break anything.
    }
  }

  async steer(tabId: string, text: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) throw new Error(`No session for tab ${tabId}`);
    await session.steer(text);
  }

  async abort(tabId: string): Promise<void> {
    const session = this.sessions.get(tabId);
    if (!session) throw new Error(`No session for tab ${tabId}`);
    await session.abort();
  }

  async cycleModel(tabId: string) {
    const session = this.sessions.get(tabId);
    return session?.cycleModel();
  }

  async cycleThinkingLevel(tabId: string) {
    const session = this.sessions.get(tabId);
    return session?.cycleThinkingLevel();
  }

  async fork(tabId: string, entryId: string) {
    const session = this.sessions.get(tabId);
    if (!session) throw new Error(`No session for tab ${tabId}`);
    return session.fork(entryId);
  }

  getSession(tabId: string): AgentSession | undefined {
    return this.sessions.get(tabId);
  }

  /**
   * Get available slash commands for a tab's session.
   * Combines built-in SDK commands, prompt templates, skills, and extension commands.
   */
  getSlashCommands(tabId: string): Array<{ name: string; description: string; source: string }> {
    const session = this.sessions.get(tabId);
    const commands: Array<{ name: string; description: string; source: string }> = [];

    // Pilot-specific commands (always available, regardless of session)
    commands.push({ name: 'memory', description: 'Open memory panel', source: 'pilot' });
    commands.push({ name: 'tasks', description: 'Open task board', source: 'pilot' });
    commands.push({ name: 'tasks ready', description: 'Show ready tasks', source: 'pilot' });
    commands.push({ name: 'tasks create', description: 'Create a new task', source: 'pilot' });
    commands.push({ name: 'orchestrate', description: 'Enter orchestrator mode — coordinate subagents', source: 'pilot' });
    commands.push({ name: 'spawn', description: 'Quick-spawn a subagent: /spawn [role] [prompt]', source: 'pilot' });

    if (!session) return commands;

    // Prompt templates from the session
    try {
      const templates = session.promptTemplates;
      for (const t of templates) {
        commands.push({
          name: t.name,
          description: t.description || `Prompt template (${t.source})`,
          source: 'prompt',
        });
      }
    } catch { /* session may not be fully initialized */ }

    // Skills from the resource loader
    try {
      const { skills } = session.resourceLoader.getSkills();
      for (const s of skills) {
        commands.push({
          name: `skill:${s.name}`,
          description: s.description || `Skill (${s.source})`,
          source: 'skill',
        });
      }
    } catch { /* ignore */ }

    // Extension-registered commands
    try {
      const runner = session.extensionRunner;
      if (runner) {
        const extCmds = runner.getRegisteredCommands();
        for (const c of extCmds) {
          // Don't duplicate built-ins already handled
          if (!commands.some(cmd => cmd.name === c.name)) {
            commands.push({
              name: c.name,
              description: c.description || 'Extension command',
              source: 'extension',
            });
          }
        }
      }
    } catch { /* ignore */ }

    return commands;
  }

  /** Get the session file path for a tab */
  getSessionPath(tabId: string): string | undefined {
    return this.sessions.get(tabId)?.sessionFile;
  }

  dispose(tabId: string): void {
    // Clean up subagents for this tab first
    this.subagentManager.cleanup(tabId);

    const unsub = this.unsubscribers.get(tabId);
    unsub?.();
    this.unsubscribers.delete(tabId);

    const session = this.sessions.get(tabId);
    session?.dispose();
    this.sessions.delete(tabId);

    this.stagedDiffs.clearTab(tabId);
    this.tabProjectPaths.delete(tabId);
    this.lastUserMessages.delete(tabId);
  }

  disposeAll(): void {
    this.subagentManager.cleanupAll();
    for (const tabId of this.sessions.keys()) {
      this.dispose(tabId);
    }
  }

  getAuthStorage(): AuthStorage {
    return this.authStorage;
  }

  getModelRegistry(): ModelRegistry {
    return this.modelRegistry;
  }

  /** Get displayable chat history from a session's persisted entries */
  getSessionHistory(tabId: string): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number; thinkingContent?: string }> {
    const session = this.sessions.get(tabId);
    if (!session) return [];

    try {
      const messages = session.state.messages;
      const history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number; thinkingContent?: string }> = [];

      for (const msg of messages) {
        if (!('role' in msg)) continue;

        if (msg.role === 'user') {
          let text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            text = msg.content
              .filter((c): c is TextContent => c.type === 'text')
              .map((c) => c.text)
              .join('');
          }
          if (text) {
            history.push({
              role: 'user',
              content: text,
              timestamp: msg.timestamp || Date.now(),
            });
          }
        } else if (msg.role === 'assistant') {
          let text = '';
          let thinkingContent = '';
          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text') {
                text += (block as TextContent).text || '';
              } else if (block.type === 'thinking') {
                thinkingContent += (block as ThinkingContent).thinking || '';
              }
            }
          }
          if (text || thinkingContent) {
            history.push({
              role: 'assistant',
              content: text,
              timestamp: msg.timestamp || Date.now(),
              thinkingContent: thinkingContent || undefined,
            });
          }
        }
      }

      return history;
    } catch {
      return [];
    }
  }

  /** List sessions for a specific project (project-scoped) */
  async listSessions(projectPath: string): Promise<SessionMetadata[]> {
    try {
      const piAgentDir = getPiAgentDir();
      const sessionDir = getSessionDir(piAgentDir, projectPath);
      const sessions = await SessionManager.list(projectPath, sessionDir);
      const metaMap = getAllSessionMeta();
      return sessions.map(s => {
        const meta = metaMap[s.path] || { isPinned: false, isArchived: false };
        return {
          sessionPath: s.path,
          projectPath: s.cwd || projectPath,
          isPinned: meta.isPinned,
          isArchived: meta.isArchived,
          customTitle: s.name || s.firstMessage || null,
          messageCount: s.messageCount || 0,
          created: s.created?.getTime() || 0,
          modified: s.modified?.getTime() || 0,
        };
      });
    } catch {
      return [];
    }
  }

  /** List all sessions across known project directories */
  async listAllSessions(projectPaths: string[]): Promise<SessionMetadata[]> {
    const piAgentDir = getPiAgentDir();
    const allSessions: SessionMetadata[] = [];
    const metaMap = getAllSessionMeta();

    if (projectPaths.length > 0) {
      // Scan sessions for specific projects
      for (const projectPath of projectPaths) {
        const sessions = await this.listSessions(projectPath);
        allSessions.push(...sessions);
      }
    } else {
      // No project paths specified — scan all session directories
      const sessionsRoot = join(piAgentDir, 'sessions');
      if (existsSync(sessionsRoot)) {
        try {
          const dirs = readdirSync(sessionsRoot, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
          for (const dirName of dirs) {
            const cwd = decodeDirName(dirName);
            const sessionDir = join(sessionsRoot, dirName);
            try {
              const sessions = await SessionManager.list(cwd, sessionDir);
              for (const s of sessions) {
                const meta = metaMap[s.path] || { isPinned: false, isArchived: false };
                allSessions.push({
                  sessionPath: s.path,
                  projectPath: s.cwd || cwd,
                  isPinned: meta.isPinned,
                  isArchived: meta.isArchived,
                  customTitle: s.name || s.firstMessage || null,
                  messageCount: s.messageCount || 0,
                  created: s.created?.getTime() || 0,
                  modified: s.modified?.getTime() || 0,
                });
              }
            } catch {
              // Skip unreadable session dirs
            }
          }
        } catch {
          // sessionsRoot not readable
        }
      }
    }

    // Sort by most recent first
    allSessions.sort((a, b) => {
      // sessionPath includes timestamp, so alphabetical sort works for recency
      return (b.sessionPath || '').localeCompare(a.sessionPath || '');
    });
    return allSessions;
  }

  /** Delete a session file from disk and clean up its metadata. */
  async deleteSession(sessionPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { unlinkSync } = await import('fs');
      if (existsSync(sessionPath)) {
        unlinkSync(sessionPath);
      }
      // Clean up persisted metadata (pin/archive flags)
      removeSessionMeta(sessionPath);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to delete session:', message);
      return { success: false, error: message };
    }
  }

  private forwardEventToRenderer(tabId: string, event: AgentSessionEvent): void {
    const serialized = JSON.parse(JSON.stringify(event));
    this.sendToRenderer(IPC.AGENT_EVENT, { tabId, event: serialized });
  }

  private sendToRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(channel, data);
    }
    // Forward to companion clients
    companionBridge.forwardEvent(channel, data);
  }
}
