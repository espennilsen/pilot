import { useEffect, useRef } from 'react';
import { useCommandPaletteStore } from '../../stores/command-palette-store';
import { Icon } from '../shared/Icon';

export function CommandPalette() {
  const {
    isOpen,
    searchQuery,
    selectedIndex,
    setSearchQuery,
    setSelectedIndex,
    executeCommand,
    close,
    getFilteredCommands,
  } = useCommandPaletteStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  const filteredCommands = getFilteredCommands();

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((selectedIndex + 1) % filteredCommands.length);
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(
            (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length
          );
          break;

        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex].id);
          }
          break;

        case 'Escape':
          e.preventDefault();
          close();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, setSelectedIndex, executeCommand, close]);

  if (!isOpen) return null;

  // Group commands by category
  const groupedCommands: Array<{ category: string; commands: typeof filteredCommands }> = [];
  const categoryMap = new Map<string, typeof filteredCommands>();

  filteredCommands.forEach(cmd => {
    const category = cmd.category || 'Other';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(cmd);
  });

  categoryMap.forEach((commands, category) => {
    groupedCommands.push({ category, commands });
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          close();
        }
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette container */}
      <div className="relative w-[560px] max-h-[400px] bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-150">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Icon name="Search" size={18} className="text-text-secondary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-text-primary text-lg outline-none placeholder:text-text-secondary"
          />
        </div>

        {/* Results list */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-secondary">
              No matching commands
            </div>
          ) : (
            <div className="py-1">
              {groupedCommands.map(({ category, commands }, groupIndex) => (
                <div key={category}>
                  {/* Category header (only show if there's a search query or multiple categories) */}
                  {(searchQuery.trim() || groupedCommands.length > 1) && (
                    <div className="px-4 py-1.5 text-text-secondary text-xs uppercase tracking-wider font-medium">
                      {category}
                    </div>
                  )}
                  
                  {commands.map((command) => {
                    const globalIndex = filteredCommands.indexOf(command);
                    const isSelected = globalIndex === selectedIndex;
                    
                    return (
                      <div
                        key={command.id}
                        ref={isSelected ? selectedItemRef : null}
                        className={`
                          px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors
                          ${isSelected 
                            ? 'bg-accent/10 text-text-primary' 
                            : 'text-text-secondary hover:bg-bg-surface'
                          }
                        `}
                        onClick={() => executeCommand(command.id)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        {/* Icon */}
                        {command.icon && (
                          <Icon 
                            name={command.icon as keyof typeof import('lucide-react')} 
                            size={18} 
                            className={isSelected ? 'text-accent' : 'text-text-secondary'}
                          />
                        )}

                        {/* Label */}
                        <span className="flex-1 font-medium">{command.label}</span>

                        {/* Description */}
                        {command.description && (
                          <span className="text-text-secondary text-sm mr-2">
                            {command.description}
                          </span>
                        )}

                        {/* Shortcut badge */}
                        {command.shortcut && (
                          <div className="bg-bg-surface border border-border rounded px-1.5 py-0.5 text-xs text-text-secondary font-mono">
                            {command.shortcut}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border text-text-secondary text-xs flex gap-4">
          <span><kbd className="font-mono">↑↓</kbd> to navigate</span>
          <span><kbd className="font-mono">↵</kbd> to select</span>
          <span><kbd className="font-mono">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
