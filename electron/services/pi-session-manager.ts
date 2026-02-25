import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createEventBus,
  type AgentSession,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { TextContent, ThinkingContent } from '@mariozechner/pi-ai';
import { extractLastAssistantText } from '../utils/message-utils';
import { StagedDiffManager } from './staged-diffs';
import { getPiAgentDir } from './app-settings';
import { MemoryManager } from './memory-manager';
import {
  PILOT_AUTH_FILE,
  PILOT_MODELS_FILE,
  ensurePilotAppDirs,
} from './pilot-paths';
import { IPC } from '../../shared/ipc';
import type { StagedDiff, SessionMetadata, MemoryCommandResult } from '../../shared/types';
import { TaskManager } from './task-manager';
import { SubagentManager } from './subagent-manager';
import { broadcastToRenderer } from '../utils/broadcast';
import { getSessionDir } from './pi-session-helpers';
import { buildSessionConfig } from './pi-session-config';
import { generateCommitMessage } from './pi-session-commit';
import { listSessions, listAllSessions, deleteSession } from './pi-session-listing';
import {
  getSlashCommands,
  handlePossibleTaskCommand,
  handlePossibleMemoryCommand,
} from './pi-session-commands';
import { extractMemoriesInBackground } from './pi-session-memory';

export class PilotSessionManager {
  private sessions = new Map<string, AgentSession>();
  private unsubscribers = new Map<string, () => void>();
  private tabProjectPaths = new Map<string, string>();
  private lastUserMessages = new Map<string, string>();
  private tabSandboxOptions = new Map<string, import('./sandboxed-tools').SandboxOptions>();
  private authStorage: AuthStorage;
  private modelRegistry: ModelRegistry;
  private eventBus = createEventBus();
  public stagedDiffs = new StagedDiffManager();
  public memoryManager = new MemoryManager();
  public taskManager = new TaskManager();
  public subagentManager: SubagentManager;

