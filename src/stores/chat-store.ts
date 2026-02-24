/**
 * @file Chat store — manages conversation messages, streaming state, model info, and token usage per tab.
 */
import { create } from 'zustand';

/**
 * A single message in the conversation history.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string; // markdown text
  timestamp: number;
  isStreaming?: boolean;
  thinkingContent?: string; // collapsible thinking text
  toolCalls?: ToolCallInfo[];
  isError?: boolean;
  retryInfo?: { attempt: number; maxAttempts: number; delayMs: number };
}

/**
 * Tool call metadata for a single tool invocation within a message.
 */
export interface ToolCallInfo {
  id: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: string;
  startedAt: number;
  completedAt?: number;
}

/**
 * Model metadata returned from the SDK.
 */
export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

/**
 * Token usage breakdown for a session.
 */
export interface SessionTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/**
 * Context window utilization metrics.
 */
export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

interface ChatState {
  // Per-tab messages
  messagesByTab: Record<string, ChatMessage[]>;
  // Streaming state per tab
  streamingByTab: Record<string, boolean>;
  // Current model per tab (display string for backward compat)
  modelByTab: Record<string, string>;
  // Full model info per tab
  modelInfoByTab: Record<string, ModelInfo>;
  // Current thinking level per tab
  thinkingByTab: Record<string, string>;
  // Session token usage per tab
  tokensByTab: Record<string, SessionTokens>;
  // Context window usage per tab
  contextUsageByTab: Record<string, ContextUsage>;
  // Session cost per tab
  costByTab: Record<string, number>;
  // Queued steering/follow-up messages per tab
  queuedByTab: Record<string, { steering: string[]; followUp: string[] }>;
  // Streaming index cache per tab (performance optimization)
  streamingIndexByTab: Record<string, number>;

  // Actions
  addMessage: (tabId: string, message: ChatMessage) => void;
  updateMessage: (tabId: string, messageId: string, updates: Partial<ChatMessage>) => void;
  appendToLastAssistant: (tabId: string, textDelta: string) => void;
  appendThinking: (tabId: string, thinkingDelta: string) => void;
  addToolCall: (tabId: string, toolCall: ToolCallInfo) => void;
  updateToolCall: (tabId: string, toolCallId: string, updates: Partial<ToolCallInfo>) => void;
  setStreaming: (tabId: string, streaming: boolean) => void;
  setModel: (tabId: string, model: string) => void;
  setModelInfo: (tabId: string, info: ModelInfo) => void;
  setThinking: (tabId: string, level: string) => void;
  setTokens: (tabId: string, tokens: SessionTokens) => void;
  setContextUsage: (tabId: string, usage: ContextUsage) => void;
  setCost: (tabId: string, cost: number) => void;
  setQueued: (tabId: string, queued: { steering: string[]; followUp: string[] }) => void;
  clearMessages: (tabId: string) => void;
  getMessages: (tabId: string) => ChatMessage[];
}

/**
 * Get the index of the last assistant message, using cache for hot path.
 * @param messages - The message array
 * @param tabId - Current tab ID (for cache lookup)
 * @param streamingIndexByTab - Cache map of tab → index
 * @param requireStreaming - If true, only return messages with `isStreaming: true`
 */
function getLastAssistantIndex(
  messages: ChatMessage[],
  tabId: string,
  streamingIndexByTab: Record<string, number>,
  requireStreaming: boolean
): number {
  // Check cache first — valid if index points to correct message type
  const cached = streamingIndexByTab[tabId];
  if (cached !== undefined && cached >= 0 && cached < messages.length) {
    const msg = messages[cached];
    if (msg.role === 'assistant' && (!requireStreaming || msg.isStreaming)) {
      return cached;
    }
  }
  // Cache miss — fallback to search
  return messages.findLastIndex(
    msg => msg.role === 'assistant' && (!requireStreaming || msg.isStreaming)
  );
}

/**
 * Chat store — manages conversation messages, streaming state, model info, and token usage per tab.
 * Messages are stored in a per-tab map to support multi-tab sessions.
 */
