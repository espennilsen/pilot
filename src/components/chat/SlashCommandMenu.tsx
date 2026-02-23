import { useEffect, useRef } from 'react';
import { Terminal, FileText, Puzzle, Brain, Sparkles } from 'lucide-react';

export interface SlashCommand {
  name: string;
  description: string;
  source: string; // 'pilot' | 'prompt' | 'skill' | 'extension'
}

interface SlashCommandMenuProps {
  /** Pre-filtered list of commands to display */
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
  visible: boolean;
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'pilot':
      return <Brain className="w-3.5 h-3.5 text-accent flex-shrink-0" />;
    case 'prompt':
      return <FileText className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
    case 'skill':
      return <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
    case 'extension':
      return <Puzzle className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
    default:
      return <Terminal className="w-3.5 h-3.5 text-text-secondary flex-shrink-0" />;
  }
}

function getSourceLabel(source: string): string {
  switch (source) {
    case 'pilot': return 'Pilot';
    case 'prompt': return 'Prompt';
    case 'skill': return 'Skill';
    case 'extension': return 'Extension';
    default: return source;
  }
}

export default function SlashCommandMenu({
  commands,
  selectedIndex,
  onSelect,
  onHover,
  visible,
}: SlashCommandMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  if (!visible || commands.length === 0) return null;

  // Group by source
  const grouped = commands.reduce<Record<string, SlashCommand[]>>((acc, cmd) => {
    (acc[cmd.source] ??= []).push(cmd);
    return acc;
  }, {});

  // Determine group order: pilot first, then prompt, skill, extension
  const sourceOrder = ['pilot', 'prompt', 'skill', 'extension'];
  const orderedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ai = sourceOrder.indexOf(a);
    const bi = sourceOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Build flat list for index mapping
  const flatList = orderedGroups.flatMap(([, cmds]) => cmds);

  return (
    <div
      ref={containerRef}
      className="mb-1.5 bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden"
    >
      <div className="max-h-64 overflow-y-auto py-1">
        {orderedGroups.map(([source, cmds]) => (
          <div key={source}>
            {/* Group header — only show if multiple groups */}
            {orderedGroups.length > 1 && (
              <div className="px-3 py-1 text-[10px] font-semibold text-text-secondary/50 uppercase tracking-wider">
                {getSourceLabel(source)}
              </div>
            )}
            {cmds.map((cmd) => {
              const flatIdx = flatList.indexOf(cmd);
              const isSelected = flatIdx === selectedIndex;
              return (
                <button
                  key={`${cmd.source}/${cmd.name}`}
                  ref={isSelected ? selectedItemRef : null}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(cmd);
                  }}
                  onMouseEnter={() => onHover(flatIdx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-accent/15 text-text-primary'
                      : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
                  }`}
                >
                  {getSourceIcon(cmd.source)}
                  <span className={`font-mono text-xs ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                    /{cmd.name}
                  </span>
                  <span className="flex-1 text-xs text-text-secondary truncate">
                    {cmd.description}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-text-secondary/50 flex gap-3">
        <span><kbd className="font-mono">↑↓</kbd> navigate</span>
        <span><kbd className="font-mono">Tab</kbd>/<kbd className="font-mono">↵</kbd> select</span>
        <span><kbd className="font-mono">Esc</kbd> dismiss</span>
      </div>
    </div>
  );
}