  constructor() {
    ensurePilotAppDirs();
    // Auth & models stored in Pilot app dir (~/.config/pilot/)
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
   * Shared session initialization — builds config, creates the agent session,
   * subscribes to events, and registers the tab.
   */
  private async initSession(
    tabId: string,
    projectPath: string,
    sessionMgr: SessionManager
  ): Promise<void> {
    const { settingsManager, resourceLoader, customTools, piAgentDir, sandboxOptions } = await buildSessionConfig({
      tabId,
      projectPath,
      memoryManager: this.memoryManager,
      taskManager: this.taskManager,
      subagentManager: this.subagentManager,
      onStagedDiff: (diff: StagedDiff) => {
        this.stagedDiffs.addDiff(diff);
        this.sendToRenderer(IPC.SANDBOX_STAGED_DIFF, { tabId, diff });
      },
    });

    const { session } = await createAgentSession({
      cwd: projectPath,
      agentDir: piAgentDir,
      sessionManager: sessionMgr,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      settingsManager,
      resourceLoader,
      tools: [],
      customTools,
    });

    // Subscribe to events and forward to renderer
    // Also trigger memory extraction when agent finishes responding
    const unsub = session.subscribe((event: AgentSessionEvent) => {
      try {
        this.forwardEventToRenderer(tabId, event);
      } catch (err) {
        console.warn(`[SessionManager] Failed to forward event '${event.type}' to renderer:`, err);
      }

      if (event.type === 'agent_end' || event.type === 'turn_end') {
        const messages = session.state.messages;
        const responseText = extractLastAssistantText(messages);
        if (responseText) {
          this.triggerMemoryExtraction(tabId, responseText);
        }
      }
    });

    this.sessions.set(tabId, session);
    this.unsubscribers.set(tabId, unsub);
    this.tabProjectPaths.set(tabId, projectPath);
    this.tabSandboxOptions.set(tabId, sandboxOptions);
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

  handlePossibleTaskCommand(
    tabId: string,
    message: string,
    projectPath: string
  ): { action: 'show_panel' | 'show_create' | 'show_ready'; readyText?: string } | null {
    return handlePossibleTaskCommand(message, projectPath, this.taskManager);
  }

  async handlePossibleMemoryCommand(
    tabId: string,
    message: string,
    projectPath: string
  ): Promise<MemoryCommandResult | null> {
    return handlePossibleMemoryCommand(message, projectPath, this.memoryManager);
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

  getSlashCommands(tabId: string): Array<{ name: string; description: string; source: string }> {
    return getSlashCommands(this.sessions.get(tabId));
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
    this.tabSandboxOptions.delete(tabId);
  }

  /**
   * Update the live sandbox options for a tab.
   * Mutates the object captured by tool closures, so changes take effect immediately.
   */
  updateSandboxOptions(tabId: string, updates: { jailEnabled?: boolean; yoloMode?: boolean; allowedPaths?: string[] }): void {
    const opts = this.tabSandboxOptions.get(tabId);
    if (!opts) return;
    if (updates.jailEnabled !== undefined) opts.jailEnabled = updates.jailEnabled;
    if (updates.yoloMode !== undefined) opts.yoloMode = updates.yoloMode;
    if (updates.allowedPaths !== undefined) opts.allowedPaths = updates.allowedPaths;
  }

  /**
   * Get the live sandbox options for a tab (read-only snapshot).
   */
  getSandboxOptions(tabId: string): { jailEnabled: boolean; yoloMode: boolean; allowedPaths: string[] } | null {
    const opts = this.tabSandboxOptions.get(tabId);
    if (!opts) return null;
    return { jailEnabled: opts.jailEnabled, yoloMode: opts.yoloMode, allowedPaths: [...opts.allowedPaths] };
  }

  /**
   * Refresh the system prompt on all active sessions.
   * Called when the user updates the system prompt in settings.
   * Updates the resource loader's appendSystemPrompt and triggers a session reload.
   */
  async refreshSystemPrompt(): Promise<void> {
    const appSettings = loadAppSettings();
    const userSystemPrompt = appSettings.systemPrompt?.trim() || null;

    for (const [tabId, session] of this.sessions) {
      try {
        const projectPath = this.tabProjectPaths.get(tabId);

        // Rebuild the full additionalContext (user prompt + memory + tasks)
        const memoryContext = this.memoryManager.enabled && projectPath
          ? await this.memoryManager.getMemoryContext(projectPath)
          : null;
        const taskSummary = this.taskManager.enabled && projectPath
          ? this.taskManager.getAgentTaskSummary(projectPath)
          : null;
        const additionalContext = [userSystemPrompt, memoryContext, taskSummary].filter(Boolean).join('\n\n');

        // Update the resource loader source and reload the session
        const loader = session.resourceLoader as any;
        loader.appendSystemPromptSource = additionalContext || undefined;
        await session.reload();
      } catch (err) {
        console.warn(`[SessionManager] Failed to refresh system prompt for tab ${tabId}:`, err);
      }
    }
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
    } catch (err) {
      console.warn('[PilotSession] Failed to parse session history:', err);
      return [];
    }
  }

  // ─── Delegated to extracted modules ─────────────────────────────

  async listSessions(projectPath: string): Promise<SessionMetadata[]> {
    return listSessions(projectPath);
  }

  async listAllSessions(projectPaths: string[]): Promise<SessionMetadata[]> {
    return listAllSessions(projectPaths);
  }

  async deleteSession(sessionPath: string): Promise<{ success: boolean; error?: string }> {
    return deleteSession(sessionPath);
  }

  async generateCommitMessage(diff: string): Promise<string> {
    return generateCommitMessage(diff, this.modelRegistry, this.authStorage);
  }

  // ─── Private helpers ────────────────────────────────────────────

  /**
   * Trigger background memory extraction — fire-and-forget.
   */
  private triggerMemoryExtraction(tabId: string, agentResponseText: string): void {
    const projectPath = this.tabProjectPaths.get(tabId);
    const userMessage = this.lastUserMessages.get(tabId);
    if (!projectPath || !userMessage) return;

    extractMemoriesInBackground({
      tabId,
      projectPath,
      userMessage,
      agentResponseText,
      memoryManager: this.memoryManager,
      modelRegistry: this.modelRegistry,
      authStorage: this.authStorage,
      onMemoryUpdated: (count, preview) => {
        this.sendToRenderer(IPC.MEMORY_UPDATED, { count, preview });
      },
    }).catch(() => {});
  }

  private forwardEventToRenderer(tabId: string, event: AgentSessionEvent): void {
    // structuredClone is faster than JSON round-trip for high-frequency events (text_delta)
    const serialized = structuredClone(event);
    this.sendToRenderer(IPC.AGENT_EVENT, { tabId, event: serialized });
  }

  private sendToRenderer(channel: string, data: unknown): void {
    broadcastToRenderer(channel, data);
  }
}
