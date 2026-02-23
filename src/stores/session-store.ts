import { create } from 'zustand';
import type { SessionMetadata } from '../../shared/types';
import { IPC } from '../../shared/ipc';
import { invoke } from '../lib/ipc-client';

export interface SessionInfo {
  path: string;
  projectPath: string;
  title: string;
  lastActive: number;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
}

interface SessionStore {
  sessions: SessionInfo[];
  searchQuery: string;
  isLoading: boolean;

  loadSessions: (projectPaths?: string[]) => Promise<void>;
  pinSession: (path: string) => void;
  unpinSession: (path: string) => void;
  archiveSession: (path: string) => void;
  unarchiveSession: (path: string) => void;
  setSearchQuery: (query: string) => void;
  getFilteredSessions: () => SessionInfo[];
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  searchQuery: '',
  isLoading: false,

  loadSessions: async (projectPaths?: string[]) => {
    set({ isLoading: true });
    
    try {
      const metadata = await invoke(IPC.SESSION_LIST_ALL, projectPaths || []) as SessionMetadata[];
      
      const sessions: SessionInfo[] = metadata.map(meta => ({
        path: meta.sessionPath,
        projectPath: meta.projectPath,
        title: meta.customTitle || 'Untitled Session',
        lastActive: meta.modified || meta.created || Date.now(),
        messageCount: meta.messageCount || 0,
        isPinned: meta.isPinned,
        isArchived: meta.isArchived,
      }));
      
      set({ sessions, isLoading: false });
    } catch (error) {
      console.error('Failed to load sessions:', error);
      set({ sessions: [], isLoading: false });
    }
  },

  pinSession: (path: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.path === path ? { ...s, isPinned: true } : s
      ),
    }));
  },

  unpinSession: (path: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.path === path ? { ...s, isPinned: false } : s
      ),
    }));
  },

  archiveSession: (path: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.path === path ? { ...s, isArchived: true } : s
      ),
    }));
  },

  unarchiveSession: (path: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.path === path ? { ...s, isArchived: false } : s
      ),
    }));
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  getFilteredSessions: () => {
    const { sessions, searchQuery } = get();
    
    // Filter out archived sessions
    let filtered = sessions.filter(s => !s.isArchived);
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.title.toLowerCase().includes(query) ||
        s.projectPath.toLowerCase().includes(query)
      );
    }
    
    // Sort: pinned first, then by last active
    filtered.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return b.lastActive - a.lastActive;
    });
    
    return filtered;
  },
}));
