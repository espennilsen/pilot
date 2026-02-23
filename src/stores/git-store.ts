import { create } from 'zustand';
import type { GitStatus, GitBranch, GitCommit, BlameLine, GitStash, GitLogOptions } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

interface GitStore {
  // State
  isAvailable: boolean;
  isRepo: boolean;
  status: GitStatus | null;
  branches: GitBranch[];
  commitLog: GitCommit[];
  blameLines: BlameLine[];
  stashes: GitStash[];
  diffContent: string | null;
  blameFilePath: string | null;
  isLoading: boolean;
  error: string | null;
  currentProjectPath: string | null;

  // Actions
  initGit: (projectPath: string) => Promise<void>;
  initRepo: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  stageFiles: (paths: string[]) => Promise<void>;
  unstageFiles: (paths: string[]) => Promise<void>;
  commit: (message: string) => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  checkout: (branch: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  loadCommitLog: (options?: GitLogOptions) => Promise<void>;
  loadBlame: (filePath: string) => Promise<void>;
  loadStashes: () => Promise<void>;
  loadDiff: (ref1?: string, ref2?: string) => Promise<void>;
  applyStash: (stashId: string) => Promise<void>;
  clearBlame: () => void;
  clearDiff: () => void;
  reset: () => void;
}

export const useGitStore = create<GitStore>((set, get) => ({
  isAvailable: true, // Assume git is available initially
  isRepo: false,
  status: null,
  branches: [],
  commitLog: [],
  blameLines: [],
  stashes: [],
  diffContent: null,
  blameFilePath: null,
  isLoading: false,
  error: null,
  currentProjectPath: null,

  initGit: async (projectPath: string) => {
    set({ isLoading: true, error: null, currentProjectPath: projectPath });
    try {
      // Initialize git service in main process first
      const result = await invoke(IPC.GIT_INIT, projectPath) as { available: boolean; isRepo: boolean };
      
      if (!result.available) {
        set({ isAvailable: false, isRepo: false, isLoading: false });
        return;
      }

      if (!result.isRepo) {
        set({ isAvailable: true, isRepo: false, isLoading: false });
        return;
      }

      // Now safe to fetch status
      const status = await invoke(IPC.GIT_STATUS) as GitStatus;
      set({ isAvailable: true, isRepo: true, status, isLoading: false });
      
      // Load branches in parallel
      get().refreshBranches();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  initRepo: async () => {
    const projectPath = get().currentProjectPath;
    if (!projectPath) return;

    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_INIT_REPO, projectPath);
      // Re-initialize to pick up the new repo
      await get().initGit(projectPath);
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  refreshStatus: async () => {
    if (!get().isRepo) return;
    
    set({ isLoading: true, error: null });
    try {
      const status = await invoke(IPC.GIT_STATUS) as GitStatus;
      set({ status, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  refreshBranches: async () => {
    if (!get().isRepo) return;
    
    try {
      const branches = await invoke(IPC.GIT_BRANCHES) as GitBranch[];
      set({ branches });
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  },

  stageFiles: async (paths: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_STAGE, paths);
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  unstageFiles: async (paths: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_UNSTAGE, paths);
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  commit: async (message: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_COMMIT, message);
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  push: async () => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_PUSH);
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  pull: async () => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_PULL);
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  checkout: async (branch: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_CHECKOUT, branch);
      await get().refreshStatus();
      await get().refreshBranches();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createBranch: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_CREATE_BRANCH, name);
      await get().refreshBranches();
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  loadCommitLog: async (options?: GitLogOptions) => {
    if (!get().isRepo) return;
    
    set({ isLoading: true, error: null });
    try {
      const commits = await invoke(IPC.GIT_LOG, options) as GitCommit[];
      set({ commitLog: commits, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  loadBlame: async (filePath: string) => {
    if (!get().isRepo) return;
    
    set({ isLoading: true, error: null });
    try {
      const blameLines = await invoke(IPC.GIT_BLAME, filePath) as BlameLine[];
      set({ blameLines, blameFilePath: filePath, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  loadStashes: async () => {
    if (!get().isRepo) return;
    
    try {
      const stashes = await invoke(IPC.GIT_STASH_LIST) as GitStash[];
      set({ stashes });
    } catch (error) {
      console.error('Failed to load stashes:', error);
    }
  },

  loadDiff: async (ref1?: string, ref2?: string) => {
    if (!get().isRepo) return;
    
    set({ isLoading: true, error: null });
    try {
      const diff = await invoke(IPC.GIT_DIFF, ref1, ref2) as string;
      set({ diffContent: diff, isLoading: false });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  applyStash: async (stashId: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke(IPC.GIT_STASH_APPLY, stashId);
      await get().loadStashes();
      await get().refreshStatus();
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  clearBlame: () => {
    set({ blameLines: [], blameFilePath: null });
  },

  clearDiff: () => {
    set({ diffContent: null });
  },

  reset: () => {
    set({
      isAvailable: true,
      isRepo: false,
      status: null,
      branches: [],
      commitLog: [],
      blameLines: [],
      stashes: [],
      diffContent: null,
      blameFilePath: null,
      isLoading: false,
      error: null,
      currentProjectPath: null,
    });
  },
}));
