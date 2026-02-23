import { create } from 'zustand';
import type { SubagentRecord, SubagentPoolProgress } from '../../shared/types';

interface SubagentState {
  // Per-tab subagent records
  subagentsByTab: Record<string, SubagentRecord[]>;
  // Per-tab pool progress
  poolProgressByTab: Record<string, Record<string, SubagentPoolProgress>>;
  // Orchestrator mode per tab
  orchestratorByTab: Record<string, boolean>;

  // Actions
  setSubagents: (tabId: string, subagents: SubagentRecord[]) => void;
  updateSubagent: (tabId: string, subId: string, updates: Partial<SubagentRecord>) => void;
  addSubagent: (tabId: string, subagent: SubagentRecord) => void;
  removeSubagent: (tabId: string, subId: string) => void;
  setPoolProgress: (tabId: string, poolId: string, progress: SubagentPoolProgress) => void;
  setOrchestrator: (tabId: string, active: boolean) => void;
  clearTab: (tabId: string) => void;
  getActiveCount: (tabId: string) => number;
  getTotalTokens: (tabId: string) => { input: number; output: number };
}

export const useSubagentStore = create<SubagentState>((set, get) => ({
  subagentsByTab: {},
  poolProgressByTab: {},
  orchestratorByTab: {},

  setSubagents: (tabId, subagents) => {
    set((state) => ({
      subagentsByTab: {
        ...state.subagentsByTab,
        [tabId]: subagents,
      },
    }));
  },

  updateSubagent: (tabId, subId, updates) => {
    set((state) => {
      const current = state.subagentsByTab[tabId] || [];
      const existing = current.find((s) => s.id === subId);

      if (existing) {
        return {
          subagentsByTab: {
            ...state.subagentsByTab,
            [tabId]: current.map((s) =>
              s.id === subId ? { ...s, ...updates } : s
            ),
          },
        };
      }

      // If not found, add it as a new record (from event)
      if (updates.id) {
        return {
          subagentsByTab: {
            ...state.subagentsByTab,
            [tabId]: [...current, updates as SubagentRecord],
          },
        };
      }

      return state;
    });
  },

  addSubagent: (tabId, subagent) => {
    set((state) => ({
      subagentsByTab: {
        ...state.subagentsByTab,
        [tabId]: [...(state.subagentsByTab[tabId] || []), subagent],
      },
    }));
  },

  removeSubagent: (tabId, subId) => {
    set((state) => ({
      subagentsByTab: {
        ...state.subagentsByTab,
        [tabId]: (state.subagentsByTab[tabId] || []).filter(
          (s) => s.id !== subId
        ),
      },
    }));
  },

  setPoolProgress: (tabId, poolId, progress) => {
    set((state) => ({
      poolProgressByTab: {
        ...state.poolProgressByTab,
        [tabId]: {
          ...(state.poolProgressByTab[tabId] || {}),
          [poolId]: progress,
        },
      },
    }));
  },

  setOrchestrator: (tabId, active) => {
    set((state) => ({
      orchestratorByTab: {
        ...state.orchestratorByTab,
        [tabId]: active,
      },
    }));
  },

  clearTab: (tabId) => {
    set((state) => {
      const { [tabId]: _subs, ...restSubs } = state.subagentsByTab;
      const { [tabId]: _pools, ...restPools } = state.poolProgressByTab;
      const { [tabId]: _orch, ...restOrch } = state.orchestratorByTab;
      return {
        subagentsByTab: restSubs,
        poolProgressByTab: restPools,
        orchestratorByTab: restOrch,
      };
    });
  },

  getActiveCount: (tabId) => {
    const subs = get().subagentsByTab[tabId] || [];
    return subs.filter(
      (s) => s.status === 'running' || s.status === 'queued'
    ).length;
  },

  getTotalTokens: (tabId) => {
    const subs = get().subagentsByTab[tabId] || [];
    return subs.reduce(
      (acc, s) => ({
        input: acc.input + s.tokenUsage.input,
        output: acc.output + s.tokenUsage.output,
      }),
      { input: 0, output: 0 }
    );
  },
}));
