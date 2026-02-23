import { useEffect, useCallback } from 'react';
import type { AgentSessionEvent, ContextUsage, ModelCycleResult } from '@mariozechner/pi-coding-agent';
import type { ImageContent } from '@mariozechner/pi-ai';
import { useChatStore } from '../stores/chat-store';
import { useTabStore } from '../stores/tab-store';
import { useProjectStore } from '../stores/project-store';
import { useSessionStore } from '../stores/session-store';
import { useMemoryStore } from '../stores/memory-store';
import { useTaskStore } from '../stores/task-store';
import { useUIStore } from '../stores/ui-store';
import { invoke, on } from '../lib/ipc-client';
import { IPC } from '../../shared/ipc';

interface AgentEventPayload {
  tabId: string;
  event: AgentSessionEvent & { content?: string };
}

interface MemoryUpdatedPayload {
  count: number;
  preview: string;
}

interface ModelInfo {
  provider: string;
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

/** Reload the sidebar session list with current project paths */
function refreshSessionList() {
  const tabs = useTabStore.getState().tabs;
  const paths = [...new Set(tabs.map(t => t.projectPath).filter(Boolean))] as string[];
  useSessionStore.getState().loadSessions(paths);
}

/** Fetch session stats and context usage from main process and update the store */
async function refreshSessionStats(tabId: string) {
  const { setTokens, setContextUsage, setCost, setModelInfo } = useChatStore.getState();

  try {
    const [stats, contextUsage, modelInfo] = await Promise.all([
      invoke(IPC.SESSION_GET_STATS, tabId) as Promise<{ tokens?: Record<string, number>; cost?: number } | null>,
      invoke(IPC.SESSION_GET_CONTEXT_USAGE, tabId) as Promise<ContextUsage | null>,
      invoke(IPC.MODEL_GET_INFO, tabId) as Promise<ModelInfo | null>,
    ]);

    if (stats && typeof stats === 'object' && stats.tokens) {
      setTokens(tabId, stats.tokens);
      if (typeof stats.cost === 'number') {
        setCost(tabId, stats.cost);
      }
    }
    if (contextUsage) {
      setContextUsage(tabId, contextUsage);
    }
    if (modelInfo) {
      setModelInfo(tabId, modelInfo);
    }
  } catch {
    // Ignore — session may not exist yet
  }
}

export function useAgentSession() {
  const activeTabId = useTabStore(s => s.activeTabId);
  const {
    addMessage, appendToLastAssistant, appendThinking,
    addToolCall, updateToolCall, setStreaming, setModel,
    setModelInfo, setThinking, updateMessage
  } = useChatStore();

  // Listen for agent events from main process
  useEffect(() => {
    const unsub = on(IPC.AGENT_EVENT, (payload: AgentEventPayload) => {
      const { tabId, event } = payload;
      handleEvent(tabId, event);
    });
    return unsub;
  }, []);

  // Listen for memory events from main process
  useEffect(() => {
    const unsubUpdated = on(IPC.MEMORY_UPDATED, (payload: MemoryUpdatedPayload) => {
      const { count, preview } = payload;
      useMemoryStore.getState().setLastUpdate({ count, preview });
      // Refresh memory count
      const projectPath = useProjectStore.getState().projectPath;
      if (projectPath) {
        useMemoryStore.getState().loadMemoryCount(projectPath);
      }
    });

    const unsubShowPanel = on(IPC.MEMORY_SHOW_PANEL, () => {
      useUIStore.getState().setSidebarPane('memory');
      if (!useUIStore.getState().sidebarVisible) {
        useUIStore.getState().toggleSidebar();
      }
    });

    // Tasks IPC listeners
    const unsubTasksShowPanel = on(IPC.TASKS_SHOW_PANEL, () => {
      useUIStore.getState().setSidebarPane('tasks');
      if (!useUIStore.getState().sidebarVisible) {
        useUIStore.getState().toggleSidebar();
      }
    });

    const unsubTasksShowCreate = on(IPC.TASKS_SHOW_CREATE, () => {
      useTaskStore.getState().setShowCreateDialog(true);
    });

    return () => {
      unsubUpdated();
      unsubShowPanel();
      unsubTasksShowPanel();
      unsubTasksShowCreate();
    };
  }, []);

  function handleEvent(tabId: string, event: AgentSessionEvent & { content?: string }) {
    switch (event.type) {
      case 'system_message':
        // Memory command result — show as a system message in chat
        addMessage(tabId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: event.content,
          timestamp: Date.now(),
        });
        // Refresh memory count after save/forget
        {
          const projectPath = useProjectStore.getState().projectPath;
          if (projectPath) {
            useMemoryStore.getState().loadMemoryCount(projectPath);
          }
        }
        break;
      case 'message_start':
        if (event.message?.role === 'assistant') {
          addMessage(tabId, {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            toolCalls: [],
          });
        }
        break;
      case 'message_update': {
        const sub = event.assistantMessageEvent;
        if (!sub) break;
        if (sub.type === 'text_delta') {
          appendToLastAssistant(tabId, sub.delta);
        } else if (sub.type === 'thinking_delta') {
          appendThinking(tabId, sub.delta);
        }
        break;
      }
      case 'message_end': {
        // Mark the last assistant message as done streaming
        const msgs = useChatStore.getState().getMessages(tabId);
        const last = msgs[msgs.length - 1];
        if (last?.isStreaming) {
          updateMessage(tabId, last.id, { isStreaming: false });
        }
        refreshSessionStats(tabId);
        break;
      }
      case 'turn_end':
        setStreaming(tabId, false);
        refreshSessionStats(tabId);
        refreshSessionList();
        refreshQueued(tabId);
        break;
      case 'agent_start':
        setStreaming(tabId, true);
        break;
      case 'agent_end':
        setStreaming(tabId, false);
        refreshSessionStats(tabId);
        refreshSessionList();
        setQueued(tabId, { steering: [], followUp: [] });
        break;
      case 'tool_execution_start':
        addToolCall(tabId, {
          id: event.toolCallId ?? crypto.randomUUID(),
          toolName: event.toolName ?? 'unknown',
          status: 'running',
          args: event.args,
          startedAt: Date.now(),
        });
        break;
      case 'tool_execution_end':
        updateToolCall(tabId, event.toolCallId, {
          status: 'completed',
          result: typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
          completedAt: Date.now(),
        });
        break;
      case 'auto_retry_start': {
        const retryMsgs = useChatStore.getState().getMessages(tabId);
        const lastRetry = retryMsgs[retryMsgs.length - 1];
        if (lastRetry) {
          updateMessage(tabId, lastRetry.id, {
            retryInfo: { attempt: event.attempt, maxAttempts: event.maxAttempts, delayMs: event.delayMs }
          });
        }
        break;
      }
      case 'auto_retry_end': {
        // Clear retry info
        const clearRetryMsgs = useChatStore.getState().getMessages(tabId);
        const lastClearRetry = clearRetryMsgs[clearRetryMsgs.length - 1];
        if (lastClearRetry?.retryInfo) {
          updateMessage(tabId, lastClearRetry.id, { retryInfo: undefined });
        }
        break;
      }
    }
  }

