/**
 * @file Git store — manages git operations, status, branches, commits, blame, and diffs.
 */
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

/**
 * Git store — manages git operations, status, branches, commits, blame, and diffs.
 * Initializes per-project and provides IPC-based git commands.
 */
export const useGitStore = create<GitStore>((set, get) => ({
  isAvailable: false, // Will be set to true after confirming git is on PATH
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
      const stagedPaths = new Set(status.staged.map(f => f.path));
      const deduped = { ...status, unstaged: status.unstaged.filter(f => !stagedPaths.has(f.path)) };
      set({ isAvailable: true, isRepo: true, status: deduped, isLoading: false });
      
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
      // Deduplicate: if a file is already staged, don't also show it in unstaged.
      // Git can report the same path in both (partial staging), but the UI should
      // show each file in one place only to avoid duplicate-key errors and confusion.
      const stagedPaths = new Set(status.staged.map(f => f.path));
      const dedupedUnstaged = status.unstaged.filter(f => !stagedPaths.has(f.path));
      set({ status: { ...status, unstaged: dedupedUnstaged }, isLoading: false });
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
    const pathSet = new Set(paths);
    const prev = get().status;

    // Optimistic update: move matched files from unstaged/untracked → staged
    if (prev) {
      const movingFromUnstaged = prev.unstaged.filter(f => pathSet.has(f.path));
      const movingFromUntracked = prev.untracked.filter(p => pathSet.has(p));
      const existingStagedPaths = new Set(prev.staged.map(f => f.path));
      const newStaged = [
        ...prev.staged,
        ...movingFromUnstaged.filter(f => !existingStagedPaths.has(f.path)),
        ...movingFromUntracked
          .filter(p => !existingStagedPaths.has(p))
          .map(p => ({ path: p, status: 'added' as const })),
      ];
      set({
        status: {
          ...prev,
          staged: newStaged,
          unstaged: prev.unstaged.filter(f => !pathSet.has(f.path)),
          untracked: prev.untracked.filter(p => !pathSet.has(p)),
          isClean: newStaged.length === 0 && prev.unstaged.filter(f => !pathSet.has(f.path)).length === 0 && prev.untracked.filter(p => !pathSet.has(p)).length === 0,
        },
      });
    }

    try {
      await invoke(IPC.GIT_STAGE, paths);
      // Quiet refresh: sync with git truth without flashing isLoading
      const freshStatus = await invoke(IPC.GIT_STATUS) as GitStatus;
      const stagedPaths = new Set(freshStatus.staged.map(f => f.path));
      set({ status: { ...freshStatus, unstaged: freshStatus.unstaged.filter(f => !stagedPaths.has(f.path)) } });
    } catch (error) {
      if (prev) set({ status: prev });
      set({ error: String(error) });
    }
  },

  unstageFiles: async (paths: string[]) => {
    const pathSet = new Set(paths);
    const prev = get().status;

    // Optimistic update: move matched files from staged → unstaged
    if (prev) {
      const moving = prev.staged.filter(f => pathSet.has(f.path));
      const existingUnstagedPaths = new Set(prev.unstaged.map(f => f.path));
      const newUnstaged = [
        ...prev.unstaged,
        ...moving.filter(f => !existingUnstagedPaths.has(f.path)),
      ];
      const newStaged = prev.staged.filter(f => !pathSet.has(f.path));
      set({
        status: {
          ...prev,
          staged: newStaged,
          unstaged: newUnstaged,
          isClean: newStaged.length === 0 && newUnstaged.length === 0 && prev.untracked.length === 0,
        },
      });
    }

    try {
      await invoke(IPC.GIT_UNSTAGE, paths);
      // Quiet refresh: sync with git truth without flashing isLoading
      const freshStatus = await invoke(IPC.GIT_STATUS) as GitStatus;
      const stagedPaths = new Set(freshStatus.staged.map(f => f.path));
      set({ status: { ...freshStatus, unstaged: freshStatus.unstaged.filter(f => !stagedPaths.has(f.path)) } });
    } catch (error) {
      if (prev) set({ status: prev });
      set({ error: String(error) });
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
      isAvailable: false,
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
