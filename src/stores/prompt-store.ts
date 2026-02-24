/**
 * @file Prompt store — manages prompt templates, commands, validation, and CRUD operations.
 */
import { create } from 'zustand';
import { IPC } from '../../shared/ipc';
import type { PromptTemplate, PromptCreateInput, PromptUpdateInput } from '../../shared/types';
import { invoke } from '../lib/ipc-client';
import { invokeAndReload } from '../lib/invoke-and-reload';

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

/**
 * Prompt store — manages prompt templates, commands, validation, and CRUD operations.
 */
export const usePromptStore = create<PromptState>((set, get) => {
  /**
   * Helper to reload prompts from the main process.
   */
  const reloadPrompts = async () => {
    const prompts = await invoke(IPC.PROMPTS_GET_ALL) as PromptTemplate[];
    set({ prompts });
  };

  return {
    prompts: [],
    loading: false,

        loadPrompts: async () => {
        set({ loading: true });
        try {
          await reloadPrompts();
          set({ loading: false });
        } catch { /* Expected: IPC may fail during app shutdown */
          set({ loading: false });
        }
      },

      getById: async (id: string) => {
        try {
          return await invoke(IPC.PROMPTS_GET, id) as PromptTemplate | null;
        } catch { /* Expected: prompt may not exist */
          return null;
        }
      },

      getByCommand: async (command: string) => {
        try {
          return await invoke(IPC.PROMPTS_GET_BY_COMMAND, command) as PromptTemplate | null;
        } catch { /* Expected: command may not be registered */
          return null;
        }
      },

      getCommands: async () => {
        try {
          return await invoke(IPC.PROMPTS_GET_COMMANDS) as Array<{ command: string; promptId: string; title: string; icon: string; description: string }>;
        } catch { /* Expected: IPC may fail during app shutdown */
          return [];
        }
      },

      getSystemCommands: async () => {
        try {
          return await invoke(IPC.PROMPTS_GET_SYSTEM_COMMANDS) as Array<{ command: string; owner: string; description: string }>;
        } catch { /* Expected: IPC may fail during app shutdown */
          return [];
        }
      },

      validateCommand: async (command: string, excludePromptId?: string) => {
        try {
          return await invoke(IPC.PROMPTS_VALIDATE_COMMAND, command, excludePromptId) as { valid: boolean; error?: string };
        } catch { /* Expected: validation may fail during app shutdown */
          return { valid: false, error: 'Validation failed' };
        }
      },

      createPrompt: async (input: PromptCreateInput, projectPath?: string) => {
        return await invokeAndReload<PromptTemplate>(
          IPC.PROMPTS_CREATE,
          [input, projectPath],
          reloadPrompts
        );
      },

      updatePrompt: async (id: string, updates: PromptUpdateInput) => {
        return await invokeAndReload<PromptTemplate>(
          IPC.PROMPTS_UPDATE,
          [id, updates],
          reloadPrompts
        );
      },

      deletePrompt: async (id: string) => {
        const result = await invokeAndReload<boolean>(
          IPC.PROMPTS_DELETE,
          [id],
          reloadPrompts
        );
        return result ?? false;
      },

      unhidePrompt: async (id: string) => {
        const result = await invokeAndReload<boolean>(
          IPC.PROMPTS_UNHIDE,
          [id],
          reloadPrompts
        );
        return result ?? false;
      },

      fillTemplate: async (content: string, values: Record<string, string>) => {
        try {
          return await invoke(IPC.PROMPTS_FILL, content, values) as string;
        } catch { /* Expected: template fill may fail, return original content */
          return content;
        }
      },

      reload: async () => {
        await invokeAndReload(
          IPC.PROMPTS_RELOAD,
          [],
          reloadPrompts
        );
      },
    };
}
);
