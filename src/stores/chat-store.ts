import { create } from 'zustand';

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

export interface ToolCallInfo {
  id: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  args?: Record<string, unknown>;
  result?: string;
  startedAt: number;
  completedAt?: number;
}

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

export interface SessionTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

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

  addMessage: (tabId, message) => {
    set(state => ({
      messagesByTab: {
        ...state.messagesByTab,
        [tabId]: [...(state.messagesByTab[tabId] || []), message],
      },
    }));
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

  appendToLastAssistant: (tabId, textDelta) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const lastAssistantIndex = messages.findLastIndex(
        msg => msg.role === 'assistant' && msg.isStreaming
      );
      
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

  appendThinking: (tabId, thinkingDelta) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const lastAssistantIndex = messages.findLastIndex(
        msg => msg.role === 'assistant' && msg.isStreaming
      );
      
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

  addToolCall: (tabId, toolCall) => {
    set(state => {
      const messages = state.messagesByTab[tabId] || [];
      const lastAssistantIndex = messages.findLastIndex(
        msg => msg.role === 'assistant'
      );
      
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
      const lastAssistantIndex = messages.findLastIndex(
        msg => msg.role === 'assistant'
      );
      
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
    set(state => ({
      messagesByTab: {
        ...state.messagesByTab,
        [tabId]: [],
      },
    }));
  },

  getMessages: (tabId) => {
    return get().messagesByTab[tabId] || [];
  },
}));
