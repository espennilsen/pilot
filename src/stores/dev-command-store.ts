import { create } from 'zustand';
import type { DevCommand, DevCommandState } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke, on } from '../lib/ipc-client';

interface DevCommandStore {
  commands: DevCommand[];
  states: Record<string, DevCommandState>;
  /** Tunnel URLs for dev servers (commandId → tunnelUrl) */
  tunnelUrls: Record<string, string>;
  expandedCommandId: string | null;
  showOutput: boolean;

  setShowOutput: (show: boolean) => void;
  loadCommands: (projectPath: string) => Promise<void>;
  saveCommands: (projectPath: string, commands: DevCommand[]) => Promise<void>;
  runCommand: (commandId: string) => Promise<void>;
  stopCommand: (commandId: string) => Promise<void>;
  setExpandedCommand: (id: string | null) => void;
  updateState: (commandId: string, state: DevCommandState) => void;
  appendOutput: (commandId: string, output: string) => void;
  setServerUrl: (commandId: string, localUrl: string, tunnelUrl?: string) => void;
}

export const useDevCommandStore = create<DevCommandStore>((set, get) => ({
  commands: [],
  states: {},
  tunnelUrls: {},
  expandedCommandId: null,
  showOutput: true,

  setShowOutput: (show: boolean) => set({ showOutput: show }),

  loadCommands: async (projectPath: string) => {
    const commands = await invoke(IPC.DEV_LOAD_CONFIG, projectPath);
    set({ commands });
  },

  saveCommands: async (projectPath: string, commands: DevCommand[]) => {
    await invoke(IPC.DEV_SAVE_CONFIG, projectPath, commands);
    set({ commands });
  },

  runCommand: async (commandId: string) => {
    const state = await invoke(IPC.DEV_RUN_COMMAND, commandId);
    set((s) => ({
      states: { ...s.states, [commandId]: state },
    }));
  },

  stopCommand: async (commandId: string) => {
    await invoke(IPC.DEV_STOP_COMMAND, commandId);
    // Clear detected URL and tunnel when stopped
    set((s) => {
      const { [commandId]: _, ...remainingTunnels } = s.tunnelUrls;
      return { tunnelUrls: remainingTunnels };
    });
  },

  setExpandedCommand: (id: string | null) => set({ expandedCommandId: id }),

  updateState: (commandId: string, state: DevCommandState) => {
    set((s) => ({
      states: { ...s.states, [commandId]: state },
    }));
  },

  appendOutput: (commandId: string, output: string) => {
    set((s) => {
      const currentState = s.states[commandId] || {
        commandId,
        status: 'idle',
        pid: null,
        output: '',
        exitCode: null,
        startedAt: null,
        finishedAt: null,
        detectedUrl: null,
      };
      return {
        states: {
          ...s.states,
          [commandId]: {
            ...currentState,
            output: currentState.output + output,
          },
        },
      };
    });
  },

  setServerUrl: (commandId: string, localUrl: string, tunnelUrl?: string) => {
    set((s) => ({
      states: {
        ...s.states,
        [commandId]: {
          ...(s.states[commandId] || {
            commandId, status: 'running', pid: null, output: '',
            exitCode: null, startedAt: null, finishedAt: null, detectedUrl: null,
          }),
          detectedUrl: localUrl,
        },
      },
      tunnelUrls: tunnelUrl
        ? { ...s.tunnelUrls, [commandId]: tunnelUrl }
        : s.tunnelUrls,
    }));
  },
}));

// Set up IPC listeners
if (typeof window !== 'undefined' && window.api) {
  on(IPC.DEV_COMMAND_OUTPUT, (commandId: string, output: string) => {
    useDevCommandStore.getState().appendOutput(commandId, output);
  });

  on(IPC.DEV_COMMAND_STATUS, (commandId: string, state: DevCommandState) => {
    useDevCommandStore.getState().updateState(commandId, state);
  });

  on(IPC.DEV_SERVER_URL, (commandId: string, localUrl: string, tunnelUrl?: string) => {
    useDevCommandStore.getState().setServerUrl(commandId, localUrl, tunnelUrl);
  });
}
