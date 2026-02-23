import { useState, useRef, useEffect } from 'react';
import { X, Terminal, GripHorizontal, Globe } from 'lucide-react';
import { useOutputWindowStore } from '../../stores/output-window-store';
import { useDevCommandStore } from '../../stores/dev-command-store';
import { CommandOutput } from './CommandOutput';
import { TunnelOutput } from './TunnelOutput';
import { isTunnelId, TUNNEL_LABELS } from '../../stores/tunnel-output-store';
import type { OutputWindow as OutputWindowType } from '../../stores/output-window-store';

interface OutputWindowProps {
  window: OutputWindowType;
}

export function OutputWindow({ window }: OutputWindowProps) {
  const { commands } = useDevCommandStore();
  const {
    setActiveTab,
    closeOutput,
    closeWindow,
    updatePosition,
    updateSize,
    setDraggedTab,
    detachTab,
    attachTab,
    reorderTabs,
    draggedTab,
  } = useOutputWindowStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const dragRef = useRef({ startX: 0, startY: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  const activeIsTunnel = isTunnelId(window.activeCommandId);
  const activeCommand = activeIsTunnel ? null : commands.find((c) => c.id === window.activeCommandId);
  const windowTitle = activeIsTunnel
    ? TUNNEL_LABELS[window.activeCommandId] || 'Tunnel Output'
    : activeCommand?.label || 'Command Output';

  // Handle window dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.no-drag')) return;

    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX - window.position.x,
      startY: e.clientY - window.position.y,
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    updatePosition(window.id, {
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  // Handle resize
  const handleResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = window.size.width;
    const startHeight = window.size.height;

    const handleResizeMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      updateSize(window.id, {
        width: Math.max(350, startWidth + deltaX),
        height: Math.max(200, startHeight + deltaY),
      });
    };

    const handleResizeEnd = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  // Tab drag handlers
  const handleTabDragStart = (e: React.DragEvent, commandId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      'application/x-pilot-tab',
      JSON.stringify({ windowId: window.id, commandId })
    );
    setDraggedTab({ windowId: window.id, commandId });
  };

  const handleTabDragEnd = () => {
    setDraggedTab(null);
    setDragOverTab(null);
  };

  const handleTabDragOver = (e: React.DragEvent, targetCommandId: string) => {
    e.preventDefault();
    if (!draggedTab) return;

    // Only show drop indicator if dragging within the same window
    if (draggedTab.windowId === window.id && draggedTab.commandId !== targetCommandId) {
      setDragOverTab(targetCommandId);
    }
  };

  const handleTabDrop = (e: React.DragEvent, targetCommandId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const data = e.dataTransfer.getData('application/x-pilot-tab');
    if (!data) return;

    try {
      const { windowId: sourceWindowId, commandId } = JSON.parse(data);

      if (sourceWindowId === window.id) {
        // Reorder tabs within same window
        const draggedIndex = window.commandIds.indexOf(commandId);
        const targetIndex = window.commandIds.indexOf(targetCommandId);

        if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
          const newOrder = [...window.commandIds];
          newOrder.splice(draggedIndex, 1);
          newOrder.splice(targetIndex, 0, commandId);
          reorderTabs(window.id, newOrder);
        }
      } else {
        // Attach tab from another window
        attachTab(sourceWindowId, commandId, window.id);
      }
    } catch (err) {
      console.error('Failed to parse drag data:', err);
    }

    setDragOverTab(null);
  };

  // Window drop handler for tabs from other windows
  const handleWindowDragOver = (e: React.DragEvent) => {
    if (!draggedTab || draggedTab.windowId === window.id) return;
    e.preventDefault();
  };

  const handleWindowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const data = e.dataTransfer.getData('application/x-pilot-tab');
    if (!data) return;

    try {
      const { windowId: sourceWindowId, commandId } = JSON.parse(data);
      if (sourceWindowId !== window.id) {
        attachTab(sourceWindowId, commandId, window.id);
      }
    } catch (err) {
      console.error('Failed to parse drag data:', err);
    }
  };

  return (
    <div
      ref={windowRef}
      className="fixed z-40 bg-bg-surface border border-border rounded-lg shadow-2xl flex flex-col"
      style={{
        left: `${window.position.x}px`,
        top: `${window.position.y}px`,
        width: `${window.size.width}px`,
        height: `${window.size.height}px`,
      }}
      onDragOver={handleWindowDragOver}
      onDrop={handleWindowDrop}
    >
      {/* Header (draggable) */}
      <div
        className="h-[36px] bg-bg-surface border-b border-border flex items-center justify-between px-3 cursor-move rounded-t-lg"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          {activeIsTunnel
            ? <Globe className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            : <Terminal className="w-3.5 h-3.5 text-accent flex-shrink-0" />
          }
          <span className="text-xs font-medium text-text-primary truncate">
            {windowTitle}
          </span>
        </div>
        <button
          onClick={() => closeWindow(window.id)}
          className="p-1 hover:bg-bg-elevated rounded transition-colors no-drag flex-shrink-0"
          aria-label="Close window"
        >
          <X className="w-3.5 h-3.5 text-text-secondary" />
        </button>
      </div>

      {/* Tab bar */}
      {window.commandIds.length > 1 && (
        <div className="h-[32px] bg-bg-base border-b border-border flex items-center gap-1 px-2 overflow-x-auto no-drag">
          {window.commandIds.map((cmdId) => {
            const tabIsTunnel = isTunnelId(cmdId);
            const cmd = tabIsTunnel ? null : commands.find((c) => c.id === cmdId);
            const tabLabel = tabIsTunnel
              ? TUNNEL_LABELS[cmdId] || 'Tunnel'
              : cmd?.label || cmdId;
            const isActive = cmdId === window.activeCommandId;
            const isDragOver = dragOverTab === cmdId;

            return (
              <div
                key={cmdId}
                draggable
                onDragStart={(e) => handleTabDragStart(e, cmdId)}
                onDragEnd={handleTabDragEnd}
                onDragOver={(e) => handleTabDragOver(e, cmdId)}
                onDrop={(e) => handleTabDrop(e, cmdId)}
                onClick={() => setActiveTab(window.id, cmdId)}
                className={`
                  flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors
                  ${isActive ? 'bg-bg-surface text-text-primary' : 'text-text-secondary hover:bg-bg-elevated'}
                  ${isDragOver ? 'border-2 border-accent' : ''}
                `}
              >
                <GripHorizontal className="w-3 h-3 opacity-50" />
                <span className="max-w-[80px] truncate">{tabLabel}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeOutput(window.id, cmdId);
                  }}
                  className="p-0.5 hover:bg-bg-elevated rounded transition-colors"
                  aria-label="Close tab"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-bg-base">
        {activeIsTunnel
          ? <TunnelOutput tunnelId={window.activeCommandId} />
          : <CommandOutput commandId={window.activeCommandId} />
        }
      </div>

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize no-drag"
        onMouseDown={handleResize}
      >
        <div className="absolute bottom-0.5 right-0.5 w-2 h-2 border-r-2 border-b-2 border-border rounded-br" />
      </div>
    </div>
  );
}
