import {
  createAgentSession,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import { randomUUID } from 'crypto';
import { extractLastAssistantText } from '../utils/message-utils';
import { broadcastToRenderer } from '../utils/broadcast';
import { createSandboxedTools, type SandboxOptions } from './sandboxed-tools';
import { loadProjectSettings } from './project-settings';
import { getPiAgentDir } from './app-settings';
import { ExtensionManager } from './extension-manager';
import {
  PILOT_AUTH_FILE,
  PILOT_MODELS_FILE,
} from './pilot-paths';
import { IPC } from '../../shared/ipc';
import type {
  StagedDiff,
  SubagentRecord,
  SubagentStatus,
  SubagentSpawnOptions,
  SubagentPoolTask,
  SubagentResult,
  SubagentPoolResult,
} from '../../shared/types';
import type { PilotSessionManager } from './pi-session-manager';

interface SubagentInternal extends SubagentRecord {
  session: AgentSession | null;
  unsub: () => void;
}

interface PoolInternal {
  id: string;
  parentTabId: string;
  subagentIds: string[];
  total: number;
  completed: number;
  failures: number;
  resolveAll?: (results: SubagentResult[]) => void;
  results: Map<string, SubagentResult>;
}

// Default limits
const DEFAULT_MAX_PER_TAB = 10;
const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_MAX_TURNS = 20;
const DEFAULT_MAX_TOKENS = 200000;
const DEFAULT_TIMEOUT = 300000; // 5 minutes

export class SubagentManager {
  private subagents = new Map<string, SubagentInternal>();
  private pools = new Map<string, PoolInternal>();
  private runningCount = 0;
  private queue: Array<{ subId: string; start: () => void }> = [];

  // File conflict tracking: poolId → Map<filePath, subagentId that wrote first>
  private fileOwnership = new Map<string, Map<string, string>>();

  /** Callbacks waiting for subagent completion — resolved by onSubagentFinished() */
  private resultResolvers = new Map<string, Array<(result: SubagentResult) => void>>();
  private poolResolvers = new Map<string, Array<(result: SubagentPoolResult) => void>>();

  constructor(private parentSessionManager: PilotSessionManager) {}

  // ─── Spawn single subagent ─────────────────────────────────────────

  async spawn(
    parentTabId: string,
    projectPath: string,
    options: SubagentSpawnOptions
  ): Promise<string> {
    // Check per-tab limit
    const tabCount = this.getTabSubagentCount(parentTabId);
    if (tabCount >= DEFAULT_MAX_PER_TAB) {
      throw new Error(
        `Maximum subagents per tab (${DEFAULT_MAX_PER_TAB}) reached. Abort some before spawning new ones.`
      );
    }

    const subId = `sub-${randomUUID().slice(0, 8)}`;

    const record: SubagentInternal = {
      id: subId,
      parentTabId,
      poolId: null,
      status: 'queued',
      role: options.role,
      prompt: options.prompt,
      result: null,
      error: null,
      modifiedFiles: [],
      createdAt: Date.now(),
      completedAt: null,
      tokenUsage: { input: 0, output: 0 },
      // Placeholders — filled when session starts
      session: null,
      unsub: () => {},
    };

    this.subagents.set(subId, record);

    const startFn = () => {
      this.startSubagent(subId, projectPath, options).catch((err) => {
        this.markFailed(subId, err.message || String(err));
      });
    };

    if (this.runningCount < DEFAULT_MAX_CONCURRENT) {
      this.runningCount++;
      startFn();
    } else {
      this.queue.push({ subId, start: startFn });
    }

    return subId;
  }

  // ─── Spawn parallel pool ──────────────────────────────────────────

  async spawnPool(
    parentTabId: string,
    projectPath: string,
    tasks: SubagentPoolTask[]
  ): Promise<string> {
    const poolId = `pool-${randomUUID().slice(0, 8)}`;

    const pool: PoolInternal = {
      id: poolId,
      parentTabId,
      subagentIds: [],
      total: tasks.length,
      completed: 0,
      failures: 0,
      results: new Map(),
    };

    this.pools.set(poolId, pool);
    this.fileOwnership.set(poolId, new Map());

    for (const task of tasks) {
      const subId = await this.spawn(parentTabId, projectPath, {
        ...task,
        model: undefined,
        maxTurns: undefined,
      });

      const sub = this.subagents.get(subId)!;
      sub.poolId = poolId;
      pool.subagentIds.push(subId);
    }

    return poolId;
  }

  // ─── Await result ─────────────────────────────────────────────────

  awaitResult(subId: string): Promise<SubagentResult> {
    const sub = this.subagents.get(subId);
    if (!sub) {
      return Promise.resolve({
        subId,
        role: 'unknown',
        result: null,
        error: 'Subagent not found',
        tokenUsage: { input: 0, output: 0 },
        modifiedFiles: [],
      });
    }
    // Already finished
    if (sub.status === 'completed' || sub.status === 'failed' || sub.status === 'aborted') {
      return Promise.resolve({
        subId: sub.id,
        role: sub.role,
        result: sub.result,
        error: sub.error,
        tokenUsage: sub.tokenUsage,
        modifiedFiles: sub.modifiedFiles,
      });
    }
    // Wait for completion via callback
    return new Promise(resolve => {
      const resolvers = this.resultResolvers.get(subId) || [];
      resolvers.push(resolve);
      this.resultResolvers.set(subId, resolvers);
    });
  }

  awaitPool(poolId: string): Promise<SubagentPoolResult> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      return Promise.resolve({ poolId, results: [], failures: [] });
    }
    // Already done
    if (pool.completed >= pool.total) {
      return Promise.resolve(this.buildPoolResult(pool));
    }
    // Wait for completion via callback
    return new Promise(resolve => {
      const resolvers = this.poolResolvers.get(poolId) || [];
      resolvers.push(resolve);
      this.poolResolvers.set(poolId, resolvers);
    });
  }

  // ─── Get result (non-blocking) ────────────────────────────────────

  getResult(subId: string): SubagentResult | null {
    const sub = this.subagents.get(subId);
    if (!sub) return null;
    if (sub.status === 'completed' || sub.status === 'failed' || sub.status === 'aborted') {
      return {
        subId: sub.id,
        role: sub.role,
        result: sub.result,
        error: sub.error,
        tokenUsage: sub.tokenUsage,
        modifiedFiles: sub.modifiedFiles,
      };
    }
    return null;
  }

  // ─── Abort ────────────────────────────────────────────────────────

  async abort(subId: string): Promise<void> {
    const sub = this.subagents.get(subId);
    if (!sub) return;
    if (sub.status === 'running') {
      try {
        await sub.session?.abort();
      } catch { /* ignore */ }
      this.markAborted(subId);
    } else if (sub.status === 'queued') {
      this.queue = this.queue.filter((q) => q.subId !== subId);
      this.markAborted(subId);
    }
  }

  async abortPool(poolId: string): Promise<void> {
    const pool = this.pools.get(poolId);
    if (!pool) return;
    for (const subId of pool.subagentIds) {
      await this.abort(subId);
    }
  }

  // ─── Status ───────────────────────────────────────────────────────

  getStatus(parentTabId: string): SubagentRecord[] {
    const records: SubagentRecord[] = [];
    for (const sub of this.subagents.values()) {
      if (sub.parentTabId === parentTabId) {
        records.push({
          id: sub.id,
          parentTabId: sub.parentTabId,
          poolId: sub.poolId,
          status: sub.status,
          role: sub.role,
          prompt: sub.prompt,
          result: sub.result,
          error: sub.error,
          modifiedFiles: sub.modifiedFiles,
          createdAt: sub.createdAt,
          completedAt: sub.completedAt,
          tokenUsage: sub.tokenUsage,
        });
      }
    }
    return records;
  }

  // ─── Cleanup ──────────────────────────────────────────────────────

  cleanup(parentTabId: string): void {
    const toRemove: string[] = [];
    for (const [subId, sub] of this.subagents) {
      if (sub.parentTabId === parentTabId) {
        if (sub.status === 'running') {
          try { sub.session?.abort(); } catch { /* ignore */ }
        }
        sub.unsub();
        try { sub.session?.dispose(); } catch { /* ignore */ }
        toRemove.push(subId);
      }
    }
    for (const subId of toRemove) {
      this.subagents.delete(subId);
      this.resultResolvers.delete(subId);
    }

    // Clean up pools for this tab
    for (const [poolId, pool] of this.pools) {
      if (pool.parentTabId === parentTabId) {
        this.pools.delete(poolId);
        this.fileOwnership.delete(poolId);
      }
    }
  }

  cleanupAll(): void {
    for (const sub of this.subagents.values()) {
      if (sub.status === 'running') {
        try { sub.session?.abort(); } catch { /* ignore */ }
      }
      sub.unsub();
      try { sub.session?.dispose(); } catch { /* ignore */ }
    }
    this.subagents.clear();
    this.pools.clear();
    this.fileOwnership.clear();
    this.resultResolvers.clear();
    this.poolResolvers.clear();
    this.queue = [];
    this.runningCount = 0;
  }

  hasActiveSubagents(parentTabId: string): boolean {
    for (const sub of this.subagents.values()) {
      if (sub.parentTabId === parentTabId && (sub.status === 'running' || sub.status === 'queued')) {
        return true;
      }
    }
    return false;
  }

  // ─── Internal: start a subagent session ────────────────────────────

  private async startSubagent(
    subId: string,
    projectPath: string,
    options: SubagentSpawnOptions
  ): Promise<void> {
    const sub = this.subagents.get(subId);
    if (!sub) return;

    sub.status = 'running';
    this.sendSubagentEvent(sub, { type: 'subagent_start', subId, role: sub.role });

    const piAgentDir = getPiAgentDir();
    const projectSettings = loadProjectSettings(projectPath);
    const settingsManager = SettingsManager.create(projectPath, piAgentDir);

    // Track modified files for conflict detection
    const modifiedFilesSet = new Set<string>();

    const sandboxOptions: SandboxOptions = {
      jailEnabled: projectSettings.jail.enabled,
      yoloMode: projectSettings.yoloMode,
      allowedPaths: options.allowedPaths ?? projectSettings.jail.allowedPaths,
      tabId: sub.parentTabId,
      onStagedDiff: (diff: StagedDiff) => {
        // Track file modifications
        modifiedFilesSet.add(diff.filePath);
        sub.modifiedFiles = [...modifiedFilesSet];

        // Check file conflicts within pool
        if (sub.poolId) {
          const ownership = this.fileOwnership.get(sub.poolId);
          if (ownership) {
            const existingOwner = ownership.get(diff.filePath);
            if (existingOwner && existingOwner !== subId) {
              // File conflict detected — this will be returned as an error
              // in the tool result via the sandboxed tools system
              console.warn(
                `[SubagentManager] File conflict: ${diff.filePath} already modified by ${existingOwner}, blocked for ${subId}`
              );
              return; // Block the diff
            }
            ownership.set(diff.filePath, subId);
          }
        }

        // Forward to parent's staged diff system
        this.parentSessionManager.stagedDiffs.addDiff(diff);
        this.sendToRenderer(IPC.SANDBOX_STAGED_DIFF, {
          tabId: sub.parentTabId,
          diff,
        });
      },
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
      authStorage: this.parentSessionManager.getAuthStorage(),
      modelRegistry: this.parentSessionManager.getModelRegistry(),
      settingsManager,
      resourceLoader,
      tools: [],
      customTools,
    });

    sub.session = session;

    // Subscribe to events and track tokens
    const unsub = session.subscribe((event: AgentSessionEvent) => {
      // Forward select events to parent renderer
      this.sendSubagentEvent(sub, event);

      // Track token usage
      if (event.type === 'turn_end') {
        const usage = (event as any).usage;
        if (usage) {
          sub.tokenUsage.input += usage.inputTokens || 0;
          sub.tokenUsage.output += usage.outputTokens || 0;
        }
      }

      // Detect completion
      if (event.type === 'agent_end') {
        const resultText = extractLastAssistantText(session.state.messages);
        this.markCompleted(subId, resultText || '(no output)');
      }
    });

    sub.unsub = unsub;

    // Set timeout
    const timeoutMs = DEFAULT_TIMEOUT;
    const timeoutTimer = setTimeout(() => {
      if (sub.status === 'running') {
        this.abort(subId).catch(() => {});
        this.markFailed(subId, `Subagent timed out after ${timeoutMs}ms`);
      }
    }, timeoutMs);

    // Send the prompt
    try {
      await session.prompt(options.prompt);
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (sub.status === 'running') {
        this.markFailed(subId, err.message || String(err));
      }
      return;
    }

    clearTimeout(timeoutTimer);

    // If still running after prompt returns (shouldn't happen normally),
    // the agent_end event handler above will handle completion.
    // But as a safety net:
    if (sub.status === 'running') {
      const resultText = extractLastAssistantText(session.state.messages);
      if (resultText) {
        this.markCompleted(subId, resultText);
      }
    }
  }

  // ─── State transitions ────────────────────────────────────────────

  private markCompleted(subId: string, result: string): void {
    const sub = this.subagents.get(subId);
    if (!sub || (sub.status !== 'running' && sub.status !== 'queued')) return;

    sub.status = 'completed';
    sub.result = result;
    sub.completedAt = Date.now();
    sub.unsub();

    this.sendSubagentEvent(sub, {
      type: 'subagent_end',
      subId,
      role: sub.role,
      status: 'completed',
      result: result.slice(0, 500), // Truncate for event
      tokenUsage: sub.tokenUsage,
      modifiedFiles: sub.modifiedFiles,
    });

    this.onSubagentFinished(sub);
  }

  private markFailed(subId: string, error: string): void {
    const sub = this.subagents.get(subId);
    if (!sub || (sub.status !== 'running' && sub.status !== 'queued')) return;

    sub.status = 'failed';
    sub.error = error;
    sub.completedAt = Date.now();
    sub.unsub();

    this.sendSubagentEvent(sub, {
      type: 'subagent_end',
      subId,
      role: sub.role,
      status: 'failed',
      error,
    });

    this.onSubagentFinished(sub);
  }

  private markAborted(subId: string): void {
    const sub = this.subagents.get(subId);
    if (!sub) return;

    sub.status = 'aborted';
    sub.error = 'Aborted';
    sub.completedAt = Date.now();
    sub.unsub();

    this.sendSubagentEvent(sub, {
      type: 'subagent_end',
      subId,
      role: sub.role,
      status: 'aborted',
    });

    this.onSubagentFinished(sub);
  }

  private onSubagentFinished(sub: SubagentInternal): void {
    // Resolve any awaiting promises for this subagent
    const resolvers = this.resultResolvers.get(sub.id);
    if (resolvers) {
      const result: SubagentResult = {
        subId: sub.id,
        role: sub.role,
        result: sub.result,
        error: sub.error,
        tokenUsage: sub.tokenUsage,
        modifiedFiles: sub.modifiedFiles,
      };
      for (const resolve of resolvers) resolve(result);
      this.resultResolvers.delete(sub.id);
    }

    this.runningCount = Math.max(0, this.runningCount - 1);

    // Update pool progress
    if (sub.poolId) {
      const pool = this.pools.get(sub.poolId);
      if (pool) {
        pool.completed++;
        if (sub.status === 'failed' || sub.status === 'aborted') {
          pool.failures++;
        }
        pool.results.set(sub.id, {
          subId: sub.id,
          role: sub.role,
          result: sub.result,
          error: sub.error,
          tokenUsage: sub.tokenUsage,
          modifiedFiles: sub.modifiedFiles,
        });

        // Send pool progress event
        this.sendToRenderer(IPC.SUBAGENT_POOL_PROGRESS, {
          parentTabId: sub.parentTabId,
          poolId: sub.poolId,
          completed: pool.completed,
          total: pool.total,
          failures: pool.failures,
        });

        // Resolve pool awaiter if all subagents finished
        if (pool.completed >= pool.total) {
          const poolResolvers = this.poolResolvers.get(sub.poolId!);
          if (poolResolvers) {
            const poolResult = this.buildPoolResult(pool);
            for (const resolve of poolResolvers) resolve(poolResult);
            this.poolResolvers.delete(sub.poolId!);
          }
        }
      }
    }

    // Try to dequeue
    this.dequeueNext();

    // Dispose session after a short delay to allow event delivery
    setTimeout(() => {
      try { sub.session?.dispose(); } catch { /* ignore */ }
    }, 1000);
  }

  private dequeueNext(): void {
    while (this.runningCount < DEFAULT_MAX_CONCURRENT && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        const sub = this.subagents.get(next.subId);
        if (sub && sub.status === 'queued') {
          this.runningCount++;
          next.start();
        }
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private buildPoolResult(pool: PoolInternal): SubagentPoolResult {
    const results: SubagentResult[] = [];
    const failures: SubagentResult[] = [];
    for (const subId of pool.subagentIds) {
      const r = pool.results.get(subId);
      if (r) {
        if (r.error) failures.push(r);
        else results.push(r);
      }
    }
    return { poolId: pool.id, results, failures };
  }

  private getTabSubagentCount(parentTabId: string): number {
    let count = 0;
    for (const sub of this.subagents.values()) {
      if (sub.parentTabId === parentTabId && (sub.status === 'running' || sub.status === 'queued')) {
        count++;
      }
    }
    return count;
  }

  private sendSubagentEvent(sub: SubagentInternal, event: Record<string, unknown>): void {
    this.sendToRenderer(IPC.SUBAGENT_EVENT, {
      parentTabId: sub.parentTabId,
      subId: sub.id,
      event,
    });
  }

  private sendToRenderer(channel: string, data: unknown): void {
    broadcastToRenderer(channel, data);
  }
}
