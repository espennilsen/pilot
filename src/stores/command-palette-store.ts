/**
 * @file Command palette store — manages command registration, search, and execution.
 */
import { create } from 'zustand';

/**
 * A single command action in the command palette.
 */
export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;     // lucide icon name
  shortcut?: string; // display label like "⌘B"
  category?: string; // e.g. "Navigation", "View", "Tab"
  action: () => void;
  keywords?: string[]; // extra search terms
}

interface CommandPaletteStore {
  isOpen: boolean;
  searchQuery: string;
  selectedIndex: number;
  commands: CommandAction[];
  recentCommandIds: string[]; // track last 5 used commands
  _lastFilterQuery: string;
  _lastFilterResult: CommandAction[];

  open: () => void;
  close: () => void;
  toggle: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedIndex: (index: number) => void;
  registerCommands: (commands: CommandAction[]) => void;
  unregisterCommands: (ids: string[]) => void;
  executeCommand: (id: string) => void;
  getFilteredCommands: () => CommandAction[];
}

/**
 * Subsequence-based fuzzy matching.
 * Returns true if all characters in query appear in target in order (case-insensitive).
 */
function fuzzyMatch(query: string, target: string): boolean {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length;
}

/**
 * Match command against query (checks label, description, category, and keywords).
 */
function matchCommand(command: CommandAction, query: string): boolean {
  if (!query.trim()) return true;
  
  const searchTargets = [
    command.label,
    command.description || '',
    command.category || '',
    ...(command.keywords || []),
  ];
  
  return searchTargets.some(target => fuzzyMatch(query, target));
}

/**
 * Command palette store — manages command registration, fuzzy search, and execution.
 * Tracks recent commands and provides memoized filtering.
 */
export const useCommandPaletteStore = create<CommandPaletteStore>((set, get) => ({
  isOpen: false,
  searchQuery: '',
  selectedIndex: 0,
  commands: [],
  recentCommandIds: [],
  _lastFilterQuery: '',
  _lastFilterResult: [],

  open: () => set({ isOpen: true, searchQuery: '', selectedIndex: 0 }),
  
  close: () => set({ isOpen: false, searchQuery: '', selectedIndex: 0 }),
  
  toggle: () => {
    const { isOpen } = get();
    if (isOpen) {
      get().close();
    } else {
      get().open();
    }
  },
  
  setSearchQuery: (query: string) => set({ searchQuery: query, selectedIndex: 0 }),
  
  setSelectedIndex: (index: number) => set({ selectedIndex: index }),
  
  registerCommands: (newCommands: CommandAction[]) => {
    set(state => {
      // Filter out commands that already exist (by id)
      const existingIds = new Set(state.commands.map(c => c.id));
      const commandsToAdd = newCommands.filter(c => !existingIds.has(c.id));
      
      return {
        commands: [...state.commands, ...commandsToAdd],
        _lastFilterQuery: '', // Invalidate cache
        _lastFilterResult: [],
      };
    });
  },
  
  unregisterCommands: (ids: string[]) => {
    set(state => ({
      commands: state.commands.filter(c => !ids.includes(c.id)),
      _lastFilterQuery: '', // Invalidate cache
      _lastFilterResult: [],
    }));
  },
  
  executeCommand: (id: string) => {
    const { commands, recentCommandIds } = get();
    const command = commands.find(c => c.id === id);
    
    if (command) {
      // Execute the command
      command.action();
      
      // Update recents (move to front, keep max 5)
      const updatedRecents = [
        id,
        ...recentCommandIds.filter(cid => cid !== id),
      ].slice(0, 5);
      
      set({ 
        recentCommandIds: updatedRecents,
        isOpen: false,
        searchQuery: '',
        selectedIndex: 0,
      });
    }
  },
  
  getFilteredCommands: () => {
    const { commands, searchQuery, recentCommandIds, _lastFilterQuery, _lastFilterResult } = get();
    
    // Memoization: return cached result if query hasn't changed
    if (searchQuery === _lastFilterQuery) {
      return _lastFilterResult;
    }
    
    // Filter commands by search query
    const filtered = commands.filter(cmd => matchCommand(cmd, searchQuery));
    
    let result: CommandAction[];
    
    if (!searchQuery.trim()) {
      // No search query: show recent commands first
      const recentCommands = recentCommandIds
        .map(id => filtered.find(c => c.id === id))
        .filter((c): c is CommandAction => c !== undefined);
      
      const otherCommands = filtered
        .filter(c => !recentCommandIds.includes(c.id))
        .sort((a, b) => {
          // Sort by category, then label
          const catCompare = (a.category || '').localeCompare(b.category || '');
          if (catCompare !== 0) return catCompare;
          return a.label.localeCompare(b.label);
        });
      
      result = [...recentCommands, ...otherCommands];
    } else {
      // With search query: sort by relevance (exact matches first, then fuzzy)
      result = filtered.sort((a, b) => {
        const queryLower = searchQuery.toLowerCase();
        const aLabelLower = a.label.toLowerCase();
        const bLabelLower = b.label.toLowerCase();
        
        // Exact prefix matches first
        const aStartsWith = aLabelLower.startsWith(queryLower);
        const bStartsWith = bLabelLower.startsWith(queryLower);
        if (aStartsWith !== bStartsWith) {
          return aStartsWith ? -1 : 1;
        }
        
        // Then by category
        const catCompare = (a.category || '').localeCompare(b.category || '');
        if (catCompare !== 0) return catCompare;
        
        // Finally alphabetically
        return a.label.localeCompare(b.label);
      });
    }
    
    // Cache the result
    set({ _lastFilterQuery: searchQuery, _lastFilterResult: result });
    return result;
  },
}));