  const sendMessage = useCallback(async (text: string, images?: ImageContent[]) => {
    if (!activeTabId) return;

    const projectPath = useProjectStore.getState().projectPath;

    const isSlashCommand = text.startsWith('/');

    // Auto-rename tab on first message if still "New Chat"
    // Don't rename for slash commands
    if (!isSlashCommand) {
      const tab = useTabStore.getState().tabs.find(t => t.id === activeTabId);
      if (tab && tab.title === 'New Chat') {
        // Take up to first 40 chars of the message, trimmed to a word boundary
        const raw = text.replace(/\n/g, ' ').trim();
        const title = raw.length <= 40 ? raw : raw.slice(0, 40).replace(/\s+\S*$/, '') + '…';
        if (title) {
          useTabStore.getState().updateTab(activeTabId, { title });
        }
      }
    }

    // Add user message to store immediately — but skip slash commands
    if (!isSlashCommand) {
      addMessage(activeTabId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      });
    }

    // Prompt — session is lazily created in main process on first call
    // Pass sessionPath so restored tabs continue the right session (not create a new one)
    const tab = useTabStore.getState().tabs.find(t => t.id === activeTabId);
    const sessionPath = tab?.sessionPath || null;
    try {
      await invoke(IPC.AGENT_PROMPT, activeTabId, text, projectPath, images, sessionPath);
      refreshSessionList();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      let friendly = raw
        .replace(/^Error:\s*/i, '')
        .replace(/Error invoking remote method '[^']+':?\s*/i, '')
        .replace(/^Error:\s*/i, '')
        .trim();

      if (/no project selected/i.test(friendly)) {
        friendly = 'No project open. Open a project first, then try again.';
      }

      addMessage(activeTabId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: friendly,
        timestamp: Date.now(),
        isError: true,
      });
    }
  }, [activeTabId, addMessage]);

  const { setQueued } = useChatStore();

  const refreshQueued = useCallback(async (tabId?: string) => {
    const id = tabId || activeTabId;
    if (!id) return;
    try {
      const result = await invoke(IPC.AGENT_GET_QUEUED, id) as { steering: string[]; followUp: string[] };
      setQueued(id, result);
    } catch { /* ignore */ }
  }, [activeTabId, setQueued]);

  const steerAgent = useCallback(async (text: string) => {
    if (!activeTabId) return;
    try {
      await invoke(IPC.AGENT_STEER, activeTabId, text);
      await refreshQueued();
    } catch { /* ignore */ }
  }, [activeTabId, refreshQueued]);

  const followUpAgent = useCallback(async (text: string) => {
    if (!activeTabId) return;
    try {
      await invoke(IPC.AGENT_FOLLOW_UP, activeTabId, text);
      await refreshQueued();
    } catch { /* ignore */ }
  }, [activeTabId, refreshQueued]);

  const abortAgent = useCallback(async () => {
    if (!activeTabId) return;
    try {
      await invoke(IPC.AGENT_ABORT, activeTabId);
      // Clear queued messages display on abort
      setQueued(activeTabId, { steering: [], followUp: [] });
    } catch { /* ignore */ }
  }, [activeTabId, setQueued]);

  const cycleModel = useCallback(async () => {
    if (!activeTabId) return;
    const result = await invoke(IPC.MODEL_CYCLE, activeTabId) as ModelCycleResult | null;
    if (result && result.model) {
      const model = result.model;
      setModelInfo(activeTabId, {
        provider: model.provider || '',
        id: model.id || '',
        name: model.name || model.id || '',
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        reasoning: model.reasoning,
      });
    }
    if (result && result.thinkingLevel) {
      setThinking(activeTabId, result.thinkingLevel);
    }
  }, [activeTabId, setModelInfo, setThinking]);

  const selectModel = useCallback(async (provider: string, modelId: string) => {
    if (!activeTabId) return;
    const result = await invoke(IPC.MODEL_SET, activeTabId, provider, modelId) as ModelInfo | null;
    if (result) {
      setModelInfo(activeTabId, {
        provider: result.provider || provider,
        id: result.id || modelId,
        name: result.name || result.id,
        contextWindow: result.contextWindow,
        maxTokens: result.maxTokens,
        reasoning: result.reasoning,
      });
    }
  }, [activeTabId, setModelInfo]);

  const cycleThinking = useCallback(async () => {
    if (!activeTabId) return;
    const result = await invoke(IPC.MODEL_CYCLE_THINKING, activeTabId) as { thinkingLevel?: string } | string | null;
    if (result && typeof result === 'object' && 'thinkingLevel' in result && result.thinkingLevel) {
      setThinking(activeTabId, result.thinkingLevel);
    } else if (typeof result === 'string') {
      setThinking(activeTabId, result);
    }
  }, [activeTabId, setThinking]);

  return { sendMessage, steerAgent, followUpAgent, abortAgent, cycleModel, selectModel, cycleThinking, refreshQueued };
}
