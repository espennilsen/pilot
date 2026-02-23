import { useEffect, useRef } from 'react';
import { File, Folder } from 'lucide-react';

export interface FileMention {
  name: string;
  path: string;
  relativePath: string;
  type?: 'file' | 'directory';
}

interface FileMentionMenuProps {
  files: FileMention[];
  selectedIndex: number;
  onSelect: (file: FileMention) => void;
  onHover: (index: number) => void;
  visible: boolean;
  loading?: boolean;
  hasQuery?: boolean;
}

/** Get the directory portion of a relative path (everything before the filename) */
function getDirPart(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf('/');
  return lastSlash > -1 ? relativePath.substring(0, lastSlash + 1) : '';
}

/** Get file extension for icon color */
function getExtColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': return 'text-blue-400';
    case 'js': case 'jsx': return 'text-yellow-400';
    case 'json': return 'text-green-400';
    case 'md': case 'mdx': return 'text-text-secondary';
    case 'css': case 'scss': return 'text-pink-400';
    case 'html': return 'text-orange-400';
    case 'py': return 'text-blue-300';
    case 'rs': return 'text-orange-300';
    case 'go': return 'text-cyan-400';
    default: return 'text-text-secondary';
  }
}

export default function FileMentionMenu({
  files,
  selectedIndex,
  onSelect,
  onHover,
  visible,
  loading,
  hasQuery,
}: FileMentionMenuProps) {
  const selectedItemRef = useRef<HTMLButtonElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  if (!visible) return null;

  if (loading) {
    return (
      <div className="mb-1.5 bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden">
        <div className="px-3 py-3 text-xs text-text-secondary text-center">Searching files…</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="mb-1.5 bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden">
        <div className="px-3 py-3 text-xs text-text-secondary text-center">
          {hasQuery ? 'No matching files' : 'Type to search project files…'}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-1.5 bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden">
      <div className="max-h-64 overflow-y-auto py-1">
        {files.map((file, idx) => {
          const isSelected = idx === selectedIndex;
          const dirPart = getDirPart(file.relativePath);
          return (
            <button
              key={file.path}
              ref={isSelected ? selectedItemRef : null}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(file);
              }}
              onMouseEnter={() => onHover(idx)}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                isSelected
                  ? 'bg-accent/15 text-text-primary'
                  : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
              }`}
            >
              {file.type === 'directory'
                ? <Folder className="w-3.5 h-3.5 flex-shrink-0 text-accent" />
                : <File className={`w-3.5 h-3.5 flex-shrink-0 ${getExtColor(file.name)}`} />
              }
              <span className="flex-1 min-w-0 flex items-baseline gap-1 truncate">
                <span className={`font-mono text-xs ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                  {file.name}
                </span>
                {dirPart && (
                  <span className="text-[11px] text-text-secondary/60 truncate">
                    {dirPart}
                  </span>
                )}
              </span>
            </button>
          );
        })}
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
