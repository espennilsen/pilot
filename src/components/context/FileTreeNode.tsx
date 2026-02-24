import { useState, useRef, useEffect } from 'react';
import {
  Folder, FolderOpen, File, FileCode, FileText,
  ChevronRight, ChevronDown,
} from 'lucide-react';
import type { FileNode } from '../../../shared/types';

// ─── File icons ──────────────────────────────────────────

export function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (['ts', 'tsx', 'js', 'jsx'].includes(ext))
    return <FileCode className="w-4 h-4 text-blue-400" />;
  if (['json', 'yaml', 'yml'].includes(ext))
    return <FileText className="w-4 h-4 text-yellow-400" />;
  if (ext === 'md')
    return <FileText className="w-4 h-4 text-text-secondary" />;
  if (['css', 'scss', 'sass', 'less'].includes(ext))
    return <FileText className="w-4 h-4 text-purple-400" />;

  return <File className="w-4 h-4 text-text-secondary" />;
}

// ─── FileTreeNode ────────────────────────────────────────

export interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  renamingPath: string | null;
  renameValue: string;
  onSelect: (path: string) => void;
  onDoubleClick: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
}

export default function FileTreeNode({
  node, depth, selectedPath, renamingPath, renameValue,
  onSelect, onDoubleClick, onContextMenu,
  onRenameChange, onRenameConfirm, onRenameCancel,
}: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const isSelected = selectedPath === node.path;
  const isRenaming = renamingPath === node.path;
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      // Select the filename without extension
      const name = node.name;
      const dotIndex = name.lastIndexOf('.');
      if (dotIndex > 0 && node.type === 'file') {
        renameInputRef.current.setSelectionRange(0, dotIndex);
      } else {
        renameInputRef.current.select();
      }
    }
  }, [isRenaming, node.name, node.type]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(node.path);
    if (node.type === 'directory') {
      setIsExpanded(!isExpanded);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick(node);
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (node.type === 'file') {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', node.path);
      e.dataTransfer.setData('application/pilot-file', JSON.stringify({ path: node.path, name: node.name }));
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => onContextMenu(e, node)}
        draggable={node.type === 'file'}
        onDragStart={handleDragStart}
        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors ${
          isSelected
            ? 'bg-accent/15 text-accent'
            : 'hover:bg-bg-elevated text-text-primary'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.type === 'directory' ? (
          <>
            {isExpanded
              ? <ChevronDown className="w-3 h-3 text-text-secondary flex-shrink-0" />
              : <ChevronRight className="w-3 h-3 text-text-secondary flex-shrink-0" />}
            {isExpanded
              ? <FolderOpen className="w-4 h-4 text-accent flex-shrink-0" />
              : <Folder className="w-4 h-4 text-accent flex-shrink-0" />}
          </>
        ) : (
          <>
            <div className="w-3" />
            {getFileIcon(node.name)}
          </>
        )}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameValue.trim()) {
                e.preventDefault();
                onRenameConfirm();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onRenameCancel();
              }
              e.stopPropagation();
            }}
            onBlur={() => onRenameCancel()}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-bg-base border border-accent rounded px-1 py-0 text-sm text-text-primary outline-none"
          />
        ) : (
          <span className="text-sm truncate">{node.name}</span>
        )}
      </div>

      {node.type === 'directory' && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onSelect={onSelect}
              onDoubleClick={onDoubleClick}
              onContextMenu={onContextMenu}
              onRenameChange={onRenameChange}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
