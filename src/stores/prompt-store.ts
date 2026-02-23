import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import type { PromptTemplate, PromptCreateInput, PromptUpdateInput } from '../../shared/types';
import { invoke } from '../lib/ipc-client';

interface PromptState {
  prompts: PromptTemplate[];
  loading: boolean;

  // Actions
  loadPrompts: () => Promise<void>;
  getById: (id: string) => Promise<PromptTemplate | null>;
  getByCommand: (command: string) => Promise<PromptTemplate | null>;
  getCommands: () => Promise<Array<{ command: string; promptId: string; title: string; icon: string; description: string }>>;
  getSystemCommands: () => Promise<Array<{ command: string; owner: string; description: string }>>;
  validateCommand: (command: string, excludePromptId?: string) => Promise<{ valid: boolean; error?: string }>;
  createPrompt: (input: PromptCreateInput, projectPath?: string) => Promise<PromptTemplate | null>;
  updatePrompt: (id: string, updates: PromptUpdateInput) => Promise<PromptTemplate | null>;
  deletePrompt: (id: string) => Promise<boolean>;
  unhidePrompt: (id: string) => Promise<boolean>;
  fillTemplate: (content: string, values: Record<string, string>) => Promise<string>;
  reload: () => Promise<void>;
}

export const usePromptStore = create<PromptState>((set) => ({
  prompts: [],
  loading: false,

  loadPrompts: async () => {
    set({ loading: true });
    try {
      const prompts = await invoke(IPC.PROMPTS_GET_ALL) as PromptTemplate[];
      set({ prompts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  getById: async (id: string) => {
    try {
      return await invoke(IPC.PROMPTS_GET, id) as PromptTemplate | null;
    } catch {
      return null;
    }
  },

  getByCommand: async (command: string) => {
    try {
      return await invoke(IPC.PROMPTS_GET_BY_COMMAND, command) as PromptTemplate | null;
    } catch {
      return null;
    }
  },

  getCommands: async () => {
    try {
      return await invoke(IPC.PROMPTS_GET_COMMANDS) as Array<{ command: string; promptId: string; title: string; icon: string; description: string }>;
    } catch {
      return [];
    }
  },

  getSystemCommands: async () => {
    try {
      return await invoke(IPC.PROMPTS_GET_SYSTEM_COMMANDS) as Array<{ command: string; owner: string; description: string }>;
    } catch {
      return [];
    }
  },

  validateCommand: async (command: string, excludePromptId?: string) => {
    try {
      return await invoke(IPC.PROMPTS_VALIDATE_COMMAND, command, excludePromptId) as { valid: boolean; error?: string };
    } catch {
      return { valid: false, error: 'Validation failed' };
    }
  },

  createPrompt: async (input: PromptCreateInput, projectPath?: string) => {
    try {
      const prompt = await invoke(IPC.PROMPTS_CREATE, input, projectPath) as PromptTemplate;
      // Reload prompts after creation
      const prompts = await invoke(IPC.PROMPTS_GET_ALL) as PromptTemplate[];
      set({ prompts });
      return prompt;
    } catch {
      return null;
    }
  },

  updatePrompt: async (id: string, updates: PromptUpdateInput) => {
    try {
      const prompt = await invoke(IPC.PROMPTS_UPDATE, id, updates) as PromptTemplate | null;
      const prompts = await invoke(IPC.PROMPTS_GET_ALL) as PromptTemplate[];
      set({ prompts });
      return prompt;
    } catch {
      return null;
    }
  },

  deletePrompt: async (id: string) => {
    try {
      const result = await invoke(IPC.PROMPTS_DELETE, id) as boolean;
      const prompts = await invoke(IPC.PROMPTS_GET_ALL) as PromptTemplate[];
      set({ prompts });
      return result;
    } catch {
      return false;
    }
  },

  unhidePrompt: async (id: string) => {
    try {
      const result = await invoke(IPC.PROMPTS_UNHIDE, id) as boolean;
      const prompts = await invoke(IPC.PROMPTS_GET_ALL) as PromptTemplate[];
      set({ prompts });
      return result;
    } catch {
      return false;
    }
  },

  fillTemplate: async (content: string, values: Record<string, string>) => {
    try {
      return await invoke(IPC.PROMPTS_FILL, content, values) as string;
    } catch {
      return content;
    }
  },

  reload: async () => {
    try {
      await invoke(IPC.PROMPTS_RELOAD);
      const prompts = await invoke(IPC.PROMPTS_GET_ALL) as PromptTemplate[];
      set({ prompts });
    } catch {
      // Silently fail
    }
  },
}));