export const useChatStore = create<ChatState>((set, get) => ({
  messagesByTab: {},
  streamingByTab: {},
  modelByTab: {},
  modelInfoByTab: {},
  thinkingByTab: {},
  tokensByTab: {},
  contextUsageByTab: {},
  costByTab: {},
  queuedByTab: {},
  streamingIndexByTab: {},

  addMessage: (tabId, message) => {
    set(state => {
      const updatedMessages = [...(state.messagesByTab[tabId] || []), message];
      const updates: Partial<ChatState> = {
        messagesByTab: {
          ...state.messagesByTab,
          [tabId]: updatedMessages,
        },
      };
      
      // Update cache when adding assistant message
      if (message.role === 'assistant') {
        updates.streamingIndexByTab = {
          ...state.streamingIndexByTab,
          [tabId]: updatedMessages.length - 1,
        };
      }
      
      return updates;
    });
  },

  updateMessage: (tabId, messageId, updates) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      return {
        messagesByTab: {
          ...state.messagesByTab,
          [tabId]: messages.map(msg =>
            msg.id === messageId ? { ...msg, ...updates } : msg
          ),
        },
      };
    });
  },

  /** Append a text delta to the last streaming assistant message (used during streaming). */
  appendToLastAssistant: (tabId, textDelta) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const lastAssistantIndex = getLastAssistantIndex(messages, tabId, state.streamingIndexByTab, true);
      
      if (lastAssistantIndex === -1) return state;

      const updatedMessages = [...messages];
      updatedMessages[lastAssistantIndex] = {
        ...updatedMessages[lastAssistantIndex],
        content: updatedMessages[lastAssistantIndex].content + textDelta,
      };

      return {
        messagesByTab: {
          ...state.messagesByTab,
          [tabId]: updatedMessages,
        },
      };
    });
  },

  /** Append a thinking delta to the last streaming assistant message (used during thinking mode). */
  appendThinking: (tabId, thinkingDelta) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const lastAssistantIndex = getLastAssistantIndex(messages, tabId, state.streamingIndexByTab, true);
      
      if (lastAssistantIndex === -1) return state;

      const updatedMessages = [...messages];
      const currentThinking = updatedMessages[lastAssistantIndex].thinkingContent || '';
      updatedMessages[lastAssistantIndex] = {
        ...updatedMessages[lastAssistantIndex],
        thinkingContent: currentThinking + thinkingDelta,
      };

      return {
        messagesByTab: {
          ...state.messagesByTab,
          [tabId]: updatedMessages,
        },
      };
    });
  },

  /** Add a new tool call to the last assistant message. */
  addToolCall: (tabId, toolCall) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const lastAssistantIndex = getLastAssistantIndex(messages, tabId, state.streamingIndexByTab, false);
      
      if (lastAssistantIndex === -1) return state;

      const updatedMessages = [...messages];
      const currentToolCalls = updatedMessages[lastAssistantIndex].toolCalls || [];
      updatedMessages[lastAssistantIndex] = {
        ...updatedMessages[lastAssistantIndex],
        toolCalls: [...currentToolCalls, toolCall],
      };

      return {
        messagesByTab: {
          ...state.messagesByTab,
          [tabId]: updatedMessages,
        },
      };
    });
  },

  updateToolCall: (tabId, toolCallId, updates) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const lastAssistantIndex = getLastAssistantIndex(messages, tabId, state.streamingIndexByTab, false);
      
      if (lastAssistantIndex === -1) return state;

      const updatedMessages = [...messages];
      const toolCalls = updatedMessages[lastAssistantIndex].toolCalls || [];
      updatedMessages[lastAssistantIndex] = {
        ...updatedMessages[lastAssistantIndex],
        toolCalls: toolCalls.map(tc =>
          tc.id === toolCallId ? { ...tc, ...updates } : tc
        ),
      };

      return {
        messagesByTab: {
          ...state.messagesByTab,
          [tabId]: updatedMessages,
        },
      };
    });
  },

  setStreaming: (tabId, streaming) => {
    set(state => ({
      streamingByTab: {
        ...state.streamingByTab,
        [tabId]: streaming,
      },
    }));
  },

  setModel: (tabId, model) => {
    set(state => ({
      modelByTab: {
        ...state.modelByTab,
        [tabId]: model,
      },
    }));
  },

  setModelInfo: (tabId, info) => {
    set(state => ({
      modelInfoByTab: {
        ...state.modelInfoByTab,
        [tabId]: info,
      },
      modelByTab: {
        ...state.modelByTab,
        [tabId]: info.name || info.id,
      },
    }));
  },

  setThinking: (tabId, level) => {
    set(state => ({
      thinkingByTab: {
        ...state.thinkingByTab,
        [tabId]: level,
      },
    }));
  },

  setTokens: (tabId, tokens) => {
    set(state => ({
      tokensByTab: {
        ...state.tokensByTab,
        [tabId]: tokens,
      },
    }));
  },

  setContextUsage: (tabId, usage) => {
    set(state => ({
      contextUsageByTab: {
        ...state.contextUsageByTab,
        [tabId]: usage,
      },
    }));
  },

  setCost: (tabId, cost) => {
    set(state => ({
      costByTab: {
        ...state.costByTab,
        [tabId]: cost,
      },
    }));
  },

  setQueued: (tabId, queued) => {
    set(state => ({
      queuedByTab: {
        ...state.queuedByTab,
        [tabId]: queued,
      },
    }));
  },

  clearMessages: (tabId) => {
    set(state => {
      const newStreamingIndexByTab = { ...state.streamingIndexByTab };
      delete newStreamingIndexByTab[tabId];
      
      return {
        messagesByTab: {
          ...state.messagesByTab,
          [tabId]: [],
        },
        streamingIndexByTab: newStreamingIndexByTab,
      };
    });
  },

  getMessages: (tabId) => {
    return get().messagesByTab[tabId] || [];
  },
}));
