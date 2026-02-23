import { useState, useRef } from 'react';
import { useUIStore } from '../../stores/ui-store';
import { X, StickyNote, Send } from 'lucide-react';

export default function ScratchPad() {
  const { scratchPadContent, setScratchPadContent, toggleScratchPad } = useUIStore();
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: window.innerHeight - 350 });
  const [size, setSize] = useState({ width: 400, height: 300 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX - position.x,
      startY: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragRef.current.startX,
      y: e.clientY - dragRef.current.startY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add/remove global listeners for dragging
  if (isDragging) {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  } else {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  const handleSendToAgent = async () => {
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(scratchPadContent);
      // Could also emit an event to paste into chat input
      console.log('Scratch pad content copied to clipboard');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div
      className="fixed z-40 bg-bg-surface border border-border rounded-lg shadow-2xl flex flex-col"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
    >
      {/* Header (draggable) */}
      <div
        className="h-[40px] bg-bg-surface border-b border-border flex items-center justify-between px-3 cursor-move rounded-t-lg"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-primary">Scratch Pad</span>
        </div>
        <button
          onClick={toggleScratchPad}
          className="p-1 hover:bg-bg-elevated rounded transition-colors"
          aria-label="Close scratch pad"
        >
          <X className="w-4 h-4 text-text-secondary" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={scratchPadContent}
          onChange={(e) => setScratchPadContent(e.target.value)}
          className="w-full h-full bg-bg-base text-text-primary font-mono text-sm p-3 resize-none outline-none"
          placeholder="Jot down notes, code snippets, or commands here..."
        />
      </div>

      {/* Footer */}
      <div className="h-[50px] bg-bg-surface border-t border-border flex items-center justify-end px-3 gap-2 rounded-b-lg">
        <button
          onClick={handleSendToAgent}
          className="px-3 py-1.5 bg-accent text-bg-base rounded text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2"
        >
          <Send className="w-3.5 h-3.5" />
          Send to Agent
        </button>
      </div>

      {/* Resize handle (bottom-right corner) */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const startWidth = size.width;
          const startHeight = size.height;

          const handleResize = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            setSize({
              width: Math.max(300, startWidth + deltaX),
              height: Math.max(200, startHeight + deltaY),
            });
          };

          const handleResizeEnd = () => {
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', handleResizeEnd);
          };

          document.addEventListener('mousemove', handleResize);
          document.addEventListener('mouseup', handleResizeEnd);
        }}
      />
    </div>
  );
}
