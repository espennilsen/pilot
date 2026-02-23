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
  showArchived: boolean;

  loadSessions: (projectPaths?: string[]) => Promise<void>;
  pinSession: (path: string) => void;
  unpinSession: (path: string) => void;
  archiveSession: (path: string) => void;
  unarchiveSession: (path: string) => void;
  deleteSession: (path: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setShowArchived: (show: boolean) => void;
  getFilteredSessions: () => SessionInfo[];
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  searchQuery: '',
  isLoading: false,
  showArchived: false,

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
    invoke(IPC.SESSION_UPDATE_META, path, { isPinned: true }).catch(console.error);
  },

  unpinSession: (path: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.path === path ? { ...s, isPinned: false } : s
      ),
    }));
    invoke(IPC.SESSION_UPDATE_META, path, { isPinned: false }).catch(console.error);
  },

  archiveSession: (path: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.path === path ? { ...s, isArchived: true } : s
      ),
    }));
    invoke(IPC.SESSION_UPDATE_META, path, { isArchived: true }).catch(console.error);
  },

  unarchiveSession: (path: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.path === path ? { ...s, isArchived: false } : s
      ),
    }));
    invoke(IPC.SESSION_UPDATE_META, path, { isArchived: false }).catch(console.error);
  },

  deleteSession: async (path: string) => {
    try {
      const result = await invoke(IPC.SESSION_DELETE, path) as { success: boolean; error?: string };
      if (result.success) {
        set(state => ({
          sessions: state.sessions.filter(s => s.path !== path),
        }));
      } else {
        console.error('Failed to delete session:', result.error);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setShowArchived: (show: boolean) => {
    set({ showArchived: show });
  },

  getFilteredSessions: () => {
    const { sessions, searchQuery, showArchived } = get();
    
    // Filter out archived sessions unless showArchived is on
    let filtered = showArchived ? [...sessions] : sessions.filter(s => !s.isArchived);
    
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
