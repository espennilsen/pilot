import { create } from 'zustand';

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

// Fuzzy match helper: checks if all characters in query appear in order in target
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

// Match command against query
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

export const useCommandPaletteStore = create<CommandPaletteStore>((set, get) => ({
  isOpen: false,
  searchQuery: '',
  selectedIndex: 0,
  commands: [],
  recentCommandIds: [],

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
      };
    });
  },
  
  unregisterCommands: (ids: string[]) => {
    set(state => ({
      commands: state.commands.filter(c => !ids.includes(c.id)),
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
    const { commands, searchQuery, recentCommandIds } = get();
    
    // Filter commands by search query
    const filtered = commands.filter(cmd => matchCommand(cmd, searchQuery));
    
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
      
      return [...recentCommands, ...otherCommands];
    }
    
    // With search query: sort by relevance (exact matches first, then fuzzy)
    return filtered.sort((a, b) => {
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
  },
}));
